/*
 * DOD Hry – most mezi hrou a portálem.
 * Vkládá se na konec index.html každé hry: <script src="../../bridge.js"></script>
 * Hru nijak nemění, jen sleduje její obrazovky a posílá portálu zprávy:
 *   { type: 'dodhry:active' }                 – hráč je aktivní (heartbeat)
 *   { type: 'dodhry:end', result: {...} }    – konec hry / jízdy / závodu
 * Body počítá portál (js/config.js), ne hra.
 */
(function () {
  if (window.parent === window) return; // hra běží samostatně, mimo portál

  const send = (msg) => window.parent.postMessage(Object.assign({ source: 'dodhry' }, msg), '*');
  const $ = (id) => document.getElementById(id);
  const visible = (el) => !!el && !el.hidden && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  const num = (s) => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0;

  // ---------- aktivita ----------
  let lastInput = 0;
  ['keydown', 'pointerdown', 'mousemove', 'touchstart', 'wheel'].forEach((ev) =>
    window.addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true })
  );
  setInterval(() => {
    if (!document.hidden && Date.now() - lastInput < 20000) send({ type: 'dodhry:active' });
  }, 5000);

  // ---------- konec hry: per-hra detektory ----------
  // Každý detektor vrací výsledek, když se objeví koncová obrazovka, jinak null.
  const detectors = [
    // Crimson Horde: Survivors
    () => {
      if (visible($('victory-modal'))) return { win: true, stage: 10, kills: num($('victory-kills')?.textContent) };
      if (visible($('gameover-modal')))
        return { win: false, stage: num(($('final-stage')?.textContent || '').split('(')[0]), kills: num($('final-kills')?.textContent) };
      return null;
    },
    // Stadium Defense
    () => {
      const wave = num(($('hud-wave')?.textContent || '').split('/')[0]);
      if (visible($('modal-victory'))) return { win: true, wave: 15 };
      if (visible($('modal-gameover'))) return { win: false, wave };
      return null;
    },
    // Halový Kros
    () => {
      if (!visible($('result')) || !$('resCard')) return null;
      const spans = [...$('resCard').querySelectorAll('.kv span')];
      const i = spans.findIndex((s) => s.textContent.trim() === 'Body');
      return i >= 0 ? { score: num(spans[i + 1]?.textContent) } : null;
    },
    // Noční Velká cena
    () => {
      if (!visible($('results')) || !$('rPos')) return null;
      const t = $('rPos').textContent.trim();
      const pos = t === 'Výhra' ? 1 : t === 'Prohra' ? 2 : num(t);
      return pos ? { position: pos } : null;
    },
    // Kaktus: Srdce pouště – canvas hra, stav je v globální proměnné `state` (úroveň v `li`)
    () => {
      if (!/^Kaktus/.test(document.title)) return null;
      // eslint-disable-next-line no-undef
      const st = state, lvl = typeof li === 'number' ? li + 1 : 0;
      if (st === 'res') return { levelDone: lvl };
      if (st === 'over') return { level: lvl };
      return null;
    },
    // Holubí bombardování – splněný level (hvězdy) nebo vypršel čas
    () => {
      const win = $('levelWinModal'), fail = $('levelFailModal');
      if (!win) return null;
      if (visible(win)) return { levelDone: 1, stars: ($('winStarsRow')?.textContent.match(/⭐/g) || []).length };
      if (visible(fail)) return { level: 0 };
      return null;
    },
    // Bílý Kopec – konec herního dne (v HUD se objeví „Den N · večer“)
    () => {
      const t = $('sDayK')?.textContent || '';
      return /večer/.test(t) ? { dayEnd: num(t.split('·')[0]) } : null;
    },
  ];

  let shown = false;
  const check = () => {
    let result = null;
    for (const d of detectors) {
      try { result = d(); } catch (e) { result = null; }
      if (result) break;
    }
    if (result && !shown) { shown = true; send({ type: 'dodhry:end', result }); }
    if (!result) shown = false;
  };
  setInterval(check, 500);

  // ---------- Lovec z Hůrecka: události místo koncové obrazovky ----------
  // splněný úkol / zakázka / kapitola se ukáže jako oznámení, nová úroveň jako titulek „Úroveň N“
  if (/^Lovec z Hůrecka/.test(document.title)) {
    const watch = () => {
      const box = $('toasts'), tc = $('tcTitle');
      if (!box || !tc) return setTimeout(watch, 1000);
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          const t = n.textContent || '';
          if (/Úkol splněn|Zakázka splněna|Kapitola dokončena/.test(t)) send({ type: 'dodhry:end', result: { quest: 1 } });
        }
      }).observe(box, { childList: true });
      let lastLvl = '';
      new MutationObserver(() => {
        const t = tc.textContent || '';
        if (/^Úroveň \d+/.test(t) && t !== lastLvl) { lastLvl = t; send({ type: 'dodhry:end', result: { level: num(t) } }); }
      }).observe(tc, { childList: true, characterData: true, subtree: true });
    };
    watch();
  }
})();
