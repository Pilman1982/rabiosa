// Kleine Helfer für die Ansichten. Fremde Texte (Namen, Antworten) gehen immer als Textknoten ins Dokument.
import { t } from './i18n.js';
import { avatarSvg } from './avatar.js';
import { ZUSATZ } from './variante.js';

/** Baut ein Element. kinder: Text, Knoten, Listen; null/false wird übersprungen. */
export function h(tag, eigenschaften, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(eigenschaften || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  haenge(el, kinder);
  return el;
}

function haenge(el, kinder) {
  for (const kind of kinder) {
    if (kind === null || kind === undefined || kind === false) continue;
    if (Array.isArray(kind)) haenge(el, kind);
    else el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
}

export function leere(el) { el.replaceChildren(); return el; }

/** Nur für SVG-Text aus dem eigenen Code (Avatar, QR-Code, Zierlinien). */
export function svg(text) {
  const vorlage = document.createElement('template');
  vorlage.innerHTML = text.trim();
  return vorlage.content.firstElementChild;
}

export const avatar = (cfg, hell = true) => svg(avatarSvg(cfg, { hell }));

export const BUCHSTABEN = 'ABCDEF';

/** Die geschwungene Kupferlinie (der Fluss). */
export function fluss(farbe = '#B6633F', dicke = 2) {
  return svg(`<svg class="fluss" viewBox="0 0 1200 36" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 C100 2 200 34 300 18 S500 2 600 18 S800 34 900 18 S1100 2 1200 18" fill="none" stroke="${farbe}" stroke-width="${dicke}" vector-effect="non-scaling-stroke"/></svg>`);
}

/** Der Name, in der Student-Fassung mit dem Zusatz «Student». */
export const marke = () => ['RABIOSA', ZUSATZ ? h('span', { class: 'zusatz' }, ZUSATZ) : null];

export function logo(sprache, farbe = 'weiss') {
  const s = sprache === 'en' ? 'en' : 'de';
  // Vom Ort des Programms aus, nicht von der Seite: Die Student-Fassung liegt eine Ebene tiefer.
  return h('img', { class: 'logo', src: new URL(`../bilder/ehl-${s}-${farbe}.svg`, import.meta.url).href, alt: s === 'en' ? 'EHL Hotel School Passugg' : 'EHL Hotelfachschule Passugg' });
}

/** Rückfrage als Fenster. Ergebnis: true = bestätigt. */
export function rueckfrage(sprache, text, jaText) {
  return new Promise(fertig => {
    const d = h('dialog', { class: 'rueckfrage' },
      h('p', null, text),
      h('div', { class: 'knopfzeile' },
        h('button', { class: 'knopf leise', onclick: () => d.close('nein') }, t(sprache, 'allg.abbrechen')),
        h('button', { class: 'knopf', onclick: () => d.close('ja') }, jaText || t(sprache, 'allg.ok'))));
    d.addEventListener('close', () => { d.remove(); fertig(d.returnValue === 'ja'); });
    document.body.append(d);
    d.showModal();
  });
}

/** Rückfrage mit einem Textfeld. Ergebnis: der Text, oder null bei Abbrechen. Enter bestätigt. */
export function eingabeFrage(sprache, text, vorgabe = '', jaText) {
  return new Promise(fertig => {
    const feld = h('input', { class: 'feld', value: vorgabe, maxlength: '80', autocomplete: 'off', 'aria-label': text });
    const d = h('dialog', { class: 'rueckfrage' },
      h('form', { method: 'dialog', onsubmit: e => { e.preventDefault(); d.close('ja'); } },
        h('label', null, h('span', { class: 'lab' }, text), feld),
        h('div', { class: 'knopfzeile' },
          h('button', { type: 'button', class: 'knopf leise', onclick: () => d.close('nein') }, t(sprache, 'allg.abbrechen')),
          h('button', { type: 'submit', class: 'knopf' }, jaText || t(sprache, 'allg.ok')))));
    d.addEventListener('close', () => { d.remove(); fertig(d.returnValue === 'ja' ? feld.value : null); });
    document.body.append(d);
    d.showModal();
    feld.select();
  });
}

/** Kurze Meldung am unteren Rand. */
export function meldung(text) {
  const el = h('div', { class: 'meldung', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

/** Text zu einem Fehler aus dem Speicher. */
export function fehlerText(sprache, e) {
  const schluessel = 'fehler.' + (e && e.code);
  const text = t(sprache, schluessel);
  if (text !== schluessel) return text;
  console.error(e);
  return t(sprache, 'fehler.allgemein');
}

export function datum(sprache, ms) {
  return new Date(ms).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
