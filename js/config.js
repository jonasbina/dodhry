// ============================================================
//  DOD Hry – konfigurace
// ============================================================

// 1) Firebase: vlož sem config z Firebase Console
//    (Project settings → Your apps → Web app → SDK setup → Config).
//    Když je apiKey prázdný, portál běží v DEMO režimu jen v tomhle prohlížeči (localStorage).
export const firebaseConfig = {
  apiKey: 'AIzaSyCmRdXz_LeYf8GK7qCm9uipxCdCjvk9YhM',
  authDomain: 'dodhry-ferenczbald.firebaseapp.com',
  projectId: 'dodhry-ferenczbald',
  storageBucket: 'dodhry-ferenczbald.firebasestorage.app',
  messagingSenderId: '866412011887',
  appId: '1:866412011887:web:6e1c0c43539f03ad34489a',
  measurementId: 'G-E0YP7P8M15',
};

// 2) Výchozí nastavení (admin je může změnit v admin.html – uloží se do databáze).
export const DEFAULT_SETTINGS = {
  target: 100,          // kolik bodů je potřeba
  adminPin: '2026',     // PIN do adminu (není to žádná bezpečnost, jen aby tam neklikali návštěvníci)
  idleLogoutMin: 10,    // automatické odhlášení po X minutách nečinnosti (0 = vypnuto)
  title: 'DOD Hry',
};

// 3) Body za čas: +1 bod za každou aktivní minutu ve hře, max. MINUTE_CAP na hru a hráče.
export const MINUTE_POINTS = 1;
export const MINUTE_CAP = 10;
// Konec hry se započítá, jen když od začátku / posledního konce uběhlo aspoň tolik sekund
// (aby nešlo farmit body okamžitým umíráním). Výhra se počítá vždy.
export const MIN_RUN_SECONDS = 40;

// 4) Hry. `points(result, prev)` dostane výsledek z bridge.js a vrací body za konec hry.
const krosPts = (score) => Math.min(30, Math.floor(Math.sqrt(score || 0) / 12));

export const GAMES = [
  {
    id: 'nocni-velka-cena',
    title: 'Noční Velká cena',
    author: 'Jakub Sibera',
    group: 'IT kroužek',
    genre: 'Závody · 3D',
    blurb: 'Noční okruhy F1, startovní světla, pit stop a garáž s vylepšeními. Tři kola proti pěti soupeřům.',
    controls: 'Šipky / WASD · C kamera · R restart',
    path: 'games/nocni-velka-cena/index.html',
    cover: 'f1',
    maxPoints: 30,
    rule: 'Za dojetí závodu: 1. místo 30 b, 2. 24 b, 3. 20 b, 4. 16 b, 5. 12 b, dál 10 b.',
    points: (r) => [30, 24, 20, 16, 12][r.position - 1] ?? 10,
  },
  {
    id: 'horde-survivor',
    title: 'Crimson Horde: Survivors',
    author: 'David Veselý',
    group: 'SIN-2027a',
    genre: 'Roguelite · přežití',
    blurb: 'Hrdina střílí sám, ty jen uhýbáš hordám. Sbírej duše, vybírej perky a prober se přes 10 zón s bossy.',
    controls: 'WASD / šipky',
    path: 'games/horde-survivor/index.html',
    cover: 'horde',
    maxPoints: 40,
    rule: 'Za konec hry 4 b + 4 b za každou další zónu (max 30). Výhra nad Karmínovým vládcem 40 b.',
    points: (r) => (r.win ? 40 : Math.min(30, 4 + (Math.max(1, r.stage) - 1) * 4)),
  },
  {
    id: 'stadium-defense',
    title: 'Stadium Defense',
    author: 'Vít Černý',
    group: 'SIN-2027a',
    genre: 'Tower defense',
    blurb: 'Rozestav sportovce kolem atletického oválu a ubraň zlatý pohár před 15 vlnami fanoušků a výtržníků.',
    controls: 'Myš · 1–5 výběr · U upgrade · N další vlna',
    path: 'games/stadium-defense/index.html',
    cover: 'stadium',
    maxPoints: 40,
    rule: 'Za konec hry 3 b + 2 b za každou vlnu (max 30). Ubráněných všech 15 vln 40 b.',
    points: (r) => (r.win ? 40 : Math.min(30, 3 + (r.wave || 0) * 2)),
  },
  {
    id: 'halovy-kros',
    title: 'Halový Kros',
    author: 'Teodor Titz',
    group: 'IT kroužek',
    genre: 'Motokros · triky',
    blurb: 'Supercross v hale: skoky, backflipy, frontflipy a komba. Čím větší skóre jízdy, tím víc bodů.',
    controls: 'Šipky / WASD · Esc pauza a konec jízdy',
    path: 'games/halovy-kros/index.html',
    cover: 'kros',
    maxPoints: 30,
    rule: 'Za ukončenou jízdu podle skóre (10 000 ≈ 8 b, 40 000 ≈ 16 b, 130 000 = 30 b).',
    // Jízdu jde ukončit a pak pokračovat dál – počítáme jen přírůstek od posledního konce.
    points: (r, prev) => {
      const before = prev && r.score >= prev.score ? krosPts(prev.score) : 0;
      return Math.max(0, krosPts(r.score) - before);
    },
    cumulative: true,
  },
];

export const gameById = (id) => GAMES.find((g) => g.id === id);
