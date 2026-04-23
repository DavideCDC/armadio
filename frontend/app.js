/**
 * Wardrobe Assistant — App Logic v3
 * Auth + Supabase Direct + Storage + Backend fallback
 */

const API = 'http://localhost:8000/api/v1';

const state = {
  page: 'home',
  user: null,
  profile: { citta_riferimento: 'Roma' },
  wardrobe: [],
  selected: new Set(),
  context: null,
  weather: { temperatura_attuale: null, citta: 'Roma' },
  authMode: 'login',
  uploadedFile: null,
  detailItem: null,
  washSelected: new Set(),
};

const CAT_ICON = {
  't-shirt': 'shirt', 'maglieria': 'shirt', 'camicia': 'shirt',
  'felpa': 'shirt', 'maglione': 'shirt', 'pantaloni': 'scissors',
  'jeans': 'scissors', 'gonna': 'shirt', 'vestito': 'shirt',
  'giacca': 'shirt', 'cappotto': 'shirt', 'scarpe': 'footprints',
  'accessori': 'watch', 'canottiera': 'shirt',
};

const app = {
  // ==================
  // AUTH MODAL
  // ==================
  openAuthModal() {
    document.getElementById('authModal').classList.add('open');
    this.switchAuthTab('login');
  },
  
  closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
  },

  switchAuthTab(mode) {
    state.authMode = mode;
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authSuccess').style.display = 'none';
    if (mode === 'login') {
      document.getElementById('tabLogin').className = 'btn btn-primary';
      document.getElementById('tabRegister').className = 'btn btn-ghost';
      document.getElementById('authBtnText').textContent = 'Accedi';
    } else {
      document.getElementById('tabLogin').className = 'btn btn-ghost';
      document.getElementById('tabRegister').className = 'btn btn-primary';
      document.getElementById('authBtnText').textContent = 'Registrati';
    }
  },

  async handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;
    const errEl = document.getElementById('authError');
    const okEl = document.getElementById('authSuccess');
    errEl.style.display = 'none';
    okEl.style.display = 'none';

    if (!email || !pass) { errEl.textContent = 'Inserisci dati validi'; errEl.style.display = 'block'; return; }
    if (pass.length < 6) { errEl.textContent = 'Minimo 6 caratteri'; errEl.style.display = 'block'; return; }

    try {
      if (state.authMode === 'register') {
        await auth.signUp(email, pass);
        okEl.textContent = 'Registrato! Controlla la tua email.';
        okEl.style.display = 'block';
      } else {
        const data = await auth.signIn(email, pass);
        state.user = data.user;
        const prof = await auth.getProfile(state.user.id);
        if (prof) state.profile = prof;
        this.closeAuthModal();
        this.updateProfileUI();
        this.toast('Accesso effettuato');
        this.loadWardrobeData();
      }
    } catch (e) {
      errEl.textContent = e.message || 'Errore';
      errEl.style.display = 'block';
    }
  },

  async logout() {
    await auth.signOut();
    state.user = null;
    this.updateProfileUI();
    this.navigateTo('home');
    this.toast('Sessione terminata');
  },

  updateProfileUI() {
    if (state.user) {
      document.getElementById('loginBtn').style.display = 'none';
      document.getElementById('profileBtn').style.display = 'block';
    } else {
      document.getElementById('loginBtn').style.display = 'block';
      document.getElementById('profileBtn').style.display = 'none';
    }
  },

  // ==================
  // SETTINGS & DATA
  // ==================
  async saveCity() {
    const city = document.getElementById('settingsCity').value.trim();
    if (!city) { this.toast('Inserisci una città'); return; }
    try {
      if (state.user) await auth.updateCity(state.user.id, city);
      state.weather.citta = city;
      state.profile.citta_riferimento = city;
      this.toast(`Città aggiornata: ${city}`);
      this.refreshWeather();
    } catch (e) {
      state.weather.citta = city;
      state.profile.citta_riferimento = city;
      this.toast(`Città aggiornata localmente: ${city}`);
      this.refreshWeather();
    }
  },

  resetLocalData() {
    if(confirm('Vuoi davvero azzerare tutti i capi?')) {
      state.wardrobe = [];
      localStorage.removeItem('armadio_local_wardrobe');
      this.syncStats();
      this.renderGrid();
      this.navigateTo('home');
      this.toast('Dati locali azzerati');
    }
  },

  // ==================
  // NAV
  // ==================
  navigateTo(id) {
    document.querySelectorAll('.page:not(#page-auth)').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById(`page-${id}`);
    if (pg) { pg.classList.add('active'); state.page = id; }
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
    const nb = document.querySelector(`.nav-btn[data-page="${id}"]`);
    if (nb) nb.classList.add('active');

    if (id === 'wardrobe') this.renderGrid();
    if (id === 'outfit') this.loadOutfitBuilder();
    if (id === 'market') this.loadMarketplace();
    if (id === 'settings') {
      if (state.user) document.getElementById('settingsEmail').textContent = state.user.email;
      if (state.profile) document.getElementById('settingsCity').value = state.profile.citta_riferimento || '';
    }

    lucide.createIcons();
  },

  // ==================
  // WEATHER
  // ==================
  async refreshWeather() {
    try {
      const r = await fetch(`${API}/weather?citta=${encodeURIComponent(state.weather.citta)}`);
      if (r.ok) {
        const d = await r.json();
        state.weather = d;
        document.getElementById('weatherTemp').textContent = `${Math.round(d.temperatura_attuale)}°`;
        document.getElementById('weatherCity').textContent = d.citta;
        return;
      }
    } catch {}
    // Fallback: Open-Meteo direct from frontend
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(state.weather.citta)}&count=1&language=it`);
      const gd = await geo.json();
      if (gd.results && gd.results.length) {
        const { latitude, longitude } = gd.results[0];
        const wr = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        const wd = await wr.json();
        state.weather.temperatura_attuale = wd.current_weather.temperature;
        document.getElementById('weatherTemp').textContent = `${Math.round(wd.current_weather.temperature)}°`;
        document.getElementById('weatherCity').textContent = state.weather.citta;
        return;
      }
    } catch {}
    document.getElementById('weatherTemp').textContent = '22°';
    state.weather.temperatura_attuale = 22;
  },

  // ==================
  // WARDROBE
  // ==================
  async loadWardrobeData() {
    // Fallback locale immediato per la modalità ospite
    if (!state.user) {
      const loc = localStorage.getItem('armadio_local_wardrobe');
      if (loc) state.wardrobe = JSON.parse(loc);
      this.syncStats();
      this.renderGrid();
      return;
    }

    // Try backend first
    try {
      const r = await fetch(`${API}/wardrobe/inventory?user_id=${state.user.id}`);
      if (r.ok) {
        const d = await r.json();
        state.wardrobe = d.capi || [];
        this.updateStats(d.statistiche);
        this.saveLocalWardrobe();
        this.renderGrid();
        return;
      }
    } catch {}

    // Fallback: Supabase direct
    if (state.profile) {
      try {
        state.wardrobe = await db.getClothes(state.profile.id);
        this.syncStats();
        this.saveLocalWardrobe();
        this.renderGrid();
        return;
      } catch {}
    }
    this.renderGrid();
  },

  saveLocalWardrobe() {
    // Salva sempre nello storage del browser così gli ospiti non perdono i dati
    localStorage.setItem('armadio_local_wardrobe', JSON.stringify(state.wardrobe));
  },

  updateStats(s) {
    if (!s) return;
    document.getElementById('statTotal').textContent = s.totale || 0;
    document.getElementById('statClean').textContent = s.puliti || 0;
    document.getElementById('statDirty').textContent = s.sporchi || 0;
    document.getElementById('statWashing').textContent = s.in_lavaggio || 0;
  },

  renderGrid() {
    const grid = document.getElementById('wardrobeGrid');
    const empty = document.getElementById('wardrobeEmpty');
    if (!state.wardrobe.length) { grid.innerHTML = ''; if(empty) empty.style.display='block'; lucide.createIcons(); return; }
    if(empty) empty.style.display = 'none';
    grid.innerHTML = state.wardrobe.map(i => this.clothCard(i, false)).join('');
    lucide.createIcons();
  },

  clothCard(item, selectable) {
    const cat = (item.categoria || '').toLowerCase();
    const icon = CAT_ICON[cat] || 'shirt';
    const col = item.colore_primario || '#808080';
    const stato = item.stato || 'pulito';
    const usi = item.contatore_usi_attuali || 0;
    const lim = item.limite_lavaggio || 3;
    const pct = Math.min(100, (usi/lim)*100);
    const barCol = pct >= 100 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--green)';
    const sel = state.selected.has(item.id);
    const badgeCls = stato === 'pulito' ? 'badge-clean' : stato === 'sporco' ? 'badge-dirty' : 'badge-wash';
    const badgeTxt = stato === 'pulito' ? 'Pulito' : stato === 'sporco' ? 'Sporco' : 'Lavaggio';
    const onclick = selectable ? `onclick="app.toggleItem('${item.id}')"` : `onclick="app.openDetail('${item.id}')"`;
    const imgUrl = item.image_url;

    return `
      <div class="cloth-card ${sel?'selected':''}" ${onclick}>
        <div class="cloth-thumb">
          ${imgUrl ? `<img src="${imgUrl}" alt="${item.categoria}" style="width:100%;height:100%;object-fit:cover;">` : `<i data-lucide="${icon}"></i>`}
          <div class="color-swatch" style="background:${col}"></div>
          <span class="badge ${badgeCls}">${badgeTxt}</span>
        </div>
        <div class="cloth-info">
          <h4>${item.categoria || 'Capo'} ${item.marca && item.marca !== 'Nessuna' ? `<span style="font-size:0.7rem; color:var(--text-3);">(${item.marca})</span>` : ''}</h4>
          <div class="meta">${item.trama_materiale || '—'} · ${usi}/${lim} usi</div>
          <div class="usage-bar"><div class="fill" style="width:${pct}%;background:${barCol}"></div></div>
        </div>
      </div>`;
  },

  // ==================
  // ADD ITEM
  // ==================
  openAddItem() {
    document.getElementById('addModal').classList.add('open');
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('formArea').style.display = 'none';
    state.uploadedFile = null;
    const area = document.getElementById('uploadArea');
    const areaIcon = area?.querySelector('i');
    const areaSpan = area?.querySelector('span');
    if (areaIcon) areaIcon.style.display = '';
    if (areaSpan) areaSpan.style.display = '';
    lucide.createIcons();
  },

  closeModal() { document.getElementById('addModal').classList.remove('open'); },

  handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    state.uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const p = document.getElementById('photoPreview');
      p.src = ev.target.result; p.style.display = 'block';
      const aI = document.querySelector('#uploadArea i');
      const aS = document.querySelector('#uploadArea span');
      if (aI) aI.style.display = 'none';
      if (aS) aS.style.display = 'none';
    };
    reader.readAsDataURL(file);
    this.analyzeImage(file);
  },

  async analyzeImage(file) {
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });

      const GEMINI_API_KEY = 'AIzaSyDSrFq1g_LoKE1x6lK-aNe8KnaZhCi7trM';
      const prompt = `Analizza questo capo di abbigliamento e rispondi SOLO in JSON con questi campi:
categoria_rilevata (una di: T-shirt, Camicia, Maglione, Felpa, Pantaloni, Jeans, Gonna, Vestito, Scarpe, Giacca, Cappotto, Accessori),
colore_primario (in formato hex es. #000000),
trama_materiale (uno di: Cotone, Lana, Denim, Seta, Lino, Sintetico, Pelle),
limite_lavaggio_consigliato (numero intero da 1 a 10),
marca_rilevata (marca se visibile, altrimenti Nessuna)`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: file.type || 'image/jpeg', data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (response.ok) {
        const resData = await response.json();
        const jsonText = resData.candidates[0].content.parts[0].text;
        const cleanedText = jsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
        this.fillForm(JSON.parse(cleanedText));
        return;
      }
    } catch (e) {
      console.warn('Image analysis failed:', e);
    }
    
    // Fallback esistente
    this.fillForm({ categoria_rilevata:'Maglieria', colore_primario:'#555', trama_materiale:'Cotone', limite_lavaggio_consigliato:3 });
  },

  fillForm(d) {
    document.getElementById('formArea').style.display = 'block';
    const cs = document.getElementById('inCat');
    for (let o of cs.options) if (o.value.toLowerCase()===(d.categoria_rilevata||'').toLowerCase()) { o.selected=true; break; }
    const ms = document.getElementById('inMat');
    for (let o of ms.options) if (o.value.toLowerCase()===(d.trama_materiale||'').toLowerCase()) { o.selected=true; break; }
    const ci = document.getElementById('inColor');
    ci.value = d.colore_primario || '#555'; document.getElementById('inColorHex').textContent = ci.value;
    document.getElementById('inWash').value = d.limite_lavaggio_consigliato || 3;
    const mrc = document.getElementById('inMarca');
    if (mrc) {
      mrc.value = (d.marca_rilevata && d.marca_rilevata !== 'Nessuna') ? d.marca_rilevata : '';
    }
    lucide.createIcons();
  },

  async saveItem() {
    const categoria = document.getElementById('inCat').value;
    const colore = document.getElementById('inColor').value;
    const materiale = document.getElementById('inMat').value;
    const limite = parseInt(document.getElementById('inWash').value);
    const marcaEl = document.getElementById('inMarca');
    const marca = marcaEl && marcaEl.value.trim() ? marcaEl.value.trim() : 'Nessuna';

    // Upload image to Supabase Storage
    let imageUrl = '';
    if (state.uploadedFile && state.user) {
      try {
        imageUrl = await storage.uploadClothingImage(state.uploadedFile, state.user.id);
      } catch (e) {
        console.warn('Image upload failed:', e);
      }
    }

    // Try backend first
    try {
      const r = await fetch(`${API}/wardrobe/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: state.user ? state.user.id : 'demo',
          categoria, colore_primario: colore, forma: 'Standard',
          trama_materiale: materiale, marca: marca, limite_lavaggio: limite,
          image_url: imageUrl, citta: state.weather.citta,
        }),
      });
      if (r.ok) {
        const res = await r.json();
        state.wardrobe.push(res.item || this.makeLocalItem(categoria, colore, materiale, limite, imageUrl, marca));
        this.finishSave();
        return;
      }
    } catch {}

    // Fallback: Supabase direct
    if (state.profile) {
      try {
        const item = await db.insertClothing(state.profile.id, {
          categoria, colore_primario: colore, trama_materiale: materiale,
          limite_lavaggio: limite, image_url: imageUrl,
        });
        state.wardrobe.push(item);
        this.finishSave();
        return;
      } catch (e) {
        console.error('DB insert failed:', e);
      }
    }

    // Last resort: local only
    state.wardrobe.push(this.makeLocalItem(categoria, colore, materiale, limite, imageUrl));
    this.finishSave();
  },

  makeLocalItem(cat, col, mat, lim, img, marca) {
    return { id: 'local_' + Date.now(), categoria: cat, colore_primario: col, trama_materiale: mat, limite_lavaggio: lim, contatore_usi_attuali: 0, stato: 'pulito', image_url: img, marca: marca || 'Nessuna' };
  },

  finishSave() {
    this.saveLocalWardrobe();
    this.closeModal();
    this.syncStats();
    this.toast('Capo aggiunto al guardaroba');
    if (state.page === 'wardrobe') this.renderGrid();
    if (state.page === 'home') this.loadWardrobeData();
  },

  // ==================
  // OUTFIT
  // ==================
  loadOutfitBuilder() {
    state.selected.clear();
    const grid = document.getElementById('outfitGrid');
    const avail = state.wardrobe.filter(c => c.stato === 'pulito');
    if (!avail.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i data-lucide="shirt"></i><h3>Nessun capo disponibile</h3><p>Fai il bucato prima!</p></div>`;
      lucide.createIcons(); return;
    }
    grid.innerHTML = avail.map(i => this.clothCard(i, true)).join('');
    this.updateBtn();
    lucide.createIcons();
  },

  toggleItem(id) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    const grid = document.getElementById('outfitGrid');
    const avail = state.wardrobe.filter(c => c.stato === 'pulito');
    grid.innerHTML = avail.map(i => this.clothCard(i, true)).join('');
    this.updateBtn();
    lucide.createIcons();
  },

  updateBtn() {
    const b = document.getElementById('confirmBtn');
    const n = state.selected.size;
    b.disabled = n === 0;
    b.innerHTML = n === 0
      ? '<i data-lucide="sparkles"></i> Seleziona almeno un capo'
      : `<i data-lucide="sparkles"></i> Valuta outfit (${n} capi)`;
    lucide.createIcons();
  },

  async confirmOutfit() {
    if (!state.selected.size) return;
    const uid = state.user ? state.user.id : 'demo';
    const payload = { user_id: uid, clothing_ids: Array.from(state.selected), contesto_tag: state.context || 'Casual', citta: state.weather.citta || 'Roma' };
    this.navigateTo('score');
    document.getElementById('scoreValue').textContent = '...';
    document.getElementById('scoreMsg').textContent = 'Calcolando...';

    try {
      const r = await fetch(`${API}/outfits/confirm`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (r.ok) { this.showScore(await r.json()); this.loadWardrobeData(); return; }
    } catch {}
    
    // Aggiorna contatori locali
    state.selected.forEach(id => {
      const item = state.wardrobe.find(i => i.id === id);
      if (item) {
        item.contatore_usi_attuali = (item.contatore_usi_attuali || 0) + 1;
        if (item.contatore_usi_attuali >= (item.limite_lavaggio || 3)) item.stato = 'sporco';
      }
    });
    this.saveLocalWardrobe();

    // Valutazione AI
    try {
      const selectedItems = state.wardrobe.filter(i => state.selected.has(i.id));
      const score = await this.evaluateOutfitWithAI(selectedItems);
      this.showScore(score);
      return;
    } catch(e) {
      console.warn('AI eval failed:', e);
    }

    // Fallback statico
    this.showScore({
      punteggio: 7.5,
      messaggio: 'Buon outfit! (offline)',
      breakdown: {
        meteo: {weighted:2.5, max:3},
        colori: {weighted:3, max:4},
        freshness: {weighted:2, max:3},
        totale: 7.5
      },
      alert_lavaggio: [],
      temperatura_attuale: state.weather.temperatura_attuale || 22
    });
  },

  showScore(d) {
    const p = d.punteggio || 0;
    const circ = document.getElementById('scoreCircle');
    setTimeout(() => { circ.style.strokeDashoffset = 283 - (p/10)*283; }, 100);
    this.animateNum('scoreValue', 0, p, 1200);
    document.getElementById('scoreMsg').textContent = d.messaggio || '';
    const bd = d.breakdown || {};
    if (bd.meteo) { document.getElementById('bMeteo').textContent = `${bd.meteo.weighted}/${bd.meteo.max}`; document.getElementById('bMeteoBar').style.width = `${(bd.meteo.weighted/bd.meteo.max)*100}%`; }
    if (bd.colori) { document.getElementById('bColori').textContent = `${bd.colori.weighted}/${bd.colori.max}`; document.getElementById('bColoriBar').style.width = `${(bd.colori.weighted/bd.colori.max)*100}%`; }
    if (bd.freshness) { document.getElementById('bFresh').textContent = `${bd.freshness.weighted}/${bd.freshness.max}`; document.getElementById('bFreshBar').style.width = `${(bd.freshness.weighted/bd.freshness.max)*100}%`; }
    const ac = document.getElementById('alerts'); ac.innerHTML = '';
    (d.alert_lavaggio||[]).forEach(a => { ac.innerHTML += `<div class="alert alert-warn"><i data-lucide="alert-triangle"></i><span>${a}</span></div>`; });
    lucide.createIcons();
  },

  animateNum(id, from, to, dur) {
    const el = document.getElementById(id); const st = performance.now();
    const run = (now) => {
      const pr = Math.min((now-st)/dur, 1);
      const e = 1 - Math.pow(1-pr, 3);
      el.textContent = (from + (to-from)*e).toFixed(1);
      if (pr < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  },

  // ==================
  // CONTEXT
  // ==================
  selectContext(tag) {
    state.context = tag;
    document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
    if (event && event.target) {
      const el = event.target.closest('.tag');
      if (el) el.classList.add('active');
    }
    this.toast(`Contesto: ${tag}`);
  },

  // ==================
  // ROUTINE
  // ==================
  async loadRoutine() {
    const now = new Date();
    const wd = (now.getDay()+6)%7;
    const hr = now.getHours();
    const uid = state.user ? state.user.id : 'demo';
    try {
      const r = await fetch(`${API}/routines/suggestions?user_id=${uid}&weekday=${wd}&hour=${hr}`);
      if (r.ok) { this.renderRoutine(await r.json()); return; }
    } catch {}
    this.renderRoutine({ contesto_suggerito:null, confidenza:0, contesti_rapidi:['Lavoro','Casual','Sport','Serata'], pattern_rilevato:'Inizia ad usare l\'app per le previsioni' });
  },

  renderRoutine(d) {
    const rl = document.getElementById('routineLabel');
    if (d.contesto_suggerito && rl) {
      rl.textContent = 'SUGGERIMENTO PROATTIVO';
      document.getElementById('routineTitle').textContent = `Oggi sembra un giorno da "${d.contesto_suggerito}"`;
      document.getElementById('routineDetail').textContent = `Confidenza: ${Math.round(d.confidenza*100)}%`;
    }
    if (d.contesti_rapidi && d.contesti_rapidi.length) {
      const ICONS = { Lavoro:'briefcase', Casual:'coffee', Sport:'dumbbell', Serata:'moon', Banca:'landmark', Palestra:'dumbbell', 'Università':'book-open', Ufficio:'building-2' };
      document.getElementById('contextTags').innerHTML = d.contesti_rapidi.map(t => {
        const ic = ICONS[t] || 'tag';
        const sug = t === d.contesto_suggerito ? ' suggested' : '';
        return `<span class="tag${sug}" onclick="app.selectContext('${t}')"><i data-lucide="${ic}"></i> ${t}</span>`;
      }).join('');
      lucide.createIcons();
    }
  },

  // ==================
  // MARKETPLACE
  // ==================
  async loadMarketplace() {
    const uid = state.user ? state.user.id : 'demo';
    try {
      const r = await fetch(`${API}/marketplace/recommendations?user_id=${uid}`);
      if (r.ok) { const d = await r.json(); this.renderRecs(d.suggerimenti||[]); }
    } catch {
      this.renderRecs([{ tipo:'buco_armadio', categoria:'Giacche', messaggio:'Ti manca una giacca.', priorita:'alta' }]);
    }
    this.renderVinted();
    lucide.createIcons();
  },

  renderRecs(list) {
    const c = document.getElementById('marketRecs');
    if (!list.length) { c.innerHTML = `<div class="card" style="text-align:center"><p style="color:var(--text-2);font-size:.85rem">Guardaroba ben fornito!</p></div>`; return; }
    c.innerHTML = list.map(s => {
      const col = s.priorita==='alta' ? 'var(--red-dim)' : s.priorita==='media' ? 'var(--amber-dim)' : 'var(--blue-dim)';
      const icol = s.priorita==='alta' ? 'var(--red)' : s.priorita==='media' ? 'var(--amber)' : 'var(--blue)';
      return `<div class="card"><div class="card-row"><div class="card-icon" style="background:${col};color:${icol}"><i data-lucide="alert-circle"></i></div><div class="card-body"><h3>${s.categoria}</h3><p>${s.messaggio}</p></div></div></div>`;
    }).join('');
  },

  renderVinted() {
    const c = document.getElementById('vintedList');
    if (!state.wardrobe.length) { c.innerHTML = '<p style="font-size:.8rem;color:var(--text-3)">Aggiungi capi per esportarli.</p>'; return; }
    c.innerHTML = state.wardrobe.map(i => {
      const ic = CAT_ICON[(i.categoria||'').toLowerCase()] || 'shirt';
      return `<div class="card" style="cursor:pointer" onclick="app.exportVinted('${i.id}')"><div class="card-row"><div class="card-icon" style="background:var(--accent-dim);color:var(--accent)"><i data-lucide="${ic}"></i></div><div class="card-body"><h3>${i.categoria||'Capo'}</h3><p>${i.trama_materiale||'—'} · Esporta su Vinted</p></div></div></div>`;
    }).join('');
  },

  async exportVinted(id) {
    try { const r = await fetch(`${API}/marketplace/export-vinted/${id}`); if (r.ok) { const d = await r.json(); this.toast(`Listing: "${d.titolo}"`); return; } } catch {}
    this.toast('Export pronto (offline)');
  },

  // ==================
  // ITEM DETAIL
  // ==================
  openDetail(id) {
    const item = state.wardrobe.find(i => i.id === id);
    if (!item) return;
    state.detailItem = item;
    const cat = (item.categoria || '').toLowerCase();
    const icon = CAT_ICON[cat] || 'shirt';
    document.getElementById('detailIcon').innerHTML = `<i data-lucide="${icon}"></i>`;
    document.getElementById('detailName').textContent = item.categoria || 'Capo';
    const mrc = item.marca && item.marca !== 'Nessuna' ? item.marca : '';
    document.getElementById('detailMeta').textContent = `${item.categoria} ${mrc ? 'di ' + mrc : ''} · ${item.trama_materiale || '—'} · ${item.forma || 'Standard'}`;
    document.getElementById('detailUsi').textContent = item.contatore_usi_attuali || 0;
    document.getElementById('detailLimite').textContent = item.limite_lavaggio || 3;
    const stato = item.stato || 'pulito';
    const statEl = document.getElementById('detailStato');
    statEl.textContent = stato.charAt(0).toUpperCase() + stato.slice(1);
    statEl.style.color = stato === 'pulito' ? 'var(--green)' : stato === 'sporco' ? 'var(--red)' : 'var(--blue)';
    statEl.style.fontSize = '.85rem';
    document.getElementById('detailColorSwatch').style.background = item.colore_primario || '#808080';
    document.getElementById('detailColorHex').textContent = item.colore_primario || '#808080';
    const usi = item.contatore_usi_attuali || 0;
    const lim = item.limite_lavaggio || 3;
    const pct = Math.min(100, (usi/lim)*100);
    const bar = document.getElementById('detailWashBar');
    bar.style.width = pct + '%';
    bar.style.background = pct >= 100 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--green)';
    document.getElementById('detailModal').classList.add('open');
    lucide.createIcons();
  },

  closeDetailModal() {
    document.getElementById('detailModal').classList.remove('open');
    state.detailItem = null;
  },

  async deleteItem() {
    if (!state.detailItem) return;
    const id = state.detailItem.id;
    // Supabase direct delete
    if (state.user) {
      try {
        await supabase.from('clothes').delete().eq('id', id);
      } catch (e) {}
    }
    state.wardrobe = state.wardrobe.filter(i => i.id !== id);
    this.saveLocalWardrobe();
    this.closeDetailModal();
    this.syncStats();
    this.renderGrid();
    this.toast('Capo eliminato');
  },

  // ==================
  // WASH / LAUNDRY
  // ==================
  openWashModal() {
    state.washSelected.clear();
    const dirty = state.wardrobe.filter(c => c.stato === 'sporco' || c.stato === 'in_lavaggio');
    const container = document.getElementById('washList');
    if (!dirty.length) {
      container.innerHTML = `<div class="empty" style="padding:24px 0;"><i data-lucide="sparkles"></i><h3>Tutto pulito!</h3><p>Non hai capi da lavare</p></div>`;
      document.getElementById('washConfirmBtn').disabled = true;
    } else {
      container.innerHTML = dirty.map(item => {
        const ic = CAT_ICON[(item.categoria||'').toLowerCase()] || 'shirt';
        return `
          <div class="card" id="wash-${item.id}" onclick="app.toggleWashItem('${item.id}')" style="cursor:pointer;">
            <div class="card-row">
              <div class="card-icon" style="background:var(--red-dim);color:var(--red);"><i data-lucide="${ic}"></i></div>
              <div class="card-body">
                <h3>${item.categoria || 'Capo'}</h3>
                <p>${item.trama_materiale || '—'} · ${item.contatore_usi_attuali || 0} usi</p>
              </div>
              <div class="wash-check" id="wcheck-${item.id}" style="width:24px;height:24px;border-radius:6px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;transition:all .2s;"></div>
            </div>
          </div>`;
      }).join('');
    }
    document.getElementById('washModal').classList.add('open');
    lucide.createIcons();
  },

  closeWashModal() {
    document.getElementById('washModal').classList.remove('open');
  },

  toggleWashItem(id) {
    if (state.washSelected.has(id)) {
      state.washSelected.delete(id);
      document.getElementById(`wash-${id}`).style.borderColor = 'var(--border)';
      document.getElementById(`wcheck-${id}`).innerHTML = '';
      document.getElementById(`wcheck-${id}`).style.borderColor = 'var(--border)';
    } else {
      state.washSelected.add(id);
      document.getElementById(`wash-${id}`).style.borderColor = 'var(--accent)';
      document.getElementById(`wcheck-${id}`).innerHTML = '<i data-lucide="check" style="width:14px;height:14px;color:var(--accent);"></i>';
      document.getElementById(`wcheck-${id}`).style.borderColor = 'var(--accent)';
      lucide.createIcons();
    }
    const btn = document.getElementById('washConfirmBtn');
    const n = state.washSelected.size;
    btn.disabled = n === 0;
    btn.innerHTML = n === 0
      ? '<i data-lucide="waves"></i> Lava selezionati'
      : `<i data-lucide="waves"></i> Lava ${n} capi`;
    lucide.createIcons();
  },

  async confirmWash() {
    if (!state.washSelected.size) return;
    const ids = Array.from(state.washSelected);

    // Try backend first
    try {
      const uid = state.user ? state.user.id : 'demo';
      const r = await fetch(`${API}/wardrobe/wash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, clothing_ids: ids }),
      });
      if (r.ok) {
        // Update local state
        ids.forEach(id => {
          const item = state.wardrobe.find(i => i.id === id);
          if (item) { item.stato = 'pulito'; item.contatore_usi_attuali = 0; }
        });
        this.finishWash(ids.length);
        return;
      }
    } catch {}

    // Fallback: Supabase direct
    try {
      await db.resetAfterWash(ids);
      ids.forEach(id => {
        const item = state.wardrobe.find(i => i.id === id);
        if (item) { item.stato = 'pulito'; item.contatore_usi_attuali = 0; }
      });
    } catch (e) {
      // Local only
      ids.forEach(id => {
        const item = state.wardrobe.find(i => i.id === id);
        if (item) { item.stato = 'pulito'; item.contatore_usi_attuali = 0; }
      });
    }
    this.finishWash(ids.length);
  },

  finishWash(count) {
    this.saveLocalWardrobe();
    this.closeWashModal();
    this.syncStats();
    this.renderGrid();
    this.toast(`${count} capi lavati e pronti!`);
  },

  // ==================
  // UTILS
  // ==================

  async evaluateOutfitWithAI(items) {
    const temp = state.weather.temperatura_attuale || 22;
    const context = state.context || 'Casual';
    const itemsDesc = items.map(i =>
      `- ${i.categoria} (${i.trama_materiale || '?'}, colore: ${i.colore_primario || 'N/A'}, usi: ${i.contatore_usi_attuali || 0}/${i.limite_lavaggio || 3})`
    ).join('\n');

    const prompt = `Valuta questo outfit da 1 a 10. Rispondi SOLO in JSON valido senza markdown.
Contesto: ${context}
Temperatura: ${temp}°C
Capi:
${itemsDesc}

JSON esatto da restituire:
{"punteggio": <numero 1-10 con 1 decimale>, "messaggio": "<frase breve in italiano>", "breakdown": {"meteo": {"weighted": <0-3>, "max": 3}, "colori": {"weighted": <0-4>, "max": 4}, "freshness": {"weighted": <0-3>, "max": 3}, "totale": <somma>}, "alert_lavaggio": [], "temperatura_attuale": ${temp}}`;

    const GEMINI_API_KEY = 'AIzaSyDSrFq1g_LoKE1x6lK-aNe8KnaZhCi7trM';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    const data = await response.json();
    const clean = data.candidates[0].content.parts[0].text.replace(/```json/gi,'').replace(/```/g,'').trim();
    return JSON.parse(clean);
  },

  openLookModal() {
    document.getElementById('lookModal').classList.add('open');
    document.getElementById('lookStep1').style.display = 'block';
    document.getElementById('lookStep2').style.display = 'none';
    document.getElementById('lookStep3').style.display = 'none';
    document.getElementById('lookStep4').style.display = 'none';
    document.getElementById('lookUploadArea').style.display = '';
    document.getElementById('lookPhotoPreview').style.display = 'none';
    document.getElementById('lookAnalyzeBtn').disabled = true;
    document.getElementById('lookDestination').value = '';
    state.uploadedFile = null;
    state._lookDetected = [];
    state._lookPendingIndex = 0;
    lucide.createIcons();
  },

  closeLookModal() {
    document.getElementById('lookModal').classList.remove('open');
  },

  handleLookPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    state.uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const p = document.getElementById('lookPhotoPreview');
      p.src = ev.target.result;
      p.style.display = 'block';
      p.onclick = () => document.getElementById('lookPhotoInput').click();
      document.getElementById('lookUploadArea').style.display = 'none';
      document.getElementById('lookAnalyzeBtn').disabled = false;
    };
    reader.readAsDataURL(file);
  },

  async analyzeLook() {
    if (!state.uploadedFile) return;
    const destination = document.getElementById('lookDestination').value.trim() || 'Casual';

    document.getElementById('lookStep1').style.display = 'none';
    document.getElementById('lookStep2').style.display = 'block';

    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(state.uploadedFile);
      });

      const GEMINI_API_KEY = 'AIzaSyDSrFq1g_LoKE1x6lK-aNe8KnaZhCi7trM';
      const prompt = `Analizza tutti i capi di abbigliamento visibili su questa persona. Rispondi SOLO in JSON valido senza markdown.
Destinazione: ${destination}
Temperatura attuale: ${state.weather.temperatura_attuale || 22}°C

Restituisci questo JSON:
{
  "capi_rilevati": [
    {
      "categoria": "<T-shirt|Camicia|Maglione|Felpa|Pantaloni|Jeans|Gonna|Vestito|Scarpe|Giacca|Cappotto|Accessori>",
      "colore_primario": "<hex es. #000000>",
      "trama_materiale": "<Cotone|Lana|Denim|Seta|Lino|Sintetico|Pelle>",
      "marca_rilevata": "<marca se visibile altrimenti Nessuna>",
      "limite_lavaggio_consigliato": <numero 1-10>
    }
  ],
  "punteggio": <1-10 con 1 decimale>,
  "messaggio": "<commento stile in italiano>",
  "breakdown": {
    "meteo": {"weighted": <0-3>, "max": 3},
    "colori": {"weighted": <0-4>, "max": 4},
    "freshness": {"weighted": <0-3>, "max": 3},
    "totale": <somma>
  },
  "alert_lavaggio": []
}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: state.uploadedFile.type || 'image/jpeg', data: base64Data } }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error("Troppe richieste. Attendi un minuto e riprova.");
        throw new Error(`Errore API: ${response.status}`);
      }

      const data = await response.json();
      if (!data.candidates || !data.candidates[0].content) {
        throw new Error("Formato json non valido ricevuto dall'API.");
      }
      const clean = data.candidates[0].content.parts[0].text.replace(/```json/gi,'').replace(/```/g,'').trim();
      const result = JSON.parse(clean);

      state._lookResult = result;
      state._lookDetected = result.capi_rilevati || [];
      state._lookPendingIndex = 0;

      // Aggiorna contatori per capi già in armadio
      for (const rilevato of state._lookDetected) {
        const match = state.wardrobe.find(w =>
          w.categoria?.toLowerCase() === rilevato.categoria?.toLowerCase() &&
          w.colore_primario?.toLowerCase() === rilevato.colore_primario?.toLowerCase()
        );
        if (match) {
          match.contatore_usi_attuali = (match.contatore_usi_attuali || 0) + 1;
          if (match.contatore_usi_attuali >= (match.limite_lavaggio || 3)) match.stato = 'sporco';
          rilevato._matched = true;
          // Aggiorna su Supabase
          if (state.user && state.profile) {
            try {
              await db.updateClothingUses(match.id, match.contatore_usi_attuali, match.stato);
            } catch(e) {}
          }
        }
      }
      this.saveLocalWardrobe();

      // Filtra solo quelli non matchati
      state._lookPending = state._lookDetected.filter(c => !c._matched);
      state._lookPendingIndex = 0;

      document.getElementById('lookStep2').style.display = 'none';
      this._showNextPendingItem();

    } catch(e) {
      console.warn('Look analysis failed:', e);
      document.getElementById('lookStep2').style.display = 'none';
      document.getElementById('lookStep1').style.display = 'block';
      this.toast(e.message || 'Analisi fallita, riprova');
    }
  },

  _showNextPendingItem() {
    if (!state._lookPending || state._lookPendingIndex >= state._lookPending.length) {
      this._showLookScore();
      return;
    }
    const item = state._lookPending[state._lookPendingIndex];
    const total = state._lookPending.length;
    const current = state._lookPendingIndex + 1;
    document.getElementById('lookDetectedProgress').textContent = `Capo ${current} di ${total} non trovati`;
    document.getElementById('lookDetectedCard').innerHTML = `
      <div class="card-row" style="align-items:center;gap:12px;">
        <div class="card-icon" style="background:${item.colore_primario}20;border:2px solid ${item.colore_primario};min-width:48px;height:48px;border-radius:12px;"></div>
        <div class="card-body">
          <h3>${item.categoria}</h3>
          <p>${item.trama_materiale} · ${item.marca_rilevata !== 'Nessuna' ? item.marca_rilevata : ''}</p>
          <p style="font-size:.75rem;color:var(--text-3);">Colore: ${item.colore_primario} · Max usi: ${item.limite_lavaggio_consigliato}</p>
        </div>
      </div>`;
    document.getElementById('lookStep3').style.display = 'block';
    lucide.createIcons();
  },

  skipDetectedItem() {
    state._lookPendingIndex++;
    this._showNextPendingItem();
  },

  async confirmDetectedItem() {
    const item = state._lookPending[state._lookPendingIndex];
    let imageUrl = '';
    if (state.uploadedFile && state.user) {
      try { imageUrl = await storage.uploadClothingImage(state.uploadedFile, state.user.id); } catch(e) {}
    }
    if (state.profile) {
      try {
        const saved = await db.insertClothing(state.profile.id, {
          categoria: item.categoria,
          colore_primario: item.colore_primario,
          trama_materiale: item.trama_materiale,
          limite_lavaggio: item.limite_lavaggio_consigliato,
          image_url: imageUrl,
          marca: item.marca_rilevata || 'Nessuna',
          contatore_usi_attuali: 1,
        });
        state.wardrobe.push(saved);
      } catch(e) {
        state.wardrobe.push({
          id: 'local_' + Date.now(),
          categoria: item.categoria,
          colore_primario: item.colore_primario,
          trama_materiale: item.trama_materiale,
          limite_lavaggio: item.limite_lavaggio_consigliato,
          contatore_usi_attuali: 1,
          stato: 'pulito',
          image_url: imageUrl,
          marca: item.marca_rilevata || 'Nessuna',
        });
      }
    } else {
      state.wardrobe.push({
        id: 'local_' + Date.now(),
        categoria: item.categoria,
        colore_primario: item.colore_primario,
        trama_materiale: item.trama_materiale,
        limite_lavaggio: item.limite_lavaggio_consigliato,
        contatore_usi_attuali: 1,
        stato: 'pulito',
        image_url: imageUrl,
        marca: item.marca_rilevata || 'Nessuna',
      });
    }
    this.saveLocalWardrobe();
    this.toast(`${item.categoria} aggiunto all'armadio`);
    state._lookPendingIndex++;
    this._showNextPendingItem();
  },

  _showLookScore() {
    document.getElementById('lookStep3').style.display = 'none';
    document.getElementById('lookStep4').style.display = 'block';
    const result = state._lookResult;
    const p = result.punteggio || 0;
    setTimeout(() => {
      document.getElementById('lookScoreCircle').style.strokeDashoffset = 283 - (p/10)*283;
    }, 100);
    this.animateNum('lookScoreValue', 0, p, 1200);
    document.getElementById('lookScoreMsg').textContent = result.messaggio || '';
    const ac = document.getElementById('lookAlerts');
    ac.innerHTML = (result.alert_lavaggio||[]).map(a =>
      `<div class="alert alert-warn"><i data-lucide="alert-triangle"></i><span>${a}</span></div>`
    ).join('');
    this.syncStats();
    lucide.createIcons();
  },

  syncStats() {
    this.updateStats({
      totale: state.wardrobe.length,
      puliti: state.wardrobe.filter(c=>c.stato==='pulito').length,
      sporchi: state.wardrobe.filter(c=>c.stato==='sporco').length,
      in_lavaggio: state.wardrobe.filter(c=>c.stato==='in_lavaggio').length,
    });
  },

  filterWardrobe() {
    const grid = document.getElementById('wardrobeGrid');
    const dirty = state.wardrobe.filter(c => c.stato !== 'pulito');
    grid.innerHTML = (dirty.length ? dirty : state.wardrobe).map(i => this.clothCard(i, false)).join('');
    lucide.createIcons();
  },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 2200);
  },
};


// ==================
// INIT
// ==================
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // Load session if exists
  const session = await auth.getSession();
  if (session && session.user) {
    state.user = session.user;
    const profile = await auth.getProfile(session.user.id);
    if (profile) state.profile = profile;
  }
  
  app.updateProfileUI();
  app.navigateTo('home');
  app.refreshWeather();
  app.loadRoutine();
  app.loadWardrobeData();

  // Color picker
  document.getElementById('inColor').addEventListener('input', function() {
    document.getElementById('inColorHex').textContent = this.value;
  });

  // Modal close on background click
  document.getElementById('addModal').addEventListener('click', e => {
    if (e.target.id === 'addModal') app.closeModal();
  });
});
