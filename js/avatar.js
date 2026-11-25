// Avatare: sechs EHL-Berufe als Vektorgrafik. Gesicht, Hautton, Frisur, Haarfarbe, Brille und Bart sind wählbar.
// Die Einstellung kommt von fremden Handys: Es werden nur Werte aus den festen Listen verwendet.

export const BERUFE = ['kueche', 'service', 'reception', 'bellboy', 'housekeeping', 'direktion'];
export const FRISUREN = ['kurz', 'scheitel', 'lang', 'dutt', 'locken', 'glatze'];
export const HAARFARBEN = ['schwarz', 'dunkel', 'braun', 'blond', 'rot', 'grau'];
export const HAUTTOENE = ['#F6D9C0', '#EBC09B', '#D29B6E', '#A56B43', '#6B4329'];
const HAAR = { schwarz: '#1E1A19', dunkel: '#4A2E1F', braun: '#7A4A2B', blond: '#C9A35E', rot: '#A6482B', grau: '#B9B7B0' };

export function saubererAvatar(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    beruf: BERUFE.includes(c.beruf) ? c.beruf : BERUFE[0],
    haut: Number.isInteger(c.haut) && c.haut >= 0 && c.haut < HAUTTOENE.length ? c.haut : 1,
    haar: HAARFARBEN.includes(c.haar) ? c.haar : HAARFARBEN[1],
    frisur: FRISUREN.includes(c.frisur) ? c.frisur : FRISUREN[0],
    brille: c.brille === true,
    bart: c.bart === true,
  };
}

export function zufallsAvatar(zufall = Math.random) {
  const aus = liste => liste[Math.min(liste.length - 1, Math.floor(zufall() * liste.length))];
  return {
    beruf: aus(BERUFE), haut: Math.min(HAUTTOENE.length - 1, Math.floor(zufall() * HAUTTOENE.length)),
    haar: aus(HAARFARBEN), frisur: aus(FRISUREN), brille: zufall() > 0.8, bart: zufall() > 0.85,
  };
}

function dunkler(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const k = v => Math.round(v * f).toString(16).padStart(2, '0');
  return '#' + k(n >> 16) + k((n >> 8) & 255) + k(n & 255);
}

const KOERPER = 'M18 122 C18 98 34 88 48 85 L72 85 C86 88 102 98 102 122 Z';

const UNIFORM = {
  kueche: `<path d="${KOERPER}" fill="#FAF8F4"/>
    <path d="M60 92 L50 122" stroke="#D5D0C6" stroke-width="1.2"/>
    <path d="M47.5 84 Q60 95 72.5 84 L74 89.5 Q60 101 46 89.5Z" fill="#fff" stroke="#D5D0C6" stroke-width=".8"/>
    <g fill="#1B365F"><circle cx="46" cy="103" r="1.9"/><circle cx="44.5" cy="114" r="1.9"/><circle cx="66" cy="103" r="1.9"/><circle cx="67.5" cy="114" r="1.9"/></g>`,
  service: `<path d="${KOERPER}" fill="#FAF8F4"/>
    <path d="M33 122 L37 93 L48 85 L60 110 L72 85 L83 93 L87 122Z" fill="#141a26"/>
    <path d="M49 85 L60 96 L55 100Z M71 85 L60 96 L65 100Z" fill="#fff" stroke="#D5D0C6" stroke-width=".6"/>
    <path d="M60 92.5 L52.5 88.5 L52.5 96.5Z M60 92.5 L67.5 88.5 L67.5 96.5Z" fill="#B6633F"/><circle cx="60" cy="92.5" r="1.9" fill="#8f4a2c"/>
    <g fill="#B6633F"><circle cx="60" cy="113" r="1.3"/><circle cx="60" cy="119" r="1.3"/></g>`,
  reception: `<path d="${KOERPER}" fill="#1B365F"/>
    <path d="M48 85 L60 110 L72 85Z" fill="#FAF8F4"/>
    <path d="M48 85 L60 110 L51.5 104 L44.5 93Z M72 85 L60 110 L68.5 104 L75.5 93Z" fill="#264a80"/>
    <path d="M55 88 Q60 92 65 88 L63 95 L66 102 L60 99 L54 102 L57 95Z" fill="#B6633F"/>
    <rect x="72.5" y="104" width="11" height="4.2" rx="1" fill="#D9BB7A"/>`,
  bellboy: `<path d="${KOERPER}" fill="#B6633F"/>
    <path d="M47.5 83 Q60 93 72.5 83 L74 89 Q60 99 46 89Z" fill="#001436"/>
    <path d="M60 95 L60 122" stroke="#8f4a2c" stroke-width="1.2"/>
    <g fill="#E2C27A"><circle cx="54" cy="101" r="1.7"/><circle cx="53.5" cy="110" r="1.7"/><circle cx="53" cy="119" r="1.7"/><circle cx="66" cy="101" r="1.7"/><circle cx="66.5" cy="110" r="1.7"/><circle cx="67" cy="119" r="1.7"/></g>
    <path d="M24 100 q8 -9 18 -11" fill="none" stroke="#E2C27A" stroke-width="1.6"/><path d="M96 100 q-8 -9 -18 -11" fill="none" stroke="#E2C27A" stroke-width="1.6"/>`,
  housekeeping: `<path d="${KOERPER}" fill="#3A74B4"/>
    <path d="M48 85 L60 98 L72 85 L70 84 L60 90 L50 84Z" fill="#2c5c92"/>
    <path d="M48.5 84.5 L60 97 L53.5 102.5 L44.5 90Z M71.5 84.5 L60 97 L66.5 102.5 L75.5 90Z" fill="#4a88cb"/>
    <rect x="58.3" y="97" width="3.4" height="13" fill="#2c5c92"/>
    <g fill="#fff"><circle cx="60" cy="101.5" r="1"/><circle cx="60" cy="106.5" r="1"/></g>`,
  direktion: `<path d="${KOERPER}" fill="#0a1c40"/>
    <path d="M48 85 L60 112 L72 85Z" fill="#FAF8F4"/>
    <path d="M48 85 L60 112 L50 105 L43.5 93Z M72 85 L60 112 L70 105 L76.5 93Z" fill="#16306a"/>
    <path d="M49 85 L60 95 L55.5 99Z M71 85 L60 95 L64.5 99Z" fill="#fff" stroke="#D5D0C6" stroke-width=".6"/>
    <path d="M57.4 93 L62.6 93 L64.3 108 L60 113 L55.7 108Z" fill="#B6633F"/><path d="M57 90.5 h6 l-1 4.5 h-4z" fill="#8f4a2c"/>
    <path d="M73.5 103.5 l7.5 -1.5 l-1 3.5 l-6 .5z" fill="#fff"/>`,
};

const HUT = {
  kueche: `<path d="M42.5 29 C33 21 38 6 50 9.5 C54 1.5 67 1.5 70.5 9.5 C82 6 87 21 77.5 29Z" fill="#fff"/>
    <path d="M51 12 q-2 8 0 15 M60 9 v18 M69 12 q2 8 0 15" stroke="#E3E3E1" stroke-width="1" fill="none"/>
    <rect x="43.5" y="26.5" width="33" height="9.5" rx="2" fill="#FAF8F4" stroke="#DDD8CE" stroke-width=".8"/>`,
  bellboy: `<g transform="rotate(-9 60 28)"><rect x="46" y="20.5" width="28" height="12.5" rx="3.2" fill="#B6633F"/>
    <rect x="46" y="28.5" width="28" height="4.5" rx="1.5" fill="#001436"/><path d="M46 28 h28" stroke="#E2C27A" stroke-width="1.2"/>
    <circle cx="60" cy="20.5" r="1.8" fill="#E2C27A"/></g>`,
};

function haarVorn(frisur, f, mitHut) {
  const kappe = `<path d="M43 49 C41.5 30 51 26.5 60 26.5 C69 26.5 78.5 30 77 49 C74.5 40 70 36 60 36 C50 36 45.5 40 43 49Z" fill="${f}"/>`;
  switch (frisur) {
    case 'glatze': return '';
    case 'scheitel': return `<path d="M43 50 C40 31 50 25.5 62 26.5 C72.5 27.5 79.5 34 77 50 C75.5 42 72 38 66.5 37 C58 40.5 50 40.5 45.5 38.5 C44 42 43.5 46 43 50Z" fill="${f}"/>`;
    case 'dutt': return (mitHut ? '' : `<circle cx="60" cy="22.5" r="7.5" fill="${f}"/>`) + kappe;
    case 'lang': return `<path d="M42.5 54 C40 30 52 26 60 26 C68 26 80 30 77.5 54 C76 43 72 37.5 62 36.5 C54 40 47 41 45 44 C43.5 47 43 50 42.5 54Z" fill="${f}"/>`;
    case 'locken': return `<g fill="${f}">${[[45, 40], [48, 32], [55, 27.5], [63, 27], [70, 30.5], [75, 38], [44, 47], [76.5, 46]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="6.4"/>`).join('')}</g>`;
    default: return kappe;
  }
}

let zaehler = 0;

/** Zeichnet einen Avatar als SVG-Text. hell = heller Hintergrund im Medaillon (für dunkle Flächen). */
export function avatarSvg(cfg, { hell = true } = {}) {
  const c = saubererAvatar(cfg);
  const id = 'av' + (++zaehler);
  const h = HAUTTOENE[c.haut], hd = dunkler(h, 0.86), hf = HAAR[c.haar];
  const mitHut = c.beruf in HUT;
  return `<svg viewBox="0 0 120 120" class="avatar" role="img" aria-hidden="true">` +
    `<defs><clipPath id="${id}"><circle cx="60" cy="60" r="57"/></clipPath></defs>` +
    `<circle cx="60" cy="60" r="57" fill="${hell ? '#EFEBE3' : '#16306a'}"/>` +
    `<g clip-path="url(#${id})">` +
    (c.frisur === 'lang' ? `<path d="M41 50 C37 26 83 26 79 50 L83 88 C74 93 46 93 37 88Z" fill="${hf}"/>` : '') +
    `<path d="M52 64 h16 v21 q-8 7 -16 0z" fill="${hd}"/>` +
    UNIFORM[c.beruf] +
    `<circle cx="43.6" cy="52" r="3.1" fill="${hd}"/><circle cx="76.4" cy="52" r="3.1" fill="${hd}"/>` +
    `<ellipse cx="60" cy="50" rx="16.6" ry="19.2" fill="${h}"/>` +
    (c.bart ? `<path d="M44 54 C44.5 70 53 72.5 60 72.5 C67 72.5 75.5 70 76 54 C73.5 60.5 69 62.5 60 62.5 C51 62.5 46.5 60.5 44 54Z" fill="${hf}"/>` : '') +
    haarVorn(c.frisur, hf, mitHut) +
    `<ellipse cx="53.4" cy="51.5" rx="1.75" ry="2.15" fill="#1E1A19"/><ellipse cx="66.6" cy="51.5" rx="1.75" ry="2.15" fill="#1E1A19"/>` +
    `<path d="M50.2 46.6 q3.2 -1.8 6.2 -.4 M63.6 46.2 q3 -1.4 6.2 .4" fill="none" stroke="${dunkler(hf, 0.8)}" stroke-width="1.15" stroke-linecap="round"/>` +
    `<path d="M60 54 q-1.6 3.8 .6 4.8" fill="none" stroke="${dunkler(h, 0.74)}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M54.8 61.8 q5.2 4.2 10.4 0" fill="none" stroke="${c.bart ? '#f1e6dc' : dunkler(h, 0.6)}" stroke-width="1.5" stroke-linecap="round"/>` +
    (c.brille ? `<g fill="none" stroke="#1B365F" stroke-width="1.25"><circle cx="53.4" cy="51.8" r="5"/><circle cx="66.6" cy="51.8" r="5"/><path d="M58.4 51.3 q1.6 -1.2 3.2 0 M48.4 51 l-4.4 -1 M71.6 51 l4.4 -1"/></g>` : '') +
    (HUT[c.beruf] || '') +
    `</g><circle cx="60" cy="60" r="57" fill="none" stroke="#B6633F" stroke-width="2"/></svg>`;
}
