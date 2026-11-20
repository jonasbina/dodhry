// Ilustrované obálky her (SVG, 16:9). Žádné externí obrázky → fungují všude.
const W = 320, H = 180;
let uid = 0;
// id gradientů musí být na stránce unikátní (stejná obálka se kreslí víckrát)
const svg = (body, defs = '') => {
  const p = `cv${++uid}-`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`
    .replace(/id="(\w+)"/g, `id="${p}$1"`).replace(/url\(#(\w+)\)/g, `url(#${p}$1)`);
};

// deterministický „náhodný“ generátor, ať obálky vypadají pokaždé stejně
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const covers = {
  f1() {
    const r = rng(7);
    let stars = '';
    for (let i = 0; i < 40; i++) stars += `<circle cx="${r() * W}" cy="${r() * 80}" r="${r() * 1.1 + 0.3}" fill="#fff" opacity="${0.3 + r() * 0.6}"/>`;
    let kerb = '';
    for (let i = 0; i < 18; i++) kerb += `<path d="M${-20 + i * 22} ${150 - i * 2.2} l11 -1.1 l0 7 l-11 1.1z" fill="${i % 2 ? '#fff' : '#e8202a'}"/>`;
    const lights = [0, 1, 2, 3, 4].map((i) => `<rect x="${92 + i * 28}" y="22" width="22" height="34" rx="6" fill="#111"/><circle cx="${103 + i * 28}" cy="${39}" r="8" fill="#ff2a2a" filter="url(#glow)"/>`).join('');
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars}
       <path d="M-10 128 C 80 100, 200 96, 340 118 L340 190 L-10 190z" fill="#15172a"/>
       <path d="M-10 142 C 90 118, 210 112, 340 132 L340 158 C 210 138, 90 146, -10 168z" fill="#2b2e3f"/>
       <path d="M-10 155 C 90 132, 210 125, 340 145" stroke="#f4f4f4" stroke-width="1.5" stroke-dasharray="10 9" fill="none" opacity=".7"/>
       ${kerb}
       <rect x="84" y="14" width="152" height="50" rx="10" fill="#1c1c22" stroke="#33343f"/>${lights}
       <path d="M180 150 l46 -4 l14 -8 l22 0 l8 6 l-6 7 l-80 6z" fill="#e10600"/><circle cx="200" cy="156" r="7" fill="#0b0b0e"/><circle cx="256" cy="151" r="7" fill="#0b0b0e"/>`,
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset="1" stop-color="#3a1d5c"/></linearGradient>
       <filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    );
  },
  horde() {
    const r = rng(11);
    let mobs = '';
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 40 + r() * 140;
      const x = 160 + Math.cos(a) * d * 1.3, y = 95 + Math.sin(a) * d * 0.75, s = 4 + r() * 6;
      mobs += `<circle cx="${x}" cy="${y}" r="${s}" fill="${r() > 0.8 ? '#5b0d16' : '#2a0a12'}" stroke="#ff3b4e" stroke-opacity=".35"/>
               <circle cx="${x - s / 3}" cy="${y - s / 4}" r="1.1" fill="#ff5a5a"/><circle cx="${x + s / 3}" cy="${y - s / 4}" r="1.1" fill="#ff5a5a"/>`;
    }
    let gems = '';
    for (let i = 0; i < 14; i++) gems += `<path d="M${60 + r() * 200} ${40 + r() * 110} l3 -5 l3 5 l-3 5z" fill="#7cf3ff" opacity=".85"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${mobs}${gems}
       <circle cx="160" cy="95" r="34" fill="none" stroke="#ffd56b" stroke-width="1.5" stroke-dasharray="3 6" opacity=".8"/>
       <circle cx="160" cy="95" r="12" fill="#ffe7a8" filter="url(#g)"/>
       <path d="M160 95 L230 60" stroke="#ffe7a8" stroke-width="2" opacity=".8"/><path d="M160 95 L95 130" stroke="#ffe7a8" stroke-width="2" opacity=".6"/>`,
      `<radialGradient id="bg" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#7a1022"/><stop offset=".6" stop-color="#2a0710"/><stop offset="1" stop-color="#0e0307"/></radialGradient>
       <filter id="g"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    );
  },
  stadium() {
    let lanes = '';
    for (let i = 0; i < 5; i++) lanes += `<ellipse cx="160" cy="98" rx="${132 - i * 9}" ry="${70 - i * 7}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>`;
    const r = rng(3);
    let crowd = '';
    for (let i = 0; i < 90; i++) crowd += `<circle cx="${r() * W}" cy="${r() * 18 + (r() > 0.5 ? 2 : 166)}" r="2.6" fill="${['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#fff'][i % 5]}" opacity=".85"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="#0f3d2a"/>${crowd}
       <ellipse cx="160" cy="98" rx="146" ry="78" fill="#c2452d"/>
       ${lanes}
       <ellipse cx="160" cy="98" rx="92" ry="34" fill="url(#grass)"/>
       <g transform="translate(160 96)"><path d="M-16 -22 h32 v8 c0 14 -8 22 -16 22 c-8 0 -16 -8 -16 -22z" fill="#ffd34d" stroke="#b8860b"/>
       <path d="M-16 -16 c-10 0 -10 14 2 14 M16 -16 c10 0 10 14 -2 14" stroke="#ffd34d" stroke-width="3" fill="none"/>
       <rect x="-4" y="8" width="8" height="8" fill="#e0a800"/><rect x="-12" y="16" width="24" height="6" rx="2" fill="#7a5200"/></g>`,
      `<linearGradient id="grass" x1="0" x2="1"><stop offset="0" stop-color="#2f9e57"/><stop offset=".5" stop-color="#38b264"/><stop offset="1" stop-color="#2f9e57"/></linearGradient>`
    );
  },
  kros() {
    let beams = '';
    [40, 120, 200, 280].forEach((x, i) => (beams += `<path d="M${x} 0 L${x - 50 + i * 10} 180 L${x + 50 + i * 10} 180z" fill="#fff" opacity=".05"/>`));
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${beams}
       <path d="M-10 150 Q 60 150 100 120 Q 130 98 150 150 Q 210 150 250 110 Q 280 86 330 150 L330 190 L-10 190z" fill="#6b3b1f"/>
       <path d="M-10 160 Q 80 156 120 168 Q 200 182 330 160 L330 190 L-10 190z" fill="#4a2814"/>
       <g transform="translate(150 58) rotate(-24)">
         <circle cx="-22" cy="18" r="13" fill="none" stroke="#111" stroke-width="5"/><circle cx="24" cy="18" r="13" fill="none" stroke="#111" stroke-width="5"/>
         <path d="M-22 18 L0 2 L24 18 M0 2 L-6 -6 h18 l10 10" stroke="#ff9a2e" stroke-width="5" fill="none" stroke-linejoin="round"/>
         <path d="M-4 -6 l-4 -16 l10 -2 l6 14" fill="#ffd166"/><circle cx="2" cy="-26" r="6" fill="#ff9a2e"/>
       </g>
       <path d="M110 70 q-30 10 -40 34" stroke="#ffd166" stroke-width="2" stroke-dasharray="2 5" fill="none" opacity=".7"/>`,
      `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1236"/><stop offset="1" stop-color="#4b1f4f"/></linearGradient>`
    );
  },
};

export const coverSVG = (name) => (covers[name] ? covers[name]() : '');
