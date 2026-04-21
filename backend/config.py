"""
Configurazione centralizzata per il Backend Wardrobe Assistant.
Variabili d'ambiente e costanti di sistema.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://kxwhrdqqabdcttescwjh.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4d2hyZHFxYWJkY3R0ZXNjd2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTY2NTIsImV4cCI6MjA5MjI3MjY1Mn0.N43b1nE6avf_0Vl2WmQ-pLN3NCRQ4OtW9MdVjP17k9o")

# --- Weather API (Open-Meteo, gratuita, no API key) ---
WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"

# --- Limiti di lavaggio di default per categoria/materiale ---
DEFAULT_WASH_LIMITS = {
    # Per categoria
    "t-shirt": 1,
    "maglieria": 2,
    "camicia": 2,
    "felpa": 3,
    "maglione": 4,
    "pantaloni": 3,
    "jeans": 5,
    "gonna": 3,
    "vestito": 2,
    "giacca": 5,
    "cappotto": 7,
    "scarpe": 10,
    "accessori": 15,
    # Per materiale (override se più restrittivo)
    "seta": 1,
    "lino": 1,
    "cotone": 2,
    "lana": 4,
    "denim": 5,
    "pelle": 10,
    "sintetico": 3,
}

# --- Pesi del punteggio ---
SCORE_WEIGHTS = {
    "meteo_coerenza": 3.0,     # max 3 punti per coerenza meteo
    "armonia_colori": 4.0,     # max 4 punti per armonia cromatica
    "freshness": 3.0,          # max 3 punti per "pulizia" dei capi
}

# --- Classificazione pesantezza capi ---
CLOTHING_WARMTH = {
    "t-shirt": 1,
    "canottiera": 0,
    "camicia": 2,
    "maglieria": 3,
    "felpa": 4,
    "maglione": 5,
    "giacca": 6,
    "cappotto": 8,
    "pantaloni": 3,
    "jeans": 4,
    "gonna": 2,
    "pantaloncini": 1,
    "vestito": 2,
    "scarpe": 0,  # neutro
    "accessori": 0,
}
