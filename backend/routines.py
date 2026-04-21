"""
Modulo Routine Predittiva — Engine dei contesti e suggerimenti proattivi.
Analizza lo storico degli outfit per predire il contesto più probabile
in base al giorno della settimana e alla fascia oraria.
"""
from typing import List, Optional
from collections import Counter
from datetime import datetime


def analizza_routine(outfit_history: List[dict], weekday: int, hour: int) -> dict:
    """
    Analizza lo storico per trovare pattern ricorrenti.
    
    Args:
        outfit_history: Lista di record dalla tabella outfit_history
        weekday: Giorno della settimana (0=Lunedì, 6=Domenica)
        hour: Ora locale corrente
        
    Returns:
        {
            "contesto_suggerito": str | None,
            "confidenza": float (0-1),
            "contesti_rapidi": List[str],  # Pulsanti rapidi ordinati per frequenza
            "pattern_rilevato": str,       # Descrizione testuale del pattern
        }
    """
    if not outfit_history:
        return {
            "contesto_suggerito": None,
            "confidenza": 0.0,
            "contesti_rapidi": ["Lavoro", "Casual", "Sport", "Serata"],
            "pattern_rilevato": "Nessuno storico disponibile. Inizia ad usare l'app!"
        }
    
    # Determina fascia oraria
    fascia = _get_fascia_oraria(hour)
    
    # Filtra per giorno della settimana
    stessa_giornata = []
    stessa_fascia = []
    
    for record in outfit_history:
        ts = _parse_timestamp(record.get("data_utilizzo", ""))
        if ts is None:
            continue
        if ts.weekday() == weekday:
            stessa_giornata.append(record)
            rec_fascia = _get_fascia_oraria(ts.hour)
            if rec_fascia == fascia:
                stessa_fascia.append(record)
    
    # Analisi contesti nella stessa fascia/giorno
    if stessa_fascia:
        contesti_fascia = [r["contesto_tag"] for r in stessa_fascia if r.get("contesto_tag")]
        counter = Counter(contesti_fascia)
        if counter:
            top_contesto, top_count = counter.most_common(1)[0]
            total = len(contesti_fascia)
            confidenza = top_count / total
            
            # Se almeno 3 occorrenze con confidenza >= 60%, è un pattern forte
            if top_count >= 3 and confidenza >= 0.6:
                pattern_desc = (
                    f"Pattern forte rilevato: '{top_contesto}' usato {top_count}/{total} volte "
                    f"il {_weekday_name(weekday)} in fascia {fascia}."
                )
            else:
                pattern_desc = (
                    f"Pattern debole: '{top_contesto}' apparso {top_count} volte su {total}. "
                    f"Continua ad usare l'app per migliorare le previsioni."
                )
            
            contesti_rapidi = [c for c, _ in counter.most_common(5)]
            # Aggiungi contesti generici se ne mancano
            for default in ["Lavoro", "Casual", "Sport", "Serata"]:
                if default not in contesti_rapidi:
                    contesti_rapidi.append(default)
                if len(contesti_rapidi) >= 6:
                    break
            
            return {
                "contesto_suggerito": top_contesto,
                "confidenza": round(confidenza, 2),
                "contesti_rapidi": contesti_rapidi,
                "pattern_rilevato": pattern_desc,
            }
    
    # Fallback: analizza solo per giorno (senza fascia)
    if stessa_giornata:
        contesti_giorno = [r["contesto_tag"] for r in stessa_giornata if r.get("contesto_tag")]
        counter = Counter(contesti_giorno)
        if counter:
            top, count = counter.most_common(1)[0]
            return {
                "contesto_suggerito": top,
                "confidenza": round(count / len(contesti_giorno) * 0.7, 2),  # penalità per fascia mancante
                "contesti_rapidi": [c for c, _ in counter.most_common(5)],
                "pattern_rilevato": f"Match parziale: '{top}' frequente il {_weekday_name(weekday)} (senza fascia oraria esatta)."
            }
    
    # Nessun pattern trovato: costruisci contesti rapidi dallo storico globale
    all_contesti = [r["contesto_tag"] for r in outfit_history if r.get("contesto_tag")]
    counter = Counter(all_contesti)
    rapidi = [c for c, _ in counter.most_common(5)] or ["Lavoro", "Casual", "Sport"]
    
    return {
        "contesto_suggerito": None,
        "confidenza": 0.0,
        "contesti_rapidi": rapidi,
        "pattern_rilevato": f"Nessun pattern per {_weekday_name(weekday)}. Uso i tuoi contesti più frequenti."
    }


def suggerisci_outfit_per_contesto(contesto: str, capi_disponibili: List[dict],
                                     outfit_history: List[dict]) -> List[dict]:
    """
    Dato un contesto (es. "Lavoro"), suggerisce un outfit dai capi disponibili.
    
    Strategia:
    1. Cerca negli outfit storici con lo stesso contesto quali categorie venivano usate.
    2. Tenta di assemblare un outfit simile dai capi puliti disponibili.
    3. Prioritizza i capi con il contatore_usi_attuali più basso (più freschi).
    """
    # 1. Scopri le categorie tipiche per questo contesto
    # Per ora, definiamo un outfit base: top + bottom + (opzionale) scarpe
    categorie_necessarie = ["maglieria", "pantaloni"]
    
    # Analizza storico per raffinare
    contesto_outfits = [r for r in outfit_history if r.get("contesto_tag", "").lower() == contesto.lower()]
    
    # 2. Seleziona i capi migliori per ogni categoria
    outfit_suggerito = []
    categorie_coperte = set()
    
    # Ordina i capi per freshness (meno usati prima)
    capi_sorted = sorted(capi_disponibili, key=lambda c: c.get("contatore_usi_attuali", 0))
    
    for cat in categorie_necessarie:
        for capo in capi_sorted:
            capo_cat = capo.get("categoria", "").lower()
            if capo_cat == cat and capo["id"] not in [c["id"] for c in outfit_suggerito]:
                outfit_suggerito.append(capo)
                categorie_coperte.add(cat)
                break
    
    # Aggiungi scarpe se disponibili
    for capo in capi_sorted:
        if capo.get("categoria", "").lower() == "scarpe" and capo["id"] not in [c["id"] for c in outfit_suggerito]:
            outfit_suggerito.append(capo)
            break
    
    return outfit_suggerito


# --- Utility interne ---

def _get_fascia_oraria(hour: int) -> str:
    """Classifica l'ora in una fascia."""
    if 6 <= hour < 10:
        return "mattina_presto"
    elif 10 <= hour < 13:
        return "mattina"
    elif 13 <= hour < 17:
        return "pomeriggio"
    elif 17 <= hour < 21:
        return "sera"
    else:
        return "notte"


def _weekday_name(weekday: int) -> str:
    """Restituisce il nome italiano del giorno."""
    nomi = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
    return nomi[weekday] if 0 <= weekday <= 6 else "Giorno sconosciuto"


def _parse_timestamp(ts_str: str) -> Optional[datetime]:
    """Parsa un timestamp ISO, gestendo vari formati."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
