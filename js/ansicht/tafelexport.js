// Whiteboard: Herunterladen als HTML (über den Haken ctx.exportHtml, gesetzt in main.js) und gemeinsame Helfer für die Druckansicht.
// Gelesen wird einmal (anmelden, ersten Stand vom Server nehmen, abmelden). Leitung: alle Gruppen (gruppe = null) oder eine;
// Mitglied: nur die eigene Gruppe (die Regeln des Speichers entscheiden, es gibt hier keine Abfrage, die nur der Leitung zusteht).
// Bilder kommen über den geprüften Zugriff (bildLaden) und werden als data:-Adressen eingebettet, EHL-Sticker ebenso; Emojis bleiben Text.
import { meldung } from '../ui.js';
import { t } from '../i18n.js';
import { htmlExport, dateiname } from '../logik/tafelexport.js';
import { stickerQuelle } from '../logik/tafelbilder.js';
import { stickerUrl } from './tafelelemente.js';

const WARTEN_MS = 20_000;     // so lange wartet ein einmaliges Lesen auf den Server
const GLEICHZEITIG = 6;       // Bilder, die gleichzeitig geladen werden
const FREIGEBEN_MS = 30_000;  // so lange bleibt die Adresse der heruntergeladenen Datei gültig
const WARNUNG_MS = 8000;      // so lange bleibt der Hinweis «Bilder fehlen» stehen

const fehler = code => Object.assign(new Error('tafelexport:' + code), { code });

/** Einmal lesen: beobachte(cb) anmelden, den ersten Wert (nicht undefined) nehmen und wieder abmelden. */
export function einmal(beobachte) {
  return new Promise((ok, nein) => {
    let fertig = false, stopp = null;
    const zeit = setTimeout(() => ende(undefined, fehler('netz')), WARTEN_MS);
    function ende(wert, err) {
      if (fertig) return;
      fertig = true;
      clearTimeout(zeit);
      if (stopp) { try { stopp(); } catch { /* schon weg */ } }
      if (err) nein(err); else ok(wert);
    }
    try { stopp = beobachte(w => { if (w !== undefined) ende(w); }); } catch (e) { ende(undefined, e); return; }
    if (fertig && stopp) { try { stopp(); } catch { /* schon weg */ } }   // der Wert kam schon während des Anmeldens
  });
}

/**
 * Sitzung und Gruppen für Druck und Export. gruppe = null: alle Gruppen (nur die Leitung), sonst nur diese.
 * Ergebnis: { sitzung, gruppen: [{ nr, name, mitglieder: [Vorname], elemente }] }.
 */
export async function sammle(store, code, gruppe, sitzung) {
  const s = sitzung || await store.tafel.nachsehen(code);
  if (!s) throw fehler('nichtGefunden');
  const namen = Array.isArray(s.gruppen) ? s.gruppen : [];
  const alle = gruppe === null;
  if (!alle && !(Number.isInteger(gruppe) && gruppe >= 0 && gruppe < namen.length)) throw fehler('nichtGefunden');
  const [mitglieder, elemente] = await Promise.all([
    einmal(cb => store.tafel.mitgliederBeobachten(code, alle ? null : gruppe, cb)),
    einmal(cb => store.tafel.elementeBeobachten(code, alle ? null : gruppe, cb)),
  ]);
  const m = Array.isArray(mitglieder) ? mitglieder : [], e = Array.isArray(elemente) ? elemente : [];
  const nummern = alle ? namen.map((_, i) => i) : [gruppe];
  return {
    sitzung: s,
    gruppen: nummern.map(nr => ({
      nr, name: String(namen[nr] ?? ''),
      mitglieder: m.filter(x => x && x.gruppe === nr && x.name).map(x => String(x.name)).sort((a, b) => a.localeCompare(b)),
      elemente: e.filter(x => x && x.gruppe === nr && x.id),
    })),
  };
}

/** Pfade der Bilder und Namen der EHL-Sticker, die in den Gruppen vorkommen. */
export function benutzteBilder(gruppen) {
  const pfade = new Set(), sticker = new Set();
  for (const g of gruppen) for (const e of g.elemente) {
    if (e.art === 'bild' && e.bildPfad) pfade.add(e.bildPfad);
    if (e.art === 'sticker') { const q = stickerQuelle(e.zeichen); if (q && q.art === 'ehl') sticker.add(q.name); }
  }
  return { pfade: [...pfade], sticker: [...sticker] };
}

async function nacheinander(aufgaben, anzahl) {
  let i = 0;
  const arbeite = async () => { while (i < aufgaben.length) { const a = aufgaben[i++]; try { await a(); } catch (e) { console.warn('rabiosa:', e); } } };
  await Promise.all(Array.from({ length: Math.min(anzahl, aufgaben.length) }, arbeite));
}

const ARTEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
/** Bildart aus den ersten Bytes, falls der Speicher keine mitliefert. */
function erkenneArt(b) {
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
async function alsDataUrl(blob, art) {
  let typ = art || blob.type;
  if (!ARTEN.includes(typ)) typ = erkenneArt(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
  if (!typ) return null;
  const sauber = blob.type === typ ? blob : new Blob([blob], { type: typ });
  return new Promise((ok, nein) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => nein(r.error);
    r.readAsDataURL(sauber);
  });
}
async function svgAlsDataUrl(url) {
  const antwort = await fetch(url);
  if (!antwort.ok) return null;
  return alsDataUrl(await antwort.blob(), 'image/svg+xml');
}

/** Alle Bilder und EHL-Sticker der Gruppen als Map(pfad | 'ehl:<name>' -> data:-Adresse). Fehlende Bilder fehlen. */
export async function bilderAlsDaten(store, gruppen) {
  const { pfade, sticker } = benutzteBilder(gruppen);
  const karte = new Map();
  await nacheinander([
    ...pfade.map(p => async () => { const blob = await store.tafel.bildLaden(p); const url = blob && await alsDataUrl(blob); if (url) karte.set(p, url); }),
    ...sticker.map(n => async () => { const url = await svgAlsDataUrl(stickerUrl(n)); if (url) karte.set('ehl:' + n, url); }),
  ], GLEICHZEITIG);
  return karte;
}

/** Eine Datei herunterladen: Blob-Adresse, <a download>, danach freigeben. */
export function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), FREIGEBEN_MS);
}

const laufend = new Set();

/** Der Haken ctx.exportHtml: gruppe === null = alle Gruppen (nur die Leitung), eine Zahl = nur diese Gruppe. */
export async function exportiereHtml(store, sprache, code, gruppe) {
  const schluessel = code + '/' + gruppe;
  if (laufend.has(schluessel)) return;        // zweiter Klick, während die Datei noch entsteht
  laufend.add(schluessel);
  try {
    meldung(t(sprache, 'tx.erstellt'));
    const { sitzung, gruppen } = await sammle(store, code, gruppe);
    const sp = sitzung.sprache === 'en' || sitzung.sprache === 'de' ? sitzung.sprache : sprache;
    const [bilder, logo] = await Promise.all([
      bilderAlsDaten(store, gruppen),
      svgAlsDataUrl(new URL(`../../bilder/ehl-${sp === 'en' ? 'en' : 'de'}-weiss.svg`, import.meta.url).href).catch(() => null),
    ]);
    const html = htmlExport({ sitzung, gruppen, bilder, sprache: sp, logo });
    herunterladen(new Blob([html], { type: 'text/html;charset=utf-8' }), dateiname(sitzung, gruppe === null ? null : gruppen[0], 'html'));
    // bildLaden gibt nach einer Frist auf: Die Datei hat dann Platzhalter, und man soll es wissen.
    // Länger stehen lassen als die übliche Meldung: Sie ist eine Warnung, kein Fortschritt (die Aufrufer melden nur Fehler).
    if (benutzteBilder(gruppen).pfade.some(p => !bilder.has(p))) meldung(t(sprache, 'tx.bilderFehlen'), WARNUNG_MS);
  } finally { laufend.delete(schluessel); }
}
