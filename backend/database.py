"""
Modulo Database — Connessione reale a Supabase e operazioni CRUD.
"""
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY
from typing import List, Optional
import uuid

# --- Connessione Singleton ---
_client: Optional[Client] = None

def get_db() -> Client:
    """Restituisce il client Supabase (singleton)."""
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# =====================
# PROFILES
# =====================
def get_or_create_profile(user_id: str, citta: str = None) -> dict:
    """Trova o crea un profilo utente."""
    db = get_db()
    res = db.table("profiles").select("*").eq("user_id", user_id).execute()
    if res.data:
        return res.data[0]
    # Crea nuovo profilo
    new_profile = {
        "user_id": user_id,
        "citta_riferimento": citta or "Roma"
    }
    created = db.table("profiles").insert(new_profile).execute()
    return created.data[0]


# =====================
# CLOTHES (CAPI)
# =====================
def insert_clothing(profile_id: str, data: dict) -> dict:
    """Inserisce un nuovo capo d'abbigliamento nella tabella clothes."""
    db = get_db()
    record = {
        "profile_id": profile_id,
        "categoria": data["categoria"],
        "colore_primario": data.get("colore_primario"),
        "forma": data.get("forma"),
        "trama_materiale": data.get("trama_materiale"),
        "limite_lavaggio": data.get("limite_lavaggio", 3),
        "contatore_usi_attuali": 0,
        "stato": "pulito",
        "image_url": data.get("image_url"),
    }
    result = db.table("clothes").insert(record).execute()
    return result.data[0]


def get_clothes_by_ids(clothing_ids: List[str]) -> List[dict]:
    """Recupera i capi dal DB dato un array di ID."""
    db = get_db()
    res = db.table("clothes").select("*").in_("id", clothing_ids).execute()
    return res.data


def get_available_clothes(profile_id: str) -> List[dict]:
    """Recupera tutti i capi DISPONIBILI (non sporchi/in_lavaggio) per un profilo."""
    db = get_db()
    res = (
        db.table("clothes")
        .select("*")
        .eq("profile_id", profile_id)
        .eq("stato", "pulito")
        .execute()
    )
    return res.data


def update_clothing_state(clothing_id: str, usi: int, stato: str):
    """Aggiorna il contatore usi e lo stato di un capo."""
    db = get_db()
    db.table("clothes").update({
        "contatore_usi_attuali": usi,
        "stato": stato,
        "updated_at": "now()"
    }).eq("id", clothing_id).execute()


def reset_clothing_after_wash(clothing_id: str):
    """Resetta un capo dopo il lavaggio (rimettilo pulito, contatore a 0)."""
    db = get_db()
    db.table("clothes").update({
        "contatore_usi_attuali": 0,
        "stato": "pulito",
        "updated_at": "now()"
    }).eq("id", clothing_id).execute()


def get_all_clothes(profile_id: str) -> List[dict]:
    """Restituisce TUTTI i capi di un profilo (per export/marketplace)."""
    db = get_db()
    res = db.table("clothes").select("*").eq("profile_id", profile_id).execute()
    return res.data


# =====================
# OUTFIT HISTORY
# =====================
def save_outfit_history(profile_id: str, contesto_tag: str, punteggio: float,
                        temperatura: float, clothing_ids: List[str]) -> dict:
    """Salva un outfit completo nello storico + relazione M:N con i capi."""
    db = get_db()
    # 1. Inserisci outfit_history
    outfit_record = {
        "profile_id": profile_id,
        "contesto_tag": contesto_tag,
        "punteggio_assegnato": punteggio,
        "temperatura_meteo": temperatura,
    }
    outfit_res = db.table("outfit_history").insert(outfit_record).execute()
    outfit_id = outfit_res.data[0]["id"]

    # 2. Inserisci relazioni M:N in outfit_items
    items = [{"outfit_id": outfit_id, "clothing_id": cid} for cid in clothing_ids]
    db.table("outfit_items").insert(items).execute()

    return outfit_res.data[0]


def get_outfit_history_by_context(profile_id: str, weekday: int = None,
                                   hour_range: tuple = None) -> List[dict]:
    """
    Recupera lo storico outfit filtrato opzionalmente per giorno della settimana
    e fascia oraria. Per l'engine predittivo.
    """
    db = get_db()
    query = db.table("outfit_history").select("*").eq("profile_id", profile_id)
    res = query.order("data_utilizzo", desc=True).limit(100).execute()
    
    results = res.data
    # Filtriamo lato Python per weekday/hour (PostgreSQL non supporta EXTRACT facilmente via REST)
    if weekday is not None or hour_range is not None:
        from datetime import datetime as dt
        filtered = []
        for r in results:
            ts = dt.fromisoformat(r["data_utilizzo"].replace("Z", "+00:00"))
            if weekday is not None and ts.weekday() != weekday:
                continue
            if hour_range is not None and not (hour_range[0] <= ts.hour <= hour_range[1]):
                continue
            filtered.append(r)
        results = filtered

    return results
