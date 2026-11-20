// Hry na portálu a pravidla bodování.
// `points(result, prev)` dostane výsledek z public/bridge.js a vrátí body za konec hry.

export type Result = {
  win?: boolean; stage?: number; wave?: number; score?: number; position?: number; kills?: number;
  dayEnd?: number; levelDone?: number; level?: number; quest?: number; stars?: number;
};

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
  /** kolikrát nejvýš může hráč v této hře dostat body za konec (např. 3 dny) */
  runCap?: number;
  /** vlastní minimální doba hraní před koncem, v sekundách (0 = vždy) */
  minRunSeconds?: number;
  /** nejvýš tolik bodů za výsledky v této hře (bez bodů za minuty) */
  cap?: number;
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
  {
    id: 'bily-kopec',
    title: 'Bílý Kopec',
    author: 'Ondra Pivokonský',
    group: '',
    genre: 'Simulace',
    blurb: 'Staráš se o lyžařské středisko v Tyrolsku. Upravuješ sjezdovky, pouštíš lanovky, platíš zaměstnance a vybíráš pokladny.',
    controls: 'Klikni do hry, myš = pohled · WASD chůze · F akce · E kniha · H mapa',
    path: '/games/bily-kopec/index.html',
    maxPoints: 30,
    rule: 'Veď středisko celý den. Když v 16:30 lanovky končí, dostaneš body.',
    finish: 'Den se počítá, když u něj hraješ aspoň 3 minuty. Body nejvýš za 3 dny.',
    howTo: [['Odehraný den (do 16:30)', '10 b'], ['Nejvíc za 3 dny', '30 b']],
    tone: 'var(--sage)',
    points: () => 10,
    runCap: 3,
    minRunSeconds: 180,
  },
  {
    id: 'kaktus',
    title: 'Kaktus: Srdce pouště',
    author: '',
    group: '',
    genre: 'Akce · plošinovka',
    blurb: 'Kaktusový pistolník bojuje přes přístav, moře, bažinu, důl, step a pevnost, aby zachránil Srdce pouště.',
    controls: 'Šipky nebo WASD · mezerník skok · J útok · K těžký útok · Q střelba',
    path: '/games/kaktus/index.html',
    maxPoints: 40,
    rule: 'Dokonči úroveň. Každá dokončená úroveň přidá 10 bodů.',
    finish: 'Body se připíšou na výsledkové obrazovce po úrovni, nebo když padneš.',
    howTo: [['Dokončená úroveň', '10 b'], ['Padneš', '3 b'], ['Nejvíc celkem', '40 b']],
    tone: 'var(--ochre)',
    points: (r) => (r.levelDone ? 10 : 3),
    cap: 40,
  },
  {
    id: 'lovec-z-hurecka',
    title: 'Lovec z Hůrecka',
    author: '',
    group: '',
    genre: 'Hra na hrdiny · 3D',
    blurb: 'Probudíš se ve stodole a nic neumíš. Ve vsi Hůrka sháníš práci, plníš úkoly, učíš se u mistrů a bojuješ s krysami i kňoury.',
    controls: 'Klikni do hry, myš = pohled · WASD · F mluvit a sebrat · X tasit · I inventář · J deník',
    path: '/games/lovec-z-hurecka/index.html',
    maxPoints: 40,
    rule: 'Plň úkoly ve vsi a sbírej zkušenosti.',
    finish: 'Body se připíšou hned, když splníš úkol nebo zakázku, nebo postoupíš na další úroveň.',
    howTo: [['Splněný úkol nebo zakázka', '10 b'], ['Nová úroveň', '5 b'], ['Nejvíc celkem', '40 b']],
    tone: 'var(--forest)',
    points: (r) => (r.quest ? 10 : 5),
    cap: 40,
    minRunSeconds: 0,
  },
  {
    id: 'holubi-bombardovani',
    title: 'Holubí bombardování',
    author: 'Domixcz',
    group: '',
    genre: 'Arkáda',
    blurb: 'Jsi holub nad městem a trefuješ chodce a cyklisty. Sto levelů v pěti světech, obchod s holuby a vylepšení.',
    controls: 'A / D let · S nebo mezerník shodit · E schopnost',
    path: '/games/holubi-bombardovani/index.html',
    maxPoints: 40,
    rule: 'Splň level v kampani. Čím víc hvězd, tím víc bodů.',
    finish: 'Body se připíšou, když level splníš, nebo když ti vyprší čas.',
    howTo: [['Level za 3 ⭐', '10 b'], ['Level za 2 ⭐', '7 b'], ['Level za 1 ⭐', '5 b'], ['Vypršel čas', '2 b'], ['Nejvíc celkem', '40 b']],
    tone: 'var(--gold-soft)',
    points: (r) => (r.levelDone ? [5, 5, 7, 10][Math.min(3, r.stars ?? 1)] : 2),
    cap: 40,
  },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);
