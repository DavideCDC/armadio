"""
Modulo Scoring — Algoritmo di punteggio outfit (0-10).
Calcola il voto basandosi su:
  1. Coerenza Meteo (temperatura vs pesantezza capi)
  2. Armonia Colori (ruota cromatica HSL)
  3. Freshness (penalità per capi vicini al limite lavaggio)
"""
import colorsys
import math
from typing import List
from config import SCORE_WEIGHTS, CLOTHING_WARMTH


# =====================
# 1. COERENZA METEO
# =====================
def calcola_punteggio_meteo(temperatura: float, capi: List[dict]) -> float:
    """
    Calcola quanto l'outfit è coerente con la temperatura esterna.
    
    Logica:
    - Calcola la "pesantezza media" dell'outfit.
    - Confronta con la temperatura: caldo → capi leggeri, freddo → capi pesanti.
    - Restituisce un punteggio 0.0 → 1.0 (da moltiplicare per il peso).
    
    Fasce temperatura:
      > 30°C  → pesantezza ideale 0-1 (canottiera, t-shirt)
      20-30°C → pesantezza ideale 2-3 (camicia, maglieria leggera)
      10-20°C → pesantezza ideale 3-5 (felpa, maglione leggero)
      0-10°C  → pesantezza ideale 5-7 (maglione pesante, giacca)
      < 0°C   → pesantezza ideale 6-8 (cappotto)
    """
    if not capi:
        return 0.5

    # Calcola pesantezza media outfit
    warmth_values = []
    for capo in capi:
        cat = capo.get("categoria", "").lower()
        warmth_values.append(CLOTHING_WARMTH.get(cat, 2))
    
    avg_warmth = sum(warmth_values) / len(warmth_values)
    
    # Determina pesantezza ideale in base alla temperatura
    if temperatura > 30:
        ideal_warmth = 0.5
    elif temperatura > 20:
        ideal_warmth = 2.5
    elif temperatura > 10:
        ideal_warmth = 4.0
    elif temperatura > 0:
        ideal_warmth = 6.0
    else:
        ideal_warmth = 7.0
    
    # Calcola la distanza dalla pesantezza ideale (normalizzata 0-1)
    max_distance = 8.0  # massima distanza possibile sulla scala
    distance = abs(avg_warmth - ideal_warmth)
    score = max(0.0, 1.0 - (distance / max_distance))
    
    return score


# =====================
# 2. ARMONIA COLORI (Ruota Cromatica)
# =====================
def hex_to_hsl(hex_color: str) -> tuple:
    """Converte un colore HEX in HSL (Hue, Saturation, Lightness)."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return (0, 0, 0.5)  # grigio di default
    r, g, b = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360, s, l)  # Hue in gradi (0-360)


def angular_distance(h1: float, h2: float) -> float:
    """Calcola la distanza angolare minima tra due hue sulla ruota (0-180)."""
    diff = abs(h1 - h2) % 360
    return min(diff, 360 - diff)


def calcola_armonia_colori(capi: List[dict]) -> float:
    """
    Algoritmo basato sulla ruota cromatica.
    
    Relazioni armoniche riconosciute:
    - Monocromatico: stesso hue (distanza < 15°) → 1.0
    - Analogo: hue vicini (distanza 15-45°) → 0.9
    - Complementare: hue opposti (distanza 150-180°) → 0.85
    - Triade: 3 colori a 120° (distanza ~120°) → 0.8
    - Split-complementare: (distanza 130-160°) → 0.75
    - Acromatico: neutri (bianco, nero, grigio) → 1.0 (sempre ok)
    - Dissonante: nessuna relazione → 0.3-0.5
    
    Restituisce un punteggio 0.0 → 1.0
    """
    if len(capi) < 2:
        return 1.0  # un solo capo è sempre armonico con sé stesso

    colors_hsl = []
    for capo in capi:
        hex_col = capo.get("colore_primario", "#808080")
        if not hex_col or hex_col == "":
            hex_col = "#808080"
        colors_hsl.append(hex_to_hsl(hex_col))
    
    # Separa neutri (acromatici) dai cromatici
    # Un colore è "neutro" se la saturazione è molto bassa o la luminosità è molto alta/bassa
    chromatic = []
    for h, s, l in colors_hsl:
        if s < 0.1 or l < 0.1 or l > 0.9:
            continue  # neutro, va sempre bene
        chromatic.append((h, s, l))
    
    if len(chromatic) <= 1:
        return 1.0  # tutto neutro o solo un colore cromatico → perfetto
    
    # Analizza le relazioni tra tutte le coppie di colori cromatici
    pair_scores = []
    for i in range(len(chromatic)):
        for j in range(i + 1, len(chromatic)):
            dist = angular_distance(chromatic[i][0], chromatic[j][0])
            
            if dist < 15:
                pair_scores.append(1.0)     # Monocromatico
            elif dist < 45:
                pair_scores.append(0.9)     # Analogo
            elif 110 < dist < 130:
                pair_scores.append(0.8)     # Triade
            elif 130 <= dist < 150:
                pair_scores.append(0.75)    # Split-complementare
            elif 150 <= dist <= 180:
                pair_scores.append(0.85)    # Complementare
            elif 45 <= dist <= 75:
                pair_scores.append(0.6)     # Semi-analogo (ok ma non top)
            else:
                pair_scores.append(0.35)    # Dissonante
    
    return sum(pair_scores) / len(pair_scores)


# =====================
# 3. FRESHNESS
# =====================
def calcola_freshness(capi: List[dict]) -> float:
    """
    Penalità per capi vicini/oltre il limite di lavaggio.
    
    - Capo pulito con contatore basso → 1.0
    - Capo che si avvicina al limite → 0.7
    - Capo al limite (dovrebbe essere lavato) → 0.3
    - Capo sporco (ancora indossato) → 0.0
    
    Restituisce la media normalizzata (0.0 → 1.0).
    """
    if not capi:
        return 1.0
    
    scores = []
    for capo in capi:
        usi = capo.get("contatore_usi_attuali", 0)
        limite = capo.get("limite_lavaggio", 3)
        stato = capo.get("stato", "pulito")
        
        if stato == "sporco":
            scores.append(0.0)
        elif limite > 0:
            ratio = usi / limite
            if ratio < 0.5:
                scores.append(1.0)
            elif ratio < 0.8:
                scores.append(0.7)
            elif ratio < 1.0:
                scores.append(0.4)
            else:
                scores.append(0.1)
        else:
            scores.append(1.0)
    
    return sum(scores) / len(scores)


# =====================
# PUNTEGGIO FINALE COMPOSTO
# =====================
def calcola_punteggio_outfit(temperatura: float, capi: List[dict]) -> tuple:
    """
    Calcola il punteggio finale (0-10) e genera un breakdown dettagliato.
    
    Returns:
        (punteggio_finale, breakdown_dict)
    """
    meteo_raw = calcola_punteggio_meteo(temperatura, capi)
    colori_raw = calcola_armonia_colori(capi)
    freshness_raw = calcola_freshness(capi)
    
    meteo_score = meteo_raw * SCORE_WEIGHTS["meteo_coerenza"]
    colori_score = colori_raw * SCORE_WEIGHTS["armonia_colori"]
    freshness_score = freshness_raw * SCORE_WEIGHTS["freshness"]
    
    total = meteo_score + colori_score + freshness_score
    final = round(max(0.0, min(10.0, total)), 1)
    
    breakdown = {
        "meteo": {"raw": round(meteo_raw, 2), "weighted": round(meteo_score, 1), "max": SCORE_WEIGHTS["meteo_coerenza"]},
        "colori": {"raw": round(colori_raw, 2), "weighted": round(colori_score, 1), "max": SCORE_WEIGHTS["armonia_colori"]},
        "freshness": {"raw": round(freshness_raw, 2), "weighted": round(freshness_score, 1), "max": SCORE_WEIGHTS["freshness"]},
        "totale": final,
    }
    
    return final, breakdown


def genera_messaggio_score(punteggio: float, breakdown: dict) -> str:
    """Genera un messaggio testuale human-friendly basato sul punteggio."""
    if punteggio >= 9.0:
        msg = "🔥 Outfit impeccabile! Stile, comfort e coerenza al massimo."
    elif punteggio >= 7.5:
        msg = "✨ Ottima combinazione! Qualche dettaglio potrebbe essere perfezionato."
    elif punteggio >= 6.0:
        msg = "👍 Buono, ma c'è margine di miglioramento."
    elif punteggio >= 4.0:
        msg = "⚠️ Outfit discutibile. Controlla i colori o la coerenza col meteo."
    else:
        msg = "❌ Forse è meglio ripensare questa combinazione."
    
    # Aggiungi dettagli specifici
    if breakdown["freshness"]["raw"] < 0.5:
        msg += " Alcuni capi andrebbero davvero lavati."
    if breakdown["meteo"]["raw"] < 0.4:
        msg += " L'outfit non è adatto alla temperatura attuale."
    if breakdown["colori"]["raw"] < 0.5:
        msg += " I colori non si armonizzano bene tra loro."
    
    return msg
