// Logika přehrávače (Player.astro): otevření hry na celou obrazovku a připisování bodů.
import { gameById, MINUTE_POINTS, MINUTE_CAP, MIN_RUN_SECONDS, type Game, type Result } from './games';
import { award, type Player, type Settings } from './db';
import { markActive } from './session';
import { $, esc, fmt, bodu, toast } from './ui';

let me: Player | null = null;
let game: Game | null = null;
let earned = 0, activeSec = 0, lastEndAt = 0;
let prev: Result | null = null;
let homeUrl = '/';

const player = () => $('player');
const frame = () => $<HTMLIFrameElement>('pFrame');

export function updatePlayer(p: Player, s: Settings) {
  me = p;
  $('pPts').textContent = fmt(p.points);
  $('pTarget').textContent = fmt(s.target);
}

const goFullscreen = () => {
  const el = player();
  if (document.fullscreenElement) return;
  el.requestFullscreen?.({ navigationUI: 'hide' })
    // Chrome: Esc patří hře (pauza v Halovém krosu); z celé obrazovky se odchází podržením Esc
    .then(() => (navigator as any).keyboard?.lock?.(['Escape']))
    .catch(() => {});
};

/** Otevře hru. Volat přímo z kliknutí, jinak prohlížeč nepovolí celou obrazovku. */
export function openGame(id: string, opts: { push?: boolean } = {}) {
  const g = gameById(id);
  if (!g) return;
  game = g; earned = 0; activeSec = 0; prev = null; lastEndAt = Date.now();
  $('pTitle').textContent = g.title;
  $('pEarned').textContent = '+0';
  document.querySelectorAll<HTMLElement>('[data-rules]').forEach((r) => (r.hidden = true));
  $('pRulesBtn').setAttribute('aria-expanded', 'false');
  $('pIntro').hidden = true;
  player().hidden = false;
  document.body.style.overflow = 'hidden';
  goFullscreen();
  // hra může převzít jméno z portálu (Bílý Kopec tím přeskočí vlastní registraci)
  frame().src = me ? `${g.path}?hrac=${encodeURIComponent(me.name)}&k=${encodeURIComponent(me.key)}` : g.path;
  frame().focus();
  if (opts.push) history.pushState({ game: id }, '', `/hra/${id}/`);
  document.title = `${g.title} · DOD hry`;
}

export function closeGame() {
  if (!game) return;
  game = null;
  frame().src = 'about:blank';
  player().hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.title = 'DOD hry';
}

async function give(pts: number, reason: 'minute' | 'run' | 'win') {
  if (!me || !game || pts <= 0) return;
  earned += pts;
  $('pEarned').textContent = `+${fmt(earned)}`;
  try {
    await award(me, game.id, pts, reason);
    if (reason !== 'minute') toast(`<b>+${pts}</b><span>${bodu(pts)} za ${esc(game.title)}</span>`);
  } catch (e) {
    console.error(e);
    toast('Body se nepodařilo uložit. Zkontroluj připojení.');
  }
}

/** Napojí ovládání přehrávače. `standalone` = stránka /hra/<id>/ (hra čeká na kliknutí). */
export function initPlayer({ standalone = false } = {}) {
  homeUrl = standalone ? '/' : location.pathname;

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!game || !me || !m || m.source !== 'dodhry' || e.source !== frame().contentWindow) return;
    markActive();
    if (m.type === 'dodhry:active') {
      activeSec += 5;
      if (activeSec >= 60) {
        activeSec -= 60;
        if ((me.games?.[game.id]?.minutes || 0) < MINUTE_CAP) give(MINUTE_POINTS, 'minute');
      }
    }
    if (m.type === 'dodhry:end' && m.result) {
      const r: Result = m.result;
      const secs = (Date.now() - lastEndAt) / 1000;
      // kumulativní skóre: nová jízda (skóre kleslo) začíná od nuly
      const base = game.cumulative && prev && (r.score ?? 0) >= (prev.score ?? 0) ? prev : null;
      const pts = Math.max(0, Math.round(game.points(r, base)));
      const minSecs = game.minRunSeconds ?? MIN_RUN_SECONDS;
      const runs = me.games?.[game.id]?.runs || 0;
      if (game.runCap && runs >= game.runCap) {
        toast(`V téhle hře už máš maximum bodů za ${game.runCap}× dohrání. Body za minuty běží dál.`);
      } else if (!r.win && !game.cumulative && secs < minSecs) {
        toast(`Hra byla moc krátká. Body se počítají od ${minSecs >= 120 ? `${Math.round(minSecs / 60)} minut` : `${minSecs} sekund`} hraní.`);
      } else {
        give(pts, r.win ? 'win' : 'run');
      }
      prev = r;
      lastEndAt = Date.now();
    }
  });

  $('pRulesBtn').addEventListener('click', () => {
    if (!game) return;
    const box = document.querySelector<HTMLElement>(`[data-rules="${game.id}"]`)!;
    box.hidden = !box.hidden;
    $('pRulesBtn').setAttribute('aria-expanded', String(!box.hidden));
  });
  $('pFs').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : goFullscreen()));

  $('pBack').addEventListener('click', (e) => {
    if (standalone) return; // obyčejný odkaz na úvod
    e.preventDefault();
    if (history.state?.game) history.back(); else { closeGame(); history.replaceState(null, '', homeUrl); }
  });
  window.addEventListener('popstate', (e) => {
    if (standalone) return;
    if (e.state?.game) openGame(e.state.game); else closeGame();
  });

  if (standalone) {
    const id = player().dataset.start!;
    game = gameById(id)!;
    $('pStart').addEventListener('click', () => openGame(id));
    $('pStart').focus();
  }
}
