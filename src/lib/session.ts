// Přihlášený hráč v tomhle prohlížeči + živá data o něm a o nastavení.
import { getPlayer, watchPlayer, watchSettings, touch, DEFAULT_SETTINGS, type Player, type Settings } from './db';

const KEY = 'dodhry:me';

export const getSession = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setSession = (k: string | null) => {
  try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch {}
  document.documentElement.dataset.auth = k ? 'in' : 'out';
};

export function logout(reason = '') {
  setSession(null);
  try { if (reason) sessionStorage.setItem('dodhry:bye', reason); } catch {}
  location.href = '/';
}

type Listener = (me: Player, s: Settings) => void;

/**
 * Pro stránky jen pro přihlášené: přesměruje na úvod, když nikdo přihlášený není,
 * a volá `onChange` při každé změně hráče nebo nastavení.
 */
export async function requirePlayer(onChange: Listener) {
  const k = getSession();
  if (!k) { location.replace('/'); return; }
  let me: Player | null = await getPlayer(k).catch(() => null);
  if (!me) { setSession(null); location.replace('/'); return; }
  let settings: Settings = DEFAULT_SETTINGS;
  const emit = () => me && onChange(me, settings);
  watchPlayer(k, (p) => { if (!p) return logout('Tvůj účet byl smazán.'); me = p; emit(); });
  watchSettings((s) => { settings = s; emit(); armIdle(s.idleLogoutMin); });
  touch(k);
  wireLogoutButtons();
  emit();
  return { get me() { return me!; }, get settings() { return settings; } };
}

export function wireLogoutButtons() {
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', () => logout()));
}

// ---- odhlášení po nečinnosti (sdílené počítače) ----
let lastActivity = Date.now();
let idleMin = 0;
let idleTimer: number | undefined;
export const markActive = () => { lastActivity = Date.now(); };
['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, markActive, { passive: true }));

function armIdle(min: number) {
  idleMin = Number(min) || 0;
  if (idleTimer) return;
  idleTimer = window.setInterval(() => {
    if (idleMin > 0 && getSession() && Date.now() - lastActivity > idleMin * 60000)
      logout(`Po ${idleMin} minutách bez hraní jsme tě odhlásili.`);
  }, 15000);
}
