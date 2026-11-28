// Einstieg: wählt den Speicher und zeigt je nach Adresse die passende Ansicht (Adressen: js/route.js).
import { waehleStore, istDemo } from './store/index.js';
import { h, leere } from './ui.js';
import { t } from './i18n.js';
import { route } from './route.js';
import { VARIANTE } from './variante.js';

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
  teilnahme: () => import('./ansicht/teilnahme.js'),
  praesentation: () => import('./ansicht/praesentation.js'),
  folieneditor: () => import('./ansicht/folieneditor.js'),
  tafeleditor: () => import('./ansicht/tafeleditor.js'),
  tafelbeitritt: () => import('./ansicht/tafelbeitritt.js'),
  // Weitere Whiteboard-Ansichten (tafelbrett, tafelzeigen …) folgen; bis dahin gilt die Startseite.
};

let lauf = 0;
async function zeige() {
  const meiner = ++lauf;
  const [name, ...werte] = route(location.hash, VARIANTE);
  try { abbau?.(); } catch (e) { console.error(e); }
  abbau = null;
  document.body.dataset.ansicht = name;
  leere(wurzel).append(h('p', { class: 'laedt' }, t(ctx.sprache, 'allg.laedt')));
  try {
    const ansicht = (ANSICHTEN[name] ?? ANSICHTEN.start)();   // lädt neben dem Speicher (Firebase-SDK) her, nicht erst danach
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
