/**
 * Supabase Client — Singleton per il frontend
 */
const SUPABASE_URL = 'https://kxwhrdqqabdcttescwjh.supabase.co';
const SUPABASE_ANON_KEY = '[eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4d2hyZHFxYWJkY3R0ZXNjd2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTY2NTIsImV4cCI6MjA5MjI3MjY1Mn0.N43b1nE6avf_0Vl2WmQ-pLN3NCRQ4OtW9MdVjP17k9o]';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const auth = {
  /** Get current session */
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** Get current user */
  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  /** Sign up with email/password */
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  /** Sign in with email/password */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /** Sign out */
  async signOut() {
    await supabase.auth.signOut();
  },

  /** Listen for auth state changes */
  onAuthChange(callback) {
    supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  /** Get user profile from profiles table */
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  },

  /** Update user city */
  async updateCity(userId, city) {
    const { error } = await supabase
      .from('profiles')
      .update({ citta_riferimento: city })
      .eq('user_id', userId);
    if (error) throw error;
  },
};

/**
 * Storage helper — Upload clothing images to Supabase Storage
 */
const storage = {
  /** Upload image and return public URL */
  async uploadClothingImage(file, userId) {
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${userId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('clothes-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('clothes-images')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  },

  /** Delete an image */
  async deleteImage(path) {
    await supabase.storage.from('clothes-images').remove([path]);
  },
};

/**
 * Direct DB operations from frontend (for when backend is unavailable)
 */
const db = {
  async getClothes(profileId) {
    const { data } = await supabase.from('clothes').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
    return data || [];
  },

  async insertClothing(profileId, item) {
    const { data, error } = await supabase.from('clothes').insert({
      profile_id: profileId,
      categoria: item.categoria,
      colore_primario: item.colore_primario,
      forma: item.forma || 'Standard',
      trama_materiale: item.trama_materiale,
      limite_lavaggio: item.limite_lavaggio || 3,
      contatore_usi_attuali: 0,
      stato: 'pulito',
      image_url: item.image_url || '',
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateClothingState(id, usi, stato) {
    await supabase.from('clothes').update({
      contatore_usi_attuali: usi,
      stato: stato,
    }).eq('id', id);
  },

  async resetAfterWash(ids) {
    for (const id of ids) {
      await supabase.from('clothes').update({
        contatore_usi_attuali: 0,
        stato: 'pulito',
      }).eq('id', id);
    }
  },

  async saveOutfit(profileId, tag, score, temp, clothingIds) {
    const { data: outfit } = await supabase.from('outfit_history').insert({
      profile_id: profileId,
      contesto_tag: tag,
      punteggio_assegnato: score,
      temperatura_meteo: temp,
    }).select().single();

    if (outfit) {
      const items = clothingIds.map(cid => ({ outfit_id: outfit.id, clothing_id: cid }));
      await supabase.from('outfit_items').insert(items);
    }
    return outfit;
  },

  async getOutfitHistory(profileId, limit = 50) {
    const { data } = await supabase.from('outfit_history').select('*').eq('profile_id', profileId).order('data_utilizzo', { ascending: false }).limit(limit);
    return data || [];
  },
};
// Esporta le variabili a livello globale sul browser
window.auth = auth;
window.storage = storage;
window.db = db;
