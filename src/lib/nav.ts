// Naplní Nav.astro daty hráče.
import type { Player, Settings } from './db';
import { $, fmt, setRing } from './ui';

export const initial = (name: string) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function fillNav(me: Player, s: Settings) {
  $('navName').textContent = me.name;
  $('navInitial').textContent = initial(me.name);
  $('navPts').textContent = fmt(me.points);
  $('navTarget').textContent = fmt(s.target);
  setRing($('navRing'), me.points, s.target);
  document.querySelectorAll('[data-title]').forEach((el) => (el.textContent = s.title));
}
