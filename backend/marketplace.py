"""
Modulo Marketplace — Hook per export e raccomandazioni future.
Predispone l'export a Vinted e i suggerimenti di acquisto (Zalando).
"""
from typing import List


def export_for_vinted(capo: dict) -> dict:
    """
    Prepara i dati di un capo per l'export verso Vinted.
    Genera un payload pronto per una futura API di listing.
    
    Returns:
        Dict con tutti i campi necessari per creare un annuncio.
    """
    # Mapping categorie interne → categorie Vinted
    vinted_categories = {
        "t-shirt": "Magliette e Top",
        "maglieria": "Maglioni e Felpe",
        "camicia": "Camicie",
        "felpa": "Maglioni e Felpe",
        "maglione": "Maglioni e Felpe",
        "pantaloni": "Pantaloni",
        "jeans": "Jeans",
        "gonna": "Gonne",
        "vestito": "Vestiti",
        "giacca": "Giacche e Cappotti",
        "cappotto": "Giacche e Cappotti",
        "scarpe": "Scarpe",
        "accessori": "Accessori",
    }
    
    categoria_interna = capo.get("categoria", "").lower()
    
    return {
        "titolo": f"{capo.get('categoria', 'Capo')} {capo.get('colore_primario', '')} - {capo.get('trama_materiale', '')}",
        "descrizione": _genera_descrizione_vinted(capo),
        "categoria_vinted": vinted_categories.get(categoria_interna, "Altro"),
        "colore": capo.get("colore_primario", ""),
        "materiale": capo.get("trama_materiale", ""),
        "immagine_url": capo.get("image_url", ""),
        "stato_usura": _calcola_stato_usura(capo),
        "ready_to_export": True,
    }


def analizza_buchi_armadio(capi: List[dict]) -> List[dict]:
    """
    Analizza l'inventario per trovare "buchi" — categorie mancanti o sotto-rappresentate.
    Suggerisce capi da acquistare su piattaforme come Zalando.
    
    Logica:
    - Un guardaroba base dovrebbe avere: maglieria, pantaloni, camicia, scarpe, giacca.
    - Se una categoria chiave manca o ha solo 1 capo → suggerisci acquisto.
    - Se un capo è troppo usurato (contatore alto, molti lavaggi) → suggerisci sostituzione.
    """
    categorie_essenziali = {
        "maglieria": {"min": 3, "label": "Magliette / T-shirt"},
        "pantaloni": {"min": 2, "label": "Pantaloni"},
        "camicia": {"min": 1, "label": "Camicie"},
        "jeans": {"min": 1, "label": "Jeans"},
        "scarpe": {"min": 2, "label": "Scarpe"},
        "giacca": {"min": 1, "label": "Giacche"},
        "felpa": {"min": 1, "label": "Felpe / Hoodie"},
    }
    
    # Conta capi per categoria
    conteggio = {}
    for capo in capi:
        cat = capo.get("categoria", "").lower()
        conteggio[cat] = conteggio.get(cat, 0) + 1
    
    suggerimenti = []
    
    # 1. Categorie mancanti o sotto-rappresentate
    for cat, info in categorie_essenziali.items():
        count = conteggio.get(cat, 0)
        if count < info["min"]:
            mancanti = info["min"] - count
            suggerimenti.append({
                "tipo": "buco_armadio",
                "categoria": info["label"],
                "messaggio": f"Ti {'manca' if count == 0 else 'servirebbe almeno un altro'} {info['label']}. Ne hai {count}/{info['min']}.",
                "priorita": "alta" if count == 0 else "media",
                "search_query_zalando": f"{info['label']}",  # Query di ricerca pronta
            })
    
    # 2. Capi troppo usurati (da sostituire)
    for capo in capi:
        usi = capo.get("contatore_usi_attuali", 0)
        limite = capo.get("limite_lavaggio", 3)
        # Se il capo ha accumulato il triplo dei lavaggi previsti, è "usurato"
        if limite > 0 and usi >= limite * 3:
            suggerimenti.append({
                "tipo": "usura",
                "categoria": capo.get("categoria", "Capo"),
                "messaggio": f"Il tuo {capo.get('categoria')} {capo.get('colore_primario', '')} è molto usurato ({usi} utilizzi). Valuta una sostituzione.",
                "priorita": "bassa",
                "search_query_zalando": f"{capo.get('categoria', '')} {capo.get('trama_materiale', '')}",
            })
    
    # Ordina per priorità
    priority_order = {"alta": 0, "media": 1, "bassa": 2}
    suggerimenti.sort(key=lambda s: priority_order.get(s["priorita"], 3))
    
    return suggerimenti


# --- Utility ---

def _genera_descrizione_vinted(capo: dict) -> str:
    """Genera una descrizione accattivante per Vinted."""
    parti = []
    if capo.get("categoria"):
        parti.append(f"Vendo {capo['categoria']}")
    if capo.get("colore_primario"):
        parti.append(f"colore {capo['colore_primario']}")
    if capo.get("trama_materiale"):
        parti.append(f"in {capo['trama_materiale']}")
    
    desc = ", ".join(parti) + "."
    desc += f" Condizioni: {_calcola_stato_usura(capo)}."
    desc += " Spedizione rapida!"
    
    return desc


def _calcola_stato_usura(capo: dict) -> str:
    """Determina lo stato di usura (terminologia da marketplace)."""
    usi = capo.get("contatore_usi_attuali", 0)
    limite = capo.get("limite_lavaggio", 3)
    
    if limite <= 0:
        return "Buone condizioni"
    
    ratio = usi / limite
    if ratio < 1:
        return "Nuovo / Mai lavato"
    elif ratio < 3:
        return "Come nuovo"
    elif ratio < 6:
        return "Buone condizioni"
    elif ratio < 10:
        return "Usato - Buono stato"
    else:
        return "Usato - Discreto"
