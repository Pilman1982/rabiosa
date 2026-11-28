// Whiteboard: Bilder, GIFs und Sticker auf dem Board. Einlesen und Verkleinern im Browser, Hochladen über den Speicher,
// Adressen der Bilder (Object-URL, pro Pfad gemerkt, beim Abbau freigegeben) und die Auswahl der Sticker.
// Eingang: Strg+V, Hineinziehen, Dateiauswahl (Knopf Bild). Das Board (tafelbrett.js) verdrahtet die Ereignisse.
import { h, meldung } from '../ui.js';
import { bildPruefen, bildErlaubt, zielGroesse, BILDARTEN } from '../logik/tafel.js';
import {
  einpassGroesse, hatTransparenz, plusUnterwegs, bildFehlerSchluessel, EMOJIS, EHL_STICKER, STICKER_GROESSE,
} from '../logik/tafelbilder.js';
import { stickerUrl } from './tafelelemente.js';

const PRUEF_KANTE = 256;      // für die Suche nach Transparenz genügt eine kleine Kopie
const NEU_VERSUCH_MS = 5000;  // so lange wartet ein fehlgeschlagenes Laden bis zum nächsten Versuch
const VERSATZ = 40;           // mehrere Bilder auf einmal liegen gestaffelt

const fehler = (code, ursache) => Object.assign(new Error('bild:' + code), { code, ursache });

async function dekodiere(datei) {
  try { return await createImageBitmap(datei); } catch { /* ältere Browser: über ein Bildelement */ }
  const url = URL.createObjectURL(datei);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, bild: img, close() {} };
  } finally { URL.revokeObjectURL(url); }
}
const quelle = bmp => bmp.bild || bmp;

const alsBlob = (leinwand, art, qualitaet) => new Promise(ok => leinwand.toBlob(ok, art, qualitaet));

/**
 * Eine Bilddatei für das Board vorbereiten. GIF bleibt unverändert (es soll weiter laufen); PNG, JPG und WebP werden
 * höchstens 2000 px an der langen Seite gross und als JPEG 0.85 gespeichert, mit Transparenz als PNG.
 * Ergebnis: { blob, b, h, type }. Fehler: Error mit code 'art' | 'gross' | 'kaputt'.
 */
export async function bildEinlesen(datei) {
  const code = bildPruefen(datei);
  if (code) throw fehler(code);
  let bmp;
  try { bmp = await dekodiere(datei); } catch (e) { throw fehler('kaputt', e); }
  try {
    const b0 = bmp.width, h0 = bmp.height;
    if (!(b0 > 0 && h0 > 0)) throw fehler('kaputt');
    if (datei.type === 'image/gif') return { blob: datei, b: b0, h: h0, type: datei.type };
    const z = zielGroesse(b0, h0);
    let png = false;
    if (datei.type !== 'image/jpeg') {
      const k = zielGroesse(z.b, z.h, PRUEF_KANTE);
      const klein = document.createElement('canvas');
      klein.width = k.b; klein.height = k.h;
      const kc = klein.getContext('2d', { willReadFrequently: true });
      kc.drawImage(quelle(bmp), 0, 0, k.b, k.h);
      png = hatTransparenz(kc.getImageData(0, 0, k.b, k.h).data);
    }
    const leinwand = document.createElement('canvas');
    leinwand.width = z.b; leinwand.height = z.h;
    const c = leinwand.getContext('2d');
    if (!png) { c.fillStyle = '#fff'; c.fillRect(0, 0, z.b, z.h); }
    c.drawImage(quelle(bmp), 0, 0, z.b, z.h);
    const blob = await alsBlob(leinwand, png ? 'image/png' : 'image/jpeg', 0.85);
    if (!blob) throw fehler('kaputt');
    // Nicht verkleinert und nicht kleiner geworden: die Originaldatei behalten.
    if (z.b === b0 && z.h === h0 && blob.size >= datei.size) return { blob: datei, b: b0, h: h0, type: datei.type };
    return { blob, b: z.b, h: z.h, type: blob.type };
  } finally { bmp.close?.(); }
}

/**
 * Adressen der Bilder eines Boards. lade(pfad) liefert ein Blob oder null. Pro Pfad wird einmal geladen;
 * ein Fehlschlag wird nach einigen Sekunden neu versucht. freigeben() gibt alle Object-URLs frei.
 */
export function erstelleBildUrls(lade, jetzt = Date.now) {
  const karte = new Map();   // pfad -> { promise, url: string | null | undefined, bis }
  let zu = false;
  function bildUrl(pfad) {
    const alt = karte.get(pfad);
    if (alt && !(alt.url === null && alt.bis <= jetzt())) return alt.promise;
    const eintrag = { url: undefined, bis: 0 };
    eintrag.promise = (async () => {
      let blob = null;
      try { blob = await lade(pfad); } catch { blob = null; }
      if (blob && !zu) eintrag.url = URL.createObjectURL(blob);
      else { eintrag.url = null; eintrag.bis = jetzt() + NEU_VERSUCH_MS; }
      return eintrag.url;
    })();
    karte.set(pfad, eintrag);
    return eintrag.promise;
  }
  return {
    bildUrl,
    /** string = fertig, null = gescheitert (vorerst), undefined = noch nicht geladen. */
    gecacht(pfad) { const e = karte.get(pfad); return !e || (e.url === null && e.bis <= jetzt()) ? undefined : e.url; },
    laeuft(pfad) { const e = karte.get(pfad); return !!e && e.url === undefined; },
    freigeben() {
      zu = true;
      for (const e of karte.values()) if (e.url) URL.revokeObjectURL(e.url);
      karte.clear();
    },
  };
}

/**
 * Bilder und Sticker für ein Board. b ist die Schnittstelle des Boards (tafelbrett.js).
 * Ergebnis: { einfuegen(dateien, punkt), dateiWaehlen(), stickerWahl(), schliessen(), abbau() }.
 */
export function erstelleBilder(b) {
  const T = b.T;
  let zaehler = { bilder: 0, bytes: 0 };
  const unterwegs = { n: 0, bytes: 0 };
  let zu = false, wahl = null, stand = 0;   // stand zählt die Meldungen des Speichers
  const stoppZaehler = (() => { try { return b.zaehlerBeobachten(z => { stand++; zaehler = z || { bilder: 0, bytes: 0 }; }); } catch { return () => {}; } })();

  const frei = bytes => bildErlaubt(plusUnterwegs(zaehler, unterwegs), bytes);
  const melde = code => meldung(T(bildFehlerSchluessel(code)));

  /** Eine Datei prüfen, verkleinern, hochladen. Ergebnis: false, wenn das Board voll ist (weitere Dateien lohnen nicht). */
  async function eine(datei, mitte) {
    const pruef = bildPruefen(datei);
    if (pruef) { melde(pruef); return true; }
    const vorher = frei(datei.type === 'image/gif' ? datei.size : 0);
    if (vorher) { melde(vorher); return false; }
    // Schon beim Einlesen reservieren, damit gleichzeitig eingefügte Dateien mitzählen.
    let gebucht = datei.size;
    unterwegs.n++; unterwegs.bytes += gebucht;
    try {
      let ein;
      try { ein = await bildEinlesen(datei); } catch (e) { melde(e.code || 'kaputt'); return true; }
      if (zu || !b.schreibbar()) return true;
      unterwegs.bytes += ein.blob.size - gebucht; gebucht = ein.blob.size;
      const nachher = bildErlaubt({ bilder: zaehler.bilder + unterwegs.n - 1, bytes: zaehler.bytes + unterwegs.bytes - gebucht }, ein.blob.size);
      if (nachher) { melde(nachher); return false; }
      const g = einpassGroesse(ein.b, ein.h);
      const e = b.neu('bild', { x: Math.round(mitte.x - g.b / 2), y: Math.round(mitte.y - g.h / 2), b: g.b, h: g.h });
      b.vorschau(e);   // der Platzhalter «wird hochgeladen …»
      b.platziert(e.id);
      try {
        const vorStand = stand;
        b.echo(await b.bildHochladen(e, ein.blob));
        // Hat der Speicher den neuen Zähler noch nicht gemeldet, gilt das Bild trotzdem schon für das nächste.
        if (stand === vorStand) zaehler = { ...zaehler, bilder: zaehler.bilder + 1, bytes: zaehler.bytes + ein.blob.size };
      } catch (err) {
        if (err && err.code === 'grenze') { b.verwerfen(e.id); melde('grenze'); return false; }
        b.fehlgeschlagen(err, e.id);
      }
      return true;
    } finally { unterwegs.n--; unterwegs.bytes -= gebucht; }
  }

  /** Mehrere Dateien nacheinander; punkt = Mitte des ersten Bildes in Board-Einheiten (sonst die Mitte der Ansicht). */
  async function einfuegen(dateien, punkt) {
    const liste = [...dateien];
    if (!liste.length || !b.schreibbar()) return;
    const start = punkt || b.mitte();
    for (let i = 0; i < liste.length; i++) {
      if (zu || !b.schreibbar()) return;
      if (!(await eine(liste[i], { x: start.x + i * VERSATZ, y: start.y + i * VERSATZ }))) return;
    }
  }

  // ---------- Dateiauswahl ----------
  let feld = null;
  function dateiWaehlen() {
    if (!feld) {
      feld = h('input', { type: 'file', accept: BILDARTEN.join(','), multiple: true, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
      feld.addEventListener('change', () => { const d = [...feld.files]; feld.value = ''; einfuegen(d, null); });
      document.body.append(feld);
    }
    feld.click();
  }

  // ---------- Sticker ----------
  function stickerLegen(zeichen) {
    if (!b.schreibbar()) return;
    const c = b.mitte(), g = STICKER_GROESSE;
    let x = Math.round(c.x - g / 2), y = Math.round(c.y - g / 2);
    // Nicht genau auf einen anderen Sticker legen, sonst sieht man den neuen nicht.
    while (b.elemente().some(e => e.art === 'sticker' && Math.abs(e.x - x) < 1 && Math.abs(e.y - y) < 1)) { x += 30; y += 30; }
    const e = b.neu('sticker', { x, y, b: g, h: g, zeichen });
    b.speichern(e, null);
    b.platziert(e.id);
  }

  const aussen = ev => { if (wahl && !wahl.contains(ev.target) && !ev.target.closest?.('[data-tbs-knopf]')) schliessen(); };
  const taste = ev => { if (ev.key === 'Escape') schliessen(); };
  function schliessen() {
    if (!wahl) return;
    wahl.remove(); wahl = null;
    document.removeEventListener('pointerdown', aussen, true);
    document.removeEventListener('keydown', taste, true);
  }
  function stickerWahl() {
    if (wahl) { schliessen(); return; }
    if (!b.schreibbar()) return;
    const waehle = zeichen => { stickerLegen(zeichen); schliessen(); };
    const raster = (klasse, knoepfe) => h('div', { class: 'tbs-raster ' + klasse }, knoepfe);
    wahl = h('div', { class: 'tbs-wahl', role: 'dialog', 'aria-label': T('sticker.titel') },
      h('div', { class: 'tbs-kopf' },
        h('b', null, T('sticker.titel')),
        h('button', { type: 'button', class: 'tbs-zu', title: T('sticker.zu'), 'aria-label': T('sticker.zu'), onclick: schliessen }, '×')),
      EMOJIS.map(gruppe => [
        h('h4', null, T('sticker.' + gruppe.gruppe)),
        raster('emoji', gruppe.zeichen.map(z => h('button', { type: 'button', class: 'tbs-knopf', onclick: () => waehle(z) }, z))),
      ]),
      h('h4', null, T('sticker.ehl')),
      raster('ehl', EHL_STICKER.map(name => h('button', { type: 'button', class: 'tbs-knopf', title: T('sticker.' + name), 'aria-label': T('sticker.' + name), onclick: () => waehle('ehl:' + name) },
        h('img', { src: stickerUrl(name), alt: '', draggable: 'false' })))));
    b.buehne.append(wahl);
    document.addEventListener('pointerdown', aussen, true);
    document.addEventListener('keydown', taste, true);
  }

  function abbau() {
    zu = true;
    schliessen();
    stoppZaehler();
    feld?.remove(); feld = null;
  }
  return { einfuegen, dateiWaehlen, stickerWahl, schliessen, abbau };
}
