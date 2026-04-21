"""
Modulo Meteo — Integrazione con Open-Meteo API (gratuita, no API key).
Recupera la temperatura corrente per una città usando geocoding + forecast.
"""
import httpx
from config import WEATHER_API_URL

# Cache semplice per evitare troppe chiamate
_geocode_cache: dict = {}


async def geocode_city(city_name: str) -> tuple:
    """
    Converte il nome di una città in coordinate (lat, lon).
    Usa l'API gratuita Open-Meteo Geocoding.
    """
    if city_name.lower() in _geocode_cache:
        return _geocode_cache[city_name.lower()]
    
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": city_name, "count": 1, "language": "it"}
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, timeout=10.0)
        data = resp.json()
    
    if "results" not in data or len(data["results"]) == 0:
        # Default: Roma
        return (41.89, 12.51)
    
    result = data["results"][0]
    coords = (result["latitude"], result["longitude"])
    _geocode_cache[city_name.lower()] = coords
    return coords


async def get_current_temperature(city_name: str) -> float:
    """
    Recupera la temperatura attuale per una città.
    Usa Open-Meteo Forecast API (gratuita, nessuna API key).
    
    Returns:
        Temperatura in gradi Celsius.
    """
    lat, lon = await geocode_city(city_name)
    
    params = {
        "latitude": lat,
        "longitude": lon,
        "current_weather": True,
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(WEATHER_API_URL, params=params, timeout=10.0)
        data = resp.json()
    
    if "current_weather" in data:
        return data["current_weather"]["temperature"]
    
    # Fallback: temperatura media
    return 20.0


async def get_weather_summary(city_name: str) -> dict:
    """
    Restituisce un sommario meteo completo per la UI.
    """
    lat, lon = await geocode_city(city_name)
    
    params = {
        "latitude": lat,
        "longitude": lon,
        "current_weather": True,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "timezone": "Europe/Rome",
        "forecast_days": 1,
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(WEATHER_API_URL, params=params, timeout=10.0)
        data = resp.json()
    
    current = data.get("current_weather", {})
    daily = data.get("daily", {})
    
    return {
        "citta": city_name,
        "temperatura_attuale": current.get("temperature", 20.0),
        "vento_kmh": current.get("windspeed", 0),
        "codice_meteo": current.get("weathercode", 0),
        "temp_max": daily.get("temperature_2m_max", [None])[0],
        "temp_min": daily.get("temperature_2m_min", [None])[0],
        "pioggia_mm": daily.get("precipitation_sum", [0])[0],
    }
