// Datová vrstva: Firestore, nebo localStorage v DEMO režimu (když chybí firebaseConfig).
import { firebaseConfig, DEFAULT_SETTINGS } from './config.js';

export const DEMO = !firebaseConfig.apiKey;

// Klíč hráče: malá písmena, bez diakritiky a mezer navíc → „Tomáš“ a „tomas“ je totéž jméno.
export function nameKey(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function cleanName(name) {
  return String(name).replace(/\s+/g, ' ').trim().slice(0, 24);
}

let impl;

// ------------------------------------------------------------ Firestore
async function firestoreImpl() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(firebaseConfig));
  const P = (k) => fs.doc(db, 'players', k);
  const S = fs.doc(db, 'settings', 'main');

  return {
    async getPlayer(k) { const s = await fs.getDoc(P(k)); return s.exists() ? s.data() : null; },
    async createPlayer(name) {
      const k = nameKey(name);
      return fs.runTransaction(db, async (tx) => {
        const s = await tx.get(P(k));
        if (s.exists()) return null;
        const p = { key: k, name, points: 0, games: {}, createdAt: Date.now(), lastSeen: Date.now() };
        tx.set(P(k), p);
        return p;
      });
    },
    async award(k, name, gameId, pts, reason, extra = {}) {
      const up = { points: fs.increment(pts), lastSeen: Date.now(), [`games.${gameId}.points`]: fs.increment(pts) };
      if (reason === 'minute') up[`games.${gameId}.minutes`] = fs.increment(1);
      else up[`games.${gameId}.runs`] = fs.increment(1);
      for (const [f, v] of Object.entries(extra)) up[`games.${gameId}.${f}`] = v;
      await fs.updateDoc(P(k), up);
      if (reason !== 'minute') await fs.addDoc(fs.collection(db, 'events'), { key: k, name, gameId, points: pts, reason, at: Date.now() });
    },
    async adjust(k, delta) {
      const p = await this.getPlayer(k);
      await fs.updateDoc(P(k), { points: fs.increment(delta) });
      await fs.addDoc(fs.collection(db, 'events'), { key: k, name: p?.name || k, gameId: null, points: delta, reason: 'admin', at: Date.now() });
    },
    async touch(k) { try { await fs.updateDoc(P(k), { lastSeen: Date.now() }); } catch (e) {} },
    async removePlayer(k) { await fs.deleteDoc(P(k)); },
    async resetAll() {
      for (const c of ['players', 'events']) {
        const snap = await fs.getDocs(fs.collection(db, c));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = fs.writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }
    },
    watchPlayer(k, cb) { return fs.onSnapshot(P(k), (s) => cb(s.exists() ? s.data() : null)); },
    watchPlayers(cb, max = 500) {
      return fs.onSnapshot(fs.query(fs.collection(db, 'players'), fs.orderBy('points', 'desc'), fs.limit(max)),
        (s) => cb(s.docs.map((d) => d.data())));
    },
    watchEvents(cb, max = 12) {
      return fs.onSnapshot(fs.query(fs.collection(db, 'events'), fs.orderBy('at', 'desc'), fs.limit(max)),
        (s) => cb(s.docs.map((d) => d.data())));
    },
    watchSettings(cb) { return fs.onSnapshot(S, (s) => cb({ ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) })); },
    async saveSettings(patch) { await fs.setDoc(S, patch, { merge: true }); },
  };
}

// ------------------------------------------------------------ DEMO (localStorage)
function localImpl() {
  const KEY = 'dodhry:demo-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const state = () => { const d = load(); d.players ||= {}; d.events ||= []; d.settings ||= {}; return d; };
  const subs = new Set();
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} subs.forEach((f) => f()); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) subs.forEach((f) => f()); });
  const watch = (fn) => { fn(); subs.add(fn); return () => subs.delete(fn); };
  const sorted = (d) => Object.values(d.players).sort((a, b) => b.points - a.points);

  return {
    async getPlayer(k) { return state().players[k] || null; },
    async createPlayer(name) {
      const d = state(), k = nameKey(name);
      if (d.players[k]) return null;
      d.players[k] = { key: k, name, points: 0, games: {}, createdAt: Date.now(), lastSeen: Date.now() };
      save(d); return d.players[k];
    },
    async award(k, name, gameId, pts, reason, extra = {}) {
      const d = state(), p = d.players[k]; if (!p) return;
      const g = (p.games[gameId] ||= { points: 0, runs: 0, minutes: 0 });
      p.points += pts; g.points += pts; p.lastSeen = Date.now();
      if (reason === 'minute') g.minutes++; else g.runs++;
      Object.assign(g, extra);
      if (reason !== 'minute') d.events.unshift({ key: k, name, gameId, points: pts, reason, at: Date.now() });
      d.events = d.events.slice(0, 50); save(d);
    },
    async adjust(k, delta) {
      const d = state(), p = d.players[k]; if (!p) return;
      p.points += delta;
      d.events.unshift({ key: k, name: p.name, gameId: null, points: delta, reason: 'admin', at: Date.now() });
      save(d);
    },
    async touch(k) { const d = state(); if (d.players[k]) { d.players[k].lastSeen = Date.now(); save(d); } },
    async removePlayer(k) { const d = state(); delete d.players[k]; save(d); },
    async resetAll() { const d = state(); d.players = {}; d.events = []; save(d); },
    watchPlayer(k, cb) { return watch(() => cb(state().players[k] || null)); },
    watchPlayers(cb, max = 500) { return watch(() => cb(sorted(state()).slice(0, max))); },
    watchEvents(cb, max = 12) { return watch(() => cb(state().events.slice(0, max))); },
    watchSettings(cb) { return watch(() => cb({ ...DEFAULT_SETTINGS, ...state().settings })); },
    async saveSettings(patch) { const d = state(); Object.assign(d.settings, patch); save(d); },
  };
}

export async function getDB() {
  if (!impl) impl = DEMO ? Promise.resolve(localImpl()) : firestoreImpl();
  return impl;
}
