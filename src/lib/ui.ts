// Drobnosti sdílené všemi stránkami.
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const fmt = (n: number) => Number(n || 0).toLocaleString('cs-CZ');

/** 1 bod, 2–4 body, 0 a 5+ bodů */
export const bodu = (n: number) => {
  const a = Math.abs(n);
  return a === 1 ? 'bod' : a >= 2 && a <= 4 ? 'body' : 'bodů';
};

/** Nastaví kruh (komponenta Ring.astro) na value/target. */
export function setRing(el: Element | null, value: number, target: number) {
  if (!el) return;
  const f = Math.max(0, Math.min(1, target ? value / target : 0));
  (el as HTMLElement).style.setProperty('--p', String(f));
  el.classList.toggle('is-done', f >= 1);
  el.classList.toggle('is-empty', f <= 0);
  el.setAttribute('aria-valuenow', String(Math.round(value)));
  el.setAttribute('aria-valuemax', String(target));
  const n = el.querySelector('[data-ring-value]');
  if (n) n.textContent = fmt(value);
}

export function toast(html: string, ms = 3600) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
  }
  // na celé obrazovce je vidět jen prvek v režimu celé obrazovky (přehrávač)
  const host = document.fullscreenElement ?? document.body;
  if (box.parentElement !== host) host.appendChild(box);
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms);
}
