// Einstieg: wählt den Speicher und zeigt je nach Adresse die passende Ansicht.
//   #/                      Startseite (Code eingeben)
//   #/123456                Handy der Studierenden
//   #/beamer/123456         Beamer / Spielleitung
//   #/studio                Studio der Dozierenden
//   #/studio/quiz/ID        Quiz-Editor
//   #/studio/rueckblick/ID  Rückblicke zu einem Quiz
//   #/cloche/ID             Cloche: Board mit Gruppen auf diesem Laptop
import { waehleStore, istDemo } from './store/index.js';
import { h, leere } from './ui.js';
import { t } from './i18n.js';

const wurzel = document.getElementById('app');
let abbau = null;
let store = null;

const ctx = {
  get store() { return store; },
  demo: istDemo(),
  get sprache() {
    try { const s = localStorage.getItem('rabiosa-sprache'); if (s === 'de' || s === 'en') return s; } catch { /* ohne Speicher */ }
    return (navigator.language || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
  },
  set sprache(s) { try { localStorage.setItem('rabiosa-sprache', s); } catch { /* ohne Speicher */ } },
  geh(ziel) { if (location.hash === ziel) zeige(); else location.hash = ziel; },
  /** Adresse, die im QR-Code steht. */
  beitrittsAdresse: code => location.origin + location.pathname + location.search + '#/' + code,
};

const ANSICHTEN = {
  start: () => import('./ansicht/start.js'),
  spieler: () => import('./ansicht/spieler.js'),
  beamer: () => import('./ansicht/beamer.js'),
  studio: () => import('./ansicht/studio.js'),
  editor: () => import('./ansicht/editor.js'),
  rueckblick: () => import('./ansicht/rueckblick.js'),
  cloche: () => import('./ansicht/cloche.js'),
};

function route() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!teile.length) return ['start'];
  if (/^\d{6}$/.test(teile[0])) return ['spieler', teile[0]];
  if (teile[0] === 'cloche' && teile[1]) return ['cloche', teile[1]];
  if (teile[0] === 'beamer' && /^\d{6}$/.test(teile[1] || '')) return ['beamer', teile[1]];
  if (teile[0] === 'studio') {
    if (teile[1] === 'quiz' && teile[2]) return ['editor', teile[2]];
    if (teile[1] === 'rueckblick' && teile[2]) return ['rueckblick', teile[2]];
    return ['studio'];
  }
  return ['start'];
}

let lauf = 0;
async function zeige() {
  const meiner = ++lauf;
  const [name, ...werte] = route();
  try { abbau?.(); } catch (e) { console.error(e); }
  abbau = null;
  document.body.dataset.ansicht = name;
  leere(wurzel).append(h('p', { class: 'laedt' }, t(ctx.sprache, 'allg.laedt')));
  try {
    const ansicht = ANSICHTEN[name]();   // lädt neben dem Speicher (Firebase-SDK) her, nicht erst danach
    ansicht.catch(() => {});             // ein Fehler wird beim await unten gemeldet
    store ??= await waehleStore();
    const modul = await ansicht;
    if (meiner !== lauf) return;
    leere(wurzel);
    abbau = modul.zeige(wurzel, ctx, ...werte) || null;
  } catch (e) {
    console.error(e);
    if (meiner === lauf) leere(wurzel).append(h('p', { class: 'laedt' }, t(ctx.sprache, 'fehler.allgemein')));
  }
}

window.addEventListener('hashchange', zeige);
zeige();
