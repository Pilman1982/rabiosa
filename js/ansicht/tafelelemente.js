// Whiteboard: zeichnet Elemente und Zonen, rein darstellend und ohne Speicher (Board, Übersicht, Präsentation, Druck).
// Alles in Board-Einheiten als CSS-Pixel; die Ansicht skaliert die ganze Welt per transform.
// Fremde Texte gehen nur als Textknoten ins Dokument, Farben nur nach Prüfung.
import { h } from '../ui.js';
import { zonenRaster } from '../logik/tafel.js';
import { DICKE, TEXTGROESSE, ZETTELGROESSE, pfeilSpitze } from '../logik/tafelbrett.js';

const NS = 'http://www.w3.org/2000/svg';
const FARBE = /^#[0-9a-fA-F]{3,8}$/;
const farbe = (w, sonst) => (typeof w === 'string' && FARBE.test(w) ? w : sonst);
const zahl = (w, sonst = 0) => (typeof w === 'number' && Number.isFinite(w) ? w : sonst);

function s(tag, attribute) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attribute)) el.setAttribute(k, String(v));
  return el;
}

function leinwand(b, hoehe) {
  return s('svg', { class: 'tb-svg', width: b, height: hoehe, viewBox: `0 0 ${b} ${hoehe}`, 'aria-hidden': 'true' });
}

const punkteText = p => { const t = []; for (let i = 0; i + 1 < p.length; i += 2) t.push(p[i] + ',' + p[i + 1]); return t.join(' '); };

function strich(e, b, hoehe) {
  const svg = leinwand(b, hoehe);
  const p = Array.isArray(e.punkte) && e.punkte.length >= 2 ? e.punkte : [0, 0];
  const breite = DICKE[e.dicke] || DICKE[2];
  const f = farbe(e.farbe, '#001436');
  if (p.length <= 4 && p[0] === p[2] && p[1] === p[3]) svg.append(s('circle', { cx: p[0], cy: p[1], r: breite / 2, fill: f }));
  else svg.append(s('polyline', { points: punkteText(p), fill: 'none', stroke: f, 'stroke-width': breite, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return svg;
}

function pfeil(e, b, hoehe) {
  const svg = leinwand(b, hoehe);
  const p = Array.isArray(e.punkte) && e.punkte.length >= 4 ? e.punkte : [0, 0, b, hoehe];
  const breite = DICKE[e.dicke] || DICKE[2];
  const f = farbe(e.farbe, '#001436');
  const laenge = Math.max(18, breite * 3.5);
  const [x0, y0, x1, y1] = p;
  const l = Math.hypot(x1 - x0, y1 - y0) || 1;
  const kurz = Math.min(l, laenge * 0.6);   // die Linie endet in der Spitze, nicht davor
  svg.append(s('line', { x1: x0, y1: y0, x2: x1 - (x1 - x0) / l * kurz, y2: y1 - (y1 - y0) / l * kurz, stroke: f, 'stroke-width': breite, 'stroke-linecap': 'round' }));
  svg.append(s('polygon', { points: punkteText(pfeilSpitze(x0, y0, x1, y1, laenge)), fill: f }));
  return svg;
}

function form(e, b, hoehe) {
  const svg = leinwand(b, hoehe);
  const breite = DICKE[e.dicke] || DICKE[2];
  const f = farbe(e.farbe, '#001436');
  const r = breite / 2;
  const gemeinsam = { fill: 'none', stroke: f, 'stroke-width': breite };
  if (e.form === 'kreis') svg.append(s('ellipse', { cx: b / 2, cy: hoehe / 2, rx: Math.max(1, b / 2 - r), ry: Math.max(1, hoehe / 2 - r), ...gemeinsam }));
  else svg.append(s('rect', { x: r, y: r, width: Math.max(1, b - breite), height: Math.max(1, hoehe - breite), rx: Math.min(12, b / 8, hoehe / 8), ...gemeinsam }));
  return svg;
}

/**
 * Ein Element als absolut positionierter Knoten (left/top/width/height in Board-Einheiten, z-index = z).
 * bildUrl: Adresse für ein Bild-Element (Task 7 lädt sie über getBlob); ohne sie erscheint ein Platzhalter.
 */
export function zeichneElement(e, { bildUrl } = {}) {
  const b = Math.max(1, zahl(e.b, 1)), hoehe = Math.max(1, zahl(e.h, 1));
  const el = h('div', { class: 'tb-el tb-' + e.art, 'data-id': e.id });
  el.style.left = zahl(e.x) + 'px';
  el.style.top = zahl(e.y) + 'px';
  el.style.width = b + 'px';
  el.style.height = hoehe + 'px';
  el.style.zIndex = String(Math.round(zahl(e.z)));
  const groesse = ['S', 'M', 'L'].includes(e.groesse) ? e.groesse : 'M';
  switch (e.art) {
    case 'zettel':
      el.style.background = farbe(e.farbe, '#FFF6C9');
      el.style.fontSize = ZETTELGROESSE[groesse] + 'px';
      el.append(h('div', { class: 'tb-inhalt' }, e.text || ''));
      break;
    case 'text':
      el.style.color = farbe(e.farbe, '#001436');
      el.style.fontSize = TEXTGROESSE[groesse] + 'px';
      el.append(h('div', { class: 'tb-inhalt' }, e.text || ''));
      break;
    case 'strich': el.append(strich(e, b, hoehe)); break;
    case 'pfeil': el.append(pfeil(e, b, hoehe)); break;
    case 'form': el.append(form(e, b, hoehe)); break;
    case 'bild':
      if (bildUrl) el.append(h('img', { src: bildUrl, alt: '', draggable: 'false' }));
      else el.classList.add('tb-platzhalter');
      break;
    case 'sticker':
      if (e.zeichen) { el.style.fontSize = Math.round(Math.min(b, hoehe) * 0.8) + 'px'; el.append(h('span', { class: 'tb-zeichen' }, e.zeichen)); }
      else el.classList.add('tb-platzhalter');
      break;
    default: el.classList.add('tb-platzhalter');
  }
  return el;
}

/** Die Zonen der Sitzung (Titel und leiser Hinweis) als Knoten der Welt. Ohne Zonen eine freie Fläche. */
export function zeichneZonen(zonen) {
  const liste = Array.isArray(zonen) ? zonen : [];
  const raster = zonenRaster(liste.length);
  return raster.zonen.map((z, i) => {
    const daten = liste[i];
    const el = h('div', { class: 'tb-zone' + (daten ? '' : ' frei') },
      daten ? h('div', { class: 'tb-zonentitel' }, daten.text || '') : null,
      daten && daten.inhalt ? h('div', { class: 'tb-zonenhinweis' }, daten.inhalt) : null);
    el.style.left = z.x + 'px'; el.style.top = z.y + 'px'; el.style.width = z.b + 'px'; el.style.height = z.h + 'px';
    return el;
  });
}

/** Leere Welt mit Zonen in der Grösse des Rasters; Elemente kommen in die zurückgegebene Ebene. */
export function zeichneWelt(zonen) {
  const raster = zonenRaster(Array.isArray(zonen) ? zonen.length : 0);
  const ebene = h('div', { class: 'tb-ebene' });
  const welt = h('div', { class: 'tb-welt' }, h('div', { class: 'tb-zonen' }, zeichneZonen(zonen)), ebene);
  welt.style.width = raster.b + 'px';
  welt.style.height = raster.h + 'px';
  return { welt, ebene, raster };
}
