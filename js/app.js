import { GAMES, gameById, MINUTE_POINTS, MINUTE_CAP, MIN_RUN_SECONDS } from './config.js';
import { getDB, DEMO, nameKey, cleanName } from './db.js';
import { coverSVG } from './covers.js';
import { $, esc, fmt, bodu, initials, ring, toast } from './ui.js';

const SESSION = 'dodhry:me';
const db = await getDB();

let settings = { target: 100, idleLogoutMin: 10, title: 'DOD Hry' };
let me = null;            // dokument přihlášeného hráče
let unwatchMe = null, unwatchBoard = null;
let lastActivity = Date.now();

const getSession = () => { try { return localStorage.getItem(SESSION); } catch (e) { return null; } };
const setSession = (k) => { try { k ? localStorage.setItem(SESSION, k) : localStorage.removeItem(SESSION); } catch (e) {} };

// ============================================================ nastavení
db.watchSettings((s) => {
  settings = s;
  document.querySelectorAll('[data-title]').forEach((el) => (el.textContent = s.title));
  document.title = s.title;
  if (me) renderMe();
});

// ============================================================ přihlášení
$('demoFlag').hidden = !DEMO;
$('loginWall').innerHTML = Array.from({ length: 16 }, (_, i) => `<div>${coverSVG(GAMES[i % GAMES.length].cover)}</div>`).join('');

let pendingName = '';

function showLogin(msg = '') {
  stopGame();
  $('shell').hidden = true;
  $('login').hidden = false;
  $('nameForm').hidden = false;
  $('conflict').hidden = true;
  $('nameInput').value = '';
  setHint(msg);
  setTimeout(() => $('nameInput').focus(), 50);
}
function setHint(text, err = false) {
  $('nameHint').textContent = text;
  $('nameHint').classList.toggle('err', err);
  $('nameInput').setAttribute('aria-invalid', err ? 'true' : 'false');
}

$('nameInput').addEventListener('input', () => setHint(''));

$('nameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanName($('nameInput').value);
  if (nameKey(name).length < 2) return setHint('Napiš aspoň 2 písmena nebo číslice.', true);
  $('nameGo').disabled = true;
  try {
    const existing = await db.getPlayer(nameKey(name));
    if (!existing) {
      const p = await db.createPlayer(name);
      if (p) return enter(p);
      // někdo ho založil mezitím → stejně jako konflikt
      return showConflict(name, await db.getPlayer(nameKey(name)));
    }
    showConflict(name, existing);
  } catch (err) {
    console.error(err);
    setHint('Nepodařilo se připojit k databázi. Zkontroluj internet a zkus to znovu.', true);
  } finally {
    $('nameGo').disabled = false;
  }
});

function showConflict(name, p) {
  pendingName = name;
  $('nameForm').hidden = true;
  $('conflict').hidden = false;
  $('cName').textContent = p.name;
  $('cName2').textContent = p.name;
  $('cPts').textContent = `${fmt(p.points)} ${bodu(p.points)}`;
  ring($('cRing'), p.points, settings.target, initials(p.name));
  $('cMe').onclick = () => enter(p);
  $('cMe').focus();
}

$('cNew').addEventListener('click', async () => {
  $('conflict').hidden = true;
  $('nameForm').hidden = false;
  $('nameInput').value = pendingName;
  setHint('Tohle jméno už má někdo jiný. Přidej třeba příjmení, třídu nebo číslo.', true);
  // nabídni pár volných variant
  const base = pendingName;
  const options = [`${base} ${new Date().getFullYear() % 100}`, `${base} 2`, `${base} ${Math.floor(10 + Math.random() * 89)}`];
  const free = [];
  for (const o of options) if (!(await db.getPlayer(nameKey(o))) && !free.includes(o)) free.push(o);
  if (free.length) {
    const chips = document.createElement('div');
    chips.className = 'chips';
    chips.innerHTML = free.map((o) => `<button type="button" class="chip">${esc(o)}</button>`).join('');
    chips.querySelectorAll('button').forEach((b) => (b.onclick = () => { $('nameInput').value = b.textContent; chips.remove(); $('nameForm').requestSubmit(); }));
    $('nameHint').appendChild(chips);
  }
  $('nameInput').focus();
  $('nameInput').select();
});

function enter(p) {
  me = p;
  setSession(p.key);
  lastActivity = Date.now();
  $('login').hidden = true;
  $('shell').hidden = false;
  unwatchMe?.();
  unwatchMe = db.watchPlayer(p.key, (doc) => {
    if (!doc) { logout('Tvůj účet byl smazán. Přihlas se znovu.'); return; }
    me = doc;
    renderMe();
  });
  renderMe();
  route();
  db.touch(p.key);
}

function logout(msg = '') {
  unwatchMe?.(); unwatchMe = null;
  unwatchBoard?.(); unwatchBoard = null;
  me = null;
  setSession(null);
  if (location.hash) history.replaceState(null, '', location.pathname);
  showLogin(msg);
}
document.querySelectorAll('[data-action="logout"]').forEach((b) => b.addEventListener('click', () => logout()));

// automatické odhlášení po nečinnosti (sdílené počítače)
['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  const min = Number(settings.idleLogoutMin) || 0;
  if (me && min > 0 && Date.now() - lastActivity > min * 60000) logout(`Odhlásili jsme tě po ${min} minutách nečinnosti.`);
}, 15000);

// ============================================================ vykreslení
function renderMe() {
  if (!me) return;
  const t = Number(settings.target) || 100, pts = me.points || 0, left = Math.max(0, t - pts);
  const label = initials(me.name);
  for (const [p, n, r] of [['mePts', 'meNeed', 'meRing'], ['pPts', 'pNeed', 'pRing']]) {
    $(p).textContent = fmt(pts);
    $(n).textContent = left ? `z ${fmt(t)} bodů` : 'cíl splněn';
    ring($(r), pts, t, label);
  }
  $('hiName').textContent = me.name;
  $('bigPts').textContent = fmt(pts);
  $('bigTarget').textContent = fmt(t);
  const f = Math.min(1, pts / t);
  $('progress').classList.toggle('done', !left);
  $('bigBar').querySelector('.bar-fill').style.width = `${f * 100}%`;
  $('bigBar').setAttribute('aria-valuenow', String(Math.round(f * 100)));
  $('bigNeed').className = 'need' + (left ? '' : ' ok');
  $('bigNeed').textContent = left ? `Ještě ${fmt(left)} ${bodu(left)} do cíle` : '🎉 Cíl splněn! Ukaž to u stolu organizátorů.';
  $('miniGames').innerHTML = GAMES.map((g) => {
    const gp = me.games?.[g.id]?.points || 0;
    return `<div class="mini-game"><b>${esc(g.title)}</b><span class="num">${fmt(gp)} b</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (gp / (g.maxPoints + MINUTE_CAP)) * 100)}%"></div></div></div>`;
  }).join('');
  renderGrid();
  renderFeature();
}

function cardHTML(g) {
  const mine = me?.games?.[g.id]?.points || 0;
  return `<button class="card" data-game="${g.id}" aria-label="Hrát ${esc(g.title)}">
    <div class="art">${coverSVG(g.cover)}
      <span class="pts-badge">až ${g.maxPoints} b</span>
      <div class="play-badge"><span><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg></span></div>
    </div>
    <div class="body">
      <div class="title">${esc(g.title)}</div>
      <div class="meta">${esc(g.genre)} · ${esc(g.author)}, ${esc(g.group)}</div>
      ${mine ? `<div class="mine">Tvoje body: ${fmt(mine)}</div>` : ''}
    </div>
  </button>`;
}

function renderGrid() {
  const q = ($('search').value || '').trim().toLowerCase();
  const list = GAMES.filter((g) => !q || [g.title, g.author, g.genre, g.group].join(' ').toLowerCase().includes(q));
  $('grid').innerHTML = list.map(cardHTML).join('');
  $('noResults').hidden = list.length > 0;
  $('sideGames').innerHTML = GAMES.map((g) =>
    `<button class="side-game" data-game="${g.id}"><span class="thumb">${coverSVG(g.cover)}</span>${esc(g.title)}</button>`).join('');
}
$('search').addEventListener('input', renderGrid);

let featuredId = null;
function renderFeature() {
  // doporuč hru, ve které má hráč zatím nejmíň bodů
  const pick = [...GAMES].sort((a, b) => (me?.games?.[a.id]?.points || 0) - (me?.games?.[b.id]?.points || 0))[0];
  if (pick.id === featuredId) return;
  featuredId = pick.id;
  const tried = !!me?.games?.[pick.id];
  $('feature').dataset.game = pick.id;
  $('feature').setAttribute('aria-label', `Hrát ${pick.title}`);
  $('feature').innerHTML = `<div class="art">${coverSVG(pick.cover)}</div>
    <div class="copy">
      <div class="eyebrow">${tried ? 'Tady ti body ještě chybí' : 'Tohle jsi ještě nehrál(a)'}</div>
      <h3>${esc(pick.title)}</h3>
      <p>${esc(pick.blurb)}</p>
      <div class="row"><span class="btn primary big" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>Hrát</span>
        <span class="tag gold">až ${pick.maxPoints} bodů za hru</span><span class="tag">${esc(pick.author)}</span></div>
    </div>`;
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-game]');
  if (g && me) location.hash = `#hra/${g.dataset.game}`;
  const v = e.target.closest('[data-view]');
  if (v) location.hash = v.dataset.view === 'board' ? '#zebricek' : '#';
});

function renderBoard(players) {
  const t = Number(settings.target) || 100;
  if (!players.length) { $('board').innerHTML = '<div class="empty">Zatím nikdo nehrál. Buď první!</div>'; return; }
  $('board').innerHTML = players.slice(0, 100).map((p, i) => `
    <div class="board-row r${i + 1} ${p.key === me?.key ? 'me-row' : ''}">
      <span class="rank num">${i + 1}.</span>
      <span class="name">${esc(p.name)}${p.points >= t ? '<span class="goal-flag">✓ cíl</span>' : ''}</span>
      <span class="score num">${fmt(p.points)}</span>
    </div>`).join('');
}

// ============================================================ routování
function route() {
  if (!me) return;
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('hra/') && gameById(h.slice(4))) return startGame(gameById(h.slice(4)));
  stopGame();
  const board = h === 'zebricek';
  $('viewHome').hidden = board;
  $('viewBoard').hidden = !board;
  document.querySelectorAll('[data-view]').forEach((b) => {
    if ((b.dataset.view === 'board') === board) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (board && !unwatchBoard) unwatchBoard = db.watchPlayers(renderBoard, 100);
  if (!board && unwatchBoard) { unwatchBoard(); unwatchBoard = null; }
}
window.addEventListener('hashchange', route);

// ============================================================ hraní + body
let run = null; // { game, openedAt, lastEndAt, activeSec, prevResult, sessionPts }

function startGame(g) {
  if (run?.game.id === g.id) return;
  stopGame();
  run = { game: g, lastEndAt: Date.now(), activeSec: 0, prevResult: null, sessionPts: 0 };
  $('pTitle').textContent = g.title;
  $('pMeta').textContent = `${g.author} · ${g.controls}`;
  $('pSession').textContent = '+0';
  $('rules').innerHTML = `<h4>Jak tu získat body</h4><p>${esc(g.rule)}</p>
    <p>Navíc +${MINUTE_POINTS} bod za každou minutu hraní (max. ${MINUTE_CAP} za hru).</p>
    <p style="color:var(--muted)">Ovládání: ${esc(g.controls)}</p>`;
  $('rules').hidden = true;
  $('rulesBtn').setAttribute('aria-expanded', 'false');
  $('frame').src = g.path;
  $('player').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('frame').focus(), 300);
}

function stopGame() {
  if (!run) return;
  run = null;
  $('frame').src = 'about:blank';
  $('player').hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

$('back').addEventListener('click', () => (location.hash = '#'));
$('fsBtn').addEventListener('click', () => {
  const el = $('frame');
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
});
$('rulesBtn').addEventListener('click', () => {
  const open = $('rules').hidden;
  $('rules').hidden = !open;
  $('rulesBtn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('rules').hidden) { $('rules').hidden = true; $('rulesBtn').setAttribute('aria-expanded', 'false'); }
});

async function award(pts, reason, extra) {
  if (!run || !me || pts <= 0) return;
  const g = run.game;
  run.sessionPts += pts;
  $('pSession').textContent = `+${fmt(run.sessionPts)}`;
  try {
    await db.award(me.key, me.name, g.id, pts, reason, extra);
  } catch (e) {
    console.error(e);
    toast('Body se nepodařilo uložit, zkontroluj připojení.');
    return;
  }
  if (reason !== 'minute') toast(`<b>+${pts}</b> ${bodu(pts)} za ${esc(g.title)}`);
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!run || !m || m.source !== 'dodhry' || e.source !== $('frame').contentWindow) return;
  lastActivity = Date.now();
  const g = run.game;

  if (m.type === 'dodhry:active') {
    run.activeSec += 5;
    if (run.activeSec >= 60) {
      run.activeSec -= 60;
      const used = me?.games?.[g.id]?.minutes || 0;
      if (used < MINUTE_CAP) award(MINUTE_POINTS, 'minute');
    }
  }

  if (m.type === 'dodhry:end' && m.result) {
    const r = m.result;
    const secs = (Date.now() - run.lastEndAt) / 1000;
    const prev = run.prevResult;
    // nová jízda v kumulativní hře (skóre kleslo) → začni počítat od nuly
    const pts = Math.max(0, Math.round(g.points(r, g.cumulative && prev && r.score >= prev.score ? prev : null) || 0));
    if (!r.win && secs < MIN_RUN_SECONDS && !g.cumulative) {
      toast(`Hra byla moc krátká, body se počítají od ${MIN_RUN_SECONDS} s hraní.`);
    } else {
      award(pts, r.win ? 'win' : 'run');
    }
    run.prevResult = r;
    run.lastEndAt = Date.now();
  }
});

// ============================================================ start
const saved = getSession();
if (saved) {
  try {
    const p = await db.getPlayer(saved);
    p ? enter(p) : showLogin();
  } catch (e) { console.error(e); showLogin('Nepodařilo se připojit k databázi.'); }
} else {
  showLogin();
}
