// Sdílené UI kousky pro portál, admin i projektor.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString('cs-CZ');

// Česká množná čísla: 1 bod, 2–4 body, 5+ bodů
export const bodu = (n) => {
  const a = Math.abs(n);
  return a === 1 ? 'bod' : a >= 2 && a <= 4 ? 'body' : 'bodů';
};

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Kruh postupu k cíli (signature prvek). value/target, uvnitř iniciály.
export function ring(el, value, target, label) {
  const r = 19, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, target ? value / target : 0));
  el.classList.toggle('done', f >= 1);
  if (!el.firstChild) {
    el.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="${r}" fill="none" stroke-width="4"/>
      <circle class="bar" cx="22" cy="22" r="${r}" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><span></span>`;
  }
  el.querySelector('span').textContent = label;
  requestAnimationFrame(() => (el.querySelector('.bar').style.strokeDashoffset = String(c * (1 - f))));
}

export function toast(html, ms = 3200) {
  const box = $('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}
