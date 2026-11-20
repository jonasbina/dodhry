// ============================================================================
// HOLUBÍ BOMBARDOVÁNÍ - DELUXE ENGINE
// Fortnite-style lobby • realističtější grafika • lokální multiplayer (2 hráči)
// ============================================================================

(function() {
  'use strict';

  // --- DETERMINISTIC RNG (stejní holubi při každém spuštění) ---
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- COLOR HELPERS ---
  const _colorCtx = document.createElement('canvas').getContext('2d');
  const _colorCache = {};
  function toRGB(c) {
    if (_colorCache[c]) return _colorCache[c];
    _colorCtx.fillStyle = '#000';
    _colorCtx.fillStyle = c;
    const v = _colorCtx.fillStyle;
    let r = 0, g = 0, b = 0;
    if (v[0] === '#') {
      r = parseInt(v.slice(1, 3), 16); g = parseInt(v.slice(3, 5), 16); b = parseInt(v.slice(5, 7), 16);
    } else {
      const m = v.match(/[\d.]+/g);
      if (m) { r = +m[0]; g = +m[1]; b = +m[2]; }
    }
    return (_colorCache[c] = [r, g, b]);
  }
  function shade(c, amt) {
    const [r, g, b] = toRGB(c);
    const f = amt < 0 ? (x) => x * (1 + amt) : (x) => x + (255 - x) * amt;
    return `rgb(${Math.round(f(r))},${Math.round(f(g))},${Math.round(f(b))})`;
  }
  function mix(c1, c2, t) {
    const a = toRGB(c1), b = toRGB(c2);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }
  function rgba(c, a) {
    const [r, g, b] = toRGB(c);
    return `rgba(${r},${g},${b},${a})`;
  }
  function makeLayer(w, h, dpr) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * dpr));
    canvas.height = Math.max(1, Math.ceil(h * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, w, h };
  }
  function noiseCanvas(size, base, variance, rng) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = base;
    x.fillRect(0, 0, size, size);
    const img = x.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * variance;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    x.putImageData(img, 0, 0);
    // occasional pebbles
    for (let i = 0; i < size / 3; i++) {
      x.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rng() * 0.08})`;
      x.beginPath();
      x.arc(rng() * size, rng() * size, 0.5 + rng() * 1.4, 0, Math.PI * 2);
      x.fill();
    }
    return c;
  }

  const FONT = "'Lilita One', 'Impact', sans-serif";

  // --- ONLINE (kódy místností a přenos objektů) ---
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PEER_PREFIX = 'holubi-bomb-v2-';
  const NET_VERSION = 1;
  const NET_SKIP = new Set(['owner', 'trail', 'attachedTarget']);
  function packEntity(e) {
    const o = {};
    for (const k of Object.keys(e)) {
      if (NET_SKIP.has(k)) continue;
      const v = e[k];
      if (typeof v === 'function') continue;
      o[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    }
    return o;
  }
  function syncList(list, packed, Cls, transform) {
    const byId = new Map(list.map(e => [e.id, e]));
    return packed.map(o => {
      if (transform) transform(o);
      let e = byId.get(o.id);
      if (!e) {
        e = Object.create(Cls.prototype);
        e.trail = [];
      }
      return Object.assign(e, o);
    });
  }

  // --- 200 PIGEON CHARACTERS GENERATOR (6 RARITY TIERS) ---
  // --- REALISTICKÁ ZBARVENÍ A JMÉNA HOLUBŮ ---
  const PIGEON_MORPHS = [
    { id: 'bar', body: '#8f98a6', wing: '#828c9a', neck: '#3d9a6a', bars: '#2b2f38' },
    { id: 'checker', body: '#7f8896', wing: '#6d7684', neck: '#4a8f6e', checker: true },
    { id: 'dark', body: '#545963', wing: '#454a53', neck: '#3f7d63', checker: true },
    { id: 'black', body: '#2d2f34', wing: '#222428', neck: '#3e6a5a', bars: '#15161a' },
    { id: 'white', body: '#eceef0', wing: '#dfe2e6', neck: '#e4dcec', beak: '#d8b894', bars: 'rgba(0,0,0,0.06)' },
    { id: 'ashred', body: '#cbbab0', wing: '#b8a092', neck: '#b56d8c', bars: '#8a3b2e', beak: '#c9a080' },
    { id: 'brown', body: '#8b6a52', wing: '#77594a', neck: '#7a9a5a', bars: '#3e2a20' },
    { id: 'pied', body: '#d9dade', wing: '#6b717b', neck: '#3d9a6a', pied: true },
    { id: 'grizzle', body: '#b8bcc2', wing: '#a2a7af', neck: '#6fa88a', checker: true },
    { id: 'yellow', body: '#e3d3b0', wing: '#d6c39b', neck: '#c9a64a', bars: '#a8803a', beak: '#d8b894' },
    { id: 'silver', body: '#c3c8cf', wing: '#b2b8c1', neck: '#7fb3a0', bars: '#5d636c' },
    { id: 'blue', body: '#7c8aa3', wing: '#6c7a93', neck: '#4f9a82', bars: '#273044' }
  ];
  const PIGEON_NAMES = ['Franta', 'Pepa', 'Jarda', 'Karel', 'Mirek', 'Zdeněk', 'Lojza', 'Venca', 'Bohouš', 'Tonda', 'Honza', 'Kuba', 'Míša', 'Ota', 'Ruda', 'Vašek', 'Láďa', 'Olda', 'Radek', 'Standa', 'Bára', 'Jitka', 'Hanka', 'Máňa', 'Zdena', 'Eliška', 'Věra', 'Dáša', 'Lída', 'Marta'];
  const PIGEON_BREEDS = ['Městský holub', 'Skalní holub', 'Hřivnáč', 'Pražský rejdič', 'Brněnský voláč', 'Český stavák', 'Poštovní holub', 'Kotrlák', 'Pávík', 'Bublák', 'Doupňák', 'Slezský voláč', 'Nádražní holub', 'Parkový holub'];

  // --- EDIT HOLUBA: úpravy vzhledu za tokeny ---
  const EDIT_COLOR_PARTS = [
    { key: 'body', prop: 'bodyColor', label: 'Peří těla', icon: '🪶', cost: 1 },
    { key: 'wing', prop: 'wingColor', label: 'Křídla a ocas', icon: '🕊️', cost: 1 },
    { key: 'neck', prop: 'neckColor', label: 'Duhový krk', icon: '🌈', cost: 1 },
    { key: 'beak', prop: 'beakColor', label: 'Zobák', icon: '🔺', cost: 1 },
    { key: 'eye', prop: 'eyeColor', label: 'Oči', icon: '👁️', cost: 1 }
  ];
  const EDIT_PALETTE = {
    body: ['#8f98a6', '#7f8896', '#545963', '#2d2f34', '#eceef0', '#cbbab0', '#8b6a52', '#e3d3b0', '#c3c8cf', '#7c8aa3', '#a86b6b', '#6b8f6e', '#c9a46b', '#6a4a8a', '#3a5a8a', '#d98fae'],
    wing: ['#828c9a', '#6d7684', '#454a53', '#222428', '#dfe2e6', '#b8a092', '#77594a', '#d6c39b', '#b2b8c1', '#6c7a93', '#8a4f4f', '#55704f', '#a8834a', '#523a6e', '#2a4570', '#b86f8e'],
    neck: ['#3d9a6a', '#4a8f6e', '#b56d8c', '#7a5ab5', '#2fb4c9', '#c9a64a', '#d35a5a', '#5a7ad3', '#e4dcec', '#7dff3b', '#ff9f43', '#ff3ea5'],
    beak: ['#3a3a3a', '#1a1a1a', '#d8b894', '#c9a080', '#e8a33d', '#e85d5d', '#f5f0e6', '#7a5a3a'],
    eye: ['#ff8a3d', '#ff3b3b', '#ffd23b', '#f0f0e0', '#5ad1ff', '#7dff3b', '#b45cff', '#2a2a2a']
  };
  const EDIT_PATTERNS = [
    { id: 'none', label: 'Bez vzoru' }, { id: 'bars', label: 'Pruhy' }, { id: 'checker', label: 'Kropenatý' },
    { id: 'pied', label: 'Strakatý' }, { id: 'spots', label: 'Tečkovaný' }
  ];
  const EDIT_MARKS = [
    { id: 'none', label: 'Žádné' }, { id: 'whiteHead', label: 'Bílá hlava' }, { id: 'darkHead', label: 'Tmavá hlava' },
    { id: 'whiteTail', label: 'Bílý ocas' }, { id: 'wingTips', label: 'Tmavé letky' }
  ];
  const EDIT_AURAS = ['#ffd23b', '#33e1ff', '#ff3b5c', '#b45cff', '#7dff3b', '#ffffff', '#ff7a1a'];
  const EDIT_COSTS = { pattern: 2, mark: 2, aura: 5 };
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  // vyčistí úpravu (např. přijatou od soupeře v online hře)
  function sanitizeEdit(e) {
    const out = {};
    if (!e || typeof e !== 'object') return out;
    EDIT_COLOR_PARTS.forEach(p => { if (HEX_RE.test(e[p.key])) out[p.key] = e[p.key].toLowerCase(); });
    if (EDIT_PATTERNS.some(x => x.id === e.pattern)) out.pattern = e.pattern;
    if (EDIT_MARKS.some(x => x.id === e.mark)) out.mark = e.mark;
    if (HEX_RE.test(e.aura)) out.aura = e.aura.toLowerCase();
    return out;
  }

  // vzhled holuba s úpravami (statistiky zůstávají z holuba)
  const _appCache = {};
  function getAppearance(pigeon, edit) {
    if (!pigeon) return pigeon;
    const e = sanitizeEdit(edit);
    if (!Object.keys(e).length) return pigeon;
    const key = `${pigeon.id}|${JSON.stringify(e)}`;
    if (_appCache[key]) return _appCache[key];
    const app = Object.assign({}, pigeon);
    EDIT_COLOR_PARTS.forEach(p => { if (e[p.key]) app[p.prop] = e[p.key]; });
    if (e.pattern) app.pattern = e.pattern;
    if (e.mark) app.mark = e.mark;
    if (e.aura) app.aura = e.aura;
    app.edited = true;
    delete app._pal;
    return (_appCache[key] = app);
  }

  // --- PRŮVODCE MÓDY (sjeď v lobby dolů jako ve Fortnite) ---
  const DISCOVER_MODES = [
    { mode: 'campaign', title: 'KAMPAŇ', icon: '🗺️', tag: 'SÓLO • 100 LEVELŮ', theme: 'day', desc: '100 levelů v 5 světech. Plň mise, sbírej hvězdy a za každých 5 levelů token.' },
    { mode: 'online', title: 'ONLINE 1v1', icon: '🌐', tag: 'ONLINE • 90 S', theme: 'neon', desc: 'Utkej se s kamarádem přes internet. Jeden vytvoří kód, druhý ho zadá.' },
    { mode: 'free', title: 'NEKONEČNÝ MÓD', icon: '♾️', tag: 'SÓLO • BEZ LIMITU', theme: 'sunset', desc: 'Bombarduj bez časového limitu a naháněj rekord do žebříčku.' },
    { mode: 'coop', title: 'CO-OP DUO', icon: '🤝', tag: '2 HRÁČI • 1 KLÁVESNICE', theme: 'dusk', desc: 'Dva holubi spolu proti celému městu na jedné klávesnici.' },
    { mode: 'versus', title: 'SOUBOJ 1v1', icon: '⚔️', tag: '2 HRÁČI • 90 S', theme: 'night', desc: 'Kdo za 90 sekund nasbírá víc bodů? Souboj na jedné klávesnici.' }
  ];
  const DISCOVER_ROWS = [
    { title: '⭐ DOPORUČENÉ', big: true, modes: ['campaign', 'online'] },
    { title: '🕊️ SÓLO', modes: ['campaign', 'free'] },
    { title: '👥 S KAMARÁDY', modes: ['online', 'coop', 'versus'] }
  ];

  // --- PASS (jako v Brawl Stars): 50 úrovní, free + prémiová cesta ---
  const PASS_TIERS = 50;
  const PASS_PREMIUM_PRICE = 250000;
  function passXpForTier(n) {
    // kumulativní XP potřebné pro úroveň n
    return n <= 0 ? 0 : 1000 * n + 150 * n * (n + 1);
  }
  function generate200Pigeons() {
    const rng = mulberry32(20240607);
    // Ceny jsou nastavené tak, aby cesta k nejlepšímu holubovi (GigaChad + max vylepšení + ultra skin) trvala desítky hodin
    const curated = [
      { id: 'classic', name: 'Městský Pepík', tier: 'common', price: 0, bodyColor: '#8a939e', wingColor: '#7a838f', neckColor: '#3d9a6a', beakColor: '#3a3a3a', abilityKey: 'nitro', abilityName: 'Křídelní Nitro', abilityIcon: '⚡', abilityDesc: 'Zvýší rychlost letu o 60 % na 3.5 sekundy.' },
      { id: 'agent', name: 'Agent 00-Holub', tier: 'rare', price: 2500, bodyColor: '#3b414d', wingColor: '#2c313b', neckColor: '#5a7f9e', beakColor: '#2a2a2a', abilityKey: 'slowmo', abilityName: 'Matrix Slow-Mo', abilityIcon: '⏱️', abilityDesc: 'Zpomalí čas o 75 % na 4 sekundy pro přesné míření.' },
      { id: 'zombie', name: 'Zombie Holub', tier: 'rare', price: 4000, bodyColor: '#7d8f6e', wingColor: '#66775a', neckColor: '#8a4a3c', beakColor: '#5a5a4a', abilityKey: 'zombieCloud', abilityName: 'Jedovatý Flusanec', abilityIcon: '🧟', abilityDesc: 'Vypustí zelený jedovatý mrak, který omráčí nejbližší chodce.' },
      { id: 'cyber', name: 'Cyber-Holub 2099', tier: 'rare', price: 6000, bodyColor: '#5d6b85', wingColor: '#48556e', neckColor: '#2fb4c9', beakColor: '#2a2a2a', abilityKey: 'emp', abilityName: 'Laserový Pulz', abilityIcon: '📡', abilityDesc: 'EMP rázová vlna v okruhu 220px omráčí chodce.' },
      { id: 'ninja', name: 'Ninja Holub', tier: 'epic', price: 12000, bodyColor: '#2b2d31', wingColor: '#1f2124', neckColor: '#3e6a5a', beakColor: '#2a2a2a', abilityKey: 'shuriken', abilityName: 'Shuriken Salva', abilityIcon: '🥷', abilityDesc: 'Vystřelí salvu 5 shuriken bobků vějířem dolů.' },
      { id: 'viking', name: 'Viking Holub', tier: 'epic', price: 18000, bodyColor: '#8b6a52', wingColor: '#6e523e', neckColor: '#7a9a5a', beakColor: '#3a3028', abilityKey: 'berserk', abilityName: 'Válečný Řev', abilityIcon: '🪓', abilityDesc: 'Nekonečné bobky a zrychlené kadění na 4.5 sekundy.' },
      { id: 'mafia', name: 'Don Corleone', tier: 'epic', price: 28000, bodyColor: '#6b707a', wingColor: '#565b64', neckColor: '#4f8a72', beakColor: '#2a2a2a', abilityKey: 'airstrike', abilityName: 'Mafiánská Podpora', abilityIcon: '🕶️', abilityDesc: 'Dva parťáci proletí nad ulicí a bombardují ji.' },
      { id: 'king', name: 'Královský Holub', tier: 'legendary', price: 60000, bodyColor: '#e3d3b0', wingColor: '#d2bc8e', neckColor: '#c9a64a', beakColor: '#c9a070', abilityKey: 'goldenRain', abilityName: 'Zlatý Příděl', abilityIcon: '👑', abilityDesc: '3.5 sekundy padá z nebe zlatý déšť bobků.' },
      { id: 'pirate', name: 'Pirátský Černovous', tier: 'legendary', price: 85000, bodyColor: '#2a2c31', wingColor: '#1d1f23', neckColor: '#4e6a5e', beakColor: '#2a2a2a', abilityKey: 'cannonball', abilityName: 'Dělová Koule', abilityIcon: '💣', abilityDesc: 'Těžký dělový bobek způsobí rázovou vlnu a srazí cyklisty.' },
      { id: 'astronaut', name: 'Kosmonaut Holub', tier: 'legendary', price: 120000, bodyColor: '#eceef0', wingColor: '#dcdfe3', neckColor: '#c9d6e6', beakColor: '#e0c0a0', abilityKey: 'antigravity', abilityName: 'Mikrogravitace', abilityIcon: '🚀', abilityDesc: 'Chodci pod tebou na 4 sekundy začnou levitovat.' },
      { id: 'rainbow', name: 'Duhový Fénix', tier: 'legendary', price: 170000, bodyColor: '#c9b8ae', wingColor: '#b49b8d', neckColor: '#b56d8c', beakColor: '#c9a080', abilityKey: 'supernova', abilityName: 'Duhový Záblesk', abilityIcon: '🦄', abilityDesc: 'Oslňující záblesk zasáhne 3 nejbližší chodce.' },
      { id: 'sith', name: 'Darth Pigeon (Sith)', tier: 'mythic', price: 300000, bodyColor: '#24262b', wingColor: '#17181c', neckColor: '#5a3a4a', beakColor: '#1a1a1a', abilityKey: 'forceLightning', abilityName: 'Sithský Blesk', abilityIcon: '⚡', abilityDesc: 'Blesk z nebe srazí 2 nejbližší chodce do K.O.' },
      { id: 'alien', name: 'UFO Mimozemšťan', tier: 'mythic', price: 500000, bodyColor: '#a7b4a0', wingColor: '#8e9c88', neckColor: '#6fbf9a', beakColor: '#4a4a4a', abilityKey: 'ufoAbduct', abilityName: 'Mini Abdukce', abilityIcon: '🛸', abilityDesc: 'Světelný paprsek vysaje 2 chodce a udělí +150 mincí.' },
      { id: 'dragon', name: 'Dračí Holub', tier: 'mythic', price: 800000, bodyColor: '#9c5a45', wingColor: '#7c4434', neckColor: '#b8743a', beakColor: '#3a2a22', abilityKey: 'dragonFire', abilityName: 'Dračí Dech', abilityIcon: '🐉', abilityDesc: 'Chrlí 5 ohnivých meteoritů dolů na ulici.' },
      { id: 'gigachad', name: 'GigaChad Holub', tier: 'cosmic', price: 3000000, bodyColor: '#b8bcc2', wingColor: '#9da2aa', neckColor: '#5fa88a', beakColor: '#2a2a2a', abilityKey: 'gigachadShock', abilityName: 'Giga Otřes', abilityIcon: '🗿', abilityDesc: 'Otřes země srazí blízké lidi a přidá +200 mincí. Nejsilnější holub ve hře.' }
    ];

    const tiers = [
      { name: 'common', minP: 150, maxP: 1500, count: 35 },
      { name: 'rare', minP: 2000, maxP: 9000, count: 40 },
      { name: 'epic', minP: 10000, maxP: 45000, count: 40 },
      { name: 'legendary', minP: 50000, maxP: 200000, count: 40 },
      { name: 'mythic', minP: 250000, maxP: 900000, count: 30 },
      { name: 'cosmic', minP: 1000000, maxP: 2500000, count: 15 }
    ];

    const tierBonus = (t) => ({
      speedMult: 1.0 + ({ rare: 0.1, epic: 0.15, legendary: 0.2, mythic: 0.25, cosmic: 0.35 }[t] || 0),
      reloadMult: 1.0 + ({ epic: 0.15, legendary: 0.25, mythic: 0.3, cosmic: 0.35 }[t] || 0),
      coinMult: 1.0 + ({ rare: 0.1, epic: 0.2, legendary: 0.4, mythic: 0.6, cosmic: 1.0 }[t] || 0)
    });
    const PULSE = {
      common: ['Holubí Mávnutí', '💨'], rare: ['Silné Mávnutí', '💨'], epic: ['Rázová Vlna', '🌀'],
      legendary: ['Zlatá Vlna', '✨'], mythic: ['Mýtický Úder', '⚡'], cosmic: ['Kosmický Výbuch', '🌌']
    };

    const allSkins = {};
    curated.forEach(s => {
      Object.assign(s, tierBonus(s.tier));
      s.poopType = { king: 'gold', cyber: 'cyber', rainbow: 'rainbow', zombie: 'zombie', dragon: 'dragon', sith: 'sith' }[s.id] || 'normal';
      s.abilityCooldown = 15;
      allSkins[s.id] = s;
    });

    // jména: unikátní kombinace "Jméno (plemeno)"
    const combos = [];
    PIGEON_NAMES.forEach(n => PIGEON_BREEDS.forEach(b => combos.push([n, b])));
    for (let i = combos.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [combos[i], combos[j]] = [combos[j], combos[i]];
    }

    let currentId = 16;
    let comboIdx = 0;
    tiers.forEach((t, ti) => {
      const needed = t.count - Object.values(allSkins).filter(s => s.tier === t.name).length;
      for (let i = 0; i < needed; i++) {
        const [first, breed] = combos[comboIdx++];
        const id = `pigeon_${currentId++}`;
        const morph = PIGEON_MORPHS[Math.floor(rng() * PIGEON_MORPHS.length)];
        // každý holub dostane vlastní odstín, krk, oči, vzor a znaky
        const tint = ['#c9a46b', '#6b7fa8', '#a86b6b', '#6ba87a', '#8a6ba8', '#a89a6b', '#5a6070', '#d0d4da', '#b88a5a', '#5a8a9a'][Math.floor(rng() * 10)];
        const amt = 0.1 + rng() * 0.25, lt = (rng() - 0.5) * 0.28;
        const necks = ['#3d9a6a', '#4a8f6e', '#b56d8c', '#7a5ab5', '#2fb4c9', '#c9a64a', '#5a9ad3', '#8fbf6b'];
        const eyes = ['#ff8a3d', '#ff8a3d', '#ff5a3b', '#ffb03b', '#f0eadc', '#e86a2a'];
        const beaks = ['#3a3a3a', '#2a2a2a', '#4a4038', morph.beak || '#3a3a3a', '#d8b894'];
        const look = {
          body: shade(mix(morph.body, tint, amt), lt),
          wing: shade(mix(morph.wing, tint, amt * 0.9), lt - 0.04),
          neck: mix(morph.neck, necks[Math.floor(rng() * necks.length)], 0.55),
          eye: eyes[Math.floor(rng() * eyes.length)],
          beak: beaks[Math.floor(rng() * beaks.length)],
          pattern: morph.pied ? 'pied' : morph.checker ? 'checker' : (rng() < 0.15 ? 'spots' : rng() < 0.12 ? 'none' : 'bars'),
          mark: rng() < 0.5 ? ['whiteHead', 'darkHead', 'whiteTail', 'wingTips'][Math.floor(rng() * 4)] : 'none'
        };
        const price = Math.round((t.minP + (t.maxP - t.minP) * (i / Math.max(1, needed - 1))) / 50) * 50;
        const [abName, abIcon] = PULSE[t.name];
        allSkins[id] = Object.assign({
          id,
          name: `${first} (${breed})`,
          tier: t.name,
          price,
          bodyColor: look.body,
          wingColor: look.wing,
          neckColor: look.neck,
          beakColor: look.beak,
          eyeColor: look.eye,
          pattern: look.pattern,
          mark: look.mark,
          morph: morph.id,
          poopType: t.name === 'legendary' || t.name === 'mythic' ? 'gold' : t.name === 'cosmic' ? 'rainbow' : 'normal',
          abilityKey: 'pulse',
          abilityName: abName,
          abilityIcon: abIcon,
          abilityRadius: 150 + ti * 30,
          abilityDesc: `Rázová vlna zasáhne chodce v okruhu ${150 + ti * 30} px.`,
          abilityCooldown: 16
        }, tierBonus(t.name));
      }
    });

    // --- SÍLA SCHOPNOSTÍ PODLE CENY: čím dražší holub, tím silnější superschopnost ---
    const byPrice = Object.values(allSkins).sort((a, b) => a.price - b.price);
    const rankOfPrice = {};
    byPrice.forEach((s, i) => { if (rankOfPrice[s.price] === undefined) rankOfPrice[s.price] = i; });
    byPrice.forEach(s => applyAbilityPower(s, rankOfPrice[s.price] / (byPrice.length - 1)));

    return allSkins;
  }

  // level 0 = nejlevnější holub, 1 = nejdražší. Síla roste plynule od 1.0× do 3.0×.
  function applyAbilityPower(s, level) {
    const f = 1 + 2 * level;
    const dur = (b) => Math.round(b * (0.6 + 0.4 * f) * 10) / 10;
    const rad = (b) => Math.round(b * (0.7 + 0.3 * f));
    const cnt = (b) => Math.max(1, Math.round(b * (0.5 + 0.5 * f)));
    const coins = (b) => Math.round(b * f / 10) * 10;
    const ab = { level, power: f };
    let desc;
    switch (s.abilityKey) {
      case 'nitro': ab.dur = dur(3.5); desc = `Zvýší rychlost letu o 60 % na ${ab.dur} s.`; break;
      case 'slowmo': ab.dur = dur(4); desc = `Zpomalí čas o 75 % na ${ab.dur} s pro přesné míření.`; break;
      case 'zombieCloud': ab.radius = rad(220); desc = `Jedovatý mrak omráčí chodce v okruhu ${ab.radius} px.`; break;
      case 'emp': ab.radius = rad(220); desc = `EMP rázová vlna v okruhu ${ab.radius} px omráčí chodce.`; break;
      case 'shuriken': ab.count = cnt(5); desc = `Vystřelí salvu ${ab.count} shuriken bobků vějířem dolů.`; break;
      case 'berserk': ab.dur = dur(4.5); desc = `Nekonečné bobky a zrychlené kadění na ${ab.dur} s.`; break;
      case 'airstrike': ab.count = cnt(2); ab.rate = 0.22 * (0.7 + 0.3 * f); desc = `${ab.count} parťáci proletí nad ulicí a bombardují ji.`; break;
      case 'goldenRain': ab.dur = dur(3.5); ab.interval = 0.14 / (0.7 + 0.3 * f); desc = `${ab.dur} s padá z nebe hustý zlatý déšť bobků.`; break;
      case 'cannonball': ab.radius = rad(180); desc = `Dělový bobek s rázovou vlnou ${ab.radius} px, srazí i cyklisty.`; break;
      case 'antigravity': ab.radius = rad(250); ab.dur = dur(4); desc = `Chodci v okruhu ${ab.radius} px levitují ${ab.dur} s.`; break;
      case 'supernova': ab.count = cnt(3); desc = `Oslňující záblesk zasáhne ${ab.count} ${ab.count >= 5 ? 'nejbližších chodců' : 'nejbližší chodce'}.`; break;
      case 'forceLightning': ab.count = cnt(2); desc = `Blesk z nebe srazí ${ab.count} ${ab.count >= 5 ? 'nejbližších chodců' : 'nejbližší chodce'} do K.O.`; break;
      case 'ufoAbduct': ab.count = cnt(2); ab.coins = coins(150); desc = `Paprsek vysaje ${ab.count} chodce a udělí +${ab.coins} mincí.`; break;
      case 'dragonFire': ab.count = cnt(5); desc = `Chrlí ${ab.count} ohnivých meteoritů dolů na ulici.`; break;
      case 'gigachadShock': ab.radius = rad(260); ab.coins = coins(200); desc = `Otřes země srazí lidi v okruhu ${ab.radius} px a přidá +${ab.coins} mincí. Nejsilnější holub ve hře.`; break;
      default: {
        ab.radius = Math.round(140 + 200 * level);
        ab.hit = level >= 0.75 ? 'ko' : level >= 0.4 ? 'head' : 'body';
        s.abilityRadius = ab.radius;
        const what = { ko: 'srazí do K.O.', head: 'zasáhne do hlavy', body: 'zasáhne' }[ab.hit];
        desc = `Rázová vlna ${what} chodce v okruhu ${ab.radius} px.`;
      }
    }
    s.ab = ab;
    s.abilityCooldown = Math.round(16 / (0.5 + 0.5 * f) * 2) / 2;
    s.abilityDesc = `${desc} <span class="ability-power">💪 Síla ${f.toFixed(1)}× • nabití ${s.abilityCooldown} s</span>`;
  }

  const SKINS = generate200Pigeons();

  const P2_DEFAULT = {
    id: 'p2_classic', name: 'Modrý Pepík', tier: 'common', price: 0,
    bodyColor: '#7d8fb3', wingColor: '#56688e', neckColor: '#a55eea', beakColor: '#ff9f43',
    abilityKey: 'nitro', abilityName: 'Křídelní Nitro', abilityIcon: '⚡', abilityDesc: 'Zvýší rychlost letu o 60 % na 3.5 sekundy.',
    speedMult: 1, reloadMult: 1, coinMult: 1, poopType: 'normal', abilityCooldown: 15
  };
  applyAbilityPower(P2_DEFAULT, 0);

  const PASS_REWARDS = (() => {
    const gen = (tier, n) => {
      const list = Object.values(SKINS).filter(s => s.tier === tier && s.id.startsWith('pigeon_'));
      return list[Math.min(n, list.length - 1)].id;
    };
    const freePigeons = { 8: gen('rare', 3), 18: gen('epic', 5), 28: gen('legendary', 2), 38: gen('mythic', 1), 48: gen('cosmic', 0) };
    const premiumSkins = {
      5: ['classic', 3], 10: ['agent', 3], 15: ['ninja', 3], 20: ['king', 3], 25: ['classic', 4],
      30: ['sith', 3], 35: ['dragon', 3], 40: ['alien', 4], 45: ['dragon', 4], 50: ['gigachad', 4]
    };
    const arr = [];
    for (let t = 1; t <= PASS_TIERS; t++) {
      const free = freePigeons[t] ? { type: 'pigeon', id: freePigeons[t] }
        : t % 10 === 0 ? { type: 'tokens', n: 3 }
        : t % 5 === 0 ? { type: 'tokens', n: 1 }
        : { type: 'coins', n: 400 * t };
      const ps = premiumSkins[t];
      const premium = ps ? { type: 'tokens', n: ps[1] >= 4 ? 8 : 5 }
        : t % 2 === 1 ? { type: 'tokens', n: t > 25 ? 3 : 2 }
        : { type: 'coins', n: 1500 * t };
      arr.push({ tier: t, free, premium });
    }
    return arr;
  })();

  const UPGRADE_MULT = { common: 1, rare: 3, epic: 8, legendary: 20, mythic: 50, cosmic: 120 };
  function upgradeCosts(tier) {
    const m = UPGRADE_MULT[tier] || 1;
    return [100, 220, 450, 800].map(c => c * m);
  }

  const TIER_LABELS = { common: 'BĚŽNÝ', rare: 'VZÁCNÝ', epic: 'EPICKÝ', legendary: 'LEGENDÁRNÍ', mythic: 'MÝTICKÝ', cosmic: 'KOSMICKÝ' };
  const TIER_COLORS = { common: '#9fb3c8', rare: '#3aa0ff', epic: '#b45cff', legendary: '#ffb627', mythic: '#ff3b5c', cosmic: '#33e1ff' };

  // --- 100 PROGRESSIVE LEVELS ---
  function generate100Levels() {
    const worlds = [
      { id: 1, name: 'Městský park', baseTime: 42 },
      { id: 2, name: 'Nákupní třída', baseTime: 40 },
      { id: 3, name: 'Finanční centrum', baseTime: 38 },
      { id: 4, name: 'Noční promenáda', baseTime: 36 },
      { id: 5, name: 'Megapole 2099', baseTime: 35 }
    ];
    const types = ['hits', 'headshots', 'cyclistCrashes', 'knockouts', 'score'];
    const levels = [];

    for (let i = 1; i <= 100; i++) {
      const world = worlds[Math.floor((i - 1) / 20)];
      const stepInWorld = (i - 1) % 20;
      const targetType = types[(i - 1) % types.length];
      let targetCount = 0;
      let desc = '';
      const timeLimit = Math.max(30, world.baseTime - Math.floor(stepInWorld / 4) * 2);
      const reward = 60 + i * 12;

      if (targetType === 'hits') { targetCount = 5 + Math.floor(i * 0.35); desc = `Tref ${targetCount} chodců svými bobky.`; }
      else if (targetType === 'headshots') { targetCount = 3 + Math.floor(i * 0.2); desc = `Dej ${targetCount} přesných HEADSHOTŮ do hlavy.`; }
      else if (targetType === 'cyclistCrashes') { targetCount = 2 + Math.floor(i * 0.15); desc = `Sundej ${targetCount} cyklistů z kola (tref je 2x).`; }
      else if (targetType === 'knockouts') { targetCount = 4 + Math.floor(i * 0.25); desc = `Sraž ${targetCount} lidí k zemi (Double K.O.).`; }
      else if (targetType === 'score') { targetCount = 1500 + i * 220; desc = `Dosáhni skóre ${targetCount.toLocaleString()} bodů.`; }

      if (i % 20 === 0) {
        desc = `👑 FINÁLE ZÓNY: Získej ${(i * 350).toLocaleString()} skóre a sundej ${3 + Math.floor(i / 15)} cyklistů!`;
      }

      levels.push({
        id: i, worldId: world.id, worldName: world.name, title: `Level ${i}`, desc, timeLimit, reward,
        targetType: (i % 20 === 0) ? 'boss' : targetType, targetCount,
        bossScore: i * 350, bossCyclists: 3 + Math.floor(i / 15)
      });
    }
    return levels;
  }

  const LEVELS = generate100Levels();

  const CHALLENGES = [
    { id: 'hits25', stat: 'hits', target: 25, reward: 150, label: 'Zasáhni 25 chodců' },
    { id: 'hs10', stat: 'headshots', target: 10, reward: 200, label: 'Dej 10 headshotů' },
    { id: 'cyc5', stat: 'cyclists', target: 5, reward: 250, label: 'Sundej 5 cyklistů' },
    { id: 'games5', stat: 'games', target: 5, reward: 150, label: 'Odehraj 5 her' },
    { id: 'ko20', stat: 'knockouts', target: 20, reward: 300, label: '20× Double K.O.' },
    { id: 'duo3', stat: 'duoGames', target: 3, reward: 400, label: 'Odehraj 3 hry ve dvou' },
    { id: 'hits200', stat: 'hits', target: 200, reward: 800, label: 'Zasáhni 200 chodců' },
    { id: 'hs75', stat: 'headshots', target: 75, reward: 1200, label: 'Dej 75 headshotů' },
    { id: 'cyc40', stat: 'cyclists', target: 40, reward: 1500, label: 'Sundej 40 cyklistů' },
    { id: 'ko150', stat: 'knockouts', target: 150, reward: 2000, label: '150× Double K.O.' },
    { id: 'hits1000', stat: 'hits', target: 1000, reward: 5000, label: 'Zasáhni 1000 chodců' },
    { id: 'hs400', stat: 'headshots', target: 400, reward: 8000, label: 'Dej 400 headshotů' }
  ];

  // --- ÚČTY (lokálně v tomto počítači) ---
  // Postup každého účtu se ukládá pod vlastním prefixem, globální jsou jen účty, session a žebříček.
  const GLOBAL_KEYS = new Set(['pigeon_accounts', 'pigeon_session', 'pigeon_leaderboard', 'pigeon_muted', 'pigeon_perf', 'pigeon_reset_done']);
  const CREATOR_NAME = 'Domixcz';
  // účet tvůrce: v kódu je jen hash hesla, ne heslo samotné
  const CREATOR_ACCOUNT = { id: 'domixcz', salt: 'domixcz-creator-salt', pass: 'ubn2ugahjn' };
  const RESERVED_NAMES = ['domixcz', 'admin', 'administrator', 'creator', 'host', 'guest', 'bot', 'moderator'];
  function rawGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  // jednorázový reset: všem hráčům kromě Domixcz se smaže postup a žebříček (účty a hesla zůstanou)
  const RESET_ID = 'reset-2026-11-13';
  (function oneTimeReset() {
    try {
      if (localStorage.getItem('pigeon_reset_done') === RESET_ID) return;
      const keep = (k) => k === 'pigeon_accounts' || k === 'pigeon_session' || k === 'pigeon_muted' ||
        k === 'pigeon_perf' || k.startsWith('pigeon_u_domixcz_');
      Object.keys(localStorage).filter(k => k.startsWith('pigeon_') && !keep(k)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem('pigeon_reset_done', RESET_ID);
    } catch (e) {}
  })();
  function rawSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
  function loadAccounts() { try { return JSON.parse(rawGet('pigeon_accounts')) || {}; } catch (e) { return {}; } }
  function sessGet() { try { return sessionStorage.getItem('pigeon_session'); } catch (e) { return null; } }
  // DOD hry portál: hráč přihlášený v portálu (?hrac=…&k=…) dostane lokální účet bez hesla,
// takže se nezobrazí registrace a postup se ukládá zvlášť pro každého hráče.
const PORTAL_USER = (() => {
    try {
      const q = new URLSearchParams(location.search), k = (q.get('k') || '').replace(/[^a-z0-9-]/g, ''), n = (q.get('hrac') || '').trim().slice(0, 16);
      if (!k || !n) return '';
      const id = 'dod-' + k, acc = loadAccounts();
      if (!acc[id]) { acc[id] = { name: n, contact: 'dod-portal', type: 'portal', salt: id, pass: '', created: Date.now() }; rawSet('pigeon_accounts', JSON.stringify(acc)); }
      return id;
    } catch (e) { return ''; }
})();
const SESSION_USER = (() => {
    const id = PORTAL_USER || rawGet('pigeon_session') || sessGet() || '';
    return id && loadAccounts()[id] ? id : '';
  })();
  function setSession(id, remember) {
    try {
      localStorage.removeItem('pigeon_session');
      sessionStorage.removeItem('pigeon_session');
      if (remember) localStorage.setItem('pigeon_session', id);
      else sessionStorage.setItem('pigeon_session', id);
    } catch (e) {}
  }

  // --- ONLINE ŽEBŘÍČEK (Firebase Realtime Database přes REST) ---
  const CLOUD_URL = String(window.HOLUBI_FIREBASE_DB_URL || '').trim().replace(/\/+$/, '');
  const cloud = {
    enabled: /^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(CLOUD_URL),
    async req(path, opts) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(`${CLOUD_URL}/${path}.json`, Object.assign({ signal: ctrl.signal }, opts || {}));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } finally { clearTimeout(timer); }
    },
    get(path) { return this.req(path); },
    put(path, val) { return this.req(path, { method: 'PUT', body: JSON.stringify(val) }); }
  };
  function safeName(n) { return String(n || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16); }
  function nsKey(key) {
    if (!SESSION_USER || GLOBAL_KEYS.has(key) || !key.startsWith('pigeon_')) return key;
    return `pigeon_u_${SESSION_USER}_${key.slice(7)}`;
  }
  // jednoduchý solený hash hesla (účty jsou jen lokální)
  function hashPass(pass, salt) {
    let h1 = 0xdeadbeef ^ salt.length, h2 = 0x41c6ce57;
    const str = `${salt}|${pass}|holubi`;
    for (let r = 0; r < 500; r++) {
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i) + r;
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    }
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function normPhone(v) {
    let d = String(v || '').replace(/[\s\-()./]/g, '');
    if (/^00\d+$/.test(d)) d = '+' + d.slice(2);
    if (/^\d{9}$/.test(d)) d = '+420' + d;
    return /^\+\d{9,15}$/.test(d) ? d : '';
  }
  function normEmail(v) {
    const e = String(v || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
  }

  // --- STORAGE ---
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(nsKey(key)); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  let onProgressChange = null;
  function lsSet(key, val) {
    try { localStorage.setItem(nsKey(key), val); } catch (e) {}
    if (onProgressChange && SESSION_USER && key.startsWith('pigeon_')) onProgressChange();
  }
  function lsJSON(key, fallback) {
    try { const d = JSON.parse(localStorage.getItem(nsKey(key))); return d === null || d === undefined ? fallback : d; } catch (e) { return fallback; }
  }

  const storage = {
    isInfinite() { return lsGet('pigeon_infinite', '') === 'secret1.0'; },
    setInfinite() { lsSet('pigeon_infinite', 'secret1.0'); },
    getCoins() { return this.isInfinite() ? 999999999999 : (parseInt(lsGet('pigeon_coins', '0'), 10) || 0); },
    setCoins(val) { if (!this.isInfinite()) lsSet('pigeon_coins', Math.max(0, Math.round(val))); },
    isInfiniteTokens() { return lsGet('pigeon_infinite_tokens', '') === '1'; },
    getTokens() { return this.isInfiniteTokens() ? 999999999 : (parseInt(lsGet('pigeon_tokens', '0'), 10) || 0); },
    setTokens(v) { if (!this.isInfiniteTokens()) lsSet('pigeon_tokens', Math.max(0, Math.round(v))); },
    addTokens(n) { this.setTokens(this.getTokens() + n); },
    getEdits() { const d = lsJSON('pigeon_edits', {}); return d && typeof d === 'object' ? d : {}; },
    getEdit(id) { return this.getEdits()[id] || {}; },
    setEdit(id, e) { const all = this.getEdits(); if (Object.keys(e).length) all[id] = e; else delete all[id]; lsSet('pigeon_edits', JSON.stringify(all)); },
    getLevelWins() { return parseInt(lsGet('pigeon_level_wins', '0'), 10) || 0; },
    addLevelWin() { const n = this.getLevelWins() + 1; lsSet('pigeon_level_wins', n); return n; },
    getPass() { return Object.assign({ premium: false, free: [], prem: [] }, lsJSON('pigeon_pass', {})); },
    setPass(p) { lsSet('pigeon_pass', JSON.stringify(p)); },
    getUnlockedSkins() {
      const data = lsJSON('pigeon_unlocked_skins', null);
      if (Array.isArray(data) && data.length > 0) return data.filter(id => SKINS[id]);
      return ['classic'];
    },
    setUnlockedSkins(arr) { lsSet('pigeon_unlocked_skins', JSON.stringify(arr)); },
    getEquippedSkin() {
      const id = lsGet('pigeon_equipped_skin', 'classic');
      return SKINS[id] ? id : 'classic';
    },
    setEquippedSkin(id) { lsSet('pigeon_equipped_skin', id); },
    getUnlockedLevel() { return parseInt(lsGet('pigeon_unlocked_level', '1'), 10) || 1; },
    setUnlockedLevel(lvl) {
      if (lvl > this.getUnlockedLevel()) lsSet('pigeon_unlocked_level', Math.min(100, lvl));
    },
    getLevelStars() {
      const d = lsJSON('pigeon_level_stars', {});
      return d && typeof d === 'object' ? d : {};
    },
    setLevelStars(lvlId, stars) {
      const data = this.getLevelStars();
      if (stars > (data[lvlId] || 0)) {
        data[lvlId] = stars;
        lsSet('pigeon_level_stars', JSON.stringify(data));
      }
    },
    getPigeonUpgrades(skinId) {
      const d = lsJSON(`pigeon_upgrades_${skinId}`, null);
      if (d && typeof d === 'object') return { speed: d.speed || 1, reload: d.reload || 1, coins: d.coins || 1 };
      return { speed: 1, reload: 1, coins: 1 };
    },
    setPigeonUpgrades(skinId, up) { lsSet(`pigeon_upgrades_${skinId}`, JSON.stringify(up)); },
    getStats() { return Object.assign({ hits: 0, headshots: 0, cyclists: 0, knockouts: 0, games: 0, duoGames: 0 }, lsJSON('pigeon_stats', {})); },
    addStat(key, n = 1) {
      const s = this.getStats();
      s[key] = (s[key] || 0) + n;
      lsSet('pigeon_stats', JSON.stringify(s));
    },
    getClaimed() { const c = lsJSON('pigeon_claimed', []); return Array.isArray(c) ? c : []; },
    setClaimed(arr) { lsSet('pigeon_claimed', JSON.stringify(arr)); },
    getXP() { return parseInt(lsGet('pigeon_xp', '0'), 10) || 0; },
    addXP(n) { lsSet('pigeon_xp', this.getXP() + Math.round(n)); },
    getLobbyMode() { const m = lsGet('pigeon_lobby_mode', 'campaign'); return ['campaign', 'free', 'coop', 'versus', 'online'].includes(m) ? m : 'campaign'; },
    setLobbyMode(m) { lsSet('pigeon_lobby_mode', m); },
    getP2Skin() { return lsGet('pigeon_p2_skin', 'p2_classic'); },
    setP2Skin(id) { lsSet('pigeon_p2_skin', id); }
  };

  // ==========================================================================
  // VISUAL THEMES (jeden pro každý svět)
  // ==========================================================================
  const THEMES = {
    day: {
      sky: [[0, '#1d5cab'], [0.45, '#4a94de'], [0.82, '#a3d2f4'], [1, '#e4f3ff']],
      sun: { x: 0.82, y: 0.15, r: 34, core: '#fffbe8', glow: 'rgba(255,244,190,0.6)' },
      mountains: ['rgba(98,140,186,0.55)', 'rgba(126,166,204,0.55)'], hills: '#5c9a56',
      far: '#8fa9c6', farWin: 0,
      buildings: ['#c9b79c', '#a7b4c2', '#8b9bb0', '#b88c74', '#d6cbb8', '#7f93a8', '#c2a68a'],
      winLit: 0.04, winLitColor: '#ffe7a3', winGlass: ['#a7d0f0', '#5d86b2'], glassShine: true,
      cloud: [255, 255, 255], cloudShade: [178, 198, 226], cloudCount: 8,
      sidewalk: '#bcb8af', curb: '#dbd7cd', asphalt: '#474b53', lane: '#f4f4f4',
      lampOn: 0, trees: true, treeColor: ['#3f8f3a', '#2c6a2a', '#62ad55'],
      tint: null, ambient: 'leaves', haze: 'rgba(214,232,250,0.45)', tallness: 0.3
    },
    sunset: {
      sky: [[0, '#26245f'], [0.32, '#713c8c'], [0.62, '#ee6f5a'], [0.86, '#ffb46b'], [1, '#ffdca3']],
      sun: { x: 0.24, y: 0.6, r: 48, core: '#fff1c4', glow: 'rgba(255,160,80,0.65)' },
      mountains: ['rgba(110,55,105,0.6)', 'rgba(165,78,98,0.5)'],
      far: '#80496f', farWin: 0.1,
      buildings: ['#7a4d5e', '#6b4a66', '#8e5a58', '#5e4560', '#9a6a5c'],
      winLit: 0.3, winLitColor: '#ffd27a', winGlass: ['#f3a47c', '#6c4262'], glassShine: true,
      cloud: [255, 186, 158], cloudShade: [150, 84, 120], cloudCount: 6,
      sidewalk: '#a99790', curb: '#cbb8ad', asphalt: '#3b3541', lane: '#f5e4c8',
      lampOn: 0.45, trees: true, treeColor: ['#4b5e2f', '#36441f', '#6b7a3a'],
      tint: 'rgba(255,160,110,0.16)', ambient: 'dust', haze: 'rgba(255,165,125,0.35)', tallness: 0.34
    },
    dusk: {
      sky: [[0, '#0e1838'], [0.4, '#2a2d6b'], [0.76, '#874a8d'], [1, '#ff9874']],
      moon: { x: 0.82, y: 0.15, r: 20 }, stars: 0.45,
      far: '#272a53', farWin: 0.18,
      buildings: ['#2b3557', '#323c63', '#25304f', '#3a3f68', '#1f2a48'],
      winLit: 0.48, winLitColor: '#ffe08a', winGlass: ['#6677b4', '#262f5a'],
      cloud: [196, 146, 198], cloudShade: [86, 66, 118], cloudCount: 4,
      sidewalk: '#78747f', curb: '#9b97a4', asphalt: '#2a2a35', lane: '#e8e0d0',
      lampOn: 0.85, trees: true, treeColor: ['#2c3f33', '#1f2f26', '#3a5040'],
      tint: 'rgba(110,100,200,0.2)', ambient: 'dust', haze: 'rgba(150,100,170,0.28)', tallness: 0.45
    },
    night: {
      sky: [[0, '#02050f'], [0.5, '#0a1736'], [1, '#1f3466']],
      moon: { x: 0.2, y: 0.14, r: 28 }, stars: 1,
      far: '#0d1630', farWin: 0.25,
      buildings: ['#151e38', '#19233f', '#111a31', '#1d2746', '#10172b'],
      winLit: 0.55, winLitColor: '#ffd36e', winGlass: ['#1f2b4d', '#0b1124'],
      cloud: [70, 86, 130], cloudShade: [26, 34, 62], cloudCount: 4,
      sidewalk: '#4f525c', curb: '#6c707a', asphalt: '#1b1d24', lane: '#d2cba9',
      lampOn: 1, trees: true, treeColor: ['#16261f', '#0e1a14', '#203528'],
      tint: 'rgba(50,70,170,0.32)', ambient: 'fireflies', wet: true, haze: 'rgba(40,60,120,0.3)', tallness: 0.4
    },
    neon: {
      sky: [[0, '#06010e'], [0.45, '#190532'], [0.8, '#3c0a5b'], [1, '#ff2a8a']],
      stars: 0.5, far: '#1a0a33', farWin: 0.4, farWinColor: '#ff3ea5',
      buildings: ['#130b26', '#180e30', '#0e0820', '#1e1137'],
      winLit: 0.5, winLitColor: '#3ef0ff', winLitColor2: '#ff3ea5', winGlass: ['#2a1a4a', '#0c0618'],
      cloud: [120, 40, 140], cloudShade: [40, 10, 60], cloudCount: 3,
      sidewalk: '#2d2739', curb: '#4b405f', asphalt: '#120f19', lane: '#3ef0ff',
      lampOn: 1, lampColor: [62, 240, 255], trees: false, neon: true,
      tint: 'rgba(120,40,200,0.28)', ambient: 'rain', wet: true, haze: 'rgba(255,42,138,0.25)', tallness: 0.55
    }
  };
  const WORLD_THEMES = { 1: 'day', 2: 'sunset', 3: 'dusk', 4: 'night', 5: 'neon' };
  const NEON_WORDS = ['HOTEL', 'BAR', 'KEBAB', 'PIZZA', 'NON-STOP', 'CYBER', 'DISCO', '24H', 'HOLUB', 'RAMEN'];

  // ==========================================================================
  // GAME ENGINE
  // ==========================================================================
  class Game {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      const $ = (id) => document.getElementById(id);
      this.$ = $;

      // Screens & Modals
      this.lobbyScreen = $('lobbyScreen');
      this.levelMapScreen = $('levelMapScreen');
      this.shopModal = $('shopModal');
      this.upgradesModal = $('upgradesModal');
      this.deviceShareModal = $('deviceShareModal');
      this.pauseScreen = $('pauseScreen');
      this.levelWinModal = $('levelWinModal');
      this.levelFailModal = $('levelFailModal');
      this.versusResultModal = $('versusResultModal');

      // HUD
      this.hud = $('hud');
      this.touchControls = $('touchControls');
      this.headshotBanner = $('headshotBanner');
      this.actionBanner = $('actionBanner');
      this.actionBannerText = $('actionBannerText');
      this.mouseToast = $('mouseToast');
      this.mouseToastText = $('mouseToastText');
      this.abilityPulseGlow = $('abilityPulseGlow');
      this.coinsValEl = $('coinsVal');
      this.scoreValEl = $('scoreVal');
      this.scoreLabelEl = $('scoreLabel');
      this.headshotsValEl = $('headshotsVal');
      this.comboValEl = $('comboVal');
      this.ammoCountEl = $('ammoCountText');
      this.ammoSlotsEl = $('ammoSlots');
      this.soundBtn = $('soundBtn');
      this.levelHudBar = $('levelHudBar');
      this.levelNameBadge = $('levelNameBadge');
      this.levelGoalText = $('levelGoalText');
      this.levelTimerVal = $('levelTimerVal');
      this.abilityBtn = $('abilityBtn');
      this.abilityIcon = $('abilityIcon');
      this.abilityName = $('abilityName');
      this.abilityCooldownFill = $('abilityCooldownFill');
      this.mouseToggleBtn = $('mouseToggleBtn');
      this.mouseToggleSub = $('mouseToggleSub');

      // Multiplayer HUD
      this.versusBar = $('versusBar');
      this.p2Hud = $('p2Hud');

      // Map & shop
      this.mapRoadContainer = $('mapRoadContainer');
      this.activeMapWorld = 1;
      this.skinsGridEl = $('skinsGrid');
      this.shopSearchInput = $('shopSearchInput');
      this.activeShopTier = 'all';

      // State
      this.gameMode = 'campaign';
      this.lobbyMode = storage.getLobbyMode();
      this.currentLevelIndex = storage.getUnlockedLevel() - 1;
      this.levelTimeRemaining = 45;
      this.versusTime = 90;
      this.levelProgress = { hits: 0, headshots: 0, cyclistCrashes: 0, knockouts: 0, maxCombo: 1 };
      this.inLobby = true;
      this.isRunning = false;
      this.isPaused = false;
      this.coins = storage.getCoins();
      this.equippedSkinId = storage.getEquippedSkin();
      this.p2SkinId = storage.getP2Skin();
      this.mouseControlEnabled = true;
      this.keys = {};
      this.mouseX = 0;
      this.maxAmmo = 5;
      this.slowMoTimer = 0;
      this.screenShake = 0;
      this.flash = 0;
      this.time = 0;
      this.lastTime = performance.now();
      this.camX = 0;
      this.themeName = 'day';
      this.sceneSeed = 1;

      this.players = [];
      this.activeAbilityEffects = [];
      this.poops = [];
      this.pedestrians = [];
      this.cyclists = [];
      this.splats = [];
      this.particles = [];
      this.floatingTexts = [];
      this.speechBubbles = [];
      this.ambient = [];
      this.lightnings = [];
      this.lobbySparkles = [];

      this.resize();
      window.addEventListener('resize', () => this.resize());

      this.setupControls();
      this.setupLobby();
      this.setupShop();
      this.setupWorldTabs();
      this.setupAdmin();
      this.setupPassAndSkins();
      this.setupEditor();
      this.setupDiscover();
      this.setupAuth();
      this.setupPerf();
      this.setupCurrencyTips();
      this.setupAutoSync();
      window.addEventListener('pointermove', (e) => {
        if (!this.inLobby) return;
        this.lobbyMouse = { x: (e.clientX / this.width) * 2 - 1, y: (e.clientY / this.height) * 2 - 1 };
      });
      this.$('featBuyBtn').addEventListener('click', () => this.buyFeatured());
      this.renderFeatured();
      setInterval(() => this.updateFeaturedTimer(), 1000);
      this.$('tabLeader').addEventListener('click', () => { this.closeAllLobbyModals(); this.openLeaderboard(); });
      this.$('closeLeaderBtn').addEventListener('click', () => this.closeLeaderboard());
      this.$('closeLeaderTopBtn').addEventListener('click', () => this.closeLeaderboard());

      requestAnimationFrame(this.loop.bind(this));
    }

    get equippedSkin() { return SKINS[this.equippedSkinId] || SKINS.classic; }
    get equippedLook() { return getAppearance(this.equippedSkin, this.editFor(this.equippedSkinId)); }
    get p2Look() { const s = this.p2Skin; return s.id === 'p2_classic' ? s : getAppearance(s, this.editFor(s.id)); }
    editFor(id) { return storage.getEdit(id); }
    get currentUpgrades() { return storage.getPigeonUpgrades(this.equippedSkinId); }
    get currentLevel() { return LEVELS[this.currentLevelIndex] || LEVELS[0]; }
    get theme() { return THEMES[this.themeName] || THEMES.day; }
    get isDuo() { return this.gameMode === 'coop' || this.gameMode === 'versus' || this.gameMode === 'online'; }
    get isLocalDuo() { return this.gameMode === 'coop' || this.gameMode === 'versus'; }
    get isVersus() { return this.gameMode === 'versus' || this.gameMode === 'online'; }
    get localIndex() { return this.netRole === 'guest' ? 1 : 0; }
    get localPl() { return this.players[this.localIndex]; }
    get otherPl() { return this.players[1 - this.localIndex]; }
    isLocal(pl) { return !this.netRole || (pl && pl.index === this.localIndex); }
    get totalScore() { return this.players.reduce((s, p) => s + p.score, 0); }
    get lobbyHasP2() { return this.lobbyMode === 'coop' || this.lobbyMode === 'versus'; }

    get p2Skin() {
      if (this.p2SkinId === 'p2_classic') return P2_DEFAULT;
      const unlocked = storage.getUnlockedSkins();
      return (SKINS[this.p2SkinId] && unlocked.includes(this.p2SkinId)) ? SKINS[this.p2SkinId] : P2_DEFAULT;
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.groundY = this.height - 110;
      this.skyY = Math.max(120, this.height * 0.28);
      this.players.forEach(p => { p.pigeon.y = this.skyY + p.yOffset; });

      this.buildScenery();
      this.buildVignette();
      this.lobbyBg = null;
    }

    // ======================================================================
    // SCENERY BUILDER (předkreslené vrstvy pro výkon)
    // ======================================================================
    setTheme(name, seed) {
      this.themeName = THEMES[name] ? name : 'day';
      this.sceneSeed = seed || Math.floor(Math.random() * 1e9);
      this.buildScenery();
      this.initAmbient();
    }

    buildScenery() {
      const th = this.theme;
      const W = this.width, H = this.height, gy = this.groundY, dpr = this.dpr;
      const rng = mulberry32(this.sceneSeed);

      // ---- SKY ----
      const bg = makeLayer(W, H, dpr);
      let c = bg.ctx;
      const sg = c.createLinearGradient(0, 0, 0, gy);
      th.sky.forEach(([o, col]) => sg.addColorStop(o, col));
      c.fillStyle = sg;
      c.fillRect(0, 0, W, H);

      if (th.stars) {
        const n = Math.floor(260 * th.stars * (W / 1400));
        for (let i = 0; i < n; i++) {
          const r = rng() * 1.3 + 0.2;
          c.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.75})`;
          c.beginPath();
          c.arc(rng() * W, rng() * gy * 0.7, r, 0, Math.PI * 2);
          c.fill();
        }
      }
      if (th.sun) {
        const sx = W * th.sun.x, sy = gy * th.sun.y + 10;
        const gl = c.createRadialGradient(sx, sy, th.sun.r * 0.5, sx, sy, th.sun.r * 7);
        gl.addColorStop(0, th.sun.glow);
        gl.addColorStop(1, 'rgba(255,220,150,0)');
        c.fillStyle = gl;
        c.fillRect(0, 0, W, gy);
        const core = c.createRadialGradient(sx, sy, 0, sx, sy, th.sun.r);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.7, th.sun.core);
        core.addColorStop(1, rgba(th.sun.core, 0.85));
        c.fillStyle = core;
        c.beginPath(); c.arc(sx, sy, th.sun.r, 0, Math.PI * 2); c.fill();
      }
      if (th.moon) {
        const mx = W * th.moon.x, my = gy * th.moon.y + 10, mr = th.moon.r;
        const gl = c.createRadialGradient(mx, my, mr, mx, my, mr * 6);
        gl.addColorStop(0, 'rgba(200,215,255,0.35)');
        gl.addColorStop(1, 'rgba(200,215,255,0)');
        c.fillStyle = gl;
        c.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
        const mg = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 1, mx, my, mr);
        mg.addColorStop(0, '#fffdf2');
        mg.addColorStop(1, '#d9d6c6');
        c.fillStyle = mg;
        c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(150,150,140,0.25)';
        [[0.3, -0.2, 0.22], [-0.35, 0.25, 0.16], [0.1, 0.45, 0.12], [-0.1, -0.45, 0.1]].forEach(([dx, dy, rr]) => {
          c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); c.fill();
        });
      }
      if (th.mountains) {
        th.mountains.forEach((col, li) => {
          const base = gy - 120 + li * 45;
          const amp = 70 - li * 20;
          const ph = rng() * 100;
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(0, gy);
          for (let x = 0; x <= W + 20; x += 16) {
            const y = base - amp * (0.55 * Math.sin(x * 0.006 + ph) + 0.3 * Math.sin(x * 0.017 + ph * 2) + 0.15 * Math.sin(x * 0.041 + ph * 3));
            c.lineTo(x, y);
          }
          c.lineTo(W, gy);
          c.closePath();
          c.fill();
        });
      }
      if (th.hills) {
        c.fillStyle = shade(th.hills, -0.1);
        c.beginPath();
        c.moveTo(0, gy);
        for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, gy - 50 - 18 * Math.sin(x * 0.01 + 1.3));
        c.lineTo(W, gy);
        c.fill();
      }
      this.bgLayer = bg;

      // ---- FAR SKYLINE ----
      const PF = 40;
      const far = makeLayer(W + PF * 2, gy, dpr);
      c = far.ctx;
      let x = -10;
      while (x < W + PF * 2) {
        const bw = 26 + rng() * 60;
        const bh = gy * (th.tallness * 0.7 + rng() * th.tallness);
        const top = gy - bh;
        c.fillStyle = th.far;
        c.fillRect(x, top, bw, bh);
        if (rng() < 0.15) {
          c.fillRect(x + bw / 2 - 2, top - 20 - rng() * 30, 4, 30);
        }
        if (th.farWin) {
          for (let wy = top + 8; wy < gy - 30; wy += 9) {
            for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
              if (rng() < th.farWin) {
                c.fillStyle = rgba(th.farWinColor || th.winLitColor, 0.5 + rng() * 0.4);
                c.fillRect(wx, wy, 3, 4);
              }
            }
          }
        }
        x += bw + rng() * 6;
      }
      const hz = c.createLinearGradient(0, gy - gy * 0.5, 0, gy);
      hz.addColorStop(0, 'rgba(0,0,0,0)');
      hz.addColorStop(1, th.haze);
      c.fillStyle = hz;
      c.fillRect(0, 0, far.w, gy);
      this.farLayer = far;
      this.farPad = PF;

      // ---- NEAR BUILDINGS ----
      const PN = 80;
      const near = makeLayer(W + PN * 2, gy, dpr);
      this.nearPad = PN;
      this.antennas = [];
      x = -20;
      while (x < W + PN * 2) {
        const bw = 80 + rng() * 120;
        const bh = Math.min(gy - 60, gy * th.tallness + rng() * gy * 0.32);
        this.drawBuilding(near.ctx, x, gy - 12, bw, bh, rng, th);
        x += bw + (rng() < 0.25 ? 8 + rng() * 24 : -2);
      }
      // atmospheric haze on near layer base
      c = near.ctx;
      const nh = c.createLinearGradient(0, gy - 120, 0, gy);
      nh.addColorStop(0, 'rgba(0,0,0,0)');
      nh.addColorStop(1, 'rgba(0,0,0,0.18)');
      c.fillStyle = nh;
      c.fillRect(0, gy - 120, near.w, 120);
      this.nearLayer = near;

      // ---- GROUND ----
      const top = gy - 14;
      const gH = H - top;
      const ground = makeLayer(W, gH, dpr);
      c = ground.ctx;
      const swH = 40, curbH = 8;
      // sidewalk
      const swg = c.createLinearGradient(0, 0, 0, swH);
      swg.addColorStop(0, shade(th.sidewalk, -0.12));
      swg.addColorStop(0.3, th.sidewalk);
      swg.addColorStop(1, shade(th.sidewalk, 0.06));
      c.fillStyle = swg;
      c.fillRect(0, 0, W, swH);
      const swNoise = c.createPattern(noiseCanvas(96, th.sidewalk, 22, rng), 'repeat');
      c.globalAlpha = 0.35;
      c.fillStyle = swNoise;
      c.fillRect(0, 0, W, swH);
      c.globalAlpha = 1;
      // tiles
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 13.5); c.lineTo(W, 13.5);
      c.moveTo(0, 27.5); c.lineTo(W, 27.5);
      for (let tx = 0; tx < W + 60; tx += 52) {
        c.moveTo(tx, 0); c.lineTo(tx - 2, 13.5);
        c.moveTo(tx + 26, 13.5); c.lineTo(tx + 23, 27.5);
        c.moveTo(tx, 27.5); c.lineTo(tx - 4, swH);
      }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.moveTo(0, 14.5); c.lineTo(W, 14.5);
      c.moveTo(0, 28.5); c.lineTo(W, 28.5);
      c.stroke();
      // wall shadow at back of sidewalk
      const ws = c.createLinearGradient(0, 0, 0, 8);
      ws.addColorStop(0, 'rgba(0,0,0,0.35)');
      ws.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ws;
      c.fillRect(0, 0, W, 8);
      // curb
      c.fillStyle = th.curb;
      c.fillRect(0, swH, W, 3);
      c.fillStyle = shade(th.curb, -0.3);
      c.fillRect(0, swH + 3, W, curbH - 3);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let cx = 0; cx < W; cx += 90) c.fillRect(cx, swH, 1.5, curbH);
      // road
      const roadTop = swH + curbH;
      const roadH = gH - roadTop;
      c.fillStyle = c.createPattern(noiseCanvas(128, th.asphalt, 26, rng), 'repeat');
      c.fillRect(0, roadTop, W, roadH);
      const rg = c.createLinearGradient(0, roadTop, 0, gH);
      rg.addColorStop(0, 'rgba(0,0,0,0.35)');
      rg.addColorStop(0.15, 'rgba(0,0,0,0.05)');
      rg.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = rg;
      c.fillRect(0, roadTop, W, roadH);
      // cracks / patches
      for (let i = 0; i < W / 120; i++) {
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.beginPath();
        c.ellipse(rng() * W, roadTop + 8 + rng() * (roadH - 16), 20 + rng() * 40, 3 + rng() * 5, 0, 0, Math.PI * 2);
        c.fill();
      }
      // crosswalk
      const cwX = W / 2 - 70;
      c.fillStyle = rgba(th.lane, 0.82);
      for (let i = 0; i < 8; i++) c.fillRect(cwX + i * 18, roadTop + 6, 11, roadH - 12);
      // lane dashes
      const laneY = roadTop + roadH * 0.5 - 2;
      c.fillStyle = rgba(th.lane, th.neon ? 0.9 : 0.75);
      if (th.neon) { c.shadowColor = th.lane; c.shadowBlur = 10; }
      for (let lx = 10; lx < W; lx += 70) {
        if (lx > cwX - 40 && lx < cwX + 150) continue;
        c.fillRect(lx, laneY, 38, 4);
      }
      c.shadowBlur = 0;
      if (th.wet) {
        const wg = c.createLinearGradient(0, roadTop, 0, gH);
        wg.addColorStop(0, 'rgba(255,255,255,0.06)');
        wg.addColorStop(0.5, 'rgba(255,255,255,0)');
        wg.addColorStop(1, 'rgba(255,255,255,0.05)');
        c.fillStyle = wg;
        c.fillRect(0, roadTop, W, roadH);
      }
      this.groundLayer = ground;
      this.groundTop = top;

      // ---- TREES & LAMPS ----
      this.trees = [];
      if (th.trees) {
        for (let tx = 140 + rng() * 60; tx < W + 60; tx += 240 + rng() * 120) {
          const scale = 0.85 + rng() * 0.45;
          this.trees.push({ x: tx, scale, sprite: this.makeTreeSprite(rng, th) });
        }
      }
      this.streetLamps = [];
      for (let lx = 70; lx < W + 100; lx += 230) this.streetLamps.push({ x: lx });

      // ---- CLOUDS ----
      this.clouds = [];
      for (let i = 0; i < th.cloudCount; i++) {
        this.clouds.push({
          x: rng() * W,
          y: 20 + rng() * (this.skyY * 0.75),
          speed: 6 + rng() * 14,
          scale: 0.6 + rng() * 0.9,
          sprite: this.makeCloudSprite(rng, th)
        });
      }
    }

    drawBuilding(c, x, baseY, w, h, rng, th) {
      const col = th.buildings[Math.floor(rng() * th.buildings.length)];
      const top = baseY - h;

      // body
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, shade(col, 0.14));
      g.addColorStop(0.55, col);
      g.addColorStop(1, shade(col, -0.28));
      c.fillStyle = g;
      c.fillRect(x, top, w, h);

      // roof extras
      if (rng() < 0.3 && !th.neon) {
        const tx = x + 12 + rng() * (w - 40);
        c.fillStyle = shade(col, -0.45);
        c.fillRect(tx + 2, top - 14, 2, 10);
        c.fillRect(tx + 16, top - 14, 2, 10);
        const tg = c.createLinearGradient(tx, 0, tx + 20, 0);
        tg.addColorStop(0, '#8a6a4a'); tg.addColorStop(1, '#4e3a28');
        c.fillStyle = tg;
        c.fillRect(tx, top - 30, 20, 17);
        c.beginPath(); c.moveTo(tx - 2, top - 30); c.lineTo(tx + 10, top - 38); c.lineTo(tx + 22, top - 30); c.fill();
      }
      if (rng() < 0.4) {
        c.fillStyle = shade(col, -0.3);
        const ax = x + 8 + rng() * (w - 30);
        c.fillRect(ax, top - 8, 14 + rng() * 10, 8);
      }
      if (rng() < 0.45) {
        const ax = x + w * (0.25 + rng() * 0.5);
        const ah = 16 + rng() * 26;
        c.strokeStyle = shade(col, -0.5);
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(ax, top - 6); c.lineTo(ax, top - 6 - ah); c.stroke();
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(ax - 6, top - 6 - ah * 0.6); c.lineTo(ax + 6, top - 6 - ah * 0.6); c.stroke();
        this.antennas.push({ x: ax, y: top - 6 - ah, phase: rng() * 1000 });
      }

      // cornice
      c.fillStyle = shade(col, -0.35);
      c.fillRect(x - 3, top - 6, w + 6, 7);
      c.fillStyle = shade(col, 0.25);
      c.fillRect(x - 3, top - 6, w + 6, 2);

      // windows
      const floorH = 22 + Math.floor(rng() * 6);
      const winW = 9 + Math.floor(rng() * 6);
      const gap = 7 + Math.floor(rng() * 5);
      const shopH = 38;
      const bands = rng() < 0.25;
      for (let fy = top + 12; fy < baseY - shopH - floorH + 6; fy += floorH) {
        c.fillStyle = 'rgba(0,0,0,0.14)';
        c.fillRect(x, fy + floorH - 5, w, 2);
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(x, fy + floorH - 3, w, 1);
        if (bands) {
          const lit = rng() < th.winLit;
          this.paintWindow(c, x + 6, fy, w - 12, floorH - 10, lit, rng, th);
          c.fillStyle = 'rgba(0,0,0,0.25)';
          for (let mx = x + 6 + 18; mx < x + w - 8; mx += 18) c.fillRect(mx, fy, 1.5, floorH - 10);
        } else {
          for (let wx = x + 9; wx + winW < x + w - 7; wx += winW + gap) {
            this.paintWindow(c, wx, fy, winW, floorH - 10, rng() < th.winLit, rng, th);
          }
        }
      }

      // ground floor shop
      c.fillStyle = shade(col, -0.4);
      c.fillRect(x, baseY - shopH, w, shopH);
      const shopLit = th.lampOn > 0.3 || rng() < 0.4;
      const sg = c.createLinearGradient(0, baseY - shopH + 10, 0, baseY - 4);
      if (shopLit) {
        sg.addColorStop(0, rgba(th.neon ? (rng() < 0.5 ? th.winLitColor : th.winLitColor2) : '#ffe0a0', 0.85));
        sg.addColorStop(1, rgba('#ffb060', 0.55));
      } else {
        sg.addColorStop(0, rgba(th.winGlass[0], 0.9));
        sg.addColorStop(1, rgba(th.winGlass[1], 0.9));
      }
      c.fillStyle = sg;
      c.fillRect(x + 8, baseY - shopH + 12, w - 30, shopH - 16);
      c.fillStyle = shade(col, -0.6);
      c.fillRect(x + w - 19, baseY - shopH + 10, 12, shopH - 10);
      // awning
      if (rng() < 0.65 && !th.neon) {
        const ac = ['#e74c3c', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085'][Math.floor(rng() * 6)];
        const ay = baseY - shopH + 2;
        for (let i = 0, ax = x + 4; ax < x + w - 4; ax += 12, i++) {
          c.fillStyle = i % 2 ? '#f4f1ea' : ac;
          c.beginPath();
          c.moveTo(ax, ay); c.lineTo(Math.min(ax + 12, x + w - 4), ay);
          c.lineTo(Math.min(ax + 14, x + w - 2), ay + 10); c.lineTo(ax + 2, ay + 10);
          c.closePath(); c.fill();
        }
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x + 4, ay + 10, w - 8, 3);
      }
      // neon signs
      if (th.neon && rng() < 0.75) {
        const word = NEON_WORDS[Math.floor(rng() * NEON_WORDS.length)];
        const nc = rng() < 0.5 ? th.winLitColor : th.winLitColor2;
        c.save();
        c.font = `${14 + Math.floor(rng() * 8)}px ${FONT}`;
        c.textAlign = 'center';
        c.shadowColor = nc;
        c.shadowBlur = 16;
        c.fillStyle = nc;
        const sy = top + 20 + rng() * Math.max(10, h * 0.4);
        if (rng() < 0.5) {
          c.fillText(word, x + w / 2, sy);
        } else {
          const sx = x + w - 10;
          for (let i = 0; i < Math.min(word.length, 6); i++) c.fillText(word[i], sx, sy + i * 16);
        }
        c.lineWidth = 2;
        c.strokeStyle = nc;
        c.strokeRect(x + 6, baseY - shopH - 4, w - 12, 3);
        c.restore();
      }
      // edge shadow + ambient occlusion
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(x + w - 2, top, 2, h);
      const ao = c.createLinearGradient(0, baseY - 50, 0, baseY);
      ao.addColorStop(0, 'rgba(0,0,0,0)');
      ao.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = ao;
      c.fillRect(x, baseY - 50, w, 50);
    }

    paintWindow(c, wx, wy, ww, wh, lit, rng, th) {
      if (lit) {
        const colr = th.winLitColor2 && rng() < 0.5 ? th.winLitColor2 : th.winLitColor;
        const lg = c.createLinearGradient(0, wy, 0, wy + wh);
        lg.addColorStop(0, shade(colr, 0.25));
        lg.addColorStop(1, shade(colr, -0.15));
        if (th.winLit > 0.3) { c.shadowColor = colr; c.shadowBlur = 8; }
        c.fillStyle = lg;
        c.fillRect(wx, wy, ww, wh);
        c.shadowBlur = 0;
        if (rng() < 0.3) {
          c.fillStyle = 'rgba(0,0,0,0.25)';
          c.fillRect(wx + ww * 0.55, wy + wh * 0.3, ww * 0.25, wh * 0.7);
        }
      } else {
        const gg = c.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
        gg.addColorStop(0, th.winGlass[0]);
        gg.addColorStop(1, th.winGlass[1]);
        c.fillStyle = gg;
        c.fillRect(wx, wy, ww, wh);
        if (th.glassShine) {
          c.fillStyle = 'rgba(255,255,255,0.22)';
          c.beginPath();
          c.moveTo(wx, wy + wh * 0.6); c.lineTo(wx + ww * 0.6, wy); c.lineTo(wx + ww * 0.85, wy); c.lineTo(wx, wy + wh * 0.9);
          c.closePath(); c.fill();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(wx - 1, wy + wh, ww + 2, 2);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(wx - 1, wy + wh + 2, ww + 2, 1);
    }

    makeTreeSprite(rng, th) {
      const L = makeLayer(130, 160, this.dpr);
      const c = L.ctx;
      const cx = 65, base = 158;
      // trunk
      const tg = c.createLinearGradient(cx - 6, 0, cx + 6, 0);
      tg.addColorStop(0, '#7a5a3e'); tg.addColorStop(1, '#3e2a1c');
      c.fillStyle = tg;
      c.beginPath();
      c.moveTo(cx - 6, base); c.lineTo(cx - 3.5, base - 70); c.lineTo(cx + 3.5, base - 70); c.lineTo(cx + 6, base);
      c.fill();
      c.strokeStyle = '#4a3322'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, base - 60); c.lineTo(cx - 18, base - 88); c.moveTo(cx, base - 66); c.lineTo(cx + 16, base - 92); c.stroke();
      // canopy blobs
      const [mid, dark, light] = th.treeColor;
      const blobs = [];
      for (let i = 0; i < 22; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
        blobs.push({ x: cx + Math.cos(a) * 40 * d, y: base - 100 + Math.sin(a) * 34 * d, r: 12 + rng() * 10 });
      }
      blobs.sort((a, b) => a.y - b.y);
      blobs.forEach(b => {
        c.fillStyle = dark;
        c.beginPath(); c.arc(b.x + 2, b.y + 3, b.r, 0, Math.PI * 2); c.fill();
      });
      blobs.forEach(b => {
        const bg = c.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, 1, b.x, b.y, b.r);
        bg.addColorStop(0, light);
        bg.addColorStop(0.6, mid);
        bg.addColorStop(1, dark);
        c.fillStyle = bg;
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
      });
      return L;
    }

    makeCloudSprite(rng, th) {
      const L = makeLayer(200, 100, this.dpr);
      const c = L.ctx;
      const puffs = [];
      const n = 7 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        puffs.push({ x: 30 + t * 140 + (rng() - 0.5) * 16, y: 60 - Math.sin(t * Math.PI) * 22 + (rng() - 0.5) * 10, r: 16 + Math.sin(t * Math.PI) * 18 + rng() * 8 });
      }
      const [r, g, b] = th.cloud, [sr, sg, sb] = th.cloudShade;
      puffs.forEach(p => {
        const pg = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.5, 2, p.x, p.y, p.r * 1.05);
        pg.addColorStop(0, `rgba(${r},${g},${b},0.98)`);
        pg.addColorStop(0.65, `rgba(${(r + sr) >> 1},${(g + sg) >> 1},${(b + sb) >> 1},0.92)`);
        pg.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
        c.fillStyle = pg;
        c.beginPath(); c.arc(p.x, p.y, p.r * 1.05, 0, Math.PI * 2); c.fill();
      });
      return L;
    }

    buildVignette() {
      const L = makeLayer(this.width, this.height, 1);
      const c = L.ctx;
      const W = this.width, H = this.height;
      const g = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,10,0.5)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      this.vignette = L;
    }

    initAmbient() {
      this.ambient = [];
      const th = this.theme;
      const W = this.width, H = this.height;
      if (th.ambient === 'leaves') {
        for (let i = 0; i < 12; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, vx: 15 + Math.random() * 20, vy: 20 + Math.random() * 25, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, ph: Math.random() * 10, color: ['#7cb342', '#c0ca33', '#f9a825', '#8d6e63'][i % 4] });
      } else if (th.ambient === 'dust') {
        for (let i = 0; i < 30; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, vx: 5 + Math.random() * 10, vy: -3 + Math.random() * 6, ph: Math.random() * 10, r: 0.8 + Math.random() * 1.6 });
      } else if (th.ambient === 'fireflies') {
        for (let i = 0; i < 26; i++) this.ambient.push({ x: Math.random() * W, y: this.groundY - Math.random() * 160, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 12, ph: Math.random() * 10 });
      } else if (th.ambient === 'rain') {
        for (let i = 0; i < 170; i++) this.ambient.push({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 400, l: 10 + Math.random() * 14 });
      }
    }

    updateAmbient(dt) {
      const th = this.theme;
      const W = this.width, H = this.height;
      this.ambient.forEach(a => {
        if (th.ambient === 'leaves') {
          a.ph += dt * 2;
          a.x += (a.vx + Math.sin(a.ph) * 25) * dt;
          a.y += a.vy * dt;
          a.rot += a.vr * dt;
          if (a.y > this.groundY + 20 || a.x > W + 20) { a.y = -10; a.x = Math.random() * W - 100; }
        } else if (th.ambient === 'dust') {
          a.ph += dt;
          a.x += a.vx * dt;
          a.y += (a.vy + Math.sin(a.ph) * 4) * dt;
          if (a.x > W + 10) a.x = -10;
          if (a.y < 0 || a.y > H) a.y = Math.random() * H;
        } else if (th.ambient === 'fireflies') {
          a.ph += dt * 2;
          a.x += (a.vx + Math.sin(a.ph * 0.7) * 15) * dt;
          a.y += (a.vy + Math.cos(a.ph * 0.5) * 10) * dt;
          if (a.x < -10) a.x = W + 10; if (a.x > W + 10) a.x = -10;
          if (a.y < this.groundY - 220 || a.y > this.groundY) a.vy *= -1;
        } else if (th.ambient === 'rain') {
          a.y += a.v * dt;
          a.x -= a.v * 0.15 * dt;
          if (a.y > this.groundY + 60 + Math.random() * 40) {
            if (Math.random() < 0.08) this.particles.push(new Particle(a.x, this.groundY + 30 + Math.random() * 40, 'rgba(160,220,255,0.6)', 'drop'));
            a.y = -20; a.x = Math.random() * (W + 100);
          }
        }
      });
    }

    renderAmbient(ctx) {
      const th = this.theme;
      if (!this.ambient.length) return;
      ctx.save();
      if (th.ambient === 'leaves') {
        this.ambient.forEach(a => {
          ctx.save();
          ctx.translate(a.x, a.y);
          ctx.rotate(a.rot);
          ctx.fillStyle = a.color;
          ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
          ctx.restore();
        });
      } else if (th.ambient === 'dust') {
        ctx.globalCompositeOperation = 'lighter';
        this.ambient.forEach(a => {
          ctx.fillStyle = `rgba(255,220,170,${0.15 + 0.15 * Math.sin(a.ph * 2)})`;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
        });
      } else if (th.ambient === 'fireflies') {
        ctx.globalCompositeOperation = 'lighter';
        this.ambient.forEach(a => {
          const al = Math.max(0, Math.sin(a.ph * 1.7));
          const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 9);
          g.addColorStop(0, `rgba(230,255,140,${0.9 * al})`);
          g.addColorStop(1, 'rgba(230,255,140,0)');
          ctx.fillStyle = g;
          ctx.fillRect(a.x - 9, a.y - 9, 18, 18);
        });
      } else if (th.ambient === 'rain') {
        ctx.strokeStyle = 'rgba(170,210,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        this.ambient.forEach(a => { ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.l * 0.15, a.y - a.l); });
        ctx.stroke();
      }
      ctx.restore();
    }

    // ======================================================================
    // CONTROLS
    // ======================================================================
    setupControls() {
      const $ = this.$;
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (e.target && e.target.tagName === 'INPUT') return;
        this.keys[key] = true;
        this.keys[e.code] = true;

        if (!this.isRunning) {
          if (e.key === '/' && this.inLobby && !this.anyModalOpen()) {
            e.preventDefault();
            this.openAdminConsole('/');
            return;
          }
          if (key === 'm') this.toggleSound();
          if (key === 'enter' && this.inLobby && !this.anyModalOpen() && document.activeElement === document.body) this.playSelectedMode();
          return;
        }

        const p1 = this.players[0], p2 = this.players[1];
        const gameKeys = [' ', 'arrowdown', 'arrowup', 'arrowleft', 'arrowright', 'enter'];
        if (gameKeys.includes(key)) e.preventDefault();
        if (e.repeat && key !== ' ' && key !== 's' && key !== 'arrowdown' && key !== 'enter') return;

        if (this.isLocalDuo && p2) {
          if (key === 's' || key === ' ') this.dropPoop(p1);
          if (key === 'e') this.triggerAbility(p1);
          if (key === 'arrowdown' || key === 'enter' || e.code === 'Numpad0') this.dropPoop(p2);
          if (key === 'arrowup' || e.code === 'ShiftRight') this.triggerAbility(p2);
        } else {
          if (key === ' ' || key === 'arrowdown' || key === 's') this.localDrop();
          if (key === 'e' || (this.netRole && key === 'arrowup')) this.localAbility();
        }

        if (key === 'q') this.toggleMouseControl();
        if (key === 'p' || key === 'escape') this.togglePause();
        if (key === 'm') this.toggleSound();
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.key.toLowerCase()] = false;
        this.keys[e.code] = false;
      });
      window.addEventListener('blur', () => { this.keys = {}; });

      this.canvas.addEventListener('pointerdown', () => {
        if (!this.isRunning || this.isPaused) return;
        this.localDrop();
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (this.mouseControlEnabled) this.mouseX = e.clientX;
      });

      this.mouseToggleBtn.addEventListener('click', () => this.toggleMouseControl());
      this.abilityBtn.addEventListener('click', () => this.localAbility());

      // Touch
      const bindTouch = (elem, pressKey) => {
        elem.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[pressKey] = true; });
        elem.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[pressKey] = false; });
      };
      bindTouch($('btnLeft'), 'touchleft');
      bindTouch($('btnRight'), 'touchright');
      $('btnDrop').addEventListener('touchstart', (e) => { e.preventDefault(); this.localDrop(); });
      $('touchAbilityBtn').addEventListener('touchstart', (e) => { e.preventDefault(); this.localAbility(); });

      // Lobby nav
      $('tabLobby').addEventListener('click', () => this.closeAllLobbyModals());
      $('tabCampaign').addEventListener('click', () => { this.closeAllLobbyModals(); this.openMap(); });
      $('lobbyShopBtn').addEventListener('click', () => { this.closeAllLobbyModals(); this.openShop(); });
      $('tabUpgrades').addEventListener('click', () => { this.closeAllLobbyModals(); this.openUpgrades(); });
      $('lobbyDeviceShareBtn').addEventListener('click', () => { this.closeAllLobbyModals(); this.openDeviceShareModal(); });
      $('lobbySoundBtn').addEventListener('click', () => this.toggleSound());
      $('lobbyPlayBtn').addEventListener('click', () => this.playSelectedMode());
      $('heroPrevBtn').addEventListener('click', () => this.cycleEquipped(-1));
      $('heroNextBtn').addEventListener('click', () => this.cycleEquipped(1));
      document.querySelectorAll('.fn-mode').forEach(btn => {
        btn.addEventListener('click', () => this.setLobbyMode(btn.dataset.mode));
      });
      $('p2InviteBtn').addEventListener('click', () => this.setLobbyMode('coop'));
      $('p2RemoveBtn').addEventListener('click', () => this.setLobbyMode('free'));
      $('p2PrevBtn').addEventListener('click', () => this.cycleP2Skin(-1));
      $('p2NextBtn').addEventListener('click', () => this.cycleP2Skin(1));

      // Upgrades
      $('btnUpgradeSpeed').addEventListener('click', () => this.upgradeStat('speed'));
      $('btnUpgradeReload').addEventListener('click', () => this.upgradeStat('reload'));
      $('btnUpgradeCoins').addEventListener('click', () => this.upgradeStat('coins'));
      $('closeUpgradesBtn').addEventListener('click', () => this.closeUpgrades());
      $('closeUpgradesTopBtn').addEventListener('click', () => this.closeUpgrades());

      // Return to lobby buttons
      $('inGameLobbyBtn').addEventListener('click', () => this.returnToLobby());
      $('backToLobbyFromMapBtn').addEventListener('click', () => this.returnToLobby());
      $('closeMapBtn').addEventListener('click', () => this.returnToLobby());
      $('lobbyFromWinBtn').addEventListener('click', () => this.returnToLobby());
      $('lobbyFromFailBtn').addEventListener('click', () => this.returnToLobby());
      $('lobbyFromPauseBtn').addEventListener('click', () => this.returnToLobby());
      $('vsLobbyBtn').addEventListener('click', () => this.returnToLobby());
      $('vsRematchBtn').addEventListener('click', () => this.requestRematch());
      this.setupOnline();

      // Map
      $('openMapFromWinBtn').addEventListener('click', () => { this.levelWinModal.classList.add('hidden'); this.openMap(); });
      $('openMapFromFailBtn').addEventListener('click', () => { this.levelFailModal.classList.add('hidden'); this.openMap(); });
      $('mapFromPauseBtn').addEventListener('click', () => { this.endRun(); this.pauseScreen.classList.add('hidden'); this.openMap(); });
      $('playCurrentMapLevelBtn').addEventListener('click', () => {
        this.closeMap();
        this.startLevel(storage.getUnlockedLevel() - 1);
      });

      // Share
      const lanInput = $('lanUrlInput');
      if (location.protocol.startsWith('http') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        lanInput.value = location.origin;
      }
      $('copyLanBtn').addEventListener('click', () => {
        lanInput.select();
        try { navigator.clipboard.writeText(lanInput.value); } catch (e) {}
        this.showToast('📋 Odkaz zkopírován do schránky!');
      });
      $('closeShareBtn').addEventListener('click', () => this.closeDeviceShareModal());

      // Shop
      $('closeShopBtn').addEventListener('click', () => this.closeShop());
      $('closeShopTopBtn').addEventListener('click', () => this.closeShop());

      // Game state
      $('resumeBtn').addEventListener('click', () => this.togglePause());
      $('soundBtn').addEventListener('click', () => this.toggleSound());
      $('pauseBtn').addEventListener('click', () => this.togglePause());
      $('nextLevelBtn').addEventListener('click', () => {
        this.levelWinModal.classList.add('hidden');
        this.startLevel(Math.min(this.currentLevelIndex + 1, LEVELS.length - 1));
      });
      $('replayLevelBtn').addEventListener('click', () => { this.levelWinModal.classList.add('hidden'); this.startLevel(this.currentLevelIndex); });
      $('retryFailBtn').addEventListener('click', () => { this.levelFailModal.classList.add('hidden'); this.startLevel(this.currentLevelIndex); });

      const muted = window.pigeonAudio.muted;
      this.soundBtn.textContent = muted ? '🔇' : '🔊';
      $('lobbySoundBtn').textContent = muted ? '🔇' : '🔊';
    }

    anyModalOpen() {
      return [this.levelMapScreen, this.shopModal, this.upgradesModal, this.deviceShareModal, this.$('onlineModal'), this.$('editModal'), this.$('discoverScreen'), this.$('passModal'), this.$('leaderModal'), this.$('authModal')].some(m => !m.classList.contains('hidden'));
    }

    closeAllLobbyModals() {
      this.levelMapScreen.classList.add('hidden');
      this.shopModal.classList.add('hidden');
      this.upgradesModal.classList.add('hidden');
      this.deviceShareModal.classList.add('hidden');
      this.$('editModal').classList.add('hidden');
      this.$('passModal').classList.add('hidden');
      this.$('leaderModal').classList.add('hidden');
      this.setActiveTab('tabLobby');
      this.updateLobbyHero();
    }

    setActiveTab(id) {
      document.querySelectorAll('.fn-tab').forEach(t => t.classList.toggle('active', t.id === id));
    }

    // ======================================================================
    // LOBBY
    // ======================================================================
    setupLobby() {
      this.updateLobbyHero();
      this.updateLobbyMode();
      this.renderChallenges();
    }

    setLobbyMode(mode) {
      this.lobbyMode = mode;
      storage.setLobbyMode(mode);
      window.pigeonAudio.playFlap();
      this.updateLobbyMode();
    }

    updateLobbyMode() {
      const dm = DISCOVER_MODES.find(m => m.mode === this.lobbyMode) || DISCOVER_MODES[0];
      this.$('cmIcon').textContent = dm.icon;
      this.$('cmName').textContent = dm.title;
      this.$('cmTag').textContent = dm.tag;
      const sub = {
        campaign: `KAMPAŇ • LEVEL ${storage.getUnlockedLevel()}`,
        free: 'NEKONEČNÝ MÓD • SÓLO',
        coop: 'CO-OP DUO • 2 HRÁČI',
        versus: 'SOUBOJ 1v1 • 90 S',
        online: 'ONLINE 1v1 • PŘES KÓD'
      }[this.lobbyMode];
      this.$('playModeSub').textContent = sub;
      const has = this.lobbyHasP2;
      this.$('p2InviteBtn').classList.toggle('hidden', has);
      this.$('p2Card').classList.toggle('hidden', !has);
      this.$('p2SkinName').textContent = this.p2Skin.name;
    }

    playSelectedMode() {
      window.pigeonAudio.ensureContext();
      if (this.lobbyMode === 'campaign') {
        this.setActiveTab('tabCampaign');
        this.openMap();
      } else if (this.lobbyMode === 'free') {
        this.startFreeMode();
      } else if (this.lobbyMode === 'online') {
        this.openOnline();
      } else {
        this.startDuo(this.lobbyMode);
      }
    }

    cycleEquipped(dir) {
      const unlocked = storage.getUnlockedSkins();
      if (unlocked.length < 2) {
        this.showToast('🛍️ Kup si další holuby v OBCHODĚ!');
        return;
      }
      let idx = unlocked.indexOf(this.equippedSkinId);
      idx = (idx + dir + unlocked.length) % unlocked.length;
      this.equippedSkinId = unlocked[idx];
      storage.setEquippedSkin(this.equippedSkinId);
      window.pigeonAudio.playFlap();
      this.lobbySwap = 1;
      this.updateLobbyHero();
    }

    cycleP2Skin(dir) {
      const options = ['p2_classic', ...storage.getUnlockedSkins()];
      let idx = options.indexOf(this.p2Skin.id);
      if (idx < 0) idx = 0;
      idx = (idx + dir + options.length) % options.length;
      this.p2SkinId = options[idx];
      storage.setP2Skin(this.p2SkinId);
      window.pigeonAudio.playFlap();
      this.lobbySwapP2 = 1;
      this.updateLobbyMode();
    }

    returnToLobby() {
      if (!this.inLobby) this.recordScore();
      if (this.netRole) this.netClose(true);
      const om = this.$('onlineModal');
      if (om) om.classList.add('hidden');
      this.endRun();
      this.inLobby = true;
      this.hud.classList.add('hidden');
      this.touchControls.classList.add('hidden');
      this.levelHudBar.classList.add('hidden');
      this.versusBar.classList.add('hidden');
      this.p2Hud.classList.add('hidden');
      [this.levelMapScreen, this.shopModal, this.upgradesModal, this.pauseScreen, this.levelWinModal, this.levelFailModal, this.versusResultModal, this.deviceShareModal]
        .forEach(m => m.classList.add('hidden'));
      this.lobbyScreen.classList.remove('hidden');
      this.setActiveTab('tabLobby');
      this.setupLobby();
    }

    endRun() {
      this.isRunning = false;
      this.isPaused = false;
    }

    updateLobbyStats() {
      this.coins = storage.getCoins();
      this.updateCoinsDisplay();

      let totalStars = 0;
      Object.values(storage.getLevelStars()).forEach(s => totalStars += s);
      this.$('lobbyStarsVal').textContent = `${totalStars}/300`;

      const skin = this.equippedSkin;
      const up = this.currentUpgrades;
      const power = Math.round((up.speed + up.reload + up.coins) * 45 + (skin.price / 100));
      this.$('lobbyPowerRating').textContent = `⚡ BOJOVÁ SÍLA: ${power}`;

      const xp = storage.getXP();
      const lvl = 1 + Math.floor(xp / 1000);
      this.$('lobbyLevelNum').textContent = lvl;
      this.$('lobbyXpFill').style.width = `${(xp % 1000) / 10}%`;
      this.$('lobbyXpText').textContent = `${(xp % 1000).toLocaleString()} / 1 000 XP`;

      // pass mini
      const st = this.passState();
      const pass = storage.getPass();
      this.$('passMiniTier').textContent = `ÚROVEŇ ${st.tier}/${PASS_TIERS}${pass.premium ? ' 👑' : ''}`;
      this.$('passMiniFill').style.width = st.maxed ? '100%' : `${(st.into / st.need) * 100}%`;
      this.$('passMiniText').textContent = st.maxed ? 'Pass dokončen!' : `${st.into.toLocaleString()} / ${st.need.toLocaleString()} XP do další úrovně`;
      let claimable = false;
      for (let t = 1; t <= st.tier && !claimable; t++) {
        if (!pass.free.includes(t) || (pass.premium && !pass.prem.includes(t))) claimable = true;
      }
      this.$('passMiniClaim').classList.toggle('hidden', !claimable);

      this.$('heroEditState').textContent = Object.keys(storage.getEdit(skin.id)).length ? '✔ UPRAVENO' : '';
    }

    renderChallenges() {
      const list = this.$('challengeList');
      const stats = storage.getStats();
      const claimed = storage.getClaimed();
      const open = CHALLENGES.filter(c => !claimed.includes(c.id)).slice(0, 4);
      list.innerHTML = '';
      if (!open.length) {
        list.innerHTML = '<div class="fn-ch-empty">🏆 Všechny výzvy splněny! Jsi legenda.</div>';
        return;
      }
      open.forEach(ch => {
        const val = Math.min(ch.target, stats[ch.stat] || 0);
        const done = val >= ch.target;
        const el = document.createElement('div');
        el.className = `fn-challenge ${done ? 'done' : ''}`;
        el.innerHTML = `
          <span class="fn-ch-label">${ch.label}</span>
          ${done ? `<button class="fn-ch-claim">VYZVEDNOUT ${ch.reward} 🪙</button>` : `<span class="fn-ch-reward">${ch.reward} 🪙</span>`}
          <div class="fn-ch-bar"><div class="fn-ch-fill" style="width:${(val / ch.target) * 100}%"></div></div>
          <span class="fn-ch-progress">${val.toLocaleString()} / ${ch.target.toLocaleString()}</span>
        `;
        if (done) {
          el.querySelector('.fn-ch-claim').addEventListener('click', () => {
            const c = storage.getClaimed();
            if (c.includes(ch.id)) return;
            c.push(ch.id);
            storage.setClaimed(c);
            this.coins = storage.getCoins() + ch.reward;
            storage.setCoins(this.coins);
            storage.addXP(250);
            window.pigeonAudio.playPurchase();
            this.showToast(`🏆 Výzva splněna: +${ch.reward} 🪙`);
            this.updateLobbyStats();
            this.renderChallenges();
          });
        }
        list.appendChild(el);
      });
    }


    // ======================================================================
    // DNEŠNÍ NABÍDKA (každý den jiný holub se slevou)
    // ======================================================================
    getFeatured() {
      const day = Math.floor(Date.now() / 86400000);
      const owned = storage.getUnlockedSkins();
      const pool = Object.values(SKINS).filter(s => s.price > 0 && s.tier !== 'cosmic');
      const rng = mulberry32(day * 7919);
      let pick = pool[Math.floor(rng() * pool.length)];
      for (let i = 0; i < 20 && owned.includes(pick.id); i++) pick = pool[Math.floor(rng() * pool.length)];
      const discount = [20, 25, 30, 40][Math.floor(rng() * 4)];
      return { skin: pick, discount, price: Math.round(pick.price * (1 - discount / 100) / 50) * 50, owned: owned.includes(pick.id) };
    }

    renderFeatured() {
      const f = this.getFeatured();
      const $ = this.$;
      $('featName').textContent = f.skin.name;
      const rar = $('featRarity');
      rar.textContent = TIER_LABELS[f.skin.tier];
      rar.className = `hero-rarity-badge ${f.skin.tier}`;
      $('featOld').textContent = `${f.skin.price.toLocaleString()} 🪙`;
      $('featPrice').textContent = `${f.price.toLocaleString()} 🪙`;
      $('featDiscount').textContent = `-${f.discount} %`;
      const btn = $('featBuyBtn');
      btn.textContent = f.owned ? '✅ MÁŠ HO' : 'KOUPIT';
      btn.disabled = f.owned;
      $('featuredCard').style.setProperty('--tier-color', TIER_COLORS[f.skin.tier]);
      renderPigeonPreview($('featCanvas'), getAppearance(f.skin, this.editFor(f.skin.id)), 1.2);
      this.updateFeaturedTimer();
    }

    updateFeaturedTimer() {
      const el = this.$('featTimer');
      if (!el) return;
      const ms = 86400000 - (Date.now() % 86400000);
      const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      el.textContent = `nová za ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (h === 23 && m === 59 && s === 59) this.renderFeatured();
    }

    buyFeatured() {
      const f = this.getFeatured();
      if (f.owned) return;
      if (this.coins < f.price) {
        window.pigeonAudio.playPanic();
        this.showToast(`❌ Chybí ti ${(f.price - this.coins).toLocaleString()} 🪙`);
        return;
      }
      this.coins -= f.price;
      storage.setCoins(this.coins);
      const u = storage.getUnlockedSkins();
      u.push(f.skin.id);
      storage.setUnlockedSkins(u);
      this.equippedSkinId = f.skin.id;
      storage.setEquippedSkin(f.skin.id);
      this.lobbySwap = 1;
      window.pigeonAudio.playPurchase();
      this.showToast(`🎉 ${f.skin.name} je tvůj! Ušetřil jsi ${f.discount} %`);
      this.renderFeatured();
      this.updateLobbyHero();
    }

    // ======================================================================
    // ÚČTY: REGISTRACE / PŘIHLÁŠENÍ (e-mail nebo telefon + unikátní jméno)
    // ======================================================================
    get accountName() {
      const acc = SESSION_USER && loadAccounts()[SESSION_USER];
      return acc ? acc.name : '';
    }

    setupAuth() {
      const $ = this.$;
      this.authMethod = 'email';
      document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => this.setAuthTab(t.dataset.auth)));
      document.querySelectorAll('.auth-mbtn').forEach(b => b.addEventListener('click', () => this.setAuthMethod(b.dataset.method)));
      $('regName').addEventListener('input', () => this.checkNameLive());
      $('authRegisterForm').addEventListener('submit', (e) => { e.preventDefault(); this.register(); });
      $('authLoginForm').addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
      $('authGuestBtn').addEventListener('click', () => {
        try { sessionStorage.setItem('pigeon_guest', '1'); } catch (e) {}
        $('authModal').classList.add('hidden');
      });
      $('profileAuthBtn').addEventListener('click', () => {
        if (SESSION_USER) this.logout();
        else this.openAuth('register');
      });
      $('profileName').textContent = SESSION_USER === CREATOR_ACCOUNT.id ? `👑 ${CREATOR_NAME}` : (this.accountName || 'HOST');
      $('profileAuthBtn').textContent = SESSION_USER ? 'ODHLÁSIT' : 'PŘIHLÁSIT SE';

      let guest = false;
      try { guest = sessionStorage.getItem('pigeon_guest') === '1'; } catch (e) {}
      if (!SESSION_USER && !guest) this.openAuth(Object.keys(loadAccounts()).length ? 'login' : 'register');
      if (SESSION_USER) setTimeout(() => this.syncCloudProfile(), 1500);
    }

    openAuth(tab) {
      this.setAuthTab(tab || 'register');
      this.$('authModal').classList.remove('hidden');
    }

    setAuthTab(tab) {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === tab));
      this.$('authRegisterForm').classList.toggle('hidden', tab !== 'register');
      this.$('authLoginForm').classList.toggle('hidden', tab !== 'login');
      this.authMsg('');
    }

    setAuthMethod(m) {
      this.authMethod = m;
      document.querySelectorAll('.auth-mbtn').forEach(b => b.classList.toggle('active', b.dataset.method === m));
      const inp = this.$('regContact');
      this.$('authContactLabel').textContent = m === 'email' ? 'E-mail' : 'Telefonní číslo';
      inp.type = m === 'email' ? 'email' : 'tel';
      inp.placeholder = m === 'email' ? 'tvuj@email.cz' : '+420 777 123 456';
      inp.autocomplete = m === 'email' ? 'email' : 'tel';
      inp.value = '';
    }

    authMsg(text, kind) {
      const el = this.$('authMsg');
      el.textContent = text;
      el.className = `online-status ${kind || ''}`;
      el.style.display = text ? '' : 'none';
    }

    nameProblem(name) {
      if (!/^[A-Za-z0-9_.-]{3,16}$/.test(name)) return 'Jméno musí mít 3–16 znaků (písmena bez diakritiky, čísla, _ . -).';
      const low = name.toLowerCase();
      if (RESERVED_NAMES.includes(low)) return 'Tohle jméno je rezervované.';
      if (loadAccounts()[low]) return 'Tohle jméno už někdo má.';
      return '';
    }

    checkNameLive() {
      const name = this.$('regName').value.trim();
      const el = this.$('regNameCheck');
      if (!name) { el.textContent = ''; el.className = ''; return; }
      const prob = this.nameProblem(name);
      el.textContent = prob ? '✖ ' + (prob.includes('má') ? 'obsazené' : prob.includes('rezerv') ? 'rezervované' : 'neplatné') : '✔ volné';
      el.className = prob ? 'bad' : 'ok';
    }

    async register() {
      const $ = this.$;
      const raw = $('regContact').value;
      const contact = this.authMethod === 'email' ? normEmail(raw) : normPhone(raw);
      const name = $('regName').value.trim();
      const pass = $('regPass').value, pass2 = $('regPass2').value;
      if (!contact) return this.authMsg(this.authMethod === 'email' ? '❌ Zadej platný e-mail.' : '❌ Zadej platné telefonní číslo (např. +420 777 123 456).', 'err');
      const prob = this.nameProblem(name);
      if (prob) return this.authMsg('❌ ' + prob, 'err');
      if (pass.length < 6) return this.authMsg('❌ Heslo musí mít aspoň 6 znaků.', 'err');
      if (pass !== pass2) return this.authMsg('❌ Hesla se neshodují.', 'err');
      const accounts = loadAccounts();
      if (Object.values(accounts).some(a => a.contact === contact)) return this.authMsg('❌ Na tento e-mail / telefon už účet existuje. Přihlas se.', 'err');

      const id = name.toLowerCase();
      if (cloud.enabled) {
        this.authMsg('⏳ Kontroluji, jestli je jméno volné...');
        try {
          const existing = await cloud.get(`players/${id}`);
          if (existing) return this.authMsg('❌ Tohle jméno už někdo má.', 'err');
        } catch (e) {
          return this.authMsg('❌ Nepodařilo se ověřit jméno online. Zkontroluj internet.', 'err');
        }
      }
      const salt = Math.random().toString(36).slice(2, 10);
      const first = Object.keys(accounts).length === 0;
      accounts[id] = { name, contact, type: this.authMethod, salt, pass: hashPass(pass, salt), created: Date.now() };
      rawSet('pigeon_accounts', JSON.stringify(accounts));
      // první účet na tomto počítači převezme dosavadní postup hosta
      if (first) {
        try {
          Object.keys(localStorage).filter(k => k.startsWith('pigeon_') && !k.startsWith('pigeon_u_') && !GLOBAL_KEYS.has(k))
            .forEach(k => localStorage.setItem(`pigeon_u_${id}_${k.slice(7)}`, localStorage.getItem(k)));
        } catch (e) {}
      }
      setSession(id, $('regRemember').checked);
      if (cloud.enabled) {
        try { await cloud.put(`players/${id}`, { name, best: 0, level: 1, pigeons: 1, updated: Date.now() }); } catch (e) {}
      }
      this.authMsg(`✅ Účet ${name} vytvořen! Načítám...`, 'ok');
      window.pigeonAudio.playLevelWin();
      setTimeout(() => location.reload(), 700);
    }

    login() {
      const $ = this.$;
      const ident = $('loginId').value.trim();
      const pass = $('loginPass').value;
      if (!ident || !pass) return this.authMsg('❌ Vyplň přihlašovací údaje.', 'err');
      const accounts = loadAccounts();
      const email = normEmail(ident), phone = normPhone(ident);
      // účet tvůrce Domixcz se vytvoří při prvním přihlášení
      if (ident.toLowerCase() === CREATOR_ACCOUNT.id && hashPass(pass, CREATOR_ACCOUNT.salt) === CREATOR_ACCOUNT.pass && !accounts[CREATOR_ACCOUNT.id]) {
        accounts[CREATOR_ACCOUNT.id] = { name: CREATOR_NAME, contact: 'creator', type: 'creator', creator: true, salt: CREATOR_ACCOUNT.salt, pass: CREATOR_ACCOUNT.pass, created: Date.now() };
        rawSet('pigeon_accounts', JSON.stringify(accounts));
      }
      const id = Object.keys(accounts).find(k => k === ident.toLowerCase() || (email && accounts[k].contact === email) || (phone && accounts[k].contact === phone));
      const acc = id && accounts[id];
      if (!acc || acc.pass !== hashPass(pass, acc.salt)) return this.authMsg('❌ Špatné jméno / e-mail / telefon nebo heslo.', 'err');
      setSession(id, $('loginRemember').checked);
      this.authMsg(`✅ Vítej zpět, ${acc.name}! Tvoje věci jsou tam, kde jsi je nechal.`, 'ok');
      setTimeout(() => location.reload(), 500);
    }

    logout() {
      try { localStorage.removeItem('pigeon_session'); sessionStorage.removeItem('pigeon_session'); sessionStorage.removeItem('pigeon_guest'); } catch (e) {}
      location.reload();
    }

    // ======================================================================
    // ŽEBŘÍČEK (se statistikami hráčů)
    // ======================================================================
    // moje statistiky, které se zobrazují v žebříčku (a posílají do online žebříčku)
    localStats() {
      let stars = 0;
      Object.values(storage.getLevelStars()).forEach(s => stars += s);
      const claimed = storage.getClaimed().length;
      const pass = storage.getPass();
      return {
        name: this.accountName,
        level: 1 + Math.floor(storage.getXP() / 1000),
        xp: storage.getXP(),
        coins: storage.isInfinite() ? -1 : storage.getCoins(),
        tokens: storage.isInfiniteTokens() ? -1 : storage.getTokens(),
        stars,
        levelsDone: Object.keys(storage.getLevelStars()).length,
        quests: claimed,
        questsTotal: CHALLENGES.length,
        passTier: this.passState().tier,
        premium: !!pass.premium,
        pigeons: storage.getUnlockedSkins().length,
        edits: Object.keys(storage.getEdits()).length,
        games: storage.getStats().games || 0,
        headshots: storage.getStats().headshots || 0
      };
    }

    recordScore() {
      if (!SESSION_USER || this._scoreRecorded || !this.players.length) return;
      const me = this.localPl;
      if (!me || me.score <= 0) return;
      this._scoreRecorded = true;
      this.saveLocalRow(me.score);
      this.syncCloudProfile();
    }

    saveLocalRow(score) {
      let lb = {};
      try { lb = JSON.parse(rawGet('pigeon_leaderboard')) || {}; } catch (e) {}
      const old = lb[SESSION_USER] || { best: 0 };
      lb[SESSION_USER] = Object.assign({}, old, this.localStats(), {
        best: Math.max(old.best || 0, score || 0),
        updated: Date.now()
      });
      rawSet('pigeon_leaderboard', JSON.stringify(lb));
      return lb[SESSION_USER];
    }

    // pošle můj řádek do online žebříčku (jméno, skóre a statistiky – nikdy e-mail, telefon ani heslo)
    async syncCloudProfile() {
      if (!cloud.enabled || !SESSION_USER) return;
      const local = this.saveLocalRow(0);
      try {
        const remote = (await cloud.get(`players/${SESSION_USER}`)) || {};
        await cloud.put(`players/${SESSION_USER}`, Object.assign({}, local, {
          best: Math.max(+remote.best || 0, +local.best || 0),
          creator: SESSION_USER === CREATOR_ACCOUNT.id,
          updated: Date.now()
        }));
      } catch (e) {}
    }

    openLeaderboard() {
      this.setActiveTab('tabLeader');
      if (SESSION_USER) this.saveLocalRow(0);
      this.renderLeaderboard();
      this.$('leaderModal').classList.remove('hidden');
      if (SESSION_USER) this.syncCloudProfile();
    }

    closeLeaderboard() {
      this.$('leaderModal').classList.add('hidden');
      this.setActiveTab('tabLobby');
    }

    get leaderVisible() {
      const m = this.$('leaderModal');
      return m && !m.classList.contains('hidden');
    }

    // automatické odesílání mých statistik, když něco získám nebo dostanu
    setupAutoSync() {
      onProgressChange = () => this.scheduleCloudSync();
      // když se vrátím k oknu, ať je žebříček aktuální
      window.addEventListener('focus', () => { if (this.leaderVisible) this.renderLeaderboard(); });
    }

    scheduleCloudSync() {
      if (this._syncTimer) return;
      // nejvýš jednou za 3 s, aby se při hraní neposílalo pořád
      const wait = Math.max(600, 3000 - (Date.now() - (this._lastSync || 0)));
      this._syncTimer = setTimeout(() => {
        this._syncTimer = null;
        this._lastSync = Date.now();
        if (SESSION_USER) this.saveLocalRow(0);
        this.syncCloudProfile();
        if (this.leaderVisible && !cloud.enabled) this.renderLeaderboard();
      }, wait);
    }


    cleanRow(id, r, fallbackName) {
      const n = (v, max = 1e13) => {
        const x = Math.round(+v);
        return isFinite(x) ? Math.max(-1, Math.min(max, x)) : 0;
      };
      r = r || {};
      return {
        id,
        name: safeName(r.name) || fallbackName || id,
        best: Math.max(0, n(r.best)),
        level: Math.max(1, n(r.level, 99999) || 1),
        coins: n(r.coins),
        tokens: n(r.tokens, 1e9),
        stars: Math.max(0, n(r.stars, 300)),
        levelsDone: Math.max(0, n(r.levelsDone, 100)),
        quests: Math.max(0, n(r.quests, 99)),
        questsTotal: Math.max(1, n(r.questsTotal, 99) || CHALLENGES.length),
        passTier: Math.max(0, n(r.passTier, PASS_TIERS)),
        premium: !!r.premium,
        pigeons: Math.max(1, n(r.pigeons, 200) || 1),
        edits: Math.max(0, n(r.edits, 200)),
        games: Math.max(0, n(r.games, 1e7)),
        headshots: Math.max(0, n(r.headshots, 1e8)),
        me: id === SESSION_USER
      };
    }

    async renderLeaderboard(liveRemote) {
      let lb = {};
      try { lb = JSON.parse(rawGet('pigeon_leaderboard')) || {}; } catch (e) {}
      const accounts = loadAccounts();
      const byId = {};
      Object.keys(accounts).forEach(id => {
        byId[id] = this.cleanRow(id, lb[id], accounts[id].name);
      });
      if (SESSION_USER) byId[SESSION_USER] = this.cleanRow(SESSION_USER, Object.assign({}, lb[SESSION_USER], this.localStats()));
      const token = (this._lbToken = {});
      if (!liveRemote) this.drawLeaderRows(byId, cloud.enabled ? (this._lbLastState === 'online' ? 'online' : 'loading') : 'local');
      if (!cloud.enabled) return;
      try {
        const remote = liveRemote || (await cloud.get('players')) || {};
        if (token !== this._lbToken) return;
        Object.keys(remote).forEach(rawId => {
          const id = safeName(rawId).toLowerCase();
          if (!id) return;
          if (id === SESSION_USER) {
            byId[id].best = Math.max(byId[id].best, Math.round(+remote[rawId].best || 0));
            return;
          }
          const row = this.cleanRow(id, remote[rawId]);
          if (byId[id]) row.best = Math.max(row.best, byId[id].best);
          byId[id] = row;
        });
        this.drawLeaderRows(byId, 'online');
      } catch (e) {
        if (token === this._lbToken) this.drawLeaderRows(byId, 'error');
      }
    }

    drawLeaderRows(byId, state) {
      const creatorData = byId[CREATOR_ACCOUNT.id];
      const rows = Object.values(byId).filter(r => r.id !== CREATOR_ACCOUNT.id);
      rows.sort((a, b) => b.best - a.best);
      // tvůrce hry je vždy na 1. místě
      const creator = Object.assign(this.cleanRow(CREATOR_ACCOUNT.id, creatorData || { name: CREATOR_NAME, level: 999, pigeons: 200 }), {
        name: CREATOR_NAME,
        creator: true,
        hidden: !creatorData,
        me: SESSION_USER === CREATOR_ACCOUNT.id
      });
      creator.best = Math.max(99999999, (rows[0] ? rows[0].best : 0) + 1);
      rows.unshift(creator);

      const fmt = (v) => v < 0 ? '∞' : v.toLocaleString();
      const medal = (i) => i === 0 ? '👑' : i === 1 ? '🥇' : i === 2 ? '🥈' : i === 3 ? '🥉' : `${i + 1}.`;
      const list = this.$('leaderList');
      list.innerHTML = rows.slice(0, 100).map((r, i) => `
        <div class="leader-item" data-id="${r.id}">
          <div class="leader-row ${r.creator ? 'creator' : ''} ${r.me ? 'me' : ''}">
            <span class="lr-rank">${medal(i)}</span>
            <span class="lr-name">${r.name}${r.creator ? ' <b class="lr-badge creator">CREATOR</b>' : ''}${r.me ? ' <b class="lr-badge me">TY</b>' : ''}</span>
            <span class="lr-level">LVL ${r.creator && r.hidden ? 999 : r.level}</span>
            <span class="lr-pigeons">🕊️ ${r.pigeons}</span>
            <span class="lr-score">${r.best.toLocaleString()}</span>
            ${r.hidden ? '' : `<span class="lr-line">
              <i>🪙 <b>${fmt(r.coins)}</b> mincí</i>
              <i>🎟️ <b>${fmt(r.tokens)}</b> tokenů</i>
              <i>⭐ <b>${r.stars}</b>/300</i>
              <i>🗺️ <b>${r.levelsDone}</b>/100 levelů</i>
              <i>🎯 <b>${r.quests}</b>/${r.questsTotal} výzev</i>
              <i>🎫 pass <b>${r.passTier}</b>${r.premium ? ' 👑' : ''}</i>
              <i>✏️ <b>${r.edits}</b> upravených</i>
            </span>`}
          </div>
        </div>`).join('');
      this._lbLastState = state;


      const meRow = rows.findIndex(r => r.me);
      const others = rows.length - 1;
      const where = SESSION_USER
        ? (meRow >= 0 ? `Tvoje umístění: ${meRow + 1}. místo` : 'Odehraj hru a objev se v žebříčku!')
        : 'Přihlas se, aby ses objevil v žebříčku.';
      const status = {
        loading: '⏳ Načítám online žebříček...',
        online: `🌐 Online žebříček • ${others} ${others === 1 ? 'hráč' : others >= 2 && others <= 4 ? 'hráči' : 'hráčů'}`,
        error: '⚠️ Online žebříček se nepodařilo načíst – zobrazuji jen tento počítač',
        local: '💻 Zatím jen hráči z tohoto počítače'
      }[state] || '';
      this.$('leaderFoot').textContent = `${where} • ${status}`;
      this.$('leaderStatus').className = `leader-status ${state}`;
      this.$('leaderStatus').textContent = state === 'online' ? '🌐 ONLINE' : state === 'loading' ? '⏳' : state === 'error' ? '⚠️ OFFLINE' : '💻 LOKÁLNÍ';
    }

    // ======================================================================
    // POPISKY MĚN (klikni na minci / token / hvězdu v horní liště)
    // ======================================================================
    setupCurrencyTips() {
      const tips = {
        coins: {
          icon: '🪙', title: 'MINCE',
          value: () => storage.isInfinite() ? '∞ (neomezené)' : storage.getCoins().toLocaleString(),
          what: 'Hlavní měna hry. Kupuješ za ni holuby v obchodě, vylepšení (rychlost, přebíjení, bonus mincí), prémiový pass a dnešní nabídku.',
          how: 'Za každý zásah chodce, headshot, K.O. a sundaného cyklistu, za dokončené levely, výzvy a odměny v passu. Kombo a bonus mincí holuba je násobí.'
        },
        tokens: {
          icon: '🎟️', title: 'TOKENY',
          value: () => storage.isInfiniteTokens() ? '∞ (neomezené)' : storage.getTokens().toLocaleString(),
          what: 'Vzácná měna na skiny holubů. Vzácný skin stojí 1, epický 2, mýtický 4, legendární 6 a ultra legendární 10 tokenů.',
          how: () => { const n = 5 - (storage.getLevelWins() % 5); return `1 token za každých 5 dokončených levelů (do dalšího: ${n} ${n === 1 ? 'level' : n <= 4 ? 'levely' : 'levelů'}) a další v Holubím passu.`; }
        },
        stars: {
          icon: '⭐', title: 'HVĚZDY',
          value: () => { let s = 0; Object.values(storage.getLevelStars()).forEach(v => s += v); return `${s} / 300`; },
          what: 'Ukazují, jak dobře jsi prošel kampaň. Každý ze 100 levelů dává až 3 hvězdy.',
          how: '3 ⭐ když level dokončíš s víc než 40 % času, 2 ⭐ s víc než 15 %, jinak 1 ⭐. Level jde kdykoli zopakovat pro lepší hodnocení.'
        }
      };
      const pop = this.$('currencyTip');
      const show = (key, anchor) => {
        if (pop.dataset.key === key && !pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
        const t = tips[key];
        const how = typeof t.how === 'function' ? t.how() : t.how;
        pop.innerHTML = `
          <div class="ct-head"><span class="ct-icon">${t.icon}</span><div><b>${t.title}</b><small>Máš: ${t.value()}</small></div></div>
          <div class="ct-sec"><span>K čemu jsou</span>${t.what}</div>
          <div class="ct-sec"><span>Jak je získat</span>${how}</div>`;
        pop.dataset.key = key;
        pop.classList.remove('hidden');
        const r = anchor.getBoundingClientRect();
        const w = pop.offsetWidth;
        pop.style.left = `${Math.max(8, Math.min(this.width - w - 8, r.left + r.width / 2 - w / 2))}px`;
        pop.style.top = `${r.bottom + 8}px`;
        window.pigeonAudio.playFlap();
      };
      document.querySelectorAll('[data-currency]').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); show(el.dataset.currency, el); });
      });
      document.addEventListener('pointerdown', (e) => {
        if (!pop.contains(e.target) && !e.target.closest('[data-currency]')) pop.classList.add('hidden');
      });
    }

    // ======================================================================
    // FPS A PING
    // ======================================================================
    setupPerf() {
      this.perfEl = this.$('perfStats');
      this.fpsFrames = 0;
      this.fpsLast = performance.now();
      this.fps = 0;
      this.ping = null;
      let hidden = false;
      try { hidden = localStorage.getItem('pigeon_perf') === 'off'; } catch (e) {}
      this.perfEl.classList.toggle('hidden', hidden);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F3') {
          e.preventDefault();
          const off = !this.perfEl.classList.toggle('hidden');
          try { localStorage.setItem('pigeon_perf', off ? 'on' : 'off'); } catch (err) {}
        }
      });
      this.measureNetPing();
      setInterval(() => {
        if (this.netRole && this.conn && this.conn.open) this.netSend({ t: 'ping', ts: performance.now() });
        else this.measureNetPing();
      }, 3000);
    }

    async measureNetPing() {
      if (this._pingBusy) return;
      this._pingBusy = true;
      const t0 = performance.now();
      try {
        await fetch(`https://cdn.jsdelivr.net/npm/peerjs@1.5.4/package.json?t=${Date.now()}`, { mode: 'no-cors', cache: 'no-store' });
        this.ping = Math.round(performance.now() - t0);
        this.pingKind = 'internet';
      } catch (e) {
        this.ping = null;
        this.pingKind = 'offline';
      }
      this._pingBusy = false;
    }

    tickPerf() {
      this.fpsFrames++;
      const now = performance.now();
      if (now - this.fpsLast >= 500) {
        this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLast));
        this.fpsFrames = 0;
        this.fpsLast = now;
        if (this.perfEl && !this.perfEl.classList.contains('hidden')) {
          const p = this.ping;
          const pcls = p === null ? 'bad' : p < 80 ? 'ok' : p < 160 ? 'mid' : 'bad';
          const fcls = this.fps >= 50 ? 'ok' : this.fps >= 30 ? 'mid' : 'bad';
          const label = this.pingKind === 'peer' ? 'PING SOUPEŘ' : 'PING';
          this.perfEl.innerHTML = `<span class="${fcls}">FPS ${this.fps}</span><span class="${pcls}">${label} ${p === null ? 'offline' : p + ' ms'}</span>`;
        }
      }
    }

    // ======================================================================
    // ADMIN KONZOLE – nic nenapovídá, panel se ukáže jen po správném příkazu
    // ======================================================================
    setupAdmin() {
      const input = this.$('adminInput');
      const panel = this.$('adminPanel');
      const consoleEl = this.$('adminConsole');
      this.$('adminToggleBtn').addEventListener('click', () => {
        if (consoleEl.classList.contains('open')) this.closeAdminConsole();
        else this.openAdminConsole('');
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); this.closeAdminConsole(); }
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = input.value;
          input.value = '';
          this.runAdminCommand(v);
        }
      });
      panel.addEventListener('input', (e) => {
        if (e.target.id === 'adminSearch') this.renderAdminSearch(e.target.value);
      });
      panel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-give]');
        if (btn) {
          const [kind, arg] = btn.dataset.give.split(':');
          this.adminGive(kind, arg);
        }
        if (e.target.closest('[data-close]')) this.closeAdminConsole();
      });
      document.addEventListener('pointerdown', (e) => {
        if (consoleEl.classList.contains('open') && !consoleEl.contains(e.target)) this.closeAdminConsole();
      });
    }

    openAdminConsole(text) {
      const input = this.$('adminInput');
      this.$('adminConsole').classList.add('open');
      input.value = text || '';
      input.focus();
    }

    closeAdminConsole() {
      this.$('adminConsole').classList.remove('open');
      this.$('adminPanel').classList.add('hidden');
      this.adminPanelOpen = false;
      this.$('adminInput').blur();
    }

    runAdminCommand(raw) {
      const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!text) return;
      const fail = () => { window.pigeonAudio.playPanic(); this.showToast('❌ Neznámý příkaz'); };
      if (text === '/admin give secret1.0') {
        storage.setInfinite();
        this.coins = storage.getCoins();
        window.pigeonAudio.playUpgrade();
        this.showToast('♾️ Neomezené mince aktivovány!');
        this.updateLobbyHero();
        if (this.adminPanelOpen) this.renderAdminPanel();
        return;
      }
      if (text === '/admin give secret #all') {
        // nekonečno úplně všeho
        storage.setInfinite();
        lsSet('pigeon_infinite_tokens', '1');
        ['pigeons:all', 'upgrades:all', 'pass:premium', 'pass:max', 'levels:stars', 'challenges:all', 'xp:100000']
          .forEach(g => { const [k, a] = g.split(':'); this.adminGive(k, a, true); });
        this.claimAllPass(true);
        window.pigeonAudio.playLevelWin();
        this.showToast('♾️ NEKONEČNO ÚPLNĚ VŠEHO aktivováno!');
        this.refreshAfterReward();
        if (this.adminPanelOpen) this.renderAdminPanel();
        return;
      }
      if (text === '/admin give') { this.renderAdminPanel(); return; }
      const m = text.match(/^\/admin give (.+)$/);
      if (!m) return fail();
      const rest = m[1];
      let mm;
      if ((mm = rest.match(/^(coins|mince)\s+(\d+)$/))) return this.adminGive('coins', mm[2]);
      if ((mm = rest.match(/^(tokens|tokeny)\s+(\d+)$/))) return this.adminGive('tokens', mm[2]);
      if ((mm = rest.match(/^xp\s+(\d+)$/))) return this.adminGive('xp', mm[1]);
      if (rest === 'all') return this.adminGive('all', 'all');
      fail();
    }

    renderAdminPanel() {
      this.adminPanelOpen = true;
      const panel = this.$('adminPanel');
      const unlocked = storage.getUnlockedSkins();
      const btn = (give, label, cls = '') => `<button class="adm-btn ${cls}" data-give="${give}">${label}</button>`;
      const tiers = ['common', 'rare', 'epic', 'legendary', 'mythic', 'cosmic'];
      const inf = storage.isInfinite();
      panel.innerHTML = `
        <div class="adm-head"><span>🛠️ ADMIN PANEL</span><button class="adm-x" data-close>✖</button></div>
        <div class="adm-sec">
          <div class="adm-title">🪙 MINCE ${inf ? '<small>♾️ neomezené</small>' : ''}</div>
          <div class="adm-btns">
            ${btn('coins:1000', '+1 000')}${btn('coins:10000', '+10 000')}${btn('coins:100000', '+100 000')}${btn('coins:1000000', '+1 000 000')}
          </div>
        </div>
        <div class="adm-sec">
          <div class="adm-title">🎟️ TOKENY <small>${storage.isInfiniteTokens() ? '♾️ neomezené' : storage.getTokens() + ' ks'}</small></div>
          <div class="adm-btns">${btn('tokens:5', '+5')}${btn('tokens:25', '+25')}${btn('tokens:100', '+100')}${btn('tokens:1000', '+1 000')}</div>
        </div>
        <div class="adm-sec">
          <div class="adm-title">🕊️ HOLUBI <small>${unlocked.length} / 200</small></div>
          <div class="adm-btns">
            ${btn('pigeons:all', 'VŠECH 200', 'hot')}
            ${tiers.map(t => btn(`pigeons:${t}`, TIER_LABELS[t])).join('')}
          </div>
          <input id="adminSearch" class="adm-search" placeholder="🔍 Najít holuba…" autocomplete="off" spellcheck="false">
          <div id="adminSearchResults" class="adm-list"></div>
        </div>
        <div class="adm-sec">
          <div class="adm-title">⬆️ VYLEPŠENÍ</div>
          <div class="adm-btns">${btn('upgrades:current', 'MAX – TENTO HOLUB')}${btn('upgrades:all', 'MAX – VŠICHNI')}</div>
        </div>
        <div class="adm-sec">
          <div class="adm-title">🎫 PASS A KAMPAŇ</div>
          <div class="adm-btns">${btn('pass:premium', 'PRÉMIOVÝ PASS')}${btn('pass:max', 'PASS NA MAX')}${btn('levels:unlock', '100 LEVELŮ')}${btn('levels:stars', 'VŠUDE 3 ⭐')}</div>
        </div>
        <div class="adm-sec">
          <div class="adm-title">✨ XP A VÝZVY</div>
          <div class="adm-btns">${btn('xp:1000', '+1 LEVEL')}${btn('xp:10000', '+10 LEVELŮ')}${btn('challenges:all', 'SPLNIT VÝZVY')}</div>
        </div>
        <div class="adm-sec">${btn('all:all', '🎁 DÁT ÚPLNĚ VŠECHNO', 'mega')}</div>
      `;
      panel.classList.remove('hidden');
    }

    renderAdminSearch(q) {
      const out = this.$('adminSearchResults');
      if (!out) return;
      const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const query = norm(q.trim());
      if (!query) { out.innerHTML = ''; return; }
      const unlocked = storage.getUnlockedSkins();
      const found = Object.values(SKINS).filter(s => norm(s.name).includes(query)).slice(0, 8);
      out.innerHTML = found.length ? found.map(s => `
        <div class="adm-row">
          <span class="adm-dot" style="background:${TIER_COLORS[s.tier]}"></span>
          <span class="adm-name">${s.name}<small>${TIER_LABELS[s.tier]}</small></span>
          <button class="adm-btn ${unlocked.includes(s.id) ? 'ghost' : ''}" data-give="pigeon:${s.id}">${unlocked.includes(s.id) ? 'NASADIT' : 'DÁT'}</button>
        </div>`).join('') : '<div class="adm-hint">Nic nenalezeno.</div>';
    }

    adminGive(kind, arg, silent) {
      let msg = '';
      switch (kind) {
        case 'coins': {
          const n = Math.max(0, Math.min(1e9, Math.round(+arg || 0)));
          this.coins = storage.getCoins() + n;
          storage.setCoins(this.coins);
          msg = `🪙 +${n.toLocaleString()} mincí`;
          break;
        }
        case 'tokens': {
          const n = Math.max(0, Math.min(1e6, Math.round(+arg || 0)));
          storage.addTokens(n);
          msg = `🎟️ +${n.toLocaleString()} tokenů`;
          break;
        }
        case 'pigeons': {
          const unlocked = new Set(storage.getUnlockedSkins());
          const before = unlocked.size;
          Object.values(SKINS).forEach(s => { if (arg === 'all' || s.tier === arg) unlocked.add(s.id); });
          storage.setUnlockedSkins([...unlocked]);
          msg = `🕊️ +${unlocked.size - before} holubů`;
          break;
        }
        case 'pigeon': {
          const skin = SKINS[arg];
          if (!skin) return;
          const unlocked = storage.getUnlockedSkins();
          if (!unlocked.includes(skin.id)) { unlocked.push(skin.id); storage.setUnlockedSkins(unlocked); }
          this.equippedSkinId = skin.id;
          storage.setEquippedSkin(skin.id);
          this.lobbySwap = 1;
          msg = `🕊️ ${skin.name} – nasazen`;
          break;
        }
        case 'upgrades': {
          const max = { speed: 5, reload: 5, coins: 5 };
          const ids = arg === 'all' ? Object.keys(SKINS) : [this.equippedSkinId];
          ids.forEach(id => storage.setPigeonUpgrades(id, max));
          msg = '⬆️ Max vylepšení';
          break;
        }
        case 'pass': {
          if (arg === 'premium') {
            const p = storage.getPass(); p.premium = true; storage.setPass(p);
            msg = '👑 Prémiový pass aktivován';
          } else {
            const need = passXpForTier(PASS_TIERS) - storage.getXP();
            if (need > 0) storage.addXP(need);
            msg = '🎫 Pass na maximální úrovni – vyzvedni odměny';
          }
          break;
        }
        case 'levels': {
          storage.setUnlockedLevel(100);
          if (arg === 'stars') {
            const data = storage.getLevelStars();
            LEVELS.forEach(l => { data[l.id] = 3; });
            lsSet('pigeon_level_stars', JSON.stringify(data));
            msg = '⭐ Všude 3 hvězdy';
          } else {
            msg = '🗺️ Odemčeno 100 levelů';
          }
          break;
        }
        case 'xp': {
          const n = Math.max(0, Math.min(1e8, Math.round(+arg || 0)));
          storage.addXP(n);
          msg = `✨ +${n.toLocaleString()} XP`;
          break;
        }
        case 'challenges': {
          const stats = storage.getStats();
          CHALLENGES.forEach(ch => { stats[ch.stat] = Math.max(stats[ch.stat] || 0, ch.target); });
          lsSet('pigeon_stats', JSON.stringify(stats));
          msg = '🎯 Výzvy splněné';
          break;
        }
        case 'all':
          ['coins:1000000', 'tokens:500', 'pigeons:all', 'upgrades:all', 'pass:premium', 'pass:max', 'levels:stars', 'challenges:all']
            .forEach(g => { const [k, a] = g.split(':'); this.adminGive(k, a, true); });
          msg = '🎁 Dáno úplně všechno!';
          break;
      }
      if (silent) return;
      window.pigeonAudio.playPurchase();
      this.showToast(msg);
      this.refreshAfterReward();
      if (this.adminPanelOpen) {
        const q = this.$('adminSearch') ? this.$('adminSearch').value : '';
        this.renderAdminPanel();
        if (q) { this.$('adminSearch').value = q; this.renderAdminSearch(q); }
      }
    }

    refreshAfterReward() {
      this.coins = storage.getCoins();
      this.renderFeatured();
      this.updateLobbyHero();
      this.updateLobbyMode();
      this.renderChallenges();
      if (!this.shopModal.classList.contains('hidden')) this.renderShopGrid();
      if (!this.$('editModal').classList.contains('hidden')) this.renderEditor();
      if (!this.$('passModal').classList.contains('hidden')) this.renderPass();
    }

    // ======================================================================
    // EDIT HOLUBA (úpravy vzhledu za tokeny)
    // ======================================================================
    openEditor(pigeonId) {
      const pigeon = SKINS[pigeonId] || this.equippedSkin;
      if (!storage.getUnlockedSkins().includes(pigeon.id)) {
        window.pigeonAudio.playPanic();
        this.showToast('🔒 Upravit můžeš jen holuba, kterého vlastníš');
        return;
      }
      this.editId = pigeon.id;
      this.editDraft = sanitizeEdit(storage.getEdit(pigeon.id));
      this.$('editModal').classList.remove('hidden');
      this.renderEditor();
      clearInterval(this._editAnim);
      let wing = 0;
      this._editAnim = setInterval(() => {
        if (this.$('editModal').classList.contains('hidden')) { clearInterval(this._editAnim); return; }
        wing += 0.35;
        this.drawEditPreview(wing);
      }, 40);
    }

    closeEditor() {
      this.$('editModal').classList.add('hidden');
      clearInterval(this._editAnim);
      this.updateLobbyHero();
      if (!this.shopModal.classList.contains('hidden')) this.renderShopGrid();
    }

    editCost() {
      const saved = sanitizeEdit(storage.getEdit(this.editId));
      const d = this.editDraft;
      let cost = 0;
      EDIT_COLOR_PARTS.forEach(p => { if (d[p.key] && d[p.key] !== saved[p.key]) cost += p.cost; });
      Object.keys(EDIT_COSTS).forEach(k => { if (d[k] && d[k] !== saved[k]) cost += EDIT_COSTS[k]; });
      return cost;
    }

    drawEditPreview(wing) {
      const c = this.$('editCanvas');
      if (!c) return;
      const look = getAppearance(SKINS[this.editId], this.editDraft);
      const ctx = c.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(c.width / 2, c.height / 2 + 72, 70, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(c.width / 2, c.height / 2 + 4 + Math.sin(wing * 0.4) * 4);
      ctx.scale(3.1, 3.1);
      drawDetailedPigeon(ctx, look, wing || 0.4);
    }

    renderEditor() {
      const pigeon = SKINS[this.editId];
      const d = this.editDraft;
      const $ = this.$;
      $('editForName').textContent = pigeon.name;
      const inf = storage.isInfiniteTokens();
      $('editTokensVal').textContent = inf ? '∞' : storage.getTokens().toLocaleString();

      const swatches = (key, colors, original) => `
        <button class="ed-sw orig ${!d[key] ? 'sel' : ''}" data-k="${key}" data-v="" title="Původní" style="--c:${original}"><span>↺</span></button>
        ${colors.map(col => `<button class="ed-sw ${d[key] === col ? 'sel' : ''}" data-k="${key}" data-v="${col}" style="--c:${col}"></button>`).join('')}`;

      $('editParts').innerHTML = `
        ${EDIT_COLOR_PARTS.map(p => `
          <div class="ed-sec">
            <div class="ed-title">${p.icon} ${p.label} <small>${p.cost} 🎟️</small></div>
            <div class="ed-swatches">${swatches(p.key, EDIT_PALETTE[p.key], p.key === 'eye' ? getPigeonPalette(pigeon).eye : pigeon[p.prop])}</div>
          </div>`).join('')}
        <div class="ed-sec">
          <div class="ed-title">🎨 Vzor peří <small>${EDIT_COSTS.pattern} 🎟️</small></div>
          <div class="ed-chips">
            <button class="ed-chip ${!d.pattern ? 'sel' : ''}" data-k="pattern" data-v="">↺ Původní</button>
            ${EDIT_PATTERNS.map(it => `<button class="ed-chip ${d.pattern === it.id ? 'sel' : ''}" data-k="pattern" data-v="${it.id}">${it.label}</button>`).join('')}
          </div>
        </div>
        <div class="ed-sec">
          <div class="ed-title">✨ Znaky <small>${EDIT_COSTS.mark} 🎟️</small></div>
          <div class="ed-chips">
            <button class="ed-chip ${!d.mark ? 'sel' : ''}" data-k="mark" data-v="">↺ Původní</button>
            ${EDIT_MARKS.map(it => `<button class="ed-chip ${d.mark === it.id ? 'sel' : ''}" data-k="mark" data-v="${it.id}">${it.label}</button>`).join('')}
          </div>
        </div>
        <div class="ed-sec">
          <div class="ed-title">🌟 Záře <small>${EDIT_COSTS.aura} 🎟️</small></div>
          <div class="ed-swatches">
            <button class="ed-sw orig ${!d.aura ? 'sel' : ''}" data-k="aura" data-v="" title="Bez záře" style="--c:#1a2040"><span>✕</span></button>
            ${EDIT_AURAS.map(col => `<button class="ed-sw glow ${d.aura === col ? 'sel' : ''}" data-k="aura" data-v="${col}" style="--c:${col}"></button>`).join('')}
          </div>
        </div>`;

      const cost = this.editCost();
      const tokens = storage.getTokens();
      const save = $('editSaveBtn');
      save.textContent = cost ? `💾 ULOŽIT ZA ${cost} 🎟️` : '💾 ULOŽIT';
      save.classList.toggle('poor', !inf && cost > tokens);
      $('editCostInfo').textContent = cost ? `Změny stojí ${cost} 🎟️ • máš ${inf ? '∞' : tokens}` : 'Vyber barvy a vzory. Vrácení na původní je zdarma.';
      this.drawEditPreview(0.4);
    }

    onEditPick(key, value) {
      if (value) this.editDraft[key] = value;
      else delete this.editDraft[key];
      window.pigeonAudio.playFlap();
      this.renderEditor();
    }

    saveEdit() {
      const cost = this.editCost();
      const inf = storage.isInfiniteTokens();
      const tokens = storage.getTokens();
      if (!inf && cost > tokens) {
        window.pigeonAudio.playPanic();
        this.showToast(`❌ Chybí ti ${cost - tokens} 🎟️ (1 token za každých 5 levelů)`);
        return;
      }
      if (cost) storage.setTokens(tokens - cost);
      storage.setEdit(this.editId, sanitizeEdit(this.editDraft));
      if (this.editId === this.equippedSkinId) this.lobbySwap = 1;
      window.pigeonAudio.playPurchase();
      this.showToast(cost ? `✏️ Holub upraven za ${cost} 🎟️!` : '✏️ Vzhled uložen');
      this.renderEditor();
      this.updateLobbyHero();
    }

    setupEditor() {
      const $ = this.$;
      $('editParts').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (b) this.onEditPick(b.dataset.k, b.dataset.v);
      });
      $('editSaveBtn').addEventListener('click', () => this.saveEdit());
      $('editResetBtn').addEventListener('click', () => { this.editDraft = {}; this.renderEditor(); });
      $('closeEditBtn').addEventListener('click', () => this.closeEditor());
      $('closeEditTopBtn').addEventListener('click', () => this.closeEditor());
      $('heroEditBtn').addEventListener('click', () => this.openEditor(this.equippedSkinId));
    }

    // ======================================================================
    // VÝBĚR MÓDU – sjeď v lobby dolů (jako Discover ve Fortnite)
    // ======================================================================
    setupDiscover() {
      const $ = this.$;
      const disc = $('discoverScreen');
      const byMode = {};
      DISCOVER_MODES.forEach(m => { byMode[m.mode] = m; });
      $('discoverRows').innerHTML = DISCOVER_ROWS.map(row => `
        <section class="disc-section">
          <h3>${row.title}</h3>
          <div class="disc-row ${row.big ? 'big' : ''}">
            ${row.modes.map(id => {
              const m = byMode[id];
              return `<button class="disc-card" data-mode="${m.mode}">
                <canvas width="${row.big ? 560 : 360}" height="${row.big ? 260 : 190}"></canvas>
                <span class="disc-tag">${m.tag}</span>
                <span class="disc-sel">✔ VYBRÁNO</span>
                <span class="disc-info"><b>${m.icon} ${m.title}</b><small>${m.desc}</small></span>
              </button>`;
            }).join('')}
          </div>
        </section>`).join('');
      disc.querySelectorAll('.disc-card').forEach(card => {
        this.drawDiscoverArt(card.querySelector('canvas'), byMode[card.dataset.mode]);
        card.addEventListener('click', () => {
          this.setLobbyMode(card.dataset.mode);
          this.closeDiscover();
        });
      });
      $('currentModeBtn').addEventListener('click', () => this.openDiscover());
      $('discoverHint').addEventListener('click', () => this.openDiscover());
      $('discoverBack').addEventListener('click', () => this.closeDiscover());
      window.addEventListener('wheel', (e) => {
        if (!this.inLobby || this.isRunning) return;
        const open = !disc.classList.contains('hidden');
        if (!open) {
          if (e.deltaY > 25 && !this.anyModalOpen() && !e.target.closest('.fn-left, .fn-console, .fn-featured')) this.openDiscover();
        } else if (e.deltaY < -25 && disc.scrollTop <= 0) {
          this.closeDiscover();
        }
      }, { passive: true });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !disc.classList.contains('hidden')) this.closeDiscover();
      });
    }

    drawDiscoverArt(canvas, m) {
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const th = THEMES[m.theme] || THEMES.day;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      th.sky.forEach(([o, col]) => g.addColorStop(o, col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const rng = mulberry32(m.title.length * 977);
      if (th.stars) for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.6})`; ctx.fillRect(rng() * W, rng() * H * 0.5, 1.5, 1.5); }
      if (th.sun) { ctx.fillStyle = th.sun.core; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.24, H * 0.1, 0, Math.PI * 2); ctx.fill(); }
      if (th.moon) { ctx.fillStyle = '#f4f1e1'; ctx.beginPath(); ctx.arc(W * 0.18, H * 0.22, H * 0.07, 0, Math.PI * 2); ctx.fill(); }
      let x = -10;
      while (x < W) {
        const bw = 26 + rng() * 40, bh = H * (0.25 + rng() * 0.35);
        const col = th.buildings[Math.floor(rng() * th.buildings.length)];
        ctx.fillStyle = shade(col, -0.2);
        ctx.fillRect(x, H * 0.82 - bh, bw, bh);
        ctx.fillStyle = rgba(th.winLitColor, 0.75);
        for (let wy = H * 0.82 - bh + 8; wy < H * 0.78; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (rng() < 0.35) ctx.fillRect(wx, wy, 4, 6);
        x += bw + 2;
      }
      ctx.fillStyle = th.sidewalk; ctx.fillRect(0, H * 0.82, W, H * 0.06);
      ctx.fillStyle = th.asphalt; ctx.fillRect(0, H * 0.88, W, H * 0.12);
      const shade2 = ctx.createLinearGradient(0, H * 0.45, 0, H);
      shade2.addColorStop(0, 'rgba(0,0,0,0)');
      shade2.addColorStop(1, 'rgba(0,0,10,0.75)');
      ctx.fillStyle = shade2; ctx.fillRect(0, 0, W, H);
      // holub(i) v obrázku
      const pigs = { campaign: ['classic'], online: ['cyber', 'ninja'], free: ['king'], coop: ['classic', 'agent'], versus: ['viking', 'pirate'] }[m.mode] || ['classic'];
      pigs.forEach((id, i) => {
        ctx.save();
        const px = pigs.length > 1 ? W * (0.36 + i * 0.3) : W * 0.55;
        ctx.translate(px, H * 0.34);
        const sc = H / 75;
        ctx.scale(i === 1 ? -sc : sc, sc);
        drawDetailedPigeon(ctx, SKINS[id] || SKINS.classic, 0.6 + i);
        ctx.restore();
      });
    }

    openDiscover() {
      const disc = this.$('discoverScreen');
      disc.querySelectorAll('.disc-card').forEach(c => c.classList.toggle('selected', c.dataset.mode === this.lobbyMode));
      disc.scrollTop = 0;
      disc.classList.remove('hidden');
    }

    closeDiscover() {
      this.$('discoverScreen').classList.add('hidden');
    }

    // ======================================================================
    // HOLUBÍ PASS
    // ======================================================================
    passState() {
      const xp = storage.getXP();
      let tier = 0;
      while (tier < PASS_TIERS && xp >= passXpForTier(tier + 1)) tier++;
      const cur = passXpForTier(tier), next = passXpForTier(Math.min(PASS_TIERS, tier + 1));
      return { xp, tier, into: xp - cur, need: next - cur, maxed: tier >= PASS_TIERS };
    }

    rewardLabel(r) {
      if (r.type === 'coins') return { icon: '🪙', text: `${r.n.toLocaleString()}` };
      if (r.type === 'tokens') return { icon: '🎟️', text: `${r.n} ${r.n === 1 ? 'token' : r.n < 5 ? 'tokeny' : 'tokenů'}` };
      if (r.type === 'pigeon') return { icon: '🕊️', text: SKINS[r.id] ? SKINS[r.id].name.replace(/\s*\(.*\)$/, '') : 'Holub' };
      return { icon: '🎁', text: '' };
    }

    giveReward(r) {
      if (r.type === 'coins') { this.coins = storage.getCoins() + r.n; storage.setCoins(this.coins); }
      else if (r.type === 'tokens') storage.addTokens(r.n);
      else if (r.type === 'pigeon') {
        const u = storage.getUnlockedSkins();
        if (!u.includes(r.id)) { u.push(r.id); storage.setUnlockedSkins(u); }
        else { this.coins = storage.getCoins() + Math.round(SKINS[r.id].price / 2); storage.setCoins(this.coins); }
      }
    }

    openPass() {
      this.setActiveTab('tabPass');
      this.$('passModal').classList.remove('hidden');
      this.renderPass(true);
    }

    closePass() {
      this.$('passModal').classList.add('hidden');
      this.setActiveTab('tabLobby');
      this.updateLobbyHero();
    }

    renderPass(scrollToCurrent) {
      const st = this.passState();
      const pass = storage.getPass();
      this.$('passTierNum').textContent = st.tier;
      this.$('passFill').style.width = st.maxed ? '100%' : `${(st.into / st.need) * 100}%`;
      this.$('passText').textContent = st.maxed ? 'MAXIMÁLNÍ ÚROVEŇ!' : `${st.into.toLocaleString()} / ${st.need.toLocaleString()} XP do úrovně ${st.tier + 1}`;
      this.$('passCoinsVal').textContent = storage.isInfinite() ? '∞' : storage.getCoins().toLocaleString();
      const pb = this.$('passPremiumBtn');
      pb.textContent = pass.premium ? '👑 PRÉMIUM AKTIVNÍ' : `👑 PRÉMIUM – ${PASS_PREMIUM_PRICE.toLocaleString()} 🪙`;
      pb.disabled = pass.premium;

      const track = this.$('passTrack');
      track.innerHTML = '';
      PASS_REWARDS.forEach(row => {
        const col = document.createElement('div');
        const reached = row.tier <= st.tier;
        col.className = `pass-col ${reached ? 'reached' : ''} ${row.tier === st.tier + 1 ? 'next' : ''}`;
        const cell = (track, r) => {
          const claimed = (track === 'f' ? pass.free : pass.prem).includes(row.tier);
          const locked = !reached || (track === 'p' && !pass.premium);
          const lab = this.rewardLabel(r);
          const state = claimed ? 'claimed' : locked ? 'locked' : 'ready';
          return `<button class="pass-cell ${track === 'p' ? 'prem' : ''} ${state} rt-${r.type}" data-tier="${row.tier}" data-track="${track}" ${state === 'ready' ? '' : 'disabled'}>
            <span class="pc-icon">${lab.icon}</span>
            <span class="pc-text">${lab.text}</span>
            <span class="pc-state">${claimed ? '✓' : locked ? '🔒' : 'VYZVEDNOUT'}</span>
          </button>`;
        };
        col.innerHTML = `${cell('f', row.free)}<div class="pass-num">${row.tier}</div>${cell('p', row.premium)}`;
        track.appendChild(col);
      });
      if (scrollToCurrent) {
        const target = track.children[Math.max(0, st.tier - 2)];
        if (target) track.scrollLeft = target.offsetLeft - track.offsetLeft;
      }
    }

    claimPass(tier, trackId) {
      const st = this.passState();
      const pass = storage.getPass();
      const list = trackId === 'f' ? pass.free : pass.prem;
      if (tier > st.tier || list.includes(tier)) return false;
      if (trackId === 'p' && !pass.premium) return false;
      const row = PASS_REWARDS[tier - 1];
      this.giveReward(trackId === 'f' ? row.free : row.premium);
      list.push(tier);
      storage.setPass(pass);
      return true;
    }

    claimAllPass(silent) {
      let n = 0;
      for (let t = 1; t <= PASS_TIERS; t++) {
        if (this.claimPass(t, 'f')) n++;
        if (this.claimPass(t, 'p')) n++;
      }
      if (silent) return;
      if (n) { window.pigeonAudio.playPurchase(); this.showToast(`🎁 Vyzvednuto ${n} odměn!`); }
      else this.showToast('Zatím nemáš nic k vyzvednutí');
      this.renderPass();
      this.refreshAfterReward();
    }

    buyPremiumPass() {
      const pass = storage.getPass();
      if (pass.premium) return;
      if (this.coins < PASS_PREMIUM_PRICE) {
        window.pigeonAudio.playPanic();
        this.showToast(`❌ Chybí ti ${(PASS_PREMIUM_PRICE - this.coins).toLocaleString()} 🪙`);
        return;
      }
      this.coins -= PASS_PREMIUM_PRICE;
      storage.setCoins(this.coins);
      pass.premium = true;
      storage.setPass(pass);
      window.pigeonAudio.playLevelWin();
      this.showToast('👑 Prémiový pass odemčen!');
      this.renderPass();
      this.updateLobbyStats();
    }

    setupPassAndSkins() {
      const $ = this.$;
      $('tabPass').addEventListener('click', () => { this.closeAllLobbyModals(); this.openPass(); });
      $('passMiniBtn').addEventListener('click', () => { this.closeAllLobbyModals(); this.openPass(); });
      $('closePassBtn').addEventListener('click', () => this.closePass());
      $('closePassTopBtn').addEventListener('click', () => this.closePass());
      $('passClaimAllBtn').addEventListener('click', () => this.claimAllPass());
      $('passPremiumBtn').addEventListener('click', () => this.buyPremiumPass());
      $('passTrack').addEventListener('click', (e) => {
        const c = e.target.closest('.pass-cell.ready');
        if (!c) return;
        if (this.claimPass(+c.dataset.tier, c.dataset.track)) {
          window.pigeonAudio.playPurchase();
          const row = PASS_REWARDS[+c.dataset.tier - 1];
          const lab = this.rewardLabel(c.dataset.track === 'f' ? row.free : row.premium);
          this.showToast(`🎁 ${lab.icon} ${lab.text}`);
          this.renderPass();
          this.refreshAfterReward();
        }
      });
    }

    updateLobbyHero() {
      const skin = this.equippedSkin;
      const up = this.currentUpgrades;

      this.$('lobbyPigeonName').textContent = skin.name;
      const rar = this.$('lobbyPigeonRarity');
      rar.textContent = TIER_LABELS[skin.tier] || 'BĚŽNÝ';
      rar.className = `hero-rarity-badge ${skin.tier || 'common'}`;
      this.$('lobbyAbilityDesc').innerHTML = `${skin.abilityIcon || '⚡'} <strong>[E] ${skin.abilityName}:</strong> ${skin.abilityDesc}`;

      const canvas = this.$('lobbyPigeonCanvas');
      if (canvas) renderPigeonPreview(canvas, this.equippedLook, 2.2);
      this.$('upgradesForName').textContent = `Trvalé bonusy pro: ${skin.name}`;

      const costs = upgradeCosts(skin.tier);
      const rows = [
        ['speed', 'speed', 10, 'btnUpgradeSpeed', 'speedCostText'],
        ['reload', 'reload', 12, 'btnUpgradeReload', 'reloadCostText'],
        ['coins', 'coin', 15, 'btnUpgradeCoins', 'coinCostText']
      ];
      rows.forEach(([stat, pre, per, btnId, costId]) => {
        const lv = up[stat];
        this.$(`${pre}LvlText`).textContent = `Lvl ${lv}/5 (+${(lv - 1) * per}%)`;
        this.$(`${pre}MeterFill`).style.width = `${(lv / 5) * 100}%`;
        const btn = this.$(btnId);
        if (lv >= 5) {
          btn.classList.add('maxed');
          this.$(costId).textContent = 'MAX';
        } else {
          btn.classList.remove('maxed');
          this.$(costId).textContent = `${costs[lv - 1]} 🪙`;
        }
      });

      this.updateLobbyStats();
    }

    upgradeStat(statType) {
      const up = this.currentUpgrades;
      const currentLevel = up[statType] || 1;
      if (currentLevel >= 5) return;
      const cost = upgradeCosts(this.equippedSkin.tier)[currentLevel - 1];

      if (this.coins >= cost) {
        this.coins -= cost;
        storage.setCoins(this.coins);
        up[statType] = currentLevel + 1;
        storage.setPigeonUpgrades(this.equippedSkinId, up);
        window.pigeonAudio.playUpgrade();
        this.showToast(`✨ VYLEPŠENO: ${statType === 'speed' ? 'Rychlost letu' : statType === 'reload' ? 'Přebíjení' : 'Bonus mincí'} na Lvl ${up[statType]}!`);
        this.updateLobbyHero();
      } else {
        window.pigeonAudio.playPanic();
        this.showToast(`❌ Chybí ti ${(cost - this.coins).toLocaleString()} 🪙`);
      }
    }

    openUpgrades() {
      this.setActiveTab('tabUpgrades');
      this.updateLobbyHero();
      this.upgradesModal.classList.remove('hidden');
    }

    closeUpgrades() {
      this.upgradesModal.classList.add('hidden');
      this.setActiveTab('tabLobby');
      this.updateLobbyHero();
    }

    // ======================================================================
    // GAME LAUNCH
    // ======================================================================
    startLevel(levelIndex) {
      this.gameMode = 'campaign';
      this.currentLevelIndex = Math.max(0, Math.min(levelIndex, LEVELS.length - 1));
      const lvl = this.currentLevel;
      this.levelTimeRemaining = lvl.timeLimit;
      this.levelHudBar.classList.remove('hidden');
      this.levelNameBadge.textContent = `LEVEL ${lvl.id}`;
      this.setTheme(WORLD_THEMES[lvl.worldId], 1000 + lvl.id);
      this.initRun();
    }

    startFreeMode() {
      this.gameMode = 'free';
      this.levelHudBar.classList.add('hidden');
      const names = Object.keys(THEMES);
      this.setTheme(names[Math.floor(Math.random() * names.length)]);
      this.initRun();
    }

    startDuo(mode) {
      this.gameMode = mode;
      this.levelHudBar.classList.add('hidden');
      this.versusTime = 90;
      const names = Object.keys(THEMES);
      this.setTheme(names[Math.floor(Math.random() * names.length)]);
      this.initRun();
    }

    createPlayer(index, skin, upgrades) {
      const yOffset = index === 0 ? 0 : -42;
      const startX = this.isDuo ? this.width * (index === 0 ? 0.35 : 0.65) : this.width / 2;
      return {
        index,
        label: `P${index + 1}`,
        color: index === 0 ? '#ffd23b' : '#33e1ff',
        skin,
        upgrades,
        yOffset,
        pigeon: new Pigeon(startX, this.skyY + yOffset, skin, upgrades),
        ammo: this.maxAmmo,
        reloadTimer: 0,
        infiniteAmmoTimer: 0,
        abilityCooldown: 0,
        score: 0,
        headshots: 0,
        combo: 1,
        comboTimer: 0
      };
    }

    initRun() {
      this.inLobby = false;
      this.lobbyScreen.classList.add('hidden');
      [this.shopModal, this.upgradesModal, this.pauseScreen, this.levelWinModal, this.levelFailModal, this.levelMapScreen, this.versusResultModal, this.deviceShareModal]
        .forEach(m => m.classList.add('hidden'));

      this.hud.classList.remove('hidden');
      const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      this.touchControls.classList.toggle('hidden', !touch || this.isLocalDuo);
      this.versusBar.classList.toggle('hidden', !this.isVersus);
      this.p2Hud.classList.toggle('hidden', !this.isDuo);
      this.scoreLabelEl.textContent = this.netRole ? 'TVOJE SKÓRE' : this.isDuo ? 'P1 SKÓRE' : 'SKÓRE';
      [this.$('onlineModal')].forEach(m => m && m.classList.add('hidden'));

      this.isRunning = true;
      this.isPaused = false;
      this._scoreRecorded = false;
      this.levelProgress = { hits: 0, headshots: 0, cyclistCrashes: 0, knockouts: 0, maxCombo: 1 };
      this.activeAbilityEffects = [];
      this.poops = [];
      this.pedestrians = [];
      this.cyclists = [];
      this.particles = [];
      this.floatingTexts = [];
      this.splats = [];
      this.speechBubbles = [];
      this.lightnings = [];
      this.slowMoTimer = 0;
      this.screenShake = 0;

      if (this.gameMode === 'online') {
        const o = this.onlineSetup;
        this.players = [this.createPlayer(0, o.s1, o.u1), this.createPlayer(1, o.s2, o.u2)];
        const opp = this.otherPl;
        const oppName = String((this.remoteHello && this.remoteHello.name) || 'Soupeř').replace(/[<>&"]/g, '').slice(0, 16);
        this.$('p2HudName').textContent = `${oppName} • ${opp.skin.name}`;
        const tag = this.p2Hud.querySelector('.p2-tag');
        tag.textContent = opp.label;
        tag.style.background = opp.color;
        this.p2Hud.style.borderColor = opp.color;
        this.$('p2AbilityText').dataset.key = '';
        this.versusTime = 90;
        this.remoteMove = 0;
        this.netTimer = 0;
        this.netEvents = [];
        this.showToast(`🌐 ONLINE SOUBOJ! Jsi ${this.localPl.label} • ← → pohyb • Mezerník kadit • E schopnost`);
        storage.addStat('duoGames');
      } else {
        this.players = [this.createPlayer(0, this.equippedLook, this.currentUpgrades)];
        const tag = this.p2Hud.querySelector('.p2-tag');
        tag.textContent = 'P2';
        tag.style.background = '';
        this.p2Hud.style.borderColor = '';
      }
      if (this.isLocalDuo) {
        const s2 = this.p2Look;
        this.players.push(this.createPlayer(1, s2, s2.id === 'p2_classic' ? { speed: 1, reload: 1, coins: 1 } : storage.getPigeonUpgrades(s2.id)));
        this.$('p2HudName').textContent = s2.name;
        if (this.mouseControlEnabled) {
          this.toggleMouseControl(true);
          this._mouseAutoOff = true;
        }
        this.showToast(this.gameMode === 'versus' ? '⚔️ SOUBOJ! P1: A/D + S • P2: ← → + ↓' : '🤝 CO-OP! P1: A/D + S • P2: ← → + ↓');
        storage.addStat('duoGames');
      } else if (this._mouseAutoOff) {
        this._mouseAutoOff = false;
        if (!this.mouseControlEnabled) this.toggleMouseControl(true);
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      this.camX = this.width / 2;

      if (this.netRole !== 'guest') {
        for (let i = 0; i < (this.isDuo ? 6 : 4); i++) this.spawnPedestrian(true);
        this.spawnCyclist();
      }

      storage.addStat('games');
      this.updateHUD();
      this.updateAmmoDisplay();
      this.updateAbilityHUD();
      this.lastTime = performance.now();
      window.pigeonAudio.playFlap();
    }

    updateLevelHUD() {
      if (this.gameMode !== 'campaign') return;
      const lvl = this.currentLevel;
      const p = this.levelProgress;
      const score = this.totalScore;
      let goalStr = '';
      if (lvl.targetType === 'hits') goalStr = `Zasáhni lidi: ${p.hits}/${lvl.targetCount}`;
      else if (lvl.targetType === 'headshots') goalStr = `HEADSHOTY: ${p.headshots}/${lvl.targetCount}`;
      else if (lvl.targetType === 'cyclistCrashes') goalStr = `Sundej cyklisty: ${p.cyclistCrashes}/${lvl.targetCount}`;
      else if (lvl.targetType === 'knockouts') goalStr = `Double K.O. k zemi: ${p.knockouts}/${lvl.targetCount}`;
      else if (lvl.targetType === 'score') goalStr = `Skóre: ${score.toLocaleString()}/${lvl.targetCount.toLocaleString()}`;
      else if (lvl.targetType === 'boss') goalStr = `Skóre: ${score.toLocaleString()}/${lvl.bossScore.toLocaleString()} | Cyklisté: ${p.cyclistCrashes}/${lvl.bossCyclists}`;
      this.levelGoalText.textContent = goalStr;
      this.levelTimerVal.textContent = `${Math.ceil(this.levelTimeRemaining)}s`;
      this.levelTimerVal.classList.toggle('danger', this.levelTimeRemaining <= 10);
    }

    checkLevelProgress() {
      if (this.gameMode !== 'campaign' || !this.isRunning) return;
      const lvl = this.currentLevel;
      const p = this.levelProgress;
      const score = this.totalScore;
      let won = false;
      if (lvl.targetType === 'hits' && p.hits >= lvl.targetCount) won = true;
      if (lvl.targetType === 'headshots' && p.headshots >= lvl.targetCount) won = true;
      if (lvl.targetType === 'cyclistCrashes' && p.cyclistCrashes >= lvl.targetCount) won = true;
      if (lvl.targetType === 'knockouts' && p.knockouts >= lvl.targetCount) won = true;
      if (lvl.targetType === 'score' && score >= lvl.targetCount) won = true;
      if (lvl.targetType === 'boss' && score >= lvl.bossScore && p.cyclistCrashes >= lvl.bossCyclists) won = true;
      if (won) this.completeLevel();
    }

    completeLevel() {
      this.isRunning = false;
      this.recordScore();
      const lvl = this.currentLevel;
      const pct = this.levelTimeRemaining / lvl.timeLimit;
      const stars = pct > 0.4 ? 3 : pct > 0.15 ? 2 : 1;

      storage.setLevelStars(lvl.id, stars);
      storage.setUnlockedLevel(lvl.id + 1);
      storage.addXP(150 + stars * 50);
      this.addCoins(lvl.reward, this.players[0]);

      // 1 token za každých 5 dokončených levelů
      const wins = storage.addLevelWin();
      const tokenEl = this.$('winTokenInfo');
      if (wins % 5 === 0) {
        storage.addTokens(1);
        tokenEl.textContent = '+1 🎟️ TOKEN!';
        tokenEl.classList.add('got');
        this.showActionBanner('🎟️ ZÍSKAL JSI TOKEN!');
      } else {
        tokenEl.textContent = `🎟️ ${wins % 5}/5`;
        tokenEl.classList.remove('got');
      }

      const starsRow = this.$('winStarsRow');
      starsRow.innerHTML = '';
      for (let s = 0; s < 3; s++) {
        const span = document.createElement('span');
        span.className = 'win-star';
        span.textContent = s < stars ? '⭐' : '⚪';
        span.style.animationDelay = `${s * 0.18}s`;
        starsRow.appendChild(span);
      }
      this.$('winLevelDesc').textContent = `Skvělá práce! Získal jsi ${stars} ⭐ a dokončil level za ${Math.ceil(lvl.timeLimit - this.levelTimeRemaining)} s.`;
      this.$('winCoinsBonus').textContent = `+${lvl.reward} 🪙`;
      this.$('winTotalCoins').textContent = `${this.coins.toLocaleString()} 🪙`;
      this.$('nextLevelBtn').style.display = lvl.id >= 100 ? 'none' : '';
      this.levelWinModal.classList.remove('hidden');
      window.pigeonAudio.playLevelWin();
      for (let i = 0; i < 80; i++) this.particles.push(new Particle(Math.random() * this.width, -10, ['#ffd23b', '#33e1ff', '#ff4d6a', '#7dff6a'][i % 4], 'confetti'));
    }

    failLevel() {
      this.isRunning = false;
      this.recordScore();
      this.$('failReasonText').textContent = `Čas vypršel dříve, než jsi stihl splnit cíl levelu ${this.currentLevel.id}.`;
      this.levelFailModal.classList.remove('hidden');
      window.pigeonAudio.playLevelFail();
    }

    finishVersus() {
      this.isRunning = false;
      this.recordScore();
      const [p1, p2] = this.players;
      const title = this.$('vsResultTitle');
      const r1 = this.$('vsResP1'), r2 = this.$('vsResP2');
      r1.classList.remove('winner'); r2.classList.remove('winner');
      if (p1.score > p2.score) { title.textContent = 'HRÁČ 1 VYHRÁVÁ!'; r1.classList.add('winner'); }
      else if (p2.score > p1.score) { title.textContent = 'HRÁČ 2 VYHRÁVÁ!'; r2.classList.add('winner'); }
      else title.textContent = 'REMÍZA!';
      if (this.netRole && p1.score !== p2.score) {
        const iWon = this.localPl.score > this.otherPl.score;
        title.textContent = iWon ? 'VYHRÁL JSI!' : 'PROHRÁL JSI!';
      }
      const rb = this.$('vsRematchBtn');
      rb.disabled = false;
      rb.textContent = '🔁 ODVETA';
      this.$('vsResultSub').textContent = `${p1.skin.name} vs ${p2.skin.name} • headshoty ${p1.headshots} : ${p2.headshots}`;
      this.$('vsResP1Score').textContent = p1.score.toLocaleString();
      this.$('vsResP2Score').textContent = p2.score.toLocaleString();
      renderPigeonPreview(this.$('vsResP1Canvas'), p1.skin, 1.4);
      renderPigeonPreview(this.$('vsResP2Canvas'), p2.skin, 1.4);
      storage.addXP(200);
      this.versusResultModal.classList.remove('hidden');
      window.pigeonAudio.playLevelWin();
      for (let i = 0; i < 80; i++) this.particles.push(new Particle(Math.random() * this.width, -10, ['#ffd23b', '#33e1ff', '#ff4d6a', '#7dff6a'][i % 4], 'confetti'));
    }

    // ======================================================================
    // ABILITIES
    // ======================================================================
    nearestPeds(x, n) {
      return this.pedestrians
        .filter(p => !p.knockedOut && !p.abducted)
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))
        .slice(0, n);
    }

    triggerAbility(pl) {
      if (!pl || !this.isRunning || this.isPaused) return;
      if (pl.abilityCooldown > 0) return;

      const skin = pl.skin;
      const pg = pl.pigeon;
      const key = skin.abilityKey || 'nitro';
      const ab = skin.ab || {};
      pl.abilityCooldown = skin.abilityCooldown || 16;

      this.fx('ability', { p: pl.index, k: key, x: pg.x, y: pg.y });

      switch (key) {
        case 'nitro':
          pg.speedBoostTimer = ab.dur || 3.5;
          break;
        case 'slowmo':
          this.slowMoTimer = ab.dur || 4.0;
          break;
        case 'zombieCloud':
          this.pedestrians.forEach(p => {
            if (!p.knockedOut && Math.abs(p.x - pg.x) < (ab.radius || 220)) {
              p.knockOut();
              this.triggerKnockout(p.x, p.groundY - 15, p, pl);
              this.fx('bubble', { x: p.x, y: p.groundY - 75, t: '🤮 MOR!' });
            }
          });
          break;
        case 'emp':
          this.pedestrians.forEach(p => {
            if (!p.knockedOut && Math.abs(p.x - pg.x) < (ab.radius || 220)) {
              p.knockOut();
              this.triggerHeadshot(p.x, p.groundY - 50, p, pl);
            }
          });
          break;
        case 'shuriken': {
          const n = ab.count || 5;
          const spread = 440 / Math.max(1, n - 1);
          for (let i = 0; i < n; i++) this.poops.push(new Poop(pg.x, pg.y + 15, pg.vx * 0.4 + (i - (n - 1) / 2) * spread, skin, pl));
          break;
        }
        case 'berserk':
          pl.infiniteAmmoTimer = ab.dur || 4.5;
          pl.ammo = this.maxAmmo;
          break;
        case 'airstrike': {
          const birds = [];
          for (let i = 0; i < (ab.count || 2); i++) birds.push({ x: -50 - i * 90, y: this.skyY - 15 + (i % 2) * 25, speed: 420 - (i % 2) * 20 });
          this.activeAbilityEffects.push({ type: 'airstrike', timer: 3.0 + birds.length * 0.25, owner: pl, rate: ab.rate || 0.22, birds });
          break;
        }
        case 'goldenRain':
          pl.infiniteAmmoTimer = ab.dur || 3.5;
          this.activeAbilityEffects.push({ type: 'goldenRain', timer: ab.dur || 3.5, spawnTimer: 0, interval: ab.interval || 0.14, owner: pl });
          break;
        case 'cannonball': {
          const bomb = new Poop(pg.x, pg.y + 20, pg.vx * 0.3, skin, pl);
          bomb.radius = 24;
          bomb.isCannonball = true;
          bomb.blastRadius = ab.radius || 180;
          this.poops.push(bomb);
          break;
        }
        case 'antigravity': {
          const r = ab.radius || 250, d = ab.dur || 4.0;
          this.pedestrians.forEach(p => { if (Math.abs(p.x - pg.x) < r) p.floating = d; });
          this.cyclists.forEach(c => { if (Math.abs(c.x - pg.x) < r) c.floating = d / 2; });
          break;
        }
        case 'supernova':
          this.nearestPeds(pg.x, ab.count || 3).forEach(p => {
            p.hitByPoop('head');
            this.triggerHeadshot(p.x, p.groundY - 55, p, pl);
          });
          break;
        case 'forceLightning':
          this.nearestPeds(pg.x, ab.count || 2).forEach(p => {
            this.fx('bolt', { x1: pg.x, y1: pg.y, x2: p.x, y2: p.groundY - 40 });
            p.knockOut();
            this.triggerKnockout(p.x, p.groundY - 20, p, pl);
          });
          break;
        case 'ufoAbduct':
          this.addCoins(ab.coins || 150, pl);
          this.nearestPeds(pg.x, ab.count || 2).forEach(p => { p.abducted = true; });
          break;
        case 'dragonFire': {
          const n = ab.count || 5;
          for (let i = 0; i < n; i++) {
            const m = new Poop(pg.x + (i - (n - 1) / 2) * 50, this.skyY + 10 - (i % 2) * 30, 0, SKINS.dragon, pl);
            m.isMeteor = true;
            m.radius = 11;
            this.poops.push(m);
          }
          break;
        }
        case 'gigachadShock':
          this.addCoins(ab.coins || 200, pl);
          this.pedestrians.forEach(p => {
            if (!p.knockedOut && Math.abs(p.x - pg.x) < (ab.radius || 260)) {
              p.knockOut();
              this.triggerKnockout(p.x, p.groundY - 20, p, pl);
            }
          });
          break;
        default: {
          const hit = ab.hit || 'body';
          this.pedestrians.forEach(p => {
            if (!p.knockedOut && (hit !== 'body' || !p.panicking) && Math.abs(p.x - pg.x) < (ab.radius || skin.abilityRadius || 180)) {
              if (hit === 'ko') {
                p.knockOut();
                this.triggerKnockout(p.x, p.groundY - 20, p, pl);
              } else if (hit === 'head') {
                p.hitByPoop('head');
                this.triggerHeadshot(p.x, p.groundY - 55, p, pl);
              } else {
                p.hitByPoop('body');
                this.triggerBodyHit(p.x, p.groundY - 30, p, pl);
              }
            }
          });
          break;
        }
      }
      this.updateAbilityHUD();
      this.updateAmmoDisplay();
    }

    updateAbilityHUD() {
      const p1 = this.localPl;
      if (p1) {
        const skin = p1.skin;
        this.abilityIcon.textContent = skin.abilityIcon || '⚡';
        this.abilityName.textContent = skin.abilityName || 'Nitro';
        if (p1.abilityCooldown <= 0) {
          this.abilityBtn.classList.add('ready');
          this.abilityCooldownFill.style.width = '0%';
        } else {
          this.abilityBtn.classList.remove('ready');
          this.abilityCooldownFill.style.width = `${(p1.abilityCooldown / (skin.abilityCooldown || 16)) * 100}%`;
        }
      }
      const p2 = this.players.length > 1 ? this.otherPl : null;
      if (p2) {
        const box = this.$('p2Ability');
        this.$('p2AbilityIcon').textContent = p2.skin.abilityIcon || '⚡';
        const ready = p2.abilityCooldown <= 0;
        box.classList.toggle('ready', ready);
        this.$('p2AbilityText').textContent = ready ? `${this.netRole ? '' : '[↑] '}${p2.skin.abilityName}` : `${Math.ceil(p2.abilityCooldown)} s`;
        this.$('p2AbilityFill').style.width = ready ? '0%' : `${(p2.abilityCooldown / (p2.skin.abilityCooldown || 16)) * 100}%`;
      }
    }

    // ======================================================================
    // AMMO / COINS / HUD
    // ======================================================================
    updateAmmo(pl, dt) {
      if (pl.infiniteAmmoTimer > 0) {
        pl.infiniteAmmoTimer -= dt;
        if (pl.infiniteAmmoTimer <= 0) this.updateAmmoDisplay();
        return;
      }
      if (pl.ammo < this.maxAmmo) {
        const reloadBonus = 1.0 + (pl.upgrades.reload - 1) * 0.12;
        const reloadRate = 0.8 / ((pl.skin.reloadMult || 1.0) * reloadBonus);
        pl.reloadTimer += dt;
        if (pl.reloadTimer >= reloadRate) {
          pl.ammo++;
          pl.reloadTimer = 0;
          this.updateAmmoDisplay();
        }
      }
    }

    updateAmmoDisplay() {
      const paint = (pl, slotsEl) => {
        if (!pl || !slotsEl) return;
        const slots = slotsEl.children;
        for (let i = 0; i < slots.length; i++) {
          slots[i].classList.toggle('ready', pl.infiniteAmmoTimer > 0 || i < pl.ammo);
        }
      };
      const p1 = this.localPl;
      if (p1) {
        this.ammoCountEl.textContent = p1.infiniteAmmoTimer > 0 ? '∞/5' : `${p1.ammo}/${this.maxAmmo}`;
        paint(p1, this.ammoSlotsEl);
      }
      if (this.players.length > 1) paint(this.otherPl, this.$('p2AmmoSlots'));
    }

    addCoins(amount, pl) {
      pl = pl || this.players[0];
      let mult = 1;
      if (pl) mult = (pl.skin.coinMult || 1.0) * (1.0 + (pl.upgrades.coins - 1) * 0.15);
      const earned = Math.round(amount * mult);
      if (!this.isLocal(pl)) {
        // mince soupeře patří do jeho peněženky na jeho počítači
        this.netSend({ t: 'coins', n: earned });
        return earned;
      }
      this.coins += earned;
      storage.setCoins(this.coins);
      this.updateCoinsDisplay();
      window.pigeonAudio.playCoin();
      return earned;
    }

    updateCoinsDisplay() {
      const txt = storage.isInfinite() ? '∞' : this.coins.toLocaleString();
      const tk = this.$('lobbyTokensVal');
      if (tk) tk.textContent = storage.isInfiniteTokens() ? '∞' : storage.getTokens().toLocaleString();
      this.coinsValEl.textContent = txt;
      this.$('lobbyCoinsVal').textContent = txt;
      this.$('shopCoinsVal').textContent = txt;
      this.$('upgradesCoinsVal').textContent = txt;
    }

    updateHUD() {
      const p1 = this.localPl, p2 = this.players.length > 1 ? this.otherPl : null;
      if (!p1) return;
      if (this.isDuo) {
        this.scoreValEl.textContent = p1.score.toLocaleString();
        this.headshotsValEl.textContent = p1.headshots;
      } else {
        this.scoreValEl.textContent = this.totalScore.toLocaleString();
        this.headshotsValEl.textContent = this.players.reduce((s, p) => s + p.headshots, 0);
      }
      this.comboValEl.textContent = `${p1.combo}x`;
      if (p2) {
        this.$('p2ScoreVal').textContent = p2.score.toLocaleString();
        this.$('p2HeadshotsVal').textContent = p2.headshots;
        this.$('p2ComboVal').textContent = `${p2.combo}x`;
      }
      if (this.isVersus && this.players[1]) {
        this.$('vsP1Score').textContent = this.players[0].score.toLocaleString();
        this.$('vsP2Score').textContent = this.players[1].score.toLocaleString();
      }
      this.updateCoinsDisplay();
      this.updateLevelHUD();
    }

    // ======================================================================
    // MAP
    // ======================================================================
    openMap() {
      this.setActiveTab('tabCampaign');
      const unlocked = storage.getUnlockedLevel();
      this.activeMapWorld = Math.min(5, Math.ceil(unlocked / 20));
      document.querySelectorAll('.world-tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.world, 10) === this.activeMapWorld));
      this.levelMapScreen.classList.remove('hidden');
      this.renderMapWorld(this.activeMapWorld);
      this.updateMapStats();
    }

    closeMap() {
      this.levelMapScreen.classList.add('hidden');
    }

    setupWorldTabs() {
      const tabs = document.querySelectorAll('.world-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.activeMapWorld = parseInt(tab.dataset.world, 10);
          this.renderMapWorld(this.activeMapWorld);
        });
      });
    }

    updateMapStats() {
      let totalStars = 0;
      Object.values(storage.getLevelStars()).forEach(s => totalStars += s);
      this.$('mapStarsCount').textContent = `${totalStars}/300`;
      this.$('mapCoinsVal').textContent = this.coins.toLocaleString();
      this.$('mapCurrentLvlNum').textContent = storage.getUnlockedLevel();
    }

    renderMapWorld(worldId) {
      this.mapRoadContainer.innerHTML = '';
      const unlockedMax = storage.getUnlockedLevel();
      const starsData = storage.getLevelStars();
      const worldLevels = LEVELS.slice((worldId - 1) * 20, worldId * 20);

      for (let r = 0; r < 4; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'map-node-row';
        let rowLevels = worldLevels.slice(r * 5, (r + 1) * 5);
        if (r % 2 === 1) rowLevels = rowLevels.reverse();

        rowLevels.forEach(lvl => {
          const isUnlocked = lvl.id <= unlockedMax;
          const isCurrent = lvl.id === unlockedMax;
          const stars = starsData[lvl.id] || 0;
          const nodeItem = document.createElement('div');
          nodeItem.className = `map-node-item ${stars > 0 ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${!isUnlocked ? 'locked' : ''}`;
          nodeItem.innerHTML = `
            <div class="map-node-tooltip">${lvl.title}: ${lvl.desc} (⏱️${lvl.timeLimit}s • +${lvl.reward}🪙)</div>
            <div class="map-node-bubble">${!isUnlocked ? '🔒' : lvl.id}</div>
            <div class="map-node-stars">${'⭐'.repeat(stars)}</div>
          `;
          if (isUnlocked) {
            nodeItem.addEventListener('click', () => {
              this.closeMap();
              this.startLevel(lvl.id - 1);
            });
          }
          rowDiv.appendChild(nodeItem);
        });
        this.mapRoadContainer.appendChild(rowDiv);
      }
    }

    // ======================================================================
    // SHOP
    // ======================================================================
    setupShop() {
      const tierBtns = document.querySelectorAll('.rarity-tab');
      tierBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tierBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeShopTier = btn.dataset.tier;
          this.renderShopGrid();
        });
      });
      this.shopSearchInput.addEventListener('input', () => this.renderShopGrid());
    }

    renderShopGrid() {
      this.skinsGridEl.innerHTML = '';
      const unlocked = storage.getUnlockedSkins();
      const search = (this.shopSearchInput.value || '').toLowerCase().trim();
      let filtered = Object.values(SKINS);
      if (this.activeShopTier !== 'all') filtered = filtered.filter(s => s.tier === this.activeShopTier);
      if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search));

      const frag = document.createDocumentFragment();
      const previews = [];
      filtered.forEach(skin => {
        const isUnlocked = unlocked.includes(skin.id);
        const isEquipped = this.equippedSkinId === skin.id;
        const card = document.createElement('div');
        card.className = `skin-card tier-${skin.tier} ${isEquipped ? 'equipped' : ''}`;
        card.style.setProperty('--tier-color', TIER_COLORS[skin.tier]);
        card.innerHTML = `
          <div class="skin-tier-strip">${TIER_LABELS[skin.tier]}</div>
          <div class="skin-preview-wrap"><canvas width="120" height="90"></canvas></div>
          <div class="skin-name">${skin.name}</div>
          <div class="skin-ability-tag">[E] ${skin.abilityIcon || '⚡'} ${skin.abilityName}</div>
          ${isUnlocked ? `<button class="skin-variants-btn">✏️ EDIT HOLUBA${Object.keys(storage.getEdit(skin.id)).length ? ' ✔' : ''}</button>` : ''}
          <div class="skin-perk">${skin.abilityDesc}</div>
          <button class="skin-btn ${isEquipped ? 'btn-equipped' : (isUnlocked ? 'btn-equip' : 'btn-buy')}">
            ${isEquipped ? '✅ NASAZENO' : (isUnlocked ? 'NASADIT' : `🪙 ${skin.price.toLocaleString()} KOUPIT`)}
          </button>
        `;
        previews.push([card.querySelector('canvas'), getAppearance(skin, this.editFor(skin.id))]);
        card.querySelector('.skin-btn').addEventListener('click', () => this.handleSkinAction(skin));
        const eb = card.querySelector('.skin-variants-btn');
        if (eb) eb.addEventListener('click', () => this.openEditor(skin.id));
        frag.appendChild(card);
      });
      this.skinsGridEl.appendChild(frag);

      // lazy render previews in chunks so the UI stays smooth
      let i = 0;
      const token = (this._shopToken = {});
      const step = () => {
        if (this._shopToken !== token) return;
        const end = Math.min(previews.length, i + 24);
        for (; i < end; i++) renderPigeonPreview(previews[i][0], previews[i][1], 1.25);
        if (i < previews.length) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    handleSkinAction(skin) {
      const unlocked = storage.getUnlockedSkins();
      if (unlocked.includes(skin.id)) {
        this.equippedSkinId = skin.id;
        storage.setEquippedSkin(skin.id);
        window.pigeonAudio.playFlap();
      } else if (this.coins >= skin.price) {
        this.coins -= skin.price;
        storage.setCoins(this.coins);
        unlocked.push(skin.id);
        storage.setUnlockedSkins(unlocked);
        this.equippedSkinId = skin.id;
        storage.setEquippedSkin(skin.id);
        window.pigeonAudio.playPurchase();
        this.showToast(`🎉 Odemčeno: ${skin.name}!`);
        this.updateCoinsDisplay();
      } else {
        window.pigeonAudio.playPanic();
        this.showToast(`❌ Chybí ti ${(skin.price - this.coins).toLocaleString()} 🪙`);
        return;
      }
      this.lobbySwap = 1;
      this.renderShopGrid();
      this.updateLobbyHero();
    }

    openShop() {
      this.setActiveTab('lobbyShopBtn');
      this.shopModal.classList.remove('hidden');
      this.updateCoinsDisplay();
      this.renderShopGrid();
    }

    closeShop() {
      this.shopModal.classList.add('hidden');
      this.setActiveTab('tabLobby');
      this.updateLobbyHero();
      this.updateLobbyMode();
    }

    openDeviceShareModal() {
      this.setActiveTab('lobbyDeviceShareBtn');
      this.deviceShareModal.classList.remove('hidden');
    }

    closeDeviceShareModal() {
      this.deviceShareModal.classList.add('hidden');
      this.setActiveTab('tabLobby');
    }

    toggleMouseControl(silent) {
      this.mouseControlEnabled = !this.mouseControlEnabled;
      this.mouseToggleBtn.classList.toggle('active', this.mouseControlEnabled);
      this.mouseToggleSub.textContent = this.mouseControlEnabled ? 'MYŠ: ZAP' : 'MYŠ: VYP';
      if (!silent) this.showToast(this.mouseControlEnabled ? '🖱️ Řízení myší: ZAPNUTO' : '⌨️ Řízení myší: VYPNUTO');
    }

    showToast(text) {
      this.mouseToastText.textContent = text;
      this.mouseToast.classList.remove('hidden');
      this.mouseToast.style.animation = 'none';
      void this.mouseToast.offsetHeight;
      this.mouseToast.style.animation = '';
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.mouseToast.classList.add('hidden'), 1600);
    }

    showActionBanner(text) {
      this.actionBannerText.textContent = text;
      this.actionBanner.classList.remove('hidden');
      this.actionBanner.style.animation = 'none';
      void this.actionBanner.offsetHeight;
      this.actionBanner.style.animation = '';
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => this.actionBanner.classList.add('hidden'), 1200);
    }

    toggleSound() {
      const isMuted = window.pigeonAudio.toggleMute();
      this.soundBtn.textContent = isMuted ? '🔇' : '🔊';
      this.$('lobbySoundBtn').textContent = isMuted ? '🔇' : '🔊';
    }

    togglePause() {
      if (!this.isRunning) return;
      if (this.netRole) {
        this.showToast('🌐 Online hru nejde pozastavit');
        return;
      }
      this.isPaused = !this.isPaused;
      this.pauseScreen.classList.toggle('hidden', !this.isPaused);
      if (!this.isPaused) this.lastTime = performance.now();
    }

    addSpeechBubble(x, y, text) {
      this.speechBubbles.push({ x, y, text, timer: 1.2 });
    }

    // vstup místního hráče (u online hosta = P1, u hosta připojeného = pošle se hostiteli)
    localDrop() {
      if (!this.isRunning || this.isPaused) return;
      if (this.netRole === 'guest') {
        const me = this.localPl;
        if (me && (me.ammo > 0 || me.infiniteAmmoTimer > 0)) this.netSend({ t: 'drop' });
        return;
      }
      this.dropPoop(this.localPl);
    }

    localAbility() {
      if (!this.isRunning || this.isPaused) return;
      if (this.netRole === 'guest') {
        const me = this.localPl;
        if (me && me.abilityCooldown <= 0) this.netSend({ t: 'ab' });
        return;
      }
      this.triggerAbility(this.localPl);
    }

    dropPoop(pl) {
      if (!pl || !this.isRunning || this.isPaused) return;
      if (pl.infiniteAmmoTimer <= 0) {
        if (pl.ammo <= 0) return;
        pl.ammo--;
        this.updateAmmoDisplay();
      }
      const pg = pl.pigeon;
      const dropX = pg.x - (pg.facingRight ? 10 : -10);
      this.poops.push(new Poop(dropX, pg.y + 15, pg.vx * 0.65, pl.skin, pl));
      this.fx('drop', {});
      pg.flapBoost = 6;
    }

    // ======================================================================
    // SCORING (každý zásah patří konkrétnímu hráči)
    // ======================================================================
    scoreFor(pl, pts) {
      pl = pl || this.players[0];
      pl.score += pts * pl.combo;
    }

    bumpCombo(pl, t) {
      pl.combo++;
      if (pl.combo > this.levelProgress.maxCombo) this.levelProgress.maxCombo = pl.combo;
      pl.comboTimer = t;
    }

    // statistiky a XP jdou do úložiště toho hráče, kterému zásah patří
    credit(pl, stats, xp) {
      if (this.isLocal(pl)) {
        stats.forEach(s => storage.addStat(s));
        storage.addXP(xp);
      } else {
        this.netSend({ t: 'stat', k: stats, xp });
      }
    }

    triggerHeadshot(x, y, target, pl) {
      pl = pl || this.players[0];
      pl.headshots++;
      this.levelProgress.headshots++;
      this.levelProgress.hits++;
      this.credit(pl, ['headshots', 'hits'], 25);
      this.scoreFor(pl, 500);
      const earned = this.addCoins(50 * pl.combo, pl);
      this.bumpCombo(pl, 4.5);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.16);
      this.fx('headshot', { x, y, p: pl.index, n: earned });
      this.updateHUD();
      this.checkLevelProgress();
    }

    triggerBodyHit(x, y, target, pl) {
      pl = pl || this.players[0];
      this.levelProgress.hits++;
      this.credit(pl, ['hits'], 10);
      this.scoreFor(pl, 150);
      const earned = this.addCoins(10 * pl.combo, pl);
      pl.comboTimer = Math.max(pl.comboTimer, 3.5);
      this.fx('body', { x, y, p: pl.index, n: earned });
      this.updateHUD();
      this.checkLevelProgress();
    }

    triggerKnockout(x, y, ped, pl) {
      pl = pl || this.players[0];
      this.levelProgress.knockouts++;
      this.credit(pl, ['knockouts'], 20);
      this.scoreFor(pl, 300);
      const earned = this.addCoins(30 * pl.combo, pl);
      pl.comboTimer = Math.max(pl.comboTimer, 3.5);
      this.fx('ko', { x, y, g: ped ? ped.groundY : y, p: pl.index, n: earned });
      this.updateHUD();
      this.checkLevelProgress();
    }

    triggerCyclistCrash(x, y, cyclist, pl) {
      pl = pl || this.players[0];
      this.levelProgress.cyclistCrashes++;
      this.credit(pl, ['cyclists'], 40);
      this.scoreFor(pl, 800);
      const earned = this.addCoins(100 * pl.combo, pl);
      this.bumpCombo(pl, 4.5);
      this.slowMoTimer = Math.max(this.slowMoTimer, 0.2);
      this.fx('crash', { x, y, p: pl.index, n: earned });
      this.updateHUD();
      this.checkLevelProgress();
    }

    // ======================================================================
    // FX - všechny vizuální a zvukové efekty (online se posílají soupeři)
    // ======================================================================
    fx(type, d) {
      if (this.netRole === 'host' && this.netEvents) this.netEvents.push([type, d]);
      const audio = window.pigeonAudio;
      const pl = this.players[d.p] || this.players[0];
      const col = pl ? pl.color : '#ffd23b';
      const who = this.isDuo && pl ? (this.netRole ? (this.isLocal(pl) ? 'TY' : 'SOUPEŘ') : pl.label) : '';
      const { x, y } = d;

      switch (type) {
        case 'drop':
          audio.playDrop();
          break;
        case 'headshot': {
          audio.playHeadshot();
          audio.playPanic();
          const msgs = ['💥 AU MOJE HLAVA!', '😱 MŮJ KLOBOUK!', '💥 HEADSHOT!', '🤬 TY HOLUBE!'];
          this.addSpeechBubble(x, y - 45, msgs[Math.floor(Math.random() * msgs.length)]);
          this.$('headshotSub').textContent = `${who ? who + ' • ' : ''}+${d.n} MINCÍ • KRITICKÝ ZÁSAH!`;
          this.headshotBanner.classList.remove('hidden');
          this.headshotBanner.style.animation = 'none';
          void this.headshotBanner.offsetHeight;
          this.headshotBanner.style.animation = '';
          clearTimeout(this._hsT);
          this._hsT = setTimeout(() => this.headshotBanner.classList.add('hidden'), 1100);
          this.screenShake = 16;
          this.floatingTexts.push(new FloatingText(x, y - 20, `💥 HEADSHOT! +${d.n}🪙`, col, 26, true));
          for (let i = 0; i < 22; i++) {
            this.particles.push(new Particle(x, y, '#ffd700', 'star'));
            this.particles.push(new Particle(x, y, '#ffffff', 'splat'));
          }
          break;
        }
        case 'body': {
          audio.playSplat();
          audio.playPanic();
          const msgs = ['🤮 FUJ!', '👔 MŮJ OBLEK!', '😱 POMÓÓC!', '🤢 BLEE!'];
          this.addSpeechBubble(x, y - 40, msgs[Math.floor(Math.random() * msgs.length)]);
          this.screenShake = Math.max(this.screenShake, 5);
          this.floatingTexts.push(new FloatingText(x, y - 10, `+${d.n}🪙`, col, 20));
          for (let i = 0; i < 14; i++) this.particles.push(new Particle(x, y, '#ffffff', 'splat'));
          break;
        }
        case 'ko':
          audio.playKnockout();
          this.screenShake = Math.max(this.screenShake, 12);
          this.addSpeechBubble(x, y - 35, '💀 K.O.!');
          this.floatingTexts.push(new FloatingText(x, y - 30, `💀 K.O.! +${d.n}🪙`, '#ff4757', 22, true));
          this.showActionBanner(`💀 K.O.! ${who ? who + ' ' : ''}SUNDÁN K ZEMI!`);
          for (let i = 0; i < 18; i++) {
            this.particles.push(new Particle(x, y, '#ff4757', 'circle'));
            this.particles.push(new Particle(x, y, '#ffd700', 'star'));
          }
          this.particles.push(new Particle(x, d.g, 'rgba(200,190,170,0.6)', 'dust'));
          break;
        case 'crash':
          audio.playBikeCrash();
          this.screenShake = 20;
          this.addSpeechBubble(x, y - 70, '🚴💥 MOJE KOLO!');
          this.floatingTexts.push(new FloatingText(x, y - 60, `🚴💥 CYKLISTA SUNDÁN! +${d.n}🪙`, '#ff9f43', 26, true));
          this.showActionBanner(`🚴💥 ${who ? who + ': ' : ''}CYKLISTA NA ZEMI!`);
          for (let i = 0; i < 26; i++) {
            this.particles.push(new Particle(x, y - 20, '#ff9f43', 'star'));
            this.particles.push(new Particle(x, y - 20, '#ffffff', 'splat'));
          }
          for (let i = 0; i < 3; i++) this.particles.push(new Particle(x + (i - 1) * 20, y, 'rgba(200,190,170,0.6)', 'dust'));
          break;
        case 'helmet':
          audio.playHelmetPop();
          this.floatingTexts.push(new FloatingText(x, y, `🎯 PŘILBA DOLE! +${d.n}🪙`, '#f39c12', 20));
          break;
        case 'bubble':
          this.addSpeechBubble(x, y, d.t);
          break;
        case 'bolt':
          this.lightnings.push({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, life: 0.45, seed: Math.random() * 1000 });
          this.flash = Math.max(this.flash, 0.6);
          break;
        case 'ground': {
          audio.playSplat();
          this.splats.push(new Splat(x, y, d.s));
          for (let i = 0; i < 5; i++) this.particles.push(new Particle(x, this.groundY + 10, d.m ? '#ff9f43' : 'rgba(255,255,255,0.9)', 'splat'));
          if (d.big) {
            this.screenShake = d.c ? 22 : 10;
            this.particles.push(new Particle(x, this.groundY, d.m ? '#ff6a00' : '#ffd700', 'ring'));
            for (let i = 0; i < (d.c ? 30 : 12); i++) this.particles.push(new Particle(x, this.groundY, '#ff7a3d', 'ember'));
          }
          break;
        }
        case 'ability': {
          const k = d.k;
          const skin = pl.skin;
          if (this.isLocal(pl)) {
            this.abilityPulseGlow.classList.add('active');
            setTimeout(() => this.abilityPulseGlow.classList.remove('active'), 800);
          }
          if (k === 'emp') audio.playAbility('emp');
          else if (k === 'forceLightning') audio.playAbility('lightning');
          else if (k === 'dragonFire') audio.playAbility('dragon');
          else if (k === 'ufoAbduct') audio.playAbility('ufo');
          else audio.playAbility();
          this.showToast(`${who ? who + ': ' : ''}✨ ${skin.abilityName}!`);
          this.screenShake = 12;
          this.floatingTexts.push(new FloatingText(x, y - 40, `${skin.abilityIcon || '✨'} ${skin.abilityName.toUpperCase()}!`, col, 22, true));
          const gy = this.groundY;
          if (k === 'zombieCloud') {
            for (let i = 0; i < 30; i++) this.particles.push(new Particle(x + (Math.random() - 0.5) * 300, gy - 30 - Math.random() * 40, 'rgba(90,220,90,0.8)', 'smoke'));
          } else if (k === 'emp') {
            this.particles.push(new Particle(x, gy - 30, '#00f3ff', 'ring'));
            for (let i = 0; i < 25; i++) this.particles.push(new Particle(x + (Math.random() - 0.5) * 200, gy - 30, '#00f3ff', 'star'));
          } else if (k === 'supernova') {
            this.flash = 1;
          } else if (k === 'ufoAbduct') {
            this.showActionBanner('🛸 UFO ABDUKCE: +150🪙!');
          } else if (k === 'gigachadShock') {
            this.showActionBanner('🗿 GIGACHAD OTŘES: +200🪙!');
            this.screenShake = 28;
            this.particles.push(new Particle(x, gy, '#ffd700', 'ring'));
          } else if (k === 'pulse') {
            this.particles.push(new Particle(x, gy - 30, col, 'ring'));
          }
          break;
        }
      }
    }

    spawnPedestrian(scatter = false) {
      const fromLeft = Math.random() > 0.5;
      let startX = fromLeft ? -40 : this.width + 40;
      if (scatter) startX = Math.random() * this.width;
      this.pedestrians.push(new Pedestrian(startX, this.groundY, fromLeft));
    }

    spawnCyclist() {
      const fromLeft = Math.random() > 0.5;
      this.cyclists.push(new Cyclist(fromLeft ? -80 : this.width + 80, this.groundY, fromLeft));
    }

    // ======================================================================
    // MAIN LOOP
    // ======================================================================
    loop(timestamp) {
      this.step(timestamp, true);
      requestAnimationFrame(this.loop.bind(this));
    }

    // záložní běh online hry, když prohlížeč pozastaví animace (okno na pozadí)
    startNetWatchdog() {
      if (this._watchdog) return;
      this._watchdog = setInterval(() => {
        if (!this.netRole) return;
        const now = performance.now();
        if (now - (this._lastFrameAt || 0) > 120) this.step(now, false);
      }, 50);
    }

    step(timestamp, doRender) {
      this._lastFrameAt = performance.now();
      if (doRender) this.tickPerf();
      let dt = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;
      if (dt > 0.1) dt = 0.1;
      if (dt < 0) dt = 0;
      this.time += dt;

      let effectiveDt = dt;
      if (this.slowMoTimer > 0 && this.isRunning && !this.isPaused) {
        this.slowMoTimer -= dt;
        effectiveDt = dt * 0.25;
      }

      if (this.isRunning && !this.isPaused) {
        if (this.netRole === 'guest') this.guestUpdate(effectiveDt, dt);
        else this.update(effectiveDt, dt);
      } else if (!this.isPaused && !this.inLobby) {
        // po konci levelu ať dobíhají částice a konfety
        this.updateFx(dt);
      }

      if (!doRender) return;
      if (this.inLobby) this.renderLobby(dt);
      else this.render();
    }

    update(dt, realDt) {
      if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 45);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - realDt * 2.5);

      if (this.gameMode === 'campaign') {
        this.levelTimeRemaining -= realDt;
        if (this.levelTimeRemaining <= 0) {
          this.levelTimeRemaining = 0;
          this.updateLevelHUD();
          this.failLevel();
          return;
        }
        this.updateLevelHUD();
      } else if (this.isVersus) {
        this.versusTime -= realDt;
        this.updateVersusTimer();
        if (this.versusTime <= 0) {
          if (this.netRole === 'host') {
            this.sendSnapshot();
            this.netSend({ t: 'end' });
          }
          this.finishVersus();
          return;
        }
      }

      let abilityDirty = false;
      this.players.forEach(pl => {
        if (pl.abilityCooldown > 0) {
          pl.abilityCooldown = Math.max(0, pl.abilityCooldown - realDt);
          abilityDirty = true;
        }
        if (pl.combo > 1) {
          pl.comboTimer -= dt;
          if (pl.comboTimer <= 0) { pl.combo = 1; this.updateHUD(); }
        }
        this.updateAmmo(pl, realDt);
      });
      if (abilityDirty) this.updateAbilityHUD();

      for (let i = this.activeAbilityEffects.length - 1; i >= 0; i--) {
        const eff = this.activeAbilityEffects[i];
        eff.timer -= dt;
        if (eff.type === 'airstrike') {
          eff.birds.forEach(b => {
            b.x += b.speed * dt;
            b.wing = (b.wing || 0) + dt * 14;
            if (Math.random() < (eff.rate || 0.22)) this.poops.push(new Poop(b.x, b.y + 10, 0, SKINS.mafia, eff.owner));
          });
        } else if (eff.type === 'goldenRain') {
          eff.spawnTimer += dt;
          if (eff.spawnTimer > (eff.interval || 0.14)) {
            eff.spawnTimer = 0;
            this.poops.push(new Poop(Math.random() * this.width, this.skyY - 30, 0, SKINS.king, eff.owner));
          }
        }
        if (eff.timer <= 0) this.activeAbilityEffects.splice(i, 1);
      }

      this.clouds.forEach(c => {
        c.x += c.speed * dt;
        if (c.x > this.width + 60) c.x = -220 * c.scale;
      });
      this.updateAmbient(dt);

      // Player movement
      this.players.forEach(pl => {
        let moveDir = 0;
        if (pl.index === 0) {
          moveDir = this.readLocalMove(pl);
        } else if (this.gameMode === 'online') {
          moveDir = this.remoteMove || 0;
        } else {
          if (this.keys['arrowleft']) moveDir -= 1;
          if (this.keys['arrowright']) moveDir += 1;
        }
        pl.pigeon.update(dt, moveDir, this.width);
      });

      // camera parallax target
      const avgX = this.players.reduce((s, p) => s + p.pigeon.x, 0) / Math.max(1, this.players.length);
      this.camX += (avgX - this.camX) * Math.min(1, dt * 2);

      const maxPeds = this.isDuo ? 7 : 5;
      if (this.pedestrians.length < maxPeds && Math.random() < 0.035) this.spawnPedestrian();
      for (let i = this.pedestrians.length - 1; i >= 0; i--) {
        const ped = this.pedestrians[i];
        ped.update(dt);
        if (ped.isOffscreen(this.width)) this.pedestrians.splice(i, 1);
      }

      const maxCyc = this.isDuo ? 3 : 2;
      if (this.cyclists.length < maxCyc && Math.random() < 0.018) this.spawnCyclist();
      for (let i = this.cyclists.length - 1; i >= 0; i--) {
        const cyc = this.cyclists[i];
        cyc.update(dt);
        if (cyc.isOffscreen(this.width)) this.cyclists.splice(i, 1);
      }

      for (let i = this.speechBubbles.length - 1; i >= 0; i--) {
        const sb = this.speechBubbles[i];
        sb.timer -= dt;
        sb.y -= 15 * dt;
        if (sb.timer <= 0) this.speechBubbles.splice(i, 1);
      }

      this.updatePoops(dt);
      this.updateFx(dt);

      if (this.netRole === 'host') {
        this.netTimer += realDt;
        if (this.netTimer >= 0.05) {
          this.netTimer = 0;
          this.sendSnapshot();
        }
      }
    }

    // směr pohybu místního hráče z klávesnice / dotyku / myši
    readLocalMove(pl) {
      let moveDir = 0;
      const solo = !this.isLocalDuo;
      if (this.keys['a'] || this.keys['touchleft'] || (solo && this.keys['arrowleft'])) moveDir -= 1;
      if (this.keys['d'] || this.keys['touchright'] || (solo && this.keys['arrowright'])) moveDir += 1;
      if (this.mouseControlEnabled && moveDir === 0 && pl) {
        const dx = this.mouseX - pl.pigeon.x;
        if (Math.abs(dx) > 15) moveDir = Math.sign(dx) * Math.min(1, Math.abs(dx) / 80);
      }
      return moveDir;
    }

    updateVersusTimer() {
      const t = this.$('vsTimer');
      t.textContent = Math.max(0, Math.ceil(this.versusTime));
      t.classList.toggle('danger', this.versusTime <= 10);
    }

    // ======================================================================
    // ONLINE MULTIPLAYER (PeerJS / WebRTC, hostitel řídí celou hru)
    // ======================================================================
    setupOnline() {
      const $ = this.$;
      $('onlineCreateBtn').addEventListener('click', () => this.createRoom());
      $('onlineJoinBtn').addEventListener('click', () => this.joinRoom());
      const inp = $('onlineJoinInput');
      inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinRoom(); });
      $('onlineCopyBtn').addEventListener('click', () => {
        try { navigator.clipboard.writeText(this.roomCode || ''); } catch (e) {}
        this.showToast('📋 Kód zkopírován!');
      });
      $('onlineCloseBtn').addEventListener('click', () => {
        this.netClose(true);
        $('onlineModal').classList.add('hidden');
        this.setActiveTab('tabLobby');
      });
    }

    openOnline() {
      const $ = this.$;
      if (!this.netRole) {
        $('onlineCodeBox').classList.add('hidden');
        this.setOnlineStatus('Jeden hráč klikne na VYTVOŘIT KÓD, druhý ten kód zadá a klikne na PŘIPOJIT.');
      }
      $('onlineModal').classList.remove('hidden');
    }

    setOnlineStatus(text, kind) {
      const el = this.$('onlineStatus');
      el.textContent = text;
      el.className = `online-status ${kind || ''}`;
    }

    loadPeer() {
      if (window.Peer) return Promise.resolve();
      if (this._peerP) return this._peerP;
      this._peerP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
        s.onload = () => resolve();
        s.onerror = () => { this._peerP = null; s.remove(); reject(new Error('peerjs')); };
        document.head.appendChild(s);
      });
      return this._peerP;
    }

    peerOptions() {
      return {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      };
    }

    async createRoom() {
      this.netClose(false);
      this.setOnlineStatus('⏳ Připojuji se k serveru...');
      try { await this.loadPeer(); } catch (e) {
        this.setOnlineStatus('❌ Nepodařilo se načíst online modul. Jsi připojený k internetu?', 'err');
        return;
      }
      const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const peer = new window.Peer(PEER_PREFIX + code, this.peerOptions());
      this.peer = peer;
      peer.on('open', () => {
        if (peer !== this.peer) return;
        this.roomCode = code;
        this.$('onlineCode').textContent = code;
        this.$('onlineCodeBox').classList.remove('hidden');
        this.setOnlineStatus('✅ Kód je připravený! Pošli ho kamarádovi a nech toto okno otevřené.', 'ok');
      });
      peer.on('connection', (conn) => {
        if (peer !== this.peer) return;
        if (this.conn) {
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
          return;
        }
        this.attachConn(conn, 'host');
      });
      peer.on('error', (err) => { if (peer === this.peer) this.onPeerError(err, 'host'); });
      peer.on('disconnected', () => { if (peer === this.peer && !peer.destroyed) peer.reconnect(); });
    }

    async joinRoom() {
      const code = this.$('onlineJoinInput').value.trim().toUpperCase();
      if (code.length !== 5) {
        this.setOnlineStatus('✍️ Zadej celý pětimístný kód od kamaráda.', 'err');
        return;
      }
      this.netClose(false);
      this.$('onlineCodeBox').classList.add('hidden');
      this.setOnlineStatus(`⏳ Připojuji se ke hře ${code}...`);
      try { await this.loadPeer(); } catch (e) {
        this.setOnlineStatus('❌ Nepodařilo se načíst online modul. Jsi připojený k internetu?', 'err');
        return;
      }
      const peer = new window.Peer(this.peerOptions());
      this.peer = peer;
      peer.on('open', () => {
        if (peer !== this.peer) return;
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        this.attachConn(conn, 'guest');
        this._joinTimeout = setTimeout(() => {
          if (peer === this.peer && !this.netRole) {
            this.setOnlineStatus('❌ Nepodařilo se spojit. Zkontroluj kód – nebo vaše síť blokuje přímé spojení (zkus jinou Wi-Fi / mobilní data).', 'err');
          }
        }, 15000);
      });
      peer.on('error', (err) => { if (peer === this.peer) this.onPeerError(err, 'guest'); });
    }

    attachConn(conn, role) {
      this.conn = conn;
      conn.on('open', () => {
        if (conn !== this.conn) return;
        clearTimeout(this._joinTimeout);
        this.netRole = role;
        this.startNetWatchdog();
        this.netSend({ t: 'hello', name: this.accountName || 'Host', skin: this.equippedSkinId, ed: this.editFor(this.equippedSkinId), up: this.currentUpgrades, v: NET_VERSION });
        this.setOnlineStatus(role === 'host' ? '🤝 Soupeř se připojuje...' : '🤝 Připojeno! Čekám, až hostitel spustí hru...', 'ok');
      });
      conn.on('data', (d) => { if (conn === this.conn) this.onNetData(d); });
      conn.on('close', () => { if (conn === this.conn) this.onNetLost(); });
      conn.on('error', () => { if (conn === this.conn) this.onNetLost(); });
    }

    onPeerError(err, role) {
      const t = err && err.type;
      if (t === 'unavailable-id' && role === 'host') { this.createRoom(); return; }
      const msg = {
        'peer-unavailable': '❌ Hra s tímto kódem neexistuje (nebo hostitel zavřel okno).',
        'network': '❌ Chyba sítě – zkontroluj připojení k internetu.',
        'server-error': '❌ Server pro spojení neodpovídá, zkus to za chvíli.',
        'socket-error': '❌ Server pro spojení neodpovídá, zkus to za chvíli.',
        'browser-incompatible': '❌ Tento prohlížeč online hru nepodporuje (zkus Chrome nebo Edge).',
        'webrtc': '❌ Přímé spojení selhalo – síť ho možná blokuje.'
      }[t] || `❌ Chyba spojení (${t || err})`;
      if (this.isRunning && this.gameMode === 'online') { this.onNetLost(); return; }
      this.setOnlineStatus(msg, 'err');
    }

    onNetLost() {
      const inGame = this.gameMode === 'online' && !this.inLobby;
      const hadRole = this.netRole;
      this.netClose(false);
      if (inGame) {
        this.returnToLobby();
        this.showToast('🔌 Soupeř se odpojil');
      } else if (hadRole) {
        this.$('onlineCodeBox').classList.add('hidden');
        this.setOnlineStatus('🔌 Spojení se ztratilo. Zkus vytvořit nový kód.', 'err');
      }
    }

    netClose(notify) {
      clearTimeout(this._joinTimeout);
      const conn = this.conn, peer = this.peer;
      if (notify && conn && conn.open) { try { conn.send({ t: 'bye' }); } catch (e) {} }
      this.conn = null;
      this.peer = null;
      this.netRole = null;
      this.roomCode = null;
      this.remoteHello = null;
      if (conn) setTimeout(() => { try { conn.close(); } catch (e) {} }, notify ? 150 : 0);
      if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) {} }, notify ? 200 : 0);
    }

    netSend(msg) {
      if (this.conn && this.conn.open) {
        try { this.conn.send(msg); } catch (e) {}
      }
    }

    onNetData(d) {
      if (!d || !d.t) return;
      const host = this.netRole === 'host', guest = this.netRole === 'guest';
      switch (d.t) {
        case 'hello':
          this.remoteHello = d;
          if (host) {
            this.setOnlineStatus('🎮 Soupeř připojen! Hra začíná...', 'ok');
            setTimeout(() => { if (this.netRole === 'host' && !this.isRunning) this.startOnlineMatch(); }, 1200);
          }
          break;
        case 'start': if (guest) this.beginOnline(d); break;
        case 's': if (guest) this.applySnapshot(d); break;
        case 'in': if (host) this.remoteMove = Math.max(-1, Math.min(1, +d.m || 0)); break;
        case 'drop': if (host && this.players[1]) this.dropPoop(this.players[1]); break;
        case 'ab': if (host && this.players[1]) this.triggerAbility(this.players[1]); break;
        case 'coins':
          if (guest) {
            this.coins += Math.max(0, Math.round(+d.n || 0));
            storage.setCoins(this.coins);
            this.updateCoinsDisplay();
            window.pigeonAudio.playCoin();
          }
          break;
        case 'stat':
          if (guest) {
            (Array.isArray(d.k) ? d.k : []).forEach(k => { if (k in storage.getStats()) storage.addStat(k); });
            storage.addXP(Math.max(0, +d.xp || 0));
          }
          break;
        case 'end': if (guest && this.isRunning) this.finishVersus(); break;
        case 'rematch': if (host && !this.isRunning) this.startOnlineMatch(); break;
        case 'full':
          this.netClose(false);
          this.setOnlineStatus('❌ Tahle hra už má dva hráče.', 'err');
          break;
        case 'bye': this.onNetLost(); break;
        case 'ping': this.netSend({ t: 'pong', ts: d.ts }); break;
        case 'pong': this.ping = Math.max(0, Math.round(performance.now() - (+d.ts || 0))); this.pingKind = 'peer'; break;
      }
    }

    sanitizeUp(u) {
      const c = (v) => Math.max(1, Math.min(5, Math.round(+v || 1)));
      u = u || {};
      return { speed: c(u.speed), reload: c(u.reload), coins: c(u.coins) };
    }

    startOnlineMatch() {
      const rh = this.remoteHello || {};
      const names = Object.keys(THEMES);
      const d = {
        t: 'start',
        theme: names[Math.floor(Math.random() * names.length)],
        seed: Math.floor(Math.random() * 1e9),
        h: { skin: this.equippedSkinId, ed: this.editFor(this.equippedSkinId), up: this.currentUpgrades },
        g: { skin: SKINS[rh.skin] ? rh.skin : 'classic', ed: sanitizeEdit(rh.ed), up: this.sanitizeUp(rh.up) }
      };
      this.netSend(d);
      this.beginOnline(d);
    }

    beginOnline(d) {
      this.onlineSetup = {
        s1: getAppearance(SKINS[d.h && d.h.skin] || SKINS.classic, d.h && d.h.ed), u1: this.sanitizeUp(d.h && d.h.up),
        s2: getAppearance(SKINS[d.g && d.g.skin] || SKINS.classic, d.g && d.g.ed), u2: this.sanitizeUp(d.g && d.g.up)
      };
      this.gameMode = 'online';
      this.levelHudBar.classList.add('hidden');
      this.setTheme(THEMES[d.theme] ? d.theme : 'day', d.seed);
      this.initRun();
    }

    requestRematch() {
      if (this.gameMode === 'online') {
        if (!this.netRole) { this.returnToLobby(); return; }
        if (this.netRole === 'host') {
          this.startOnlineMatch();
        } else {
          this.netSend({ t: 'rematch' });
          const rb = this.$('vsRematchBtn');
          rb.disabled = true;
          rb.textContent = '⏳ ČEKÁM NA HOSTITELE...';
        }
        return;
      }
      this.versusResultModal.classList.add('hidden');
      this.startDuo('versus');
    }

    sendSnapshot() {
      const r = (v) => Math.round(v * 100) / 100;
      const idOf = (e) => { if (!e.id) e.id = ++this.eid; return e; };
      this.eid = this.eid || 0;
      const msg = {
        t: 's',
        w: this.width, sky: this.skyY, gy: this.groundY,
        vt: r(this.versusTime), sm: r(this.slowMoTimer),
        p: this.players.map(pl => {
          const pg = pl.pigeon;
          return [r(pg.x), r(pg.y), r(pg.vx), pg.facingRight ? 1 : 0, r(pg.flapBoost), r(pg.tilt), r(pg.speedBoostTimer),
            pl.score, pl.ammo, r(pl.infiniteAmmoTimer), pl.combo, r(pl.abilityCooldown), pl.headshots];
        }),
        pd: this.pedestrians.map(e => packEntity(idOf(e))),
        cy: this.cyclists.map(e => packEntity(idOf(e))),
        po: this.poops.map(e => packEntity(idOf(e))),
        ef: this.activeAbilityEffects.map(e => ({ type: e.type, timer: r(e.timer), birds: e.birds })),
        ev: this.netEvents || []
      };
      this.netEvents = [];
      this.netSend(msg);
    }

    applySnapshot(s) {
      if (!this.isRunning || this.gameMode !== 'online') return;
      const sx = this.width / (s.w || this.width);
      const sy = (this.groundY - this.skyY) / ((s.gy - s.sky) || 1);
      const mx = (v) => v * sx;
      const my = (v) => this.skyY + (v - s.sky) * sy;

      this.versusTime = s.vt;
      this.slowMoTimer = s.sm;
      (s.p || []).forEach((a, i) => {
        const pl = this.players[i];
        if (!pl) return;
        const pg = pl.pigeon;
        pg.x = mx(a[0]); pg.y = my(a[1]); pg.vx = a[2] * sx; pg.facingRight = !!a[3];
        pg.flapBoost = a[4]; pg.tilt = a[5]; pg.speedBoostTimer = a[6];
        pl.score = a[7]; pl.ammo = a[8]; pl.infiniteAmmoTimer = a[9]; pl.combo = a[10]; pl.abilityCooldown = a[11]; pl.headshots = a[12];
      });
      const ground = (o) => {
        o.x = mx(o.x); o.groundY = my(o.groundY); o.baseGround = my(o.baseGround); o.speed *= sx;
        if (o.flyingHelmet) o.flyingHelmet = Object.assign({}, o.flyingHelmet, { x: mx(o.flyingHelmet.x), y: my(o.flyingHelmet.y), vx: o.flyingHelmet.vx * sx });
      };
      this.pedestrians = syncList(this.pedestrians, s.pd || [], Pedestrian, ground);
      this.cyclists = syncList(this.cyclists, s.cy || [], Cyclist, ground);
      this.poops = syncList(this.poops, s.po || [], Poop, (o) => { o.x = mx(o.x); o.y = my(o.y); o.vx *= sx; o.vy *= sy; o.gravity *= sy; });
      this.activeAbilityEffects = (s.ef || []).map(e => Object.assign({}, e, {
        birds: e.birds && e.birds.map(b => Object.assign({}, b, { x: mx(b.x), y: my(b.y), speed: b.speed * sx }))
      }));
      (s.ev || []).forEach(([type, d]) => {
        const m = Object.assign({}, d);
        ['x', 'x1', 'x2'].forEach(k => { if (typeof m[k] === 'number') m[k] = mx(m[k]); });
        ['y', 'y1', 'y2', 'g'].forEach(k => { if (typeof m[k] === 'number') m[k] = my(m[k]); });
        this.fx(type, m);
      });
      this.updateHUD();
      this.updateAmmoDisplay();
      this.updateAbilityHUD();
      this.updateVersusTimer();
    }

    // připojený hráč: hru nepočítá, jen plynule dopočítává pohyb mezi snímky od hostitele
    guestUpdate(dt, realDt) {
      if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 45);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - realDt * 2.5);
      this.clouds.forEach(c => {
        c.x += c.speed * dt;
        if (c.x > this.width + 60) c.x = -220 * c.scale;
      });
      this.updateAmbient(dt);

      this.players.forEach(pl => {
        const pg = pl.pigeon;
        pg.x = Math.max(40, Math.min(this.width - 40, pg.x + pg.vx * dt));
        pg.wingSpeed = 12 + Math.abs(pg.vx) / 40;
        pg.wingAngle += pg.wingSpeed * dt;
        pg.bobTimer += dt * 5;
        if (pg.flapBoost > 0) pg.flapBoost = Math.max(0, pg.flapBoost - dt * 25);
      });
      const avgX = this.players.reduce((s, p) => s + p.pigeon.x, 0) / Math.max(1, this.players.length);
      this.camX += (avgX - this.camX) * Math.min(1, dt * 2);

      this.pedestrians.forEach(p => p.update(dt));
      this.cyclists.forEach(c => c.update(dt));
      this.poops.forEach(p => p.update(dt));
      this.activeAbilityEffects.forEach(eff => {
        if (eff.birds) eff.birds.forEach(b => { b.x += b.speed * dt; b.wing = (b.wing || 0) + dt * 14; });
      });
      for (let i = this.speechBubbles.length - 1; i >= 0; i--) {
        const sb = this.speechBubbles[i];
        sb.timer -= dt;
        sb.y -= 15 * dt;
        if (sb.timer <= 0) this.speechBubbles.splice(i, 1);
      }
      this.updateFx(dt);

      this.versusTime = Math.max(0, this.versusTime - realDt);
      this.updateVersusTimer();

      // posílání vlastního pohybu hostiteli
      const m = Math.round(this.readLocalMove(this.localPl) * 100) / 100;
      this.netInTimer = (this.netInTimer || 0) + realDt;
      if (m !== this.lastSentMove || this.netInTimer > 0.25) {
        this.netSend({ t: 'in', m });
        this.lastSentMove = m;
        this.netInTimer = 0;
      }
    }

    updatePoops(dt) {
      for (let pIdx = this.poops.length - 1; pIdx >= 0; pIdx--) {
        const poop = this.poops[pIdx];
        const owner = poop.owner || this.players[0];
        poop.update(dt);

        if (poop.y >= this.groundY + 10) {
          this.fx('ground', { x: poop.x, y: this.groundY + 10 + Math.random() * 8, s: poop.skinType, m: poop.isMeteor, c: poop.isCannonball, big: poop.isCannonball || poop.isMeteor });

          if (poop.isCannonball || poop.isMeteor) {
            const radius = poop.isCannonball ? (poop.blastRadius || 180) : 60;
            this.pedestrians.forEach(p => {
              if (!p.knockedOut && Math.abs(p.x - poop.x) < radius) {
                p.knockOut();
                this.triggerKnockout(p.x, p.groundY - 15, p, owner);
              }
            });
            if (poop.isCannonball) this.cyclists.forEach(c => { if (Math.abs(c.x - poop.x) < (poop.blastRadius || 180) + 20) c.crash(this, owner); });
          }
          this.poops.splice(pIdx, 1);
          continue;
        }

        let hit = false;
        for (const cyc of this.cyclists) {
          if (cyc.crashed) continue;
          if (poop.intersects(cyc.getHeadBounds()) || poop.intersects(cyc.getBodyBounds())) {
            cyc.takeHit(this, owner);
            this.splats.push(new Splat(poop.x, poop.y, poop.skinType, cyc));
            this.poops.splice(pIdx, 1);
            hit = true;
            break;
          }
        }
        if (hit) continue;

        for (const ped of this.pedestrians) {
          if (ped.knockedOut || ped.abducted) continue;
          const headBounds = ped.getHeadBounds();
          const bodyBounds = ped.getBodyBounds();

          if (ped.panicking) {
            if (poop.intersects(headBounds) || poop.intersects(bodyBounds)) {
              ped.knockOut();
              this.triggerKnockout(poop.x, poop.y, ped, owner);
              this.poops.splice(pIdx, 1);
              hit = true;
              break;
            }
            continue;
          }
          if (poop.intersects(headBounds)) {
            ped.hitByPoop('head');
            this.triggerHeadshot(poop.x, poop.y, ped, owner);
            this.poops.splice(pIdx, 1);
            hit = true;
            break;
          }
          if (poop.intersects(bodyBounds)) {
            ped.hitByPoop('body');
            this.triggerBodyHit(poop.x, poop.y, ped, owner);
            this.poops.splice(pIdx, 1);
            hit = true;
            break;
          }
        }
        if (hit) continue;
        if (poop.y > this.height + 40) this.poops.splice(pIdx, 1);
      }
    }

    updateFx(dt) {
      for (let i = this.splats.length - 1; i >= 0; i--) {
        this.splats[i].update(dt);
        if (this.splats[i].alpha <= 0) this.splats.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].update(dt);
        if (this.particles[i].life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        this.floatingTexts[i].update(dt);
        if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
      }
      for (let i = this.lightnings.length - 1; i >= 0; i--) {
        this.lightnings[i].life -= dt;
        if (this.lightnings[i].life <= 0) this.lightnings.splice(i, 1);
      }
    }

    // ======================================================================
    // RENDER - GAME SCENE
    // ======================================================================
    render() {
      const ctx = this.ctx;
      const W = this.width, H = this.height, gy = this.groundY;
      const th = this.theme;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();

      if (this.screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
      }

      // sky
      ctx.drawImage(this.bgLayer.canvas, 0, 0, W, H);

      // clouds (behind skyline)
      this.clouds.forEach(cl => {
        const s = cl.scale;
        ctx.drawImage(cl.sprite.canvas, cl.x, cl.y, 200 * s, 100 * s);
      });

      // parallax layers
      const norm = (this.camX - W / 2) / (W / 2);
      ctx.drawImage(this.farLayer.canvas, -this.farPad - norm * 25, 0, this.farLayer.w, this.farLayer.h);
      const nearX = -this.nearPad - norm * 60;
      ctx.drawImage(this.nearLayer.canvas, nearX, 0, this.nearLayer.w, this.nearLayer.h);

      // antenna blinkers
      const blinkOn = (this.time * 1000) % 1200 < 500;
      this.antennas.forEach(a => {
        if (!blinkOn) return;
        const ax = a.x + nearX;
        if (ax < -10 || ax > W + 10) return;
        ctx.fillStyle = '#ff3b4d';
        ctx.beginPath(); ctx.arc(ax, a.y, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,60,80,0.25)';
        ctx.beginPath(); ctx.arc(ax, a.y, 7, 0, Math.PI * 2); ctx.fill();
      });

      // ground
      ctx.drawImage(this.groundLayer.canvas, 0, this.groundTop, this.groundLayer.w, this.groundLayer.h);

      // lamp poles + trees (back of sidewalk)
      this.drawLampPoles(ctx);
      this.trees.forEach(t => {
        const s = t.scale;
        ctx.drawImage(t.sprite.canvas, t.x - 65 * s, gy - 10 - 158 * s, 130 * s, 160 * s);
      });

      // splats on ground
      this.splats.forEach(s => s.render(ctx));

      // shadows of pigeons on the ground (helps aiming!)
      this.players.forEach(pl => {
        const pg = pl.pigeon;
        const sx = pg.x + pg.vx * 0.35;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.ellipse(sx, gy + 6, 20, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        if (this.isDuo) {
          ctx.strokeStyle = rgba(pl.color, 0.55);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx, gy + 6, 24, 6, 0, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // UFO beams
      this.pedestrians.forEach(p => {
        if (!p.abducted) return;
        const bg = ctx.createLinearGradient(p.x, 0, p.x, gy);
        bg.addColorStop(0, 'rgba(120,255,200,0.05)');
        bg.addColorStop(1, 'rgba(120,255,200,0.35)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.moveTo(p.x - 12, 0); ctx.lineTo(p.x + 12, 0); ctx.lineTo(p.x + 40, gy + 5); ctx.lineTo(p.x - 40, gy + 5); ctx.fill();
      });

      // characters sorted by depth
      const actors = [...this.pedestrians, ...this.cyclists].sort((a, b) => a.groundY - b.groundY);
      actors.forEach(a => a.render(ctx));

      // airstrike birds
      this.activeAbilityEffects.forEach(eff => {
        if (eff.type !== 'airstrike') return;
        eff.birds.forEach(b => {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(0.8, 0.8);
          drawDetailedPigeon(ctx, SKINS.mafia, b.wing || 0);
          ctx.restore();
        });
      });

      this.poops.forEach(p => p.render(ctx));

      // pigeons
      this.players.forEach(pl => {
        pl.pigeon.render(ctx, pl.infiniteAmmoTimer > 0 || pl.pigeon.speedBoostTimer > 0 ? pl.color : null);
        if (this.isDuo) this.drawPlayerTag(ctx, pl);
        if (this.slowMoTimer > 0 && pl.skin.id === 'agent') this.drawAimLine(ctx, pl.pigeon);
      });

      // lightning
      this.lightnings.forEach(l => this.drawLightning(ctx, l));

      // color grading
      if (th.tint) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = th.tint;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.restore();
      }

      // light (additive, after grading)
      this.drawLampGlows(ctx);
      this.renderAmbient(ctx);
      this.particles.forEach(pt => pt.render(ctx));

      if (this.slowMoTimer > 0.3) {
        ctx.fillStyle = 'rgba(0,200,255,0.08)';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.drawImage(this.vignette.canvas, 0, 0, W, H);

      // UI-ish world text on top
      this.speechBubbles.forEach(sb => this.drawSpeechBubble(sb));
      this.floatingTexts.forEach(ft => ft.render(ctx));

      ctx.restore();
    }

    drawLampPoles(ctx) {
      const gy = this.groundY;
      this.streetLamps.forEach(lamp => {
        const x = lamp.x;
        const pg = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
        pg.addColorStop(0, '#5b6370');
        pg.addColorStop(1, '#1e2228');
        ctx.fillStyle = pg;
        ctx.fillRect(x - 2.5, gy - 98, 5, 88);
        ctx.fillRect(x - 5, gy - 14, 10, 6);
        ctx.strokeStyle = '#2b3038';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(x, gy - 96);
        ctx.quadraticCurveTo(x + 4, gy - 108, x + 20, gy - 106);
        ctx.stroke();
        ctx.fillStyle = '#2b3038';
        ctx.beginPath();
        ctx.moveTo(x + 12, gy - 108); ctx.lineTo(x + 30, gy - 108); ctx.lineTo(x + 27, gy - 102); ctx.lineTo(x + 15, gy - 102);
        ctx.closePath(); ctx.fill();
        const on = this.theme.lampOn;
        ctx.fillStyle = on > 0 ? `rgba(255,240,200,${0.5 + on * 0.5})` : '#c8ccd2';
        ctx.fillRect(x + 15, gy - 102, 12, 2.5);
      });
    }

    drawLampGlows(ctx) {
      const on = this.theme.lampOn;
      if (!on) return;
      const gy = this.groundY;
      const [r, g, b] = this.theme.lampColor || [255, 214, 140];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.streetLamps.forEach(lamp => {
        const lx = lamp.x + 21, ly = gy - 101;
        const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, 34);
        halo.addColorStop(0, `rgba(${r},${g},${b},${0.75 * on})`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(lx - 34, ly - 34, 68, 68);

        const cone = ctx.createLinearGradient(0, ly, 0, gy + 20);
        cone.addColorStop(0, `rgba(${r},${g},${b},${0.22 * on})`);
        cone.addColorStop(1, `rgba(${r},${g},${b},${0.05 * on})`);
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(lx - 7, ly + 2); ctx.lineTo(lx + 7, ly + 2); ctx.lineTo(lx + 62, gy + 18); ctx.lineTo(lx - 62, gy + 18);
        ctx.closePath(); ctx.fill();

        const pool = ctx.createRadialGradient(lx, gy + 8, 0, lx, gy + 8, 80);
        pool.addColorStop(0, `rgba(${r},${g},${b},${0.22 * on})`);
        pool.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = pool;
        ctx.beginPath(); ctx.ellipse(lx, gy + 8, 80, 18, 0, 0, Math.PI * 2); ctx.fill();

        if (this.theme.wet) {
          const refl = ctx.createLinearGradient(0, gy + 34, 0, this.height);
          refl.addColorStop(0, `rgba(${r},${g},${b},${0.2 * on})`);
          refl.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = refl;
          ctx.fillRect(lx - 6, gy + 34, 12, this.height - gy - 34);
        }
      });
      ctx.restore();
    }

    drawPlayerTag(ctx, pl) {
      const pg = pl.pigeon;
      const y = pg.y - 46 + Math.sin(pg.bobTimer) * 4;
      ctx.save();
      ctx.font = `16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.roundRect(pg.x - 17, y - 15, 34, 20, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pg.x - 5, y + 5); ctx.lineTo(pg.x + 5, y + 5); ctx.lineTo(pg.x, y + 11);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.fillText(pl.label, pg.x, y);
      ctx.restore();
    }

    drawAimLine(ctx, pg) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 42, 95, 0.75)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pg.x, pg.y + 15);
      ctx.lineTo(pg.x + pg.vx * 0.45, this.groundY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff2a5f';
      ctx.beginPath();
      ctx.arc(pg.x + pg.vx * 0.45, this.groundY + 5, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawLightning(ctx, l) {
      const rng = mulberry32(Math.floor(l.seed + this.time * 30));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(255,60,80,0.5)' : 'rgba(255,230,240,0.95)';
        ctx.lineWidth = pass === 0 ? 8 : 2.5;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const jx = i === steps ? 0 : (rng() - 0.5) * 40;
          ctx.lineTo(l.x1 + (l.x2 - l.x1) * t + jx, l.y1 + (l.y2 - l.y1) * t);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSpeechBubble(sb) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.min(1, sb.timer * 3);
      ctx.font = `14px ${FONT}`;
      const tw = ctx.measureText(sb.text).width;
      const bw = tw + 18, bh = 24;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(sb.x - bw / 2, sb.y - bh, bw, bh, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sb.x - 5, sb.y - 1); ctx.lineTo(sb.x, sb.y + 7); ctx.lineTo(sb.x + 5, sb.y - 1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(sb.x - 4, sb.y - 3, 8, 3);
      ctx.fillStyle = '#e8173f';
      ctx.textAlign = 'center';
      ctx.fillText(sb.text, sb.x, sb.y - 7);
      ctx.restore();
    }

    // ======================================================================
    // RENDER - LOBBY SCENE (Fortnite-like stage)
    // ======================================================================
    buildLobbyBg() {
      const W = this.width, H = this.height;
      const L = makeLayer(W, H, this.dpr);
      const c = L.ctx;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#071443');
      g.addColorStop(0.45, '#1846b8');
      g.addColorStop(0.75, '#3fa0ff');
      g.addColorStop(1, '#8fd3ff');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // distant floating islands & city
      const rng = mulberry32(77);
      const horizon = H * 0.72;
      c.fillStyle = 'rgba(30, 70, 170, 0.55)';
      let x = -20;
      while (x < W + 20) {
        const bw = 20 + rng() * 50, bh = 40 + rng() * 120;
        c.fillRect(x, horizon - bh, bw, bh + 10);
        x += bw + rng() * 10;
      }
      c.fillStyle = 'rgba(60, 120, 230, 0.6)';
      x = -40;
      while (x < W + 40) {
        const bw = 30 + rng() * 60, bh = 20 + rng() * 70;
        c.fillRect(x, horizon - bh + 20, bw, bh);
        x += bw + rng() * 6;
      }
      // islands
      [[0.12, 0.3, 90], [0.88, 0.24, 70], [0.72, 0.42, 45], [0.3, 0.18, 40]].forEach(([fx, fy, s]) => {
        const ix = W * fx, iy = H * fy;
        c.fillStyle = 'rgba(40, 80, 170, 0.7)';
        c.beginPath();
        c.moveTo(ix - s, iy);
        c.quadraticCurveTo(ix, iy + s * 1.2, ix + s, iy);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(90, 200, 130, 0.65)';
        c.beginPath(); c.ellipse(ix, iy, s, s * 0.18, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(70, 170, 110, 0.6)';
        c.beginPath(); c.arc(ix - s * 0.3, iy - s * 0.2, s * 0.25, 0, Math.PI * 2); c.arc(ix + s * 0.2, iy - s * 0.25, s * 0.3, 0, Math.PI * 2); c.fill();
      });
      // cloud floor
      const cloudTh = { cloud: [235, 245, 255], cloudShade: [150, 190, 240] };
      for (let i = 0; i < 14; i++) {
        const sp = this.makeCloudSprite(rng, cloudTh);
        const s = 1.6 + rng() * 1.8;
        c.drawImage(sp.canvas, (i / 13) * W - 150 + (rng() - 0.5) * 80, H * 0.78 + rng() * 50, 200 * s, 100 * s);
      }
      const fade = c.createLinearGradient(0, H * 0.85, 0, H);
      fade.addColorStop(0, 'rgba(10,30,90,0)');
      fade.addColorStop(1, 'rgba(6,16,60,0.85)');
      c.fillStyle = fade;
      c.fillRect(0, H * 0.85, W, H * 0.15);
      this.lobbyBg = L;
    }

    renderLobby(dt) {
      const ctx = this.ctx;
      const W = this.width, H = this.height, t = this.time;
      if (!this.lobbyBg) this.buildLobbyBg();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // jemný parallax podle myši
      const lm = this.lobbyMouse || { x: 0, y: 0 };
      this.lobbyPar = this.lobbyPar || { x: 0, y: 0 };
      this.lobbyPar.x += (lm.x - this.lobbyPar.x) * Math.min(1, dt * 3);
      this.lobbyPar.y += (lm.y - this.lobbyPar.y) * Math.min(1, dt * 3);
      const px = this.lobbyPar.x, py = this.lobbyPar.y;
      ctx.drawImage(this.lobbyBg.canvas, -W * 0.02 - px * 14, -H * 0.02 - py * 8, W * 1.04, H * 1.04);

      // padající hvězdy
      if (!this.lobbyStars) this.lobbyStars = [];
      if (Math.random() < dt * 0.35) this.lobbyStars.push({ x: Math.random() * W * 0.8 + W * 0.2, y: Math.random() * H * 0.25, life: 1 });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = this.lobbyStars.length - 1; i >= 0; i--) {
        const st = this.lobbyStars[i];
        st.life -= dt * 1.4;
        st.x -= 520 * dt; st.y += 220 * dt;
        if (st.life <= 0) { this.lobbyStars.splice(i, 1); continue; }
        const sg = ctx.createLinearGradient(st.x, st.y, st.x + 90, st.y - 38);
        sg.addColorStop(0, `rgba(255,255,255,${st.life})`);
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = sg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(st.x + 90, st.y - 38); ctx.stroke();
      }
      ctx.restore();

      // pomalu plující mraky
      if (!this.lobbyClouds) {
        const rng = mulberry32(991);
        const th = { cloud: [235, 245, 255], cloudShade: [140, 180, 235] };
        this.lobbyClouds = Array.from({ length: 6 }, (_, i) => ({
          x: rng() * W, y: H * (0.08 + rng() * 0.35), s: 0.9 + rng() * 1.4, v: 6 + rng() * 10, a: 0.35 + rng() * 0.35,
          sprite: this.makeCloudSprite(rng, th)
        }));
      }
      this.lobbyClouds.forEach(cl => {
        cl.x += cl.v * dt;
        if (cl.x > W + 50) cl.x = -200 * cl.s;
        ctx.globalAlpha = cl.a;
        ctx.drawImage(cl.sprite.canvas, cl.x - px * 24, cl.y - py * 10, 200 * cl.s, 100 * cl.s);
      });
      ctx.globalAlpha = 1;

      const L = this.layoutLobby();
      const narrow = L.narrow;
      const cx = L.heroX;
      const s = L.s;
      const baseY = L.baseY;
      const skin = this.equippedLook;
      const tierCol = skin.aura || TIER_COLORS[skin.tier] || '#9fb3c8';

      // god rays
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, -40);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI / 2 + Math.sin(t * 0.25 + i * 1.7) * 0.5 + (i - 4) * 0.13;
        ctx.save();
        ctx.rotate(a - Math.PI / 2);
        const rg = ctx.createLinearGradient(0, 0, 0, H);
        rg.addColorStop(0, 'rgba(255,255,255,0.12)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(80 + i * 6, H); ctx.lineTo(-80 - i * 6, H); ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // hero back glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(cx, baseY - s * 25, 10, cx, baseY - s * 25, s * 75);
      glow.addColorStop(0, rgba(tierCol, 0.55));
      glow.addColorStop(1, rgba(tierCol, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(cx - s * 80, baseY - s * 100, s * 160, s * 160);
      ctx.restore();

      // sparkles
      if (this.lobbySparkles.length < 50 && Math.random() < 0.6) {
        this.lobbySparkles.push({ x: Math.random() * W, y: H + 10, v: 20 + Math.random() * 40, r: 1 + Math.random() * 2.2, ph: Math.random() * 10 });
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = this.lobbySparkles.length - 1; i >= 0; i--) {
        const p = this.lobbySparkles[i];
        p.y -= p.v * dt;
        p.ph += dt * 2;
        if (p.y < -10) { this.lobbySparkles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(200,235,255,${0.35 + 0.35 * Math.sin(p.ph)})`;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(p.ph) * 6, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // P2 platform
      const p2x = L.p2X;
      const p2Base = baseY + s * 6;
      const s2 = s * 0.72;
      if (this.lobbyHasP2) {
        this.drawLobbyPlatform(ctx, p2x, p2Base, s2, '#33e1ff', t + 1);
        this.lobbySwapP2 = Math.max(0, (this.lobbySwapP2 || 0) - dt * 3);
        this.drawLobbyPigeon(ctx, this.p2Look, p2x, p2Base, s2, t + 0.7, this.lobbySwapP2, false);
      } else {
        this.drawLobbyPlatform(ctx, p2x, p2Base, s2, '#ffffff', t + 1, true);
      }

      // hero platform
      this.drawLobbyPlatform(ctx, cx, baseY, s, tierCol, t);
      this.lobbySwap = Math.max(0, (this.lobbySwap || 0) - dt * 3);
      this.drawLobbyPigeon(ctx, skin, cx, baseY, s, t, this.lobbySwap, false);

      ctx.drawImage(this.vignette.canvas, 0, 0, W, H);
    }

    // Rozmístí pódia a jmenovky mezi levý panel a panel s módy
    layoutLobby() {
      const W = this.width, H = this.height;
      const narrow = W < 850;
      const plate = this.$('lobbyScreen').querySelector('.fn-hero-plate');
      const p2Slot = this.$('p2Slot');
      if (narrow) {
        if (this._lobbyLayoutKey !== 'narrow') {
          plate.style.left = ''; plate.style.width = '';
          p2Slot.style.left = ''; p2Slot.style.width = '';
          this._lobbyLayoutKey = 'narrow';
        }
        const s = Math.max(2, Math.min(W / 300, H / 190, 4)) * 0.85;
        return { narrow, s, heroX: W * 0.5, p2X: W * 0.18, baseY: H * 0.6 };
      }
      const aside = this.$('lobbyScreen').querySelector('.fn-left');
      const play = this.$('lobbyScreen').querySelector('.fn-play-area');
      const challengesShown = W >= 1200;
      const leftEdge = challengesShown ? aside.getBoundingClientRect().right + 10 : 140;
      const rightEdge = play.getBoundingClientRect().left - 10;
      const avail = Math.max(200, rightEdge - leftEdge);
      const heroX = leftEdge + avail * 0.66;
      const p2X = leftEdge + avail * 0.2;
      const s = Math.max(2, Math.min(W / 300, H / 190, 5.2, (avail * 0.36) / 44));
      const baseY = Math.min(H * 0.66, H - 176 - 21 * s);
      const plateW = Math.min(360, 2 * (rightEdge - heroX));
      const slotW = Math.max(150, Math.min(220, (heroX - plateW / 2 - 10 - p2X) * 2));
      const key = `${Math.round(heroX)}|${Math.round(plateW)}|${Math.round(p2X)}|${Math.round(slotW)}`;
      if (key !== this._lobbyLayoutKey) {
        plate.style.left = `${heroX}px`;
        plate.style.width = `${plateW}px`;
        p2Slot.style.left = `${p2X}px`;
        p2Slot.style.width = `${slotW}px`;
        this._lobbyLayoutKey = key;
      }
      return { narrow, s, heroX, p2X, baseY };
    }

    drawLobbyPlatform(ctx, x, y, s, color, t, ghost) {
      const rx = s * 52, ry = s * 12, depth = s * 9;
      ctx.save();
      if (ghost) ctx.globalAlpha = 0.35;
      // side
      const sg = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
      sg.addColorStop(0, '#1b2a5a');
      sg.addColorStop(0.5, '#33489a');
      sg.addColorStop(1, '#141f45');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(x, y + depth, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(x - rx, y);
      ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      // top
      const tg = ctx.createRadialGradient(x, y - ry * 0.3, 2, x, y, rx);
      tg.addColorStop(0, '#5b78d6');
      tg.addColorStop(0.7, '#2c3f86');
      tg.addColorStop(1, '#1f2e66');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      // rim glow
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.55 + 0.35 * Math.sin(t * 2.5);
      ctx.strokeStyle = rgba(color, ghost ? 0.5 : pulse);
      ctx.lineWidth = Math.max(2, s * 1.1);
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.98, ry * 0.98, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba(color, ghost ? 0.2 : 0.35 * pulse);
      ctx.lineWidth = s * 3;
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.98, ry * 0.98, 0, 0, Math.PI * 2); ctx.stroke();
      // inner rotating ring
      ctx.strokeStyle = rgba(color, ghost ? 0.15 : 0.35);
      ctx.lineWidth = Math.max(1, s * 0.5);
      ctx.setLineDash([s * 6, s * 4]);
      ctx.lineDashOffset = -t * s * 10;
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // front light strip
      const fg = ctx.createLinearGradient(0, y, 0, y + depth);
      fg.addColorStop(0, rgba(color, ghost ? 0.15 : 0.35));
      fg.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(x, y + depth, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(x - rx, y);
      ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawLobbyPigeon(ctx, skin, x, baseY, s, t, swap, flip) {
      const bob = Math.sin(t * 2) * s * 1.6;
      const pop = 1 + swap * 0.25;
      // shadow
      ctx.fillStyle = 'rgba(0,0,20,0.35)';
      ctx.beginPath(); ctx.ellipse(x, baseY, s * 22 * (1 - bob / (s * 20)), s * 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(x, baseY - s * 24 + bob);
      ctx.scale(s * pop * (flip ? -1 : 1), s * pop);
      ctx.rotate(Math.sin(t * 0.8) * 0.04);
      drawDetailedPigeon(ctx, skin, t * 4.5);
      ctx.restore();
      if (swap > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,255,255,${swap * 0.6})`;
        ctx.beginPath(); ctx.arc(x, baseY - s * 24, s * 40 * (1.2 - swap * 0.4), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // PIGEON ENTITY
  // ==========================================================================
  class Pigeon {
    constructor(x, y, skin, upgrades) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.baseMaxSpeed = 390;
      this.accel = 1250;
      this.friction = 0.88;
      this.facingRight = true;
      this.wingAngle = Math.random() * 6;
      this.wingSpeed = 12;
      this.flapBoost = 0;
      this.bobTimer = Math.random() * 6;
      this.speedBoostTimer = 0;
      this.tilt = 0;
      this.upgrades = upgrades || { speed: 1, reload: 1, coins: 1 };
      this.trail = [];
      this.setSkin(skin);
    }

    setSkin(skin) {
      this.skin = skin;
      const speedUpgradeBonus = 1.0 + (this.upgrades.speed - 1) * 0.10;
      this.speed = this.baseMaxSpeed * (skin.speedMult || 1.0) * speedUpgradeBonus;
    }

    update(dt, moveDir, screenWidth) {
      let curSpeed = this.speed;
      if (this.speedBoostTimer > 0) {
        this.speedBoostTimer -= dt;
        curSpeed *= 1.6;
      }
      if (moveDir !== 0) {
        this.vx += moveDir * this.accel * dt;
        this.facingRight = moveDir > 0;
      } else {
        this.vx *= Math.pow(this.friction, dt * 60);
      }
      this.vx = Math.max(-curSpeed, Math.min(curSpeed, this.vx));
      this.x += this.vx * dt;

      const margin = 40;
      if (this.x < margin) { this.x = margin; this.vx = 0; }
      if (this.x > screenWidth - margin) { this.x = screenWidth - margin; this.vx = 0; }

      const targetTilt = (this.vx / this.baseMaxSpeed) * 0.18;
      this.tilt += (Math.abs(targetTilt) - this.tilt) * Math.min(1, dt * 8);
      this.wingSpeed = 12 + Math.abs(this.vx) / 40;
      this.wingAngle += this.wingSpeed * dt;
      this.bobTimer += dt * 5;
      if (this.flapBoost > 0) this.flapBoost = Math.max(0, this.flapBoost - dt * 25);

      if (this.speedBoostTimer > 0) {
        this.trail.push({ x: this.x, y: this.y, life: 0.3 });
      }
      this.trail.forEach(p => p.life -= dt);
      this.trail = this.trail.filter(p => p.life > 0);
    }

    render(ctx, auraColor) {
      const bobY = Math.sin(this.bobTimer) * 4 - this.flapBoost;
      if (this.trail.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.trail.forEach(p => {
          ctx.fillStyle = `rgba(120,220,255,${p.life * 1.2})`;
          ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 18 * p.life * 3, 6, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.x, this.y + bobY);
      if (auraColor) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 50);
        g.addColorStop(0, rgba(auraColor, 0.45));
        g.addColorStop(1, rgba(auraColor, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-50, -50, 100, 100);
        ctx.restore();
      }
      if (!this.facingRight) ctx.scale(-1, 1);
      ctx.rotate(this.tilt);
      ctx.scale(1.25, 1.25);
      drawDetailedPigeon(ctx, this.skin, this.wingAngle);
      ctx.restore();
    }
  }

  // ==========================================================================
  // PIGEON ARTWORK (stínování, peří, duhový krk)
  // ==========================================================================
  function getPigeonPalette(skin) {
    if (skin._pal) return skin._pal;
    const body = skin.bodyColor, wing = skin.wingColor, neck = skin.neckColor;
    skin._pal = {
      body,
      bodyLight: shade(body, 0.3),
      bodyDark: shade(body, -0.38),
      belly: shade(body, 0.42),
      wing,
      wingLight: shade(wing, 0.22),
      wingDark: shade(wing, -0.32),
      neck,
      neckAlt: mix(neck, '#a55eea', 0.45),
      neckLight: shade(neck, 0.35),
      beak: skin.beakColor,
      beakDark: shade(skin.beakColor, -0.35),
      eye: skin.eyeColor || (skin.id === 'sith' ? '#ff1744' : skin.id === 'zombie' ? '#d4ff3b' : '#ff8a3d')
    };
    const morph = skin.morph && PIGEON_MORPHS.find(m => m.id === skin.morph);
    const pattern = skin.pattern || (morph && morph.checker ? 'checker' : morph && morph.pied ? 'pied' : 'bars');
    skin._pal.pattern = pattern;
    skin._pal.bars = (morph && morph.bars && pattern !== 'none') ? morph.bars : (pattern === 'none' || pattern === 'spots' ? null : 'rgba(15,15,25,0.55)');
    skin._pal.checker = pattern === 'checker';
    skin._pal.pied = pattern === 'pied';
    skin._pal.spots = pattern === 'spots';
    skin._pal.mark = skin.mark || 'none';
    return skin._pal;
  }

  function drawWing(ctx, pal, back) {
    const base = back ? pal.wingDark : pal.wing;
    ctx.lineJoin = 'round';
    // primary flight feathers
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate(-0.18 + i * 0.09);
      ctx.fillStyle = pal.mark === 'wingTips' ? shade(base, i % 2 ? -0.6 : -0.5) : (i % 2 ? shade(base, -0.22) : shade(base, -0.1));
      ctx.beginPath();
      ctx.ellipse(-15 - i * 1.6, 3, 13.5, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // covert (main wing)
    const g = ctx.createLinearGradient(0, -9, 0, 9);
    g.addColorStop(0, shade(base, 0.22));
    g.addColorStop(1, shade(base, -0.18));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.quadraticCurveTo(0, -11, -16, -4);
    ctx.quadraticCurveTo(-25, 2, -20, 7);
    ctx.quadraticCurveTo(-4, 10, 10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,22,0.45)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (!back && pal.checker) {
      // kropenaté (checker) peří
      ctx.fillStyle = 'rgba(20,20,30,0.38)';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const x = 4 - c * 5 - r * 2, y = -4 + r * 4;
          ctx.beginPath();
          ctx.moveTo(x, y - 1.6); ctx.lineTo(x + 1.8, y); ctx.lineTo(x, y + 1.6); ctx.lineTo(x - 1.8, y);
          ctx.fill();
        }
      }
    }
    if (!back && pal.spots) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      [[3, -4], [-3, -2], [-9, 0], [-14, 3], [0, 2], [-6, 4]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill(); });
    }
    if (!back && pal.bars) {
      ctx.strokeStyle = pal.bars;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1, -3); ctx.quadraticCurveTo(-7, 1, -11, 5);
      ctx.moveTo(-7, -4); ctx.quadraticCurveTo(-12, 0, -16, 4);
      ctx.stroke();
    }
    if (!back) {
      // scalloped highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, -4); ctx.quadraticCurveTo(0, -9, -14, -3.5);
      ctx.stroke();
    }
  }

  function drawDetailedPigeon(ctx, skin, wingAngle = 0) {
    const pal = getPigeonPalette(skin);
    const outline = 'rgba(10,12,22,0.5)';
    const flap = Math.sin(wingAngle);
    ctx.save();
    if (skin.aura) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
      const ag = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
      ag.addColorStop(0, rgba(skin.aura, 0.42 * pulse));
      ag.addColorStop(1, rgba(skin.aura, 0));
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.lineJoin = 'round';

    // TAIL
    const tg = ctx.createLinearGradient(-42, 0, -12, 0);
    tg.addColorStop(0, shade(pal.wingDark, -0.3));
    tg.addColorStop(0.25, pal.wingDark);
    tg.addColorStop(1, pal.wing);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-12, 1);
    ctx.quadraticCurveTo(-28, -3, -42, -1);
    ctx.lineTo(-44, 5);
    ctx.lineTo(-42, 11);
    ctx.quadraticCurveTo(-27, 14, -11, 12);
    ctx.closePath();
    ctx.fill();
    if (pal.mark === 'whiteTail') {
      ctx.fillStyle = 'rgba(250,250,248,0.92)';
      ctx.beginPath(); ctx.moveTo(-30, -2); ctx.lineTo(-42, -1); ctx.lineTo(-44, 5); ctx.lineTo(-42, 11); ctx.lineTo(-30, 13); ctx.quadraticCurveTo(-27, 5, -30, -2); ctx.fill();
    }
    ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-20, 5); ctx.lineTo(-42, 2); ctx.moveTo(-20, 7); ctx.lineTo(-43, 8); ctx.stroke();

    // FAR WING
    ctx.save();
    ctx.translate(-2, -2);
    ctx.rotate(-0.3 - flap * 0.55);
    drawWing(ctx, pal, true);
    ctx.restore();

    // FEET
    ctx.strokeStyle = '#d4606b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, 16); ctx.lineTo(-6, 22); ctx.lineTo(-10, 23);
    ctx.moveTo(-6, 22); ctx.lineTo(-3, 23.5);
    ctx.moveTo(5, 16); ctx.lineTo(5, 22); ctx.lineTo(1, 23);
    ctx.moveTo(5, 22); ctx.lineTo(8, 23.5);
    ctx.stroke();

    // BODY
    const bg = ctx.createRadialGradient(0, -6, 3, 0, 4, 27);
    bg.addColorStop(0, pal.bodyLight);
    bg.addColorStop(0.55, pal.body);
    bg.addColorStop(1, pal.bodyDark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 4, 22, 15.5, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.1; ctx.stroke();
    // belly
    const blg = ctx.createRadialGradient(6, 12, 1, 6, 12, 14);
    blg.addColorStop(0, rgba(pal.belly, 0.55));
    blg.addColorStop(1, rgba(pal.belly, 0));
    ctx.fillStyle = blg;
    ctx.beginPath(); ctx.ellipse(6, 11, 14, 7, 0, 0, Math.PI * 2); ctx.fill();

    if (pal.pied) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(-6, 8, 9, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -2, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    // NECK (iridescent)
    const shimmer = 0.5 + 0.5 * Math.sin(wingAngle * 0.25);
    const ng = ctx.createLinearGradient(4, -16, 20, 8);
    ng.addColorStop(0, pal.neck);
    ng.addColorStop(0.35 + shimmer * 0.3, pal.neckAlt);
    ng.addColorStop(1, shade(pal.neck, -0.25));
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.moveTo(3, -2);
    ctx.quadraticCurveTo(5, -15, 13, -18);
    ctx.lineTo(22, -7);
    ctx.quadraticCurveTo(23, 5, 14, 10);
    ctx.quadraticCurveTo(5, 9, 3, -2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(13, -6, 3, 6, 0.6, 0, Math.PI * 2); ctx.fill();

    // HEAD
    const hg = ctx.createRadialGradient(14, -15, 1.5, 17, -10, 11);
    hg.addColorStop(0, pal.bodyLight);
    hg.addColorStop(0.6, pal.body);
    hg.addColorStop(1, pal.bodyDark);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(17, -10, 9.5, 0, Math.PI * 2); ctx.fill();
    if (pal.mark === 'whiteHead' || pal.mark === 'darkHead') {
      ctx.fillStyle = pal.mark === 'whiteHead' ? 'rgba(250,250,248,0.9)' : 'rgba(20,20,28,0.7)';
      ctx.beginPath(); ctx.arc(17, -10, 9.5, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = outline; ctx.lineWidth = 1; ctx.stroke();

    // BEAK
    const bkg = ctx.createLinearGradient(25, -12, 25, -6);
    bkg.addColorStop(0, shade(pal.beak, 0.2));
    bkg.addColorStop(1, pal.beakDark);
    ctx.fillStyle = bkg;
    ctx.beginPath();
    ctx.moveTo(24.5, -12.8);
    ctx.quadraticCurveTo(31, -11.5, 34.5, -8.6);
    ctx.quadraticCurveTo(30, -6.8, 24.5, -6.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(25, -9); ctx.lineTo(33, -8.7); ctx.stroke();
    // cere
    ctx.fillStyle = 'rgba(246,242,232,0.95)';
    ctx.beginPath(); ctx.ellipse(25.6, -12, 2.6, 1.5, -0.25, 0, Math.PI * 2); ctx.fill();

    // EYE
    ctx.fillStyle = pal.eye;
    ctx.beginPath(); ctx.arc(20, -12, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(20.5, -12, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(21.3, -12.9, 0.8, 0, Math.PI * 2); ctx.fill();

    // NEAR WING
    ctx.save();
    ctx.translate(-3, 1);
    ctx.rotate(flap * 0.45 - 0.05);
    drawWing(ctx, pal, false);
    ctx.restore();

    drawAccessories(ctx, skin);
    ctx.restore();
  }

  function drawAccessories(ctx, skin) {
    const id = skin.id;
    ctx.save();
    if (id === 'agent') {
      ctx.fillStyle = '#050505';
      ctx.beginPath(); ctx.roundRect(16, -14.5, 10, 4.5, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(18, -14, 3, 1);
      ctx.fillStyle = '#d63031';
      ctx.beginPath(); ctx.moveTo(12, 2); ctx.lineTo(15.5, 14); ctx.lineTo(11, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(13, 3); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
    } else if (id === 'cyber') {
      ctx.shadowColor = '#00f3ff'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#00f3ff';
      ctx.fillRect(15, -14, 12, 3.5);
      ctx.fillRect(-8, -2, 3, 3); ctx.fillRect(-14, 4, 3, 3);
      ctx.strokeStyle = '#00f3ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-2, 0); ctx.lineTo(2, 6); ctx.stroke();
    } else if (id === 'ninja') {
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(9, -15.5, 16, 3.5);
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.quadraticCurveTo(2, -20, -4, -16); ctx.lineTo(0, -13); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -14); ctx.quadraticCurveTo(4, -12, -2, -9); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill();
    } else if (id === 'viking') {
      const hg = ctx.createLinearGradient(12, -24, 24, -15);
      hg.addColorStop(0, '#c8d0d6'); hg.addColorStop(1, '#6b767e');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(17, -15, 9.5, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f5e6c4';
      ctx.beginPath(); ctx.moveTo(9, -17); ctx.quadraticCurveTo(3, -22, 4, -30); ctx.quadraticCurveTo(8, -24, 12, -20); ctx.fill();
      ctx.beginPath(); ctx.moveTo(24, -17); ctx.quadraticCurveTo(30, -22, 30, -30); ctx.quadraticCurveTo(26, -24, 22, -20); ctx.fill();
    } else if (id === 'mafia') {
      ctx.fillStyle = '#1e2124';
      ctx.beginPath(); ctx.ellipse(17, -18.5, 10, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(11, -28, 12, 10, 3); ctx.fill();
      ctx.fillStyle = '#b71c1c'; ctx.fillRect(11, -21.5, 12, 2);
      ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.roundRect(16, -14.5, 10, 4.5, 1.5); ctx.fill();
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(31, -9, 9, 2.6);
      ctx.fillStyle = '#ff7043'; ctx.fillRect(39.5, -9, 1.5, 2.6);
    } else if (id === 'king') {
      const cg = ctx.createLinearGradient(10, -28, 24, -18);
      cg.addColorStop(0, '#fff3a0'); cg.addColorStop(1, '#d4a000');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(10, -17); ctx.lineTo(11, -27); ctx.lineTo(14.5, -21); ctx.lineTo(17, -29); ctx.lineTo(19.5, -21); ctx.lineTo(23, -27); ctx.lineTo(24, -17);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(17, -20, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'pirate') {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.moveTo(6, -18); ctx.quadraticCurveTo(17, -30, 28, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '6px sans-serif'; ctx.fillText('☠', 14.5, -20);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(20.3, -12, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(10, -16); ctx.lineTo(26, -10); ctx.stroke();
    } else if (id === 'astronaut') {
      ctx.fillStyle = 'rgba(150,220,255,0.25)';
      ctx.beginPath(); ctx.arc(18, -10, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#dfe6e9'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(13, -16, 3, 5, 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'rainbow') {
      ['#ff5e57', '#ffd32a', '#0be881', '#4bcffa'].forEach((cl, i) => {
        ctx.fillStyle = cl;
        ctx.beginPath(); ctx.moveTo(14 + i * 2, -17); ctx.quadraticCurveTo(18 + i * 3, -30 + i, 26 + i * 2, -27 + i * 2); ctx.lineTo(18 + i * 2, -16); ctx.closePath(); ctx.fill();
      });
    } else if (id === 'sith') {
      ctx.fillStyle = '#050505';
      ctx.beginPath(); ctx.arc(16, -10, 12.5, Math.PI * 0.62, Math.PI * 1.9); ctx.quadraticCurveTo(8, 0, 6, 4); ctx.fill();
      ctx.save();
      ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, 8); ctx.lineTo(26, 20); ctx.stroke();
      ctx.restore();
    } else if (id === 'alien') {
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(14, -18); ctx.quadraticCurveTo(10, -26, 8, -28); ctx.moveTo(19, -19); ctx.quadraticCurveTo(22, -27, 25, -29); ctx.stroke();
      ctx.fillStyle = '#b6ff3b';
      ctx.beginPath(); ctx.arc(8, -28, 2, 0, Math.PI * 2); ctx.arc(25, -29, 2, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'dragon') {
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.moveTo(12, -17); ctx.lineTo(5, -28); ctx.lineTo(15, -19); ctx.fill();
      ctx.beginPath(); ctx.moveTo(17, -19); ctx.lineTo(14, -31); ctx.lineTo(21, -19); ctx.fill();
      ctx.fillStyle = '#f39c12';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-14 + i * 7, -10); ctx.lineTo(-11 + i * 7, -16); ctx.lineTo(-8 + i * 7, -10); ctx.fill(); }
    } else if (id === 'gigachad') {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(15, -14.5, 12, 4.5, 1); ctx.fill();
      ctx.fillStyle = '#ffd700'; ctx.fillRect(16, -14, 3, 1);
      ctx.fillStyle = shade(skin.bodyColor, -0.2);
      ctx.beginPath(); ctx.moveTo(18, -4); ctx.lineTo(28, -4); ctx.lineTo(26, 2); ctx.lineTo(19, 2); ctx.closePath(); ctx.fill();
    } else if (skin.tier === 'cosmic' || skin.tier === 'mythic') {
      // aura sparkles for generated top-tier birds
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = skin.tier === 'cosmic' ? 'rgba(100,230,255,0.9)' : 'rgba(255,90,120,0.9)';
      [[-18, -14], [-26, 4], [8, -24]].forEach(([x, y]) => { ctx.fillRect(x - 2, y - 0.5, 4, 1); ctx.fillRect(x - 0.5, y - 2, 1, 4); });
    }
    ctx.restore();
  }

  function renderPigeonPreview(canvas, skin, scale = 1.0) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(canvas.width / 2, canvas.height / 2 + 28 * scale, 22 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 4 * scale);
    ctx.scale(scale, scale);
    drawDetailedPigeon(ctx, skin, 0.4);
    ctx.restore();
  }

  // ==========================================================================
  // CYCLIST ENTITY
  // ==========================================================================
  class Cyclist {
    constructor(x, groundY, walkingRight) {
      this.x = x;
      this.groundY = groundY;
      this.baseGround = groundY;
      this.walkingRight = walkingRight;
      this.speed = (125 + Math.random() * 45) * (walkingRight ? 1 : -1);
      this.hasHelmet = true;
      this.crashed = false;
      this.crashTimer = 0;
      this.pedalAngle = 0;
      this.flyingHelmet = null;
      this.floating = 0;
      this.height = 72;
      this.width = 54;
      this.bikeColor = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#ff7f50'][Math.floor(Math.random() * 6)];
      this.jerseyColor = ['#e84393', '#0984e3', '#00b894', '#fdcb6e', '#2d3436'][Math.floor(Math.random() * 5)];
      this.helmetColor = ['#f39c12', '#ecf0f1', '#e74c3c', '#2ecc71'][Math.floor(Math.random() * 4)];
      this.skinColor = ['#f5cd9f', '#e8b48a', '#c68a5e', '#8d5a3b'][Math.floor(Math.random() * 4)];
    }

    getHeadBounds() {
      if (this.crashed) return { x: 0, y: 0, width: 0, height: 0 };
      const r = 11;
      return { x: this.x - r + (this.walkingRight ? 6 : -6), y: this.groundY - 56 - r, width: r * 2, height: r * 2 + 4 };
    }

    getBodyBounds() {
      if (this.crashed) return { x: 0, y: 0, width: 0, height: 0 };
      return { x: this.x - this.width / 2, y: this.groundY - 52, width: this.width, height: 52 };
    }

    takeHit(game, pl) {
      if (this.crashed) return;
      if (this.hasHelmet) {
        this.hasHelmet = false;
        const earned = game.addCoins(20, pl);
        game.fx('helmet', { x: this.x, y: this.groundY - 70, n: earned });
        this.flyingHelmet = {
          x: this.x, y: this.groundY - 62,
          vx: (this.walkingRight ? -1 : 1) * 120 + (Math.random() - 0.5) * 60,
          vy: -240, angle: 0, rotSpeed: 10
        };
        this.speed *= 1.3;
      } else {
        this.crash(game, pl);
      }
    }

    crash(game, pl) {
      if (this.crashed) return;
      this.crashed = true;
      this.speed = 0;
      game.triggerCyclistCrash(this.x, this.groundY, this, pl);
    }

    update(dt) {
      if (this.floating > 0) {
        this.floating -= dt;
        this.groundY -= 40 * dt;
      } else if (this.groundY < this.baseGround) {
        this.groundY = Math.min(this.baseGround, this.groundY + 160 * dt);
      }
      if (!this.crashed) {
        this.x += this.speed * dt;
        this.pedalAngle += Math.abs(this.speed) * 0.08 * dt;
      } else {
        this.crashTimer += dt;
      }
      if (this.flyingHelmet) {
        const h = this.flyingHelmet;
        h.vy += 650 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.angle += h.rotSpeed * dt;
        if (h.y >= this.baseGround + 6) { h.y = this.baseGround + 6; h.vx *= 0.5; h.vy = 0; h.rotSpeed *= 0.9; }
      }
    }

    isOffscreen(screenWidth) {
      if (this.crashed && this.crashTimer > 6.0) return true;
      return (this.walkingRight && this.x > screenWidth + 100) || (!this.walkingRight && this.x < -100);
    }

    drawWheel(ctx, cx, cy, r) {
      ctx.strokeStyle = '#151515';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#a8b0b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, r - 2.6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(210,215,220,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = this.pedalAngle + (i * Math.PI) / 4;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * (r - 2.6), cy + Math.sin(a) * (r - 2.6));
      }
      ctx.stroke();
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    render(ctx) {
      ctx.save();

      if (this.flyingHelmet) {
        ctx.save();
        ctx.translate(this.flyingHelmet.x, this.flyingHelmet.y);
        ctx.rotate(this.flyingHelmet.angle);
        ctx.fillStyle = this.helmetColor;
        ctx.beginPath(); ctx.arc(0, 0, 9, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-6, -6, 2, 5); ctx.fillRect(-1, -8, 2, 7); ctx.fillRect(4, -6, 2, 5);
        ctx.restore();
      }

      // ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(this.x, this.baseGround + 1, this.crashed ? 34 : 30, 4, 0, 0, Math.PI * 2); ctx.fill();

      ctx.translate(this.x, this.groundY);
      if (!this.walkingRight) ctx.scale(-1, 1);

      if (this.crashed) {
        ctx.save();
        ctx.translate(-4, 2);
        ctx.rotate(-0.25);
        this.drawWheel(ctx, -20, -2, 12);
        ctx.restore();
        this.drawWheel(ctx, 14, -9, 12);
        ctx.strokeStyle = this.bikeColor;
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-2, -10); ctx.lineTo(14, -8); ctx.stroke();
        // rider lying
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.roundRect(-30, -5, 18, 6, 3); ctx.fill();
        ctx.fillStyle = this.jerseyColor;
        ctx.beginPath(); ctx.roundRect(-14, -7, 22, 9, 4); ctx.fill();
        ctx.fillStyle = this.skinColor;
        ctx.beginPath(); ctx.arc(14, -3, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(13, -6); ctx.lineTo(16, -3); ctx.moveTo(16, -6); ctx.lineTo(13, -3); ctx.stroke();
        const sa = Date.now() * 0.005;
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < 3; i++) {
          const a = sa + (i * Math.PI * 2) / 3;
          drawStar(ctx, 14 + Math.cos(a) * 13, -14 + Math.sin(a) * 4, 3);
        }
        ctx.restore();
        return;
      }

      const wr = 13;
      this.drawWheel(ctx, -18, -wr, wr);
      this.drawWheel(ctx, 20, -wr, wr);

      // frame
      const fg = ctx.createLinearGradient(0, -36, 0, -12);
      fg.addColorStop(0, shade(this.bikeColor, 0.3));
      fg.addColorStop(1, shade(this.bikeColor, -0.25));
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-18, -wr); ctx.lineTo(-2, -wr); ctx.lineTo(-6, -32); ctx.lineTo(-18, -wr);
      ctx.moveTo(-2, -wr); ctx.lineTo(14, -34); ctx.lineTo(-6, -32);
      ctx.moveTo(14, -34); ctx.lineTo(20, -wr);
      ctx.stroke();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(14, -34); ctx.lineTo(13, -40); ctx.quadraticCurveTo(18, -42, 19, -38); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.roundRect(-13, -36, 13, 3.5, 1.5); ctx.fill();
      // crank
      const ca = this.pedalAngle * 1.3;
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-2, -wr, 3.5, 0, Math.PI * 2); ctx.stroke();

      // legs (far + near)
      const legPos = (phase) => ({ x: -2 + Math.cos(ca + phase) * 6, y: -wr + Math.sin(ca + phase) * 6 });
      const drawLeg = (phase, col) => {
        const foot = legPos(phase);
        const hip = { x: -6, y: -36 };
        const kx = (hip.x + foot.x) / 2 + 7, ky = (hip.y + foot.y) / 2 - 2;
        ctx.strokeStyle = col;
        ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(kx, ky); ctx.lineTo(foot.x, foot.y); ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.fillRect(foot.x - 3, foot.y - 1.5, 7, 3);
      };
      drawLeg(Math.PI, '#1e272e');
      drawLeg(0, '#2c3e50');

      // torso + head (leaning forward)
      ctx.save();
      ctx.translate(-4, -40);
      ctx.rotate(0.35);
      const jg = ctx.createLinearGradient(-6, 0, 8, 0);
      jg.addColorStop(0, shade(this.jerseyColor, 0.2));
      jg.addColorStop(1, shade(this.jerseyColor, -0.25));
      ctx.fillStyle = jg;
      ctx.beginPath(); ctx.roundRect(-6, -14, 14, 19, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-6, -6, 14, 2);
      // arm
      ctx.strokeStyle = this.skinColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(10, -3); ctx.lineTo(15, 0); ctx.stroke();
      // head
      const hg = ctx.createRadialGradient(8, -23, 1, 10, -20, 9);
      hg.addColorStop(0, shade(this.skinColor, 0.2));
      hg.addColorStop(1, shade(this.skinColor, -0.15));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(10, -20, 8.5, 0, Math.PI * 2); ctx.fill();
      if (this.hasHelmet) {
        const hl = ctx.createLinearGradient(0, -32, 0, -20);
        hl.addColorStop(0, shade(this.helmetColor, 0.3));
        hl.addColorStop(1, shade(this.helmetColor, -0.2));
        ctx.fillStyle = hl;
        ctx.beginPath();
        ctx.moveTo(0, -21); ctx.quadraticCurveTo(2, -33, 13, -31); ctx.quadraticCurveTo(21, -28, 20, -21); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(6, -29, 2, 5); ctx.fillRect(10, -30, 2, 6); ctx.fillRect(14, -29, 2, 5);
      } else {
        ctx.fillStyle = '#3d2b1f';
        ctx.beginPath(); ctx.arc(9, -23, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      }
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.roundRect(11, -21.5, 7, 3, 1); ctx.fill();
      ctx.restore();

      ctx.restore();
    }
  }

  function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ==========================================================================
  // PEDESTRIAN ENTITY
  // ==========================================================================
  const SKIN_TONES = ['#f5cd9f', '#eab88f', '#d39a6a', '#a8714a', '#7a4a2e', '#f1d6bf'];
  const HAIR_COLORS = ['#2d1b10', '#4a2f1d', '#8a5a2b', '#d9b26b', '#1a1a1a', '#b5452c'];

  class Pedestrian {
    constructor(x, groundY, walkingRight) {
      this.x = x;
      this.groundY = groundY;
      this.baseGround = groundY;
      this.walkingRight = walkingRight;
      this.speed = (35 + Math.random() * 45) * (walkingRight ? 1 : -1);
      this.walkTimer = Math.random() * 10;
      this.panicking = false;
      this.knockedOut = false;
      this.knockTimer = 0;
      this.hitSpot = null;
      this.floating = 0;
      this.abducted = false;

      const types = ['business', 'casual', 'runner', 'grandma', 'lady', 'tourist'];
      this.type = types[Math.floor(Math.random() * types.length)];
      if (this.type === 'runner') this.speed *= 1.6;
      else if (this.type === 'grandma') this.speed *= 0.65;

      this.height = 68;
      this.width = 24;
      const shirts = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#34495e', '#e84393', '#16a085'];
      this.shirtColor = shirts[Math.floor(Math.random() * shirts.length)];
      this.skinColor = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
      this.hairColor = this.type === 'grandma' ? '#dfe6e9' : HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
      this.pantsColor = ['#2c3e50', '#34495e', '#3d3d3d', '#5d4037', '#1e3a5f'][Math.floor(Math.random() * 5)];
      this.shoeColor = this.type === 'runner' ? '#ff4757' : ['#1a1a1a', '#5d4037', '#ecf0f1'][Math.floor(Math.random() * 3)];
      if (this.type === 'business') { this.shirtColor = ['#2d3436', '#34495e', '#4a4a5a'][Math.floor(Math.random() * 3)]; this.pantsColor = this.shirtColor; }
      this.hasBag = this.type === 'lady' || (this.type === 'business' && Math.random() < 0.6);
    }

    getHeadBounds() {
      if (this.knockedOut) return { x: 0, y: 0, width: 0, height: 0 };
      const r = 11;
      const cy = this.groundY - this.height + r;
      return { x: this.x - r, y: cy - r, width: r * 2, height: r * 2 + 4 };
    }

    getBodyBounds() {
      if (this.knockedOut) return { x: 0, y: 0, width: 0, height: 0 };
      const r = 11;
      return { x: this.x - this.width / 2, y: this.groundY - this.height + r * 2, width: this.width, height: this.height - r * 2 };
    }

    hitByPoop(type) {
      if (this.knockedOut) return;
      this.panicking = true;
      this.hitSpot = type;
      this.speed = (this.walkingRight ? 1 : -1) * 220;
    }

    knockOut() {
      this.knockedOut = true;
      this.panicking = false;
      this.speed = 0;
    }

    update(dt) {
      if (this.abducted) {
        this.groundY -= 150 * dt;
        return;
      }
      if (this.floating > 0) {
        this.floating -= dt;
        this.groundY -= 40 * dt;
      } else if (this.groundY < this.baseGround) {
        this.groundY = Math.min(this.baseGround, this.groundY + 160 * dt);
      }
      if (!this.knockedOut) {
        this.x += this.speed * dt;
        this.walkTimer += dt * (this.panicking ? 18 : 8);
      } else {
        this.knockTimer += dt;
      }
    }

    isOffscreen(screenWidth) {
      if (this.abducted && this.groundY < -80) return true;
      if (this.knockedOut && this.knockTimer > 6.0) return true;
      return (this.walkingRight && this.x > screenWidth + 80) || (!this.walkingRight && this.x < -80);
    }

    render(ctx) {
      // shadow on the real ground (even when floating)
      const air = this.baseGround - this.groundY;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, 0.3 - air / 400)})`;
      ctx.beginPath(); ctx.ellipse(this.x, this.baseGround + 1, this.knockedOut ? 22 : 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.translate(this.x, this.groundY);
      if (!this.walkingRight) ctx.scale(-1, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (this.knockedOut) {
        this.renderKnocked(ctx);
        ctx.restore();
        return;
      }

      const sw = Math.sin(this.walkTimer);
      const legSwing = sw * 9;
      const bounce = Math.abs(Math.cos(this.walkTimer)) * 1.5;
      const wob = this.panicking ? Math.sin(this.walkTimer * 2) * 3 : 0;
      const hunch = this.type === 'grandma' ? 3 : 0;
      const bodyTop = -50 - bounce + wob * 0.3;

      // legs
      const drawLeg = (dir, col) => {
        const hipX = dir * 2.5;
        const fx = hipX + dir * legSwing;
        const kx = hipX + dir * legSwing * 0.4 + 2;
        ctx.strokeStyle = col;
        ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(hipX, -26 - bounce); ctx.lineTo(kx, -13); ctx.lineTo(fx, -2); ctx.stroke();
        ctx.fillStyle = this.shoeColor;
        ctx.beginPath(); ctx.roundRect(fx - 3, -4, 9, 4, 2); ctx.fill();
      };
      drawLeg(-1, shade(this.pantsColor, -0.25));
      if (this.type === 'lady') {
        // dress
        const dg = ctx.createLinearGradient(-12, 0, 12, 0);
        dg.addColorStop(0, shade(this.shirtColor, 0.15));
        dg.addColorStop(1, shade(this.shirtColor, -0.25));
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.moveTo(-7, bodyTop + 16); ctx.lineTo(7, bodyTop + 16); ctx.lineTo(11 + sw, -14); ctx.lineTo(-11 + sw, -14); ctx.closePath(); ctx.fill();
      }
      drawLeg(1, this.pantsColor);

      // back arm
      const armSwing = Math.cos(this.walkTimer) * 9;
      const shoulderY = bodyTop + 5;
      ctx.strokeStyle = shade(this.shirtColor, -0.3);
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (this.panicking) { ctx.moveTo(-3, shoulderY); ctx.lineTo(-10, shoulderY - 12 + Math.sin(this.walkTimer * 3) * 5); }
      else { ctx.moveTo(-2, shoulderY); ctx.lineTo(-armSwing * 0.6 - 1, shoulderY + 20); }
      ctx.stroke();

      // torso
      ctx.save();
      ctx.translate(0, 0);
      ctx.rotate(hunch * 0.04);
      const tg = ctx.createLinearGradient(-8, 0, 8, 0);
      tg.addColorStop(0, shade(this.shirtColor, 0.22));
      tg.addColorStop(0.6, this.shirtColor);
      tg.addColorStop(1, shade(this.shirtColor, -0.3));
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.roundRect(-8, bodyTop, 16, 27, [6, 6, 3, 3]); ctx.fill();
      if (this.type === 'business') {
        ctx.fillStyle = '#ecf0f1';
        ctx.beginPath(); ctx.moveTo(-2, bodyTop); ctx.lineTo(4, bodyTop); ctx.lineTo(1, bodyTop + 9); ctx.fill();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.moveTo(0, bodyTop + 1); ctx.lineTo(2.5, bodyTop + 1); ctx.lineTo(3, bodyTop + 13); ctx.lineTo(1, bodyTop + 15); ctx.lineTo(-0.5, bodyTop + 13); ctx.fill();
      } else if (this.type === 'runner') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `9px ${FONT}`;
        ctx.fillText('42', -5, bodyTop + 15);
      } else if (this.type === 'grandma') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 3; i++) ctx.fillRect(-1, bodyTop + 5 + i * 6, 2, 2);
      } else if (this.type === 'tourist') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        [[-4, 6], [3, 12], [-3, 18], [4, 3]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(fx, bodyTop + fy, 2, 0, Math.PI * 2); ctx.fill(); });
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-5, bodyTop + 1); ctx.lineTo(3, bodyTop + 12); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.fillRect(1, bodyTop + 11, 7, 5);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-8, bodyTop + 23, 16, 2.5);
      ctx.restore();

      // neck + head
      const headY = -58 - bounce + wob + hunch;
      ctx.fillStyle = shade(this.skinColor, -0.15);
      ctx.fillRect(-2.5, headY + 6, 5, 6);
      const hg = ctx.createRadialGradient(-2, headY - 3, 1, 0, headY, 11);
      hg.addColorStop(0, shade(this.skinColor, 0.18));
      hg.addColorStop(1, shade(this.skinColor, -0.18));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, headY, 10, 0, Math.PI * 2); ctx.fill();
      // nose & ear
      ctx.fillStyle = shade(this.skinColor, -0.1);
      ctx.beginPath(); ctx.arc(9.5, headY + 1, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-2, headY + 1, 2, 0, Math.PI * 2); ctx.fill();

      // hair / hats
      ctx.fillStyle = this.hairColor;
      if (this.type === 'grandma') {
        ctx.beginPath(); ctx.arc(-1, headY - 3, 9.5, Math.PI * 0.9, Math.PI * 2.05); ctx.fill();
        ctx.beginPath(); ctx.arc(-8, headY - 6, 5, 0, Math.PI * 2); ctx.fill();
      } else if (this.type === 'lady') {
        ctx.beginPath(); ctx.arc(-1, headY - 2, 10.5, Math.PI * 0.85, Math.PI * 2.1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-10, headY - 2); ctx.quadraticCurveTo(-14, headY + 10, -6, headY + 14); ctx.lineTo(-4, headY + 2); ctx.fill();
        ctx.fillStyle = '#fd79a8';
        ctx.beginPath(); ctx.ellipse(0, headY - 9, 15, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, headY - 12, 8, 5, 0, Math.PI, 0); ctx.fill();
      } else if (this.type === 'business') {
        ctx.beginPath(); ctx.arc(-1, headY - 3, 10, Math.PI * 0.95, Math.PI * 2.02); ctx.fill();
        ctx.fillStyle = '#1e1e24';
        ctx.beginPath(); ctx.ellipse(0, headY - 9, 13, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(-8, headY - 18, 16, 9, 2); ctx.fill();
      } else if (this.type === 'runner') {
        ctx.beginPath(); ctx.arc(-1, headY - 3, 10, Math.PI * 0.95, Math.PI * 2.02); ctx.fill();
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(-10, headY - 7, 20, 3.5);
      } else if (this.type === 'tourist') {
        ctx.fillStyle = '#f5deb3';
        ctx.beginPath(); ctx.ellipse(0, headY - 8, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, headY - 10, 8, 5, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(-8, headY - 10, 16, 1.6);
      } else {
        ctx.beginPath(); ctx.arc(-1, headY - 3, 10, Math.PI * 0.92, Math.PI * 2.05); ctx.fill();
        ctx.beginPath(); ctx.arc(4, headY - 9, 4, 0, Math.PI * 2); ctx.fill();
      }

      // face
      if (this.panicking) {
        ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(3, headY - 3); ctx.lineTo(7, headY + 1); ctx.moveTo(7, headY - 3); ctx.lineTo(3, headY + 1); ctx.stroke();
        ctx.fillStyle = '#5a1a1a';
        ctx.beginPath(); ctx.ellipse(6, headY + 5, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(5, headY - 1.5, 2.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(5.8, headY - 1.3, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = shade(this.skinColor, -0.45); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(4, headY + 5); ctx.quadraticCurveTo(6, headY + 6, 8, headY + 5); ctx.stroke();
        if (this.type === 'grandma') {
          ctx.strokeStyle = '#555'; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(5.5, headY - 1.5, 3, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // front arm
      ctx.strokeStyle = shade(this.shirtColor, 0.05);
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      let handX, handY;
      if (this.panicking) {
        ctx.moveTo(3, shoulderY); handX = 11; handY = shoulderY - 14 - Math.sin(this.walkTimer * 3) * 5;
        ctx.lineTo(handX, handY);
      } else {
        ctx.moveTo(2, shoulderY); handX = armSwing * 0.6 + 2; handY = shoulderY + 20;
        ctx.quadraticCurveTo(armSwing * 0.3 + 3, shoulderY + 11, handX, handY);
      }
      ctx.stroke();
      ctx.fillStyle = this.skinColor;
      ctx.beginPath(); ctx.arc(handX, handY, 2.4, 0, Math.PI * 2); ctx.fill();
      if (this.hasBag && !this.panicking) {
        ctx.fillStyle = this.type === 'lady' ? '#8e44ad' : '#5d4037';
        ctx.beginPath(); ctx.roundRect(handX - 4, handY + 1, 9, 8, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(handX - 2, handY + 1); ctx.quadraticCurveTo(handX + 0.5, handY - 2, handX + 3, handY + 1); ctx.stroke();
      }
      if (this.type === 'grandma' && !this.panicking) {
        ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(handX + 3, 0); ctx.stroke();
      }

      // poop splat on target
      if (this.panicking) {
        const sy = this.hitSpot === 'head' ? headY - 8 : bodyTop + 10;
        const sx = this.hitSpot === 'head' ? 1 : 0;
        ctx.fillStyle = '#f7f7f2';
        ctx.beginPath(); ctx.ellipse(sx, sy, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx - 3, sy + 4, 1.6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx + 3, sy + 3, 1.3, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a9a5b';
        ctx.beginPath(); ctx.arc(sx + 1, sy, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    renderKnocked(ctx) {
      ctx.fillStyle = this.pantsColor;
      ctx.beginPath(); ctx.roundRect(-20, -5, 18, 6, 3); ctx.fill();
      ctx.fillStyle = this.shoeColor;
      ctx.fillRect(-24, -6, 4, 6);
      const tg = ctx.createLinearGradient(0, -8, 0, 2);
      tg.addColorStop(0, shade(this.shirtColor, 0.2));
      tg.addColorStop(1, shade(this.shirtColor, -0.25));
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.roundRect(-3, -8, 22, 9, 4); ctx.fill();
      ctx.fillStyle = this.skinColor;
      ctx.beginPath(); ctx.arc(25, -4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.hairColor;
      ctx.beginPath(); ctx.arc(27, -5, 7, -Math.PI * 0.4, Math.PI * 0.6); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(22, -8); ctx.lineTo(25, -5); ctx.moveTo(25, -8); ctx.lineTo(22, -5); ctx.stroke();
      ctx.fillStyle = '#f7f7f2';
      ctx.beginPath(); ctx.ellipse(8, -7, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a9a5b';
      ctx.beginPath(); ctx.arc(9, -7, 2.4, 0, Math.PI * 2); ctx.fill();
      const sa = Date.now() * 0.006;
      ctx.fillStyle = '#ffd700';
      for (let i = 0; i < 3; i++) {
        const a = sa + (i * Math.PI * 2) / 3;
        drawStar(ctx, 25 + Math.cos(a) * 13, -16 + Math.sin(a) * 4, 3);
      }
    }
  }

  // ==========================================================================
  // POOP ENTITY
  // ==========================================================================
  const POOP_COLORS = { gold: '#ffd700', cyber: '#00f3ff', zombie: '#2ecc71', dragon: '#ff7a1a', sith: '#ff1744', normal: '#f5f6f0' };

  class Poop {
    constructor(x, y, vx, skin, owner) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = 75;
      this.gravity = 780;
      this.radius = skin.poopType === 'rainbow' ? 10 : 7;
      this.skinType = skin.poopType;
      this.owner = owner || null;
      this.isCannonball = false;
      this.isMeteor = false;
      this.trail = [];
      this.rot = Math.random() * 6;
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += dt * 6;
      this.trail.push({ x: this.x, y: this.y, alpha: 0.8 });
      if (this.trail.length > (this.isMeteor ? 12 : 6)) this.trail.shift();
      this.trail.forEach(t => t.alpha -= dt * 2.5);
    }

    intersects(rect) {
      const closestX = Math.max(rect.x, Math.min(this.x, rect.x + rect.width));
      const closestY = Math.max(rect.y, Math.min(this.y, rect.y + rect.height));
      const dx = this.x - closestX;
      const dy = this.y - closestY;
      return (dx * dx + dy * dy) < (this.radius * this.radius);
    }

    render(ctx) {
      ctx.save();
      const glowy = this.skinType !== 'normal' || this.isMeteor;
      if (glowy) ctx.globalCompositeOperation = 'lighter';
      this.trail.forEach((t, i) => {
        if (t.alpha <= 0) return;
        ctx.fillStyle = this.getTrailColor(t.alpha * 0.8);
        ctx.beginPath();
        ctx.arc(t.x, t.y, this.radius * (0.3 + 0.5 * (i / this.trail.length)), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      ctx.translate(this.x, this.y);

      if (this.isCannonball) {
        const cg = ctx.createRadialGradient(-6, -6, 2, 0, 0, this.radius);
        cg.addColorStop(0, '#666'); cg.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.quadraticCurveTo(5, -this.radius - 6, 2, -this.radius - 10); ctx.stroke();
        ctx.fillStyle = Math.random() < 0.5 ? '#ffeb3b' : '#ff5722';
        ctx.beginPath(); ctx.arc(2, -this.radius - 11, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }

      if (this.isMeteor) {
        ctx.globalCompositeOperation = 'lighter';
        const mg = ctx.createRadialGradient(0, 0, 1, 0, 0, this.radius * 2.2);
        mg.addColorStop(0, 'rgba(255,240,180,1)');
        mg.addColorStop(0.4, 'rgba(255,120,20,0.8)');
        mg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }

      const angle = Math.atan2(this.vy, this.vx) - Math.PI / 2;
      ctx.rotate(angle);
      const r = this.radius;

      if (glowy) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
        gg.addColorStop(0, this.getTrailColor(0.5));
        gg.addColorStop(1, this.getTrailColor(0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      let fill;
      if (this.skinType === 'rainbow') {
        fill = ctx.createLinearGradient(-r, -r, r, r);
        fill.addColorStop(0, '#ff7675');
        fill.addColorStop(0.5, '#ffd700');
        fill.addColorStop(1, '#00f3ff');
      } else {
        const base = POOP_COLORS[this.skinType] || POOP_COLORS.normal;
        fill = ctx.createRadialGradient(-r * 0.3, r * 0.1, 0.5, 0, 0, r * 1.6);
        fill.addColorStop(0, shade(base, 0.5));
        fill.addColorStop(0.6, base);
        fill.addColorStop(1, shade(base, -0.25));
      }
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.quadraticCurveTo(-r * 0.7, -r * 1.2, 0, -r * 1.9);
      ctx.quadraticCurveTo(r * 0.7, -r * 1.2, r, 0);
      ctx.closePath();
      ctx.fill();
      if (this.skinType === 'normal') {
        const cg = ctx.createRadialGradient(0, 1, 0, 0, 1, r * 0.55);
        cg.addColorStop(0, '#4a5a2a');
        cg.addColorStop(1, '#6f7d45');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(0, 1, r * 0.48, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.18, r * 0.35, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    getTrailColor(alpha) {
      if (this.isMeteor) return `rgba(255,130,30,${alpha})`;
      if (this.skinType === 'gold') return `rgba(255,215,0,${alpha})`;
      if (this.skinType === 'cyber') return `rgba(0,243,255,${alpha})`;
      if (this.skinType === 'rainbow') return `rgba(253,121,168,${alpha})`;
      if (this.skinType === 'dragon') return `rgba(255,122,26,${alpha})`;
      if (this.skinType === 'zombie') return `rgba(46,204,113,${alpha})`;
      if (this.skinType === 'sith') return `rgba(255,23,68,${alpha})`;
      return `rgba(245,246,250,${alpha * 0.45})`;
    }
  }

  // ==========================================================================
  // SPLAT ENTITY
  // ==========================================================================
  class Splat {
    constructor(x, y, skinType, attachedTarget = null) {
      this.x = x;
      this.y = y;
      this.skinType = skinType;
      this.attachedTarget = attachedTarget;
      this.alpha = 1.0;
      this.decay = 0.1;
      this.radius = 10 + Math.random() * 7;
      this.dots = [];
      for (let i = 0; i < 7; i++) {
        const rad = Math.random() * Math.PI * 2;
        const dist = this.radius * (0.8 + Math.random() * 0.9);
        this.dots.push({ x: Math.cos(rad) * dist, y: Math.sin(rad) * dist * 0.35, r: 1.2 + Math.random() * 2.6 });
      }
    }

    update(dt) { this.alpha -= this.decay * dt; }

    render(ctx) {
      if (this.attachedTarget) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.translate(this.x, this.y);
      const color = POOP_COLORS[this.skinType] || (this.skinType === 'rainbow' ? '#fd79a8' : '#f5f6f0');
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(1, 1.5, this.radius, this.radius * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, 0, this.radius, this.radius * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      this.dots.forEach(d => { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); });
      if (this.skinType === 'normal' || !this.skinType) {
        ctx.fillStyle = '#7d8a4e';
        ctx.beginPath(); ctx.ellipse(1, 0, this.radius * 0.4, this.radius * 0.15, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(-this.radius * 0.35, -this.radius * 0.08, this.radius * 0.25, this.radius * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================================================
  // PARTICLES
  // ==========================================================================
  class Particle {
    constructor(x, y, color, shape = 'circle') {
      this.x = x;
      this.y = y;
      this.color = color;
      this.shape = shape;
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 240;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed - 60;
      this.gravity = 400;
      this.life = 0.6 + Math.random() * 0.4;
      this.size = 3 + Math.random() * 5;
      this.rot = Math.random() * 6;
      this.vr = (Math.random() - 0.5) * 10;

      if (shape === 'ring') { this.vx = this.vy = 0; this.gravity = 0; this.life = 0.6; this.size = 10; }
      else if (shape === 'dust') { this.vx = (Math.random() - 0.5) * 30; this.vy = -20; this.gravity = 0; this.life = 0.9; this.size = 12; }
      else if (shape === 'smoke') { this.vx = (Math.random() - 0.5) * 40; this.vy = -20 - Math.random() * 30; this.gravity = -10; this.life = 1.2; this.size = 14 + Math.random() * 16; }
      else if (shape === 'ember') { this.vy = -150 - Math.random() * 250; this.gravity = 500; this.size = 2 + Math.random() * 3; }
      else if (shape === 'confetti') { this.vx = (Math.random() - 0.5) * 120; this.vy = 60 + Math.random() * 120; this.gravity = 60; this.life = 2.5 + Math.random() * 1.5; this.size = 4 + Math.random() * 4; }
      else if (shape === 'drop') { this.vx = (Math.random() - 0.5) * 60; this.vy = -60 - Math.random() * 60; this.gravity = 500; this.life = 0.3; this.size = 1.5; }
      this.maxLife = this.life;
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.vr * dt;
      this.life -= dt;
      if (this.shape === 'ring') this.size += dt * 480;
      if (this.shape === 'dust' || this.shape === 'smoke') this.size += dt * 30;
      if (this.shape === 'confetti') this.vx *= 0.99;
    }

    render(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      switch (this.shape) {
        case 'star':
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = this.color;
          ctx.rotate(this.rot);
          drawStar(ctx, 0, 0, this.size);
          break;
        case 'ring':
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = this.color;
          ctx.lineWidth = 6 * alpha + 1;
          ctx.beginPath(); ctx.ellipse(0, 0, this.size, this.size * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'dust':
        case 'smoke':
          ctx.fillStyle = this.color;
          ctx.globalAlpha = alpha * 0.6;
          ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'ember':
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'confetti':
          ctx.rotate(this.rot);
          ctx.fillStyle = this.color;
          ctx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2 * (0.5 + 0.5 * Math.abs(Math.sin(this.rot * 2))));
          break;
        case 'drop':
          ctx.fillStyle = this.color;
          ctx.fillRect(-0.75, -2, 1.5, 3);
          break;
        default:
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.arc(0, 0, this.size * (this.shape === 'splat' ? 0.6 : 1), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ==========================================================================
  // FLOATING TEXTS
  // ==========================================================================
  class FloatingText {
    constructor(x, y, text, color, fontSize = 20, isBig = false) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.fontSize = fontSize;
      this.isBig = isBig;
      this.life = 1.1;
      this.maxLife = 1.1;
      this.vy = -60;
    }

    update(dt) {
      this.y += this.vy * dt;
      this.life -= dt;
    }

    render(ctx) {
      ctx.save();
      const t = 1 - this.life / this.maxLife;
      const alpha = Math.max(0, Math.min(1, this.life / this.maxLife * 2));
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(pop, pop);
      ctx.font = `${this.fontSize}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = this.isBig ? 6 : 4;
      ctx.strokeText(this.text, 0, 0);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
  });

})();
