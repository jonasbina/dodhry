// Hry na portálu a pravidla bodování.
// `points(result, prev)` dostane výsledek z public/bridge.js a vrátí body za konec hry.

export type Result = { win?: boolean; stage?: number; wave?: number; score?: number; position?: number; kills?: number };

export type Game = {
  id: string;
  title: string;
  author: string;
  group: string;
  genre: string;
  blurb: string;
  controls: string;
  path: string;
  maxPoints: number;
  rule: string;
  /** jak se hra ukončí, aby se body připsaly */
  finish: string;
  /** přehled bodů: co udělat → kolik bodů */
  howTo: [string, string][];
  /** barva pro grafy a akcenty (ze zemité palety DESIGN.md) */
  tone: string;
  points: (r: Result, prev: Result | null) => number;
  /** skóre se v rámci jedné jízdy sčítá – počítá se jen přírůstek */
  cumulative?: boolean;
};

// +1 bod za aktivní minutu, max MINUTE_CAP na hru a hráče
export const MINUTE_POINTS = 1;
export const MINUTE_CAP = 10;
// konec hry se počítá až po tolika sekundách hraní (výhra vždy)
export const MIN_RUN_SECONDS = 40;

const krosPts = (score = 0) => Math.min(30, Math.floor(Math.sqrt(score) / 12));

export const GAMES: Game[] = [
  {
    id: 'nocni-velka-cena',
    title: 'Noční Velká cena',
    author: 'Jakub Sibera',
    group: 'IT kroužek',
    genre: 'Závody',
    blurb: 'Formule na nočních okruzích. Startovní světla, pit stop, garáž s vylepšeními a tři kola proti pěti soupeřům.',
    controls: 'Šipky nebo WASD · C kamera · R restart',
    path: '/games/nocni-velka-cena/index.html',
    maxPoints: 30,
    rule: 'Dojeď závod. Body podle umístění.',
    finish: 'Body se připíšou, když projedeš cílem posledního kola.',
    howTo: [['1. místo', '30 b'], ['2. místo', '24 b'], ['3. místo', '20 b'], ['4. místo', '16 b'], ['5. místo', '12 b'], ['6. místo', '10 b']],
    tone: 'var(--gold)',
    points: (r) => [30, 24, 20, 16, 12][(r.position ?? 6) - 1] ?? 10,
  },
  {
    id: 'horde-survivor',
    title: 'Crimson Horde',
    author: 'David Veselý',
    group: 'SIN-2027a',
    genre: 'Přežití',
    blurb: 'Hrdina střílí sám, ty jen uhýbáš hordám. Sbíráš duše, vybíráš vylepšení a postupuješ deseti zónami s bossy.',
    controls: 'WASD nebo šipky',
    path: '/games/horde-survivor/index.html',
    maxPoints: 40,
    rule: 'Přežij co nejdál. Každá zóna, do které se dostaneš, přidá 4 body.',
    finish: 'Body se připíšou, když hra skončí (hrdina padne nebo vyhraješ).',
    howTo: [['Padneš v 1. zóně', '4 b'], ['Každá další zóna', '+4 b'], ['Nejvíc bez výhry', '30 b'], ['Porazíš posledního bosse', '40 b']],
    tone: 'var(--clay)',
    points: (r) => (r.win ? 40 : Math.min(30, 4 + (Math.max(1, r.stage ?? 1) - 1) * 4)),
  },
  {
    id: 'stadium-defense',
    title: 'Stadium Defense',
    author: 'Vít Černý',
    group: 'SIN-2027a',
    genre: 'Strategie',
    blurb: 'Rozestav sportovce kolem atletického oválu a ubraň zlatý pohár před patnácti vlnami fanoušků.',
    controls: 'Myš · 1–5 výběr · U vylepšit · N další vlna',
    path: '/games/stadium-defense/index.html',
    maxPoints: 40,
    rule: 'Ubraň co nejvíc vln. Každá vlna přidá 2 body.',
    finish: 'Body se připíšou, když hra skončí (pohár padne nebo ubráníš všech 15 vln).',
    howTo: [['Za odehranou hru', '3 b'], ['Každá vlna', '+2 b'], ['Nejvíc bez výhry', '30 b'], ['Ubráníš všech 15 vln', '40 b']],
    tone: 'var(--olive)',
    points: (r) => (r.win ? 40 : Math.min(30, 3 + (r.wave ?? 0) * 2)),
  },
  {
    id: 'halovy-kros',
    title: 'Halový kros',
    author: 'Teodor Titz',
    group: 'IT kroužek',
    genre: 'Triky',
    blurb: 'Motokros v hale. Skoky, salta a komba – čím vyšší skóre jízdy, tím víc bodů.',
    controls: 'Šipky nebo WASD · Esc pauza a konec jízdy',
    path: '/games/halovy-kros/index.html',
    maxPoints: 30,
    rule: 'Dělej skoky a salta. Čím vyšší skóre jízdy, tím víc bodů.',
    finish: 'Body se připíšou, až jízdu ukončíš: Esc → Ukončit jízdu.',
    howTo: [['Skóre 10 000', '8 b'], ['Skóre 40 000', '16 b'], ['Skóre 90 000', '25 b'], ['Skóre 130 000 a víc', '30 b']],
    tone: 'var(--ochre)',
    points: (r, prev) => Math.max(0, krosPts(r.score) - (prev ? krosPts(prev.score) : 0)),
    cumulative: true,
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);
