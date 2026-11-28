// Whiteboard: reine Helfer für das Board (Ansicht, Treffer, Striche, Drosseln). Ohne Datenbank und ohne Oberfläche.
// Koordinaten in Board-Einheiten (eine Zone = 1600 × 900). Bei Strich und Pfeil liegen «punkte» relativ zur Ecke (x, y)
// des Elements; so ändert Verschieben nur x und y, und b × h ist immer die Hülle der Punkte.
import { vereinfache, PUNKTE_MAX, NAME_MAX } from './tafel.js';

export const DICKE = { 1: 4, 2: 8, 3: 16 };          // Strichbreite in Board-Einheiten
export const TEXTGROESSE = { S: 32, M: 48, L: 80 };   // Schrift eines Textfelds
export const ZETTELGROESSE = { S: 24, M: 32, L: 44 }; // Schrift auf einem Zettel
export const ZETTEL_SEITE = 260;
export const TEXT_BREITE = 560;
export const MIN_SEITE = 20;
export const ZOOM_MIN = 0.05, ZOOM_MAX = 4;
export const DROSSEL_MS = 250;
export const FREMD_MS = 10_000;   // so lange gilt ein fremder Rahmen ohne neue Änderung

/** Kennung eines neuen Elements: sortiert nach Anlegezeit. zufall(n) liefert n Zeichen. */
export const neueKennung = (jetzt, zufall) => 'e' + jetzt.toString(36) + zufall(8);

// ---------- Ansicht: Bildschirm = Brett * s + (x, y) ----------
export const zuBrett = (a, px, py) => ({ x: (px - a.x) / a.s, y: (py - a.y) / a.s });

/** Massstab und Versatz, damit die ganze Welt mit Rand in die Fläche passt, mittig. */
export function einpassen(flaecheB, flaecheH, weltB, weltH, rand = 24) {
  const s = Math.max(ZOOM_MIN, Math.min((flaecheB - 2 * rand) / weltB, (flaecheH - 2 * rand) / weltH)) || ZOOM_MIN;
  return { s, x: (flaecheB - weltB * s) / 2, y: (flaecheH - weltH * s) / 2 };
}

/** Zoomt um den Bildschirmpunkt (px, py): Was dort liegt, bleibt dort. */
export function zoome(a, faktor, px, py, min = ZOOM_MIN, max = ZOOM_MAX) {
  const s = Math.min(max, Math.max(min, a.s * faktor));
  const p = zuBrett(a, px, py);
  return { s, x: px - p.x * s, y: py - p.y * s };
}

// ---------- Formen ----------
/** Kleinstes Rechteck um [x0, y0, x1, y1, …], mindestens 1 × 1. */
export function huelle(punkte) {
  if (punkte.length < 2) return { x: 0, y: 0, b: 1, h: 1 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < punkte.length; i += 2) {
    x0 = Math.min(x0, punkte[i]); x1 = Math.max(x1, punkte[i]);
    y0 = Math.min(y0, punkte[i + 1]); y1 = Math.max(y1, punkte[i + 1]);
  }
  return { x: x0, y: y0, b: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

const runde = w => Math.round(w * 10) / 10;
const relativ = (punkte, x, y) => punkte.map((w, i) => runde(w - (i % 2 ? y : x)));

/** Aus den gezeichneten Punkten (absolut) ein Strich: vereinfacht, relativ, innerhalb von PUNKTE_MAX. */
export function strichAus(absolut, toleranz = 2) {
  let p = absolut.length >= 2 ? absolut.slice(0, absolut.length - (absolut.length % 2)) : [0, 0];
  if (p.length === 2) p = [p[0], p[1], p[0], p[1]];   // ein Klick: ein Punkt
  let v = vereinfache(p, toleranz);
  for (let tol = toleranz * 2; v.length > PUNKTE_MAX && tol < 1e6; tol *= 2) v = vereinfache(p, tol);
  if (v.length > PUNKTE_MAX) v = [...v.slice(0, PUNKTE_MAX - 2), ...v.slice(-2)];
  const r = huelle(v);
  return { x: runde(r.x), y: runde(r.y), b: runde(r.b), h: runde(r.h), punkte: relativ(v, r.x, r.y) };
}

/** Rechteck aus zwei Ecken, in jede Richtung gezogen. */
export function rechteckAus(x0, y0, x1, y1) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), b: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** Pfeil oder Linie von (x0, y0) nach (x1, y1): Hülle und zwei relative Punkte, der Start zuerst. */
export function linieAus(x0, y0, x1, y1) {
  const r = rechteckAus(x0, y0, x1, y1);
  return { ...r, punkte: relativ([x0, y0, x1, y1], r.x, r.y) };
}

export const verschiebe = (e, dx, dy) => ({ ...e, x: runde(e.x + dx), y: runde(e.y + dy) });

/** Neue Grösse; Strich und Pfeil wachsen mit (die Punkte werden gestreckt). */
export function skaliere(e, b, h) {
  const linie = e.art === 'strich' || e.art === 'pfeil';
  const min = linie ? 1 : MIN_SEITE;
  const nb = runde(Math.max(min, b)), nh = runde(Math.max(min, h));
  const neu = { ...e, b: nb, h: nh };
  if (linie && Array.isArray(e.punkte)) {
    const fx = nb / Math.max(1, e.b || 1), fy = nh / Math.max(1, e.h || 1);
    neu.punkte = e.punkte.map((w, i) => runde(w * (i % 2 ? fy : fx)));
  }
  return neu;
}

// ---------- Treffer ----------
function abstandZuStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function trifft(e, x, y, tol) {
  const b = e.b || 0, h = e.h || 0;
  if (e.art === 'strich' || e.art === 'pfeil') {
    const p = e.punkte || [];
    const grenze = tol + (DICKE[e.dicke] || DICKE[2]) / 2 + (e.art === 'pfeil' ? 4 : 0);
    if (x < e.x - grenze || x > e.x + b + grenze || y < e.y - grenze || y > e.y + h + grenze) return false;
    if (p.length === 2) return Math.hypot(x - e.x - p[0], y - e.y - p[1]) <= grenze;
    for (let i = 0; i + 3 < p.length; i += 2) {
      if (abstandZuStrecke(x, y, e.x + p[i], e.y + p[i + 1], e.x + p[i + 2], e.y + p[i + 3]) <= grenze) return true;
    }
    return false;
  }
  return x >= e.x - tol && x <= e.x + b + tol && y >= e.y - tol && y <= e.y + h + tol;
}

/** Reihenfolge der Darstellung: z aufsteigend, bei Gleichstand nach Kennung (= Anlegezeit). */
export const reihenfolge = elemente => [...elemente].sort((a, b) => (a.z || 0) - (b.z || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Das oberste Element am Punkt (x, y) oder null. */
export function getroffen(elemente, x, y, toleranz = 0) {
  const liste = reihenfolge(elemente);
  for (let i = liste.length - 1; i >= 0; i--) if (trifft(liste[i], x, y, toleranz)) return liste[i];
  return null;
}

export const zVorn = elemente => (elemente.length ? Math.max(...elemente.map(e => e.z || 0)) + 1 : 1);
export const zHinten = elemente => (elemente.length ? Math.min(...elemente.map(e => e.z || 0)) - 1 : 0);

/** Dreieck der Pfeilspitze am Ende (x1, y1): [Spitze, linke Ecke, rechte Ecke]. */
export function pfeilSpitze(x0, y0, x1, y1, laenge) {
  const w = Math.atan2(y1 - y0, x1 - x0), breit = 0.45;
  return [x1, y1,
    x1 - laenge * Math.cos(w - breit), y1 - laenge * Math.sin(w - breit),
    x1 - laenge * Math.cos(w + breit), y1 - laenge * Math.sin(w + breit)].map(runde);
}

// ---------- Drosseln ----------
/**
 * Ruft fn höchstens einmal pro «ms» auf. Was dazwischen kommt, wird gesammelt: Der neuste Stand folgt am Ende
 * des Abstands. abbrechen() verwirft einen geplanten Nachzügler (zum Beispiel vor dem endgültigen Speichern).
 */
export function erstelleDrossel(fn, ms, { jetzt = Date.now, plane = setTimeout, stoppe = clearTimeout } = {}) {
  let letzt = -Infinity, geplant = null, offen = null;
  const los = () => { geplant = null; const w = offen; offen = null; if (w) { letzt = jetzt(); fn(...w); } };
  return {
    rufe(...werte) {
      const t = jetzt();
      if (geplant === null && t - letzt >= ms) { letzt = t; fn(...werte); return; }
      offen = werte;
      if (geplant === null) geplant = plane(los, Math.max(0, letzt + ms - t));
    },
    abbrechen() { if (geplant !== null) stoppe(geplant); geplant = null; offen = null; },
  };
}

// ---------- Namen ----------
/** Vorname zum Kontonamen der Leitung: erster Teil, höchstens NAME_MAX Zeichen. */
export const kurzname = name => String(name ?? '').trim().split(/\s+/)[0].slice(0, NAME_MAX);

/** Rahmen zeigen? Nur bei anderen und nur, solange die letzte Änderung frisch ist (empfangen = lokale Zeit). */
export const istFremdBearbeitet = (e, meineUid, empfangen, jetzt) =>
  !!(e && e.bearbeitet && e.bearbeitet.uid && e.bearbeitet.uid !== meineUid && jetzt - empfangen < FREMD_MS);

/** Gleicher Inhalt? Reihenfolge der Felder egal (Firestore liefert sie beliebig), undefined zählt wie fehlend. */
export function gleicheElemente(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((w, i) => gleicheElemente(w, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  return ka.length === kb.length && ka.every(k => k in b && gleicheElemente(a[k], b[k]));
}
