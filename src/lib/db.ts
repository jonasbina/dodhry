// Firestore: hráči, události (pro projektor) a nastavení.
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  runTransaction, onSnapshot, query, orderBy, limit, increment, writeBatch, where,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCmRdXz_LeYf8GK7qCm9uipxCdCjvk9YhM',
  authDomain: 'dodhry-ferenczbald.firebaseapp.com',
  projectId: 'dodhry-ferenczbald',
  storageBucket: 'dodhry-ferenczbald.firebasestorage.app',
  messagingSenderId: '866412011887',
  appId: '1:866412011887:web:6e1c0c43539f03ad34489a',
});
const db = getFirestore(app);

export type GameStats = { points?: number; runs?: number; minutes?: number };
export type Player = { key: string; name: string; points: number; games: Record<string, GameStats>; createdAt: number; lastSeen: number };
export type GameEvent = { key: string; name: string; gameId: string | null; points: number; reason: 'run' | 'win' | 'admin'; at: number };
export type Settings = { target: number; adminPin: string; idleLogoutMin: number; title: string };

export const DEFAULT_SETTINGS: Settings = { target: 100, adminPin: '2026', idleLogoutMin: 10, title: 'DOD hry' };

/** „Tomáš“, „tomas“ i „TOMÁŠ “ je totéž jméno */
export function nameKey(name: string) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const cleanName = (name: string) => String(name).replace(/\s+/g, ' ').trim().slice(0, 24);

const P = (k: string) => doc(db, 'players', k);
const S = doc(db, 'settings', 'main');
const EV = collection(db, 'events');

export async function getPlayer(k: string) {
  const s = await getDoc(P(k));
  return s.exists() ? (s.data() as Player) : null;
}

/** vrátí null, když jméno už někdo má */
export function createPlayer(name: string) {
  const k = nameKey(name);
  return runTransaction(db, async (tx) => {
    const s = await tx.get(P(k));
    if (s.exists()) return null;
    const p: Player = { key: k, name, points: 0, games: {}, createdAt: Date.now(), lastSeen: Date.now() };
    tx.set(P(k), p);
    return p;
  });
}

export async function award(p: Pick<Player, 'key' | 'name'>, gameId: string, pts: number, reason: 'minute' | 'run' | 'win') {
  await updateDoc(P(p.key), {
    points: increment(pts),
    lastSeen: Date.now(),
    [`games.${gameId}.points`]: increment(pts),
    [`games.${gameId}.${reason === 'minute' ? 'minutes' : 'runs'}`]: increment(1),
  });
  if (reason !== 'minute') await addDoc(EV, { key: p.key, name: p.name, gameId, points: pts, reason, at: Date.now() });
}

export async function adjust(p: Pick<Player, 'key' | 'name'>, delta: number) {
  await updateDoc(P(p.key), { points: increment(delta) });
  await addDoc(EV, { key: p.key, name: p.name, gameId: null, points: delta, reason: 'admin', at: Date.now() });
}

export const touch = (k: string) => updateDoc(P(k), { lastSeen: Date.now() }).catch(() => {});
/** smaže hráče i jeho záznamy v „Právě získali“ */
export async function removePlayer(k: string) {
  const evs = await getDocs(query(EV, where('key', '==', k)));
  const b = writeBatch(db);
  evs.docs.forEach((d) => b.delete(d.ref));
  b.delete(P(k));
  await b.commit();
}
export const saveSettings = (patch: Partial<Settings>) => setDoc(S, patch, { merge: true });

export async function resetAll() {
  for (const c of ['players', 'events']) {
    const snap = await getDocs(collection(db, c));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
}

export const watchPlayer = (k: string, cb: (p: Player | null) => void) =>
  onSnapshot(P(k), (s) => cb(s.exists() ? (s.data() as Player) : null));

export const watchPlayers = (cb: (p: Player[]) => void, max = 500) =>
  onSnapshot(query(collection(db, 'players'), orderBy('points', 'desc'), limit(max)), (s) => cb(s.docs.map((d) => d.data() as Player)));

export const watchEvents = (cb: (e: GameEvent[]) => void, max = 8) =>
  onSnapshot(query(EV, orderBy('at', 'desc'), limit(max)), (s) => cb(s.docs.map((d) => d.data() as GameEvent)));

export const watchSettings = (cb: (s: Settings) => void) =>
  onSnapshot(S, (s) => cb({ ...DEFAULT_SETTINGS, ...(s.exists() ? (s.data() as Partial<Settings>) : {}) }));
