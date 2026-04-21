"""
🧥 Wardrobe Assistant API — Backend Completo
FastAPI con integrazione reale Supabase, Computer Vision, Scoring, Meteo, Routine, Marketplace.
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import io
from PIL import Image
from rembg import remove
from collections import Counter
import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
# Utilizziamo il modello più rapido e capace di leggere immagini
gemini_model = genai.GenerativeModel('gemini-1.5-flash')

# Moduli interni
from database import (
    get_or_create_profile, insert_clothing, get_clothes_by_ids,
    get_available_clothes, update_clothing_state, reset_clothing_after_wash,
    get_all_clothes, save_outfit_history, get_outfit_history_by_context
)
from scoring import calcola_punteggio_outfit, genera_messaggio_score
from weather import get_current_temperature, get_weather_summary
from routines import analizza_routine, suggerisci_outfit_per_contesto
from marketplace import export_for_vinted, analizza_buchi_armadio
from config import DEFAULT_WASH_LIMITS

# =====================
# APP INIT
# =====================
app = FastAPI(
    title="Wardrobe Assistant API",
    description="Assistente guardaroba digitale proattivo con CV, scoring e routine predittive.",
    version="1.0.0"
)

# CORS per Flutter/React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================
# PYDANTIC MODELS
# =====================
class ItemCandidate(BaseModel):
    id: str
    categoria: str
    colore_primario: str
    forma: str
    trama_materiale: str
    confidence: float
    image_url: str

class AnalyzeImageResponse(BaseModel):
    categoria_rilevata: str
    colore_primario: str
    forma: str
    trama_materiale: str
    marca_rilevata: str
    immagine_scontornata_url: str
    needs_quick_choice: bool
    candidates_for_resolution: List[ItemCandidate] = []
    limite_lavaggio_consigliato: int = 3

class ItemCreate(BaseModel):
    user_id: str
    categoria: str
    colore_primario: str
    forma: str
    trama_materiale: str
    marca: str = "Nessuna"
    limite_lavaggio: Optional[int] = None  # Se None, usiamo il default intelligente
    image_url: str
    citta: Optional[str] = "Roma"

class OutfitConfirm(BaseModel):
    user_id: str
    clothing_ids: List[str]
    contesto_tag: str
    citta: str

class ScoreBreakdown(BaseModel):
    meteo: dict
    colori: dict
    freshness: dict
    totale: float

class OutfitResponse(BaseModel):
    punteggio: float
    messaggio: str
    breakdown: ScoreBreakdown
    alert_lavaggio: List[str] = []
    temperatura_attuale: float = 0.0

class WashRequest(BaseModel):
    clothing_ids: List[str]


# =====================
# HELPER FUNCTIONS
# =====================
def get_dominant_color_hex(img: Image.Image) -> str:
    """Estrae il colore dominante da un'immagine RGBA ignorando la trasparenza."""
    try:
        img_copy = img.copy()
        img_copy.thumbnail((100, 100))
        pixels = list(img_copy.getdata())
        opaque_pixels = [p[:3] for p in pixels if len(p) > 3 and p[3] > 200]
        if not opaque_pixels:
            return "#808080"
        counter = Counter(opaque_pixels)
        dominant = counter.most_common(1)[0][0]
        return f"#{dominant[0]:02x}{dominant[1]:02x}{dominant[2]:02x}"
    except Exception:
        return "#808080"


def suggest_wash_limit(categoria: str, materiale: str) -> int:
    """Propone un limite di lavaggio intelligente in base a categoria e materiale."""
    cat_limit = DEFAULT_WASH_LIMITS.get(categoria.lower(), 3)
    mat_limit = DEFAULT_WASH_LIMITS.get(materiale.lower(), 99)
    # Il più restrittivo tra i due
    return min(cat_limit, mat_limit)


# =====================
# API ENDPOINTS
# =====================

@app.get("/")
def read_root():
    return {
        "app": "Wardrobe Assistant",
        "versione": "1.0.0",
        "stato": "🟢 Online",
        "endpoints": [
            "/api/v1/wardrobe/analyze-image",
            "/api/v1/wardrobe/items",
            "/api/v1/outfits/confirm",
            "/api/v1/routines/suggestions",
            "/api/v1/wardrobe/wash",
            "/api/v1/wardrobe/inventory",
            "/api/v1/marketplace/export-vinted",
            "/api/v1/marketplace/recommendations",
            "/api/v1/weather",
        ]
    }


# --- 1. COMPUTER VISION ---
@app.post("/api/v1/wardrobe/analyze-image", response_model=AnalyzeImageResponse)
async def analyze_image(file: UploadFile = File(...)):
    """
    Pipeline di analisi immagine:
    1. Rimozione background (rembg)
    2. Estrazione colore dominante
    3. Suggerimento limite lavaggio
    """
    input_data = await file.read()
    
    try:
        # 1. Scontorno
        output_data = remove(input_data)
        out_image = Image.open(io.BytesIO(output_data)).convert("RGBA")
        
        # 2. Colore dominante
        colore = get_dominant_color_hex(out_image)
        
        # 3. URL immagine temporaneo
        temp_url = f"pending_upload_{uuid.uuid4()}.png"
        
        # 4. Riconoscimento Intelligente Visivo (Gemini API)
        categoria_rilevata = "T-shirt"
        materiale_rilevato = "Cotone"
        marca_rilevata = "Nessuna"
        
        try:
            prompt = """Scansiona questo capo di abbigliamento. Cerca loghi o testi espliciti.
            Rispondi ESATTAMENTE con questo schema JSON e nient'altro:
            {
              "categoria": "la tipologia (es. T-shirt, Maglione, Jeans, Gonna, Scarpe, Accessori, Pantaloni, Cappotto)",
              "materiale": "tessuto probabile (es. Cotone, Denim, Sintetico, Lana, Pelle, Lino)",
              "marca": "il brand SE LEGGI o RICONOSCI un logo noto (es. Nike, Adidas, Gucci, Zara). Se non lo vedi scrivi Nessuna"
            }"""
            # Sottomettiamo al modello l'immagine nuda (prima dei ritocchi)
            response = gemini_model.generate_content([
                prompt,
                { "mime_type": file.content_type or "image/jpeg", "data": input_data }
            ])
            
            import re
            match = re.search(r'\{.*\}', response.text, re.DOTALL)
            if match:
                ai_data = json.loads(match.group(0))
                categoria_rilevata = str(ai_data.get('categoria', 'T-shirt')).capitalize()
                materiale_rilevato = str(ai_data.get('materiale', 'Cotone')).capitalize()
                marca_rilevata = str(ai_data.get('marca', 'Nessuna')).capitalize()
        except Exception as ai_e:
            print("Errore Gemini:", ai_e)  # logghiamo silenziosamente e procediamo
            
        limite_suggerito = suggest_wash_limit(categoria_rilevata, materiale_rilevato)
        
        return AnalyzeImageResponse(
            categoria_rilevata=categoria_rilevata,
            colore_primario=colore,
            forma="Standard",
            trama_materiale=materiale_rilevato,
            marca_rilevata=marca_rilevata,
            immagine_scontornata_url=temp_url,
            needs_quick_choice=False,
            candidates_for_resolution=[],
            limite_lavaggio_consigliato=limite_suggerito
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore analisi immagine: {str(e)}")


# --- 2. GESTIONE CAPI (CRUD) ---
@app.post("/api/v1/wardrobe/items")
async def add_item(item: ItemCreate):
    """Aggiunge un capo al guardaroba con limite lavaggio intelligente."""
    try:
        profile = get_or_create_profile(item.user_id, item.citta)
        
        # Calcola limite lavaggio: se l'utente non lo specifica, proponiamo noi
        limite = item.limite_lavaggio
        if limite is None:
            limite = suggest_wash_limit(item.categoria, item.trama_materiale)
        
        data = {
            "categoria": item.categoria,
            "colore_primario": item.colore_primario,
            "forma": item.forma,
            "trama_materiale": item.trama_materiale,
            "limite_lavaggio": limite,
            "image_url": item.image_url,
        }
        
        result = insert_clothing(profile["id"], data)
        return {
            "message": "✅ Capo aggiunto al guardaroba!",
            "item": result,
            "limite_lavaggio_applicato": limite,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/wardrobe/inventory")
async def get_inventory(user_id: str, only_available: bool = False):
    """Recupera l'inventario completo o solo i capi disponibili (non sporchi)."""
    try:
        profile = get_or_create_profile(user_id)
        if only_available:
            capi = get_available_clothes(profile["id"])
        else:
            capi = get_all_clothes(profile["id"])
        
        stats = {
            "totale": len(capi),
            "puliti": len([c for c in capi if c.get("stato") == "pulito"]),
            "sporchi": len([c for c in capi if c.get("stato") == "sporco"]),
            "in_lavaggio": len([c for c in capi if c.get("stato") == "in_lavaggio"]),
        }
        
        return {"capi": capi, "statistiche": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 3. CONFERMA OUTFIT (Laundry Logic + Scoring) ---
@app.post("/api/v1/outfits/confirm", response_model=OutfitResponse)
async def confirm_outfit(outfit: OutfitConfirm):
    """
    Il cuore dell'app. Quando l'utente conferma un outfit:
    1. Recupera i capi dal DB reale
    2. Prende il meteo dalla città impostata
    3. Calcola il punteggio (colori + meteo + freshness)
    4. Aggiorna i contatori e lo stato lavaggio
    5. Salva nello storico per le routine predittive
    """
    try:
        profile = get_or_create_profile(outfit.user_id, outfit.citta)
        
        # 1. Recupera capi reali dal DB
        capi = get_clothes_by_ids(outfit.clothing_ids)
        if not capi:
            raise HTTPException(status_code=404, detail="Nessun capo trovato con gli ID forniti.")
        
        # 2. Meteo reale
        temperatura = await get_current_temperature(outfit.citta)
        
        # 3. Scoring completo
        punteggio, breakdown = calcola_punteggio_outfit(temperatura, capi)
        messaggio = genera_messaggio_score(punteggio, breakdown)
        
        # 4. Laundry Logic: aggiorna i contatori
        alert_lavaggio = []
        for capo in capi:
            new_usi = capo.get("contatore_usi_attuali", 0) + 1
            new_stato = capo.get("stato", "pulito")
            
            if new_usi >= capo.get("limite_lavaggio", 3):
                new_stato = "sporco"
                alert_lavaggio.append(
                    f"🧺 {capo['categoria']} ({capo.get('colore_primario', '?')}) → "
                    f"da lavare! ({new_usi}/{capo.get('limite_lavaggio', 3)} utilizzi)"
                )
            
            update_clothing_state(capo["id"], new_usi, new_stato)
        
        # 5. Salva nello storico
        save_outfit_history(
            profile_id=profile["id"],
            contesto_tag=outfit.contesto_tag,
            punteggio=punteggio,
            temperatura=temperatura,
            clothing_ids=outfit.clothing_ids,
        )
        
        return OutfitResponse(
            punteggio=punteggio,
            messaggio=messaggio,
            breakdown=ScoreBreakdown(**breakdown),
            alert_lavaggio=alert_lavaggio,
            temperatura_attuale=temperatura,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 4. LAVAGGIO ---
@app.post("/api/v1/wardrobe/wash")
async def wash_clothes(req: WashRequest):
    """Segna i capi come lavati: resetta il contatore e rimettili puliti."""
    try:
        for cid in req.clothing_ids:
            reset_clothing_after_wash(cid)
        return {
            "message": f"🫧 {len(req.clothing_ids)} capi lavati e rimessi nel guardaroba!",
            "clothing_ids": req.clothing_ids
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 5. ROUTINE PREDITTIVA ---
@app.get("/api/v1/routines/suggestions")
async def get_routine_suggestions(user_id: str, weekday: int, hour: int):
    """
    Engine predittivo: analizza lo storico e suggerisce contesto + outfit.
    Se l'utente va in banca ogni lunedì alle 9, lo predice.
    """
    try:
        profile = get_or_create_profile(user_id)
        
        # Recupera storico
        history = get_outfit_history_by_context(profile["id"])
        
        # Analizza pattern
        routine_result = analizza_routine(history, weekday, hour)
        
        # Se c'è un contesto suggerito, prepara anche un outfit
        outfit_suggerito = []
        if routine_result["contesto_suggerito"]:
            capi_disponibili = get_available_clothes(profile["id"])
            outfit_suggerito = suggerisci_outfit_per_contesto(
                routine_result["contesto_suggerito"],
                capi_disponibili,
                history
            )
        
        return {
            **routine_result,
            "outfit_suggerito": outfit_suggerito,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 6. METEO ---
@app.get("/api/v1/weather")
async def get_weather(citta: str = "Roma"):
    """Endpoint meteo per la UI del frontend."""
    try:
        summary = await get_weather_summary(citta)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 7. MARKETPLACE HOOKS ---
@app.get("/api/v1/marketplace/export-vinted/{clothing_id}")
async def export_to_vinted(clothing_id: str):
    """Prepara i dati di un capo per l'export su Vinted."""
    try:
        capi = get_clothes_by_ids([clothing_id])
        if not capi:
            raise HTTPException(status_code=404, detail="Capo non trovato.")
        
        export_data = export_for_vinted(capi[0])
        return export_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/marketplace/recommendations")
async def get_recommendations(user_id: str):
    """Analizza i buchi nel guardaroba e suggerisce acquisti."""
    try:
        profile = get_or_create_profile(user_id)
        capi = get_all_clothes(profile["id"])
        suggerimenti = analizza_buchi_armadio(capi)
        
        return {
            "totale_capi": len(capi),
            "suggerimenti": suggerimenti,
            "messaggio": f"Abbiamo trovato {len(suggerimenti)} suggerimenti per il tuo guardaroba."
                         if suggerimenti else "Il tuo guardaroba è ben fornito! 💪"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================
# RUN
# =====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
