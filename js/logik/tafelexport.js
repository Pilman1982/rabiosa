// Whiteboard: Herunterladen als HTML. Rein (ohne DOM, ohne Netz): baut aus Sitzung, Gruppen und eingebetteten Bildern
// eine einzige HTML-Datei, die offline läuft. Die Daten stehen als JSON in einem <script type="application/json">,
// gezeichnet wird von «darsteller» unten, dessen Quelltext in die Datei kommt (darum ohne Importe und ohne Bezug
// auf Werte dieses Moduls). Texte der Studierenden gehen nur über textContent ins Dokument.
// Schriften: Georgia für Titel, Systemschrift für Text (keine EHL-Schriftdateien in der Datei).
import { t } from '../i18n.js';
import { zonenRaster, praesentationsSchritte } from './tafel.js';
import { DICKE, TEXTGROESSE, ZETTELGROESSE, pfeilSpitze, reihenfolge } from './tafelbrett.js';
import { schrittTexte } from './tafelzeigen.js';
import { stickerQuelle } from './tafelbilder.js';

const FARBE = /^#[0-9a-fA-F]{3,8}$/;
const DATENBILD = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]*$/;
const zahl = (w, sonst = 0) => (typeof w === 'number' && Number.isFinite(w) ? w : sonst);
const text = w => (typeof w === 'string' ? w : '');

/** Dateiname ohne Umlaute, Leerzeichen und Satzzeichen, z. B. Signature_Dish_Gruppe_3.html. gruppe = null: alle Gruppen. */
export function dateiname(sitzung, gruppe, endung) {
  const teil = s => String(s ?? '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const titel = teil(sitzung && sitzung.titel) || 'Whiteboard';
  const wer = gruppe ? teil(gruppe.name) || 'Gruppe' : 'alle_Gruppen';
  return `${titel}_${wer}.${endung}`;
}

/** Nur die Felder, die der Darsteller braucht; Farben geprüft, Pfeile mit fertig gerechneter Linie und Spitze. */
function vorbereite(e) {
  const r = { id: text(e.id), art: text(e.art), x: zahl(e.x), y: zahl(e.y), b: Math.max(1, zahl(e.b, 1)), h: Math.max(1, zahl(e.h, 1)), z: Math.round(zahl(e.z)) };
  if (typeof e.farbe === 'string' && FARBE.test(e.farbe)) r.farbe = e.farbe;
  if (typeof e.text === 'string') r.text = e.text;
  if (['S', 'M', 'L'].includes(e.groesse)) r.groesse = e.groesse;
  if (e.dicke === 1 || e.dicke === 2 || e.dicke === 3) r.dicke = e.dicke;
  if (e.form === 'kreis' || e.form === 'rechteck') r.form = e.form;
  if (typeof e.bildPfad === 'string') r.bildPfad = e.bildPfad;
  if (typeof e.zeichen === 'string') r.zeichen = e.zeichen;
  if (Array.isArray(e.punkte)) r.punkte = e.punkte.filter(w => typeof w === 'number' && Number.isFinite(w));
  if (r.art === 'pfeil') {
    const p = r.punkte && r.punkte.length >= 4 ? r.punkte : [0, 0, r.b, r.h];
    const breite = DICKE[r.dicke] || DICKE[2];
    const laenge = Math.max(18, breite * 3.5);
    const [x0, y0, x1, y1] = p;
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const kurz = Math.min(l, laenge * 0.6);   // wie am Board: die Linie endet in der Spitze
    r.linie = [x0, y0, x1 - (x1 - x0) / l * kurz, y1 - (y1 - y0) / l * kurz];
    r.spitze = pfeilSpitze(x0, y0, x1, y1, laenge);
  }
  return r;
}

/** JSON, das sicher in einem <script> steht: kein «<», «>», «&» und keine Zeilentrenner U+2028/U+2029. */
const sicheresJson = w => JSON.stringify(w).replace(/[<>&\u2028\u2029]/g, z => '\\u' + z.charCodeAt(0).toString(16).padStart(4, '0'));
const maskiere = s => String(s).replace(/[&<>"']/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]);

/**
 * Vollständiges HTML-Dokument ohne externe Verweise.
 * gruppen: [{ nr, name, mitglieder: [Vorname], elemente }], bilder: Map(pfad -> data:-Adresse); EHL-Sticker unter «ehl:<name>».
 * logo (freiwillig): data:-Adresse des EHL-Logos für den dunklen Kopf.
 */
export function htmlExport({ sitzung, gruppen, bilder, sprache, logo }) {
  const s = sitzung || {};
  const sp = sprache === 'en' ? 'en' : 'de';
  const T = (k, w) => t(sp, k, w);
  const zonen = (Array.isArray(s.zonen) ? s.zonen : []).map(z => ({ text: text(z && z.text), inhalt: text(z && z.inhalt) }));
  const raster = zonenRaster(zonen.length);
  const schritte = praesentationsSchritte(zonen.length);
  const karte = bilder instanceof Map ? bilder : new Map();
  const benutzt = {};
  const nimm = schluessel => { const url = karte.get(schluessel); if (typeof url === 'string' && DATENBILD.test(url)) benutzt[schluessel] = url; };
  const liste = (Array.isArray(gruppen) ? gruppen : []).map(g => {
    const elemente = reihenfolge((Array.isArray(g.elemente) ? g.elemente : []).filter(e => e && typeof e === 'object')).map(vorbereite);
    for (const e of elemente) {
      if (e.art === 'bild' && e.bildPfad) nimm(e.bildPfad);
      if (e.art === 'sticker') { const q = stickerQuelle(e.zeichen); if (q && q.art === 'ehl') nimm('ehl:' + q.name); }
    }
    return { nr: zahl(g.nr), name: text(g.name), mitglieder: (Array.isArray(g.mitglieder) ? g.mitglieder : []).map(text).filter(Boolean), elemente };
  });
  const daten = {
    titel: text(s.titel), sprache: sp, marke: 'RABIOSA',
    logo: typeof logo === 'string' && DATENBILD.test(logo) ? logo : null,
    raster, zonen, schritte,
    texte: schrittTexte(schritte, zonen, T('tz.gesamt'), n => T('tz.zone', { n })),
    t: { schritte: T('tz.schritte'), gruppe: T('tx.gruppe'), keineMitglieder: T('tu.keineMitglieder'), hilfe: T('tx.hilfe'), logo: T('tx.logo') },
    konst: { dicke: DICKE, text: TEXTGROESSE, zettel: ZETTELGROESSE },
    gruppen: liste,
    bilder: benutzt,
  };
  const seitentitel = [daten.titel, liste.length === 1 ? liste[0].name : ''].filter(Boolean).join(' · ') || 'Whiteboard';
  return `<!DOCTYPE html>
<html lang="${sp}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${maskiere(seitentitel)}</title>
<style>${STIL}</style>
</head>
<body>
<noscript><p class="tx-ohne">${maskiere(T('tx.ohneSkript'))}</p></noscript>
<script type="application/json" id="tx-daten">${sicheresJson(daten)}</script>
<script>(${darsteller.toString()})(JSON.parse(document.getElementById('tx-daten').textContent));</script>
</body>
</html>
`;
}

const STIL = `
:root { --navy: #001436; --kupfer: #B6633F; --petrol: #005779; --grau: #919388; --text-leise: #6c7385;
  --serif: Georgia, "Times New Roman", serif; --sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: #0b1220; color: #fff; font-family: var(--sans); line-height: 1.45; }
button, select { font: inherit; }
.tx-ohne { padding: 40px; text-align: center; }
.tx { position: fixed; inset: 0; display: flex; flex-direction: column; }
.tx-kopf { background: var(--navy); border-bottom: 3px solid var(--kupfer); padding: 10px 24px 8px; flex: none; }
.tx-zeile { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.tx-marke { font-family: var(--serif); letter-spacing: .14em; font-size: 15px; font-weight: 600; }
.tx-logo { height: 30px; width: auto; display: block; }
.tx-titel { font-family: var(--serif); font-size: 24px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
.tx-gruppe { font-size: 15px; letter-spacing: .12em; text-transform: uppercase; color: #d8a889; overflow-wrap: anywhere; }
.tx-platz { flex: 1; }
.tx-wahl { background: transparent; color: #fff; border: 1px solid #ffffff55; border-radius: 99px; padding: 4px 12px; }
.tx-wahl option { color: #001436; }
.tx-namen { font-size: 16px; color: #c9d1e2; margin-top: 3px; overflow-wrap: anywhere; }
.tx-buehne { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.tx-leiste { display: flex; align-items: center; gap: 12px; background: var(--navy); border-top: 1px solid #ffffff22; padding: 8px 16px; flex: none; flex-wrap: wrap; }
.tx-schritte { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; justify-content: center; }
.tx-schritt { border: 1px solid #ffffff44; background: transparent; color: #c9d1e2; border-radius: 99px; padding: 6px 16px; font-size: 14.5px; max-width: 24ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.tx-schritt:hover { border-color: #fff; color: #fff; }
.tx-schritt.an { background: var(--kupfer); border-color: var(--kupfer); color: #fff; font-weight: 700; }
.tx-hilfe { font-size: 12px; color: #8d97ad; }
:focus-visible { outline: 3px solid #5EC7F0; outline-offset: 2px; }
.tb-welt { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: #eef1f5; font-family: var(--sans); color: var(--navy); will-change: transform; }
.tb-zonen, .tb-ebene { position: absolute; inset: 0; }
.tb-zone { position: absolute; background: #fff; border: 3px solid #eadbd0; padding: 34px 44px; overflow: hidden; }
.tb-zonentitel { font-family: var(--serif); font-size: 46px; font-weight: 600; color: var(--navy); overflow-wrap: anywhere; }
.tb-zonenhinweis { font-size: 26px; color: #8a90a0; margin-top: 8px; max-width: 1100px; overflow-wrap: anywhere; }
.tb-el { position: absolute; }
.tb-svg { position: absolute; left: 0; top: 0; overflow: visible; }
.tb-inhalt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.25; }
.tb-zettel { box-shadow: 0 6px 14px #00143626; padding: 18px 20px; border-radius: 4px; overflow: hidden; color: var(--navy); }
.tb-platzhalter { background: #f3efe9; border: 3px dashed var(--grau); border-radius: 8px; }
.tb-bild img, .tb-sticker img { display: block; width: 100%; height: 100%; object-fit: contain; }
.tb-sticker { display: grid; place-items: center; line-height: 1; }
@media (max-width: 767px) { .tx-kopf { padding: 8px 12px; } .tx-titel { font-size: 18px; } .tx-schritt { padding: 5px 11px; font-size: 13px; } .tx-hilfe { display: none; } }
`;

/* Der eingebaute Darsteller. Läuft in der heruntergeladenen Datei; nur «d» (die Daten), document und window.
   Gleiche Bedienung wie die Präsentation: Pfeile, Bild auf/ab, Leertaste, Pos1/Ende, Ziffern für die Gruppe. */
function darsteller(d) {
  var NS = 'http://www.w3.org/2000/svg';
  var UEBERGANG = 550;
  var gruppe = 0, schritt = 0;

  function el(tag, klasse, inhalt) {
    var k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (inhalt !== undefined && inhalt !== null) k.textContent = String(inhalt);
    return k;
  }
  function s(tag, attr) {
    var k = document.createElementNS(NS, tag);
    Object.keys(attr).forEach(function (a) { k.setAttribute(a, String(attr[a])); });
    return k;
  }
  function leinwand(b, h) { return s('svg', { class: 'tb-svg', width: b, height: h, viewBox: '0 0 ' + b + ' ' + h, 'aria-hidden': 'true' }); }
  function punkteText(p) { var t = []; for (var i = 0; i + 1 < p.length; i += 2) t.push(p[i] + ',' + p[i + 1]); return t.join(' '); }
  function bild(url) { var i = document.createElement('img'); i.src = url; i.alt = ''; i.draggable = false; return i; }

  function element(e) {
    var k = el('div', 'tb-el tb-' + e.art);
    k.style.left = e.x + 'px'; k.style.top = e.y + 'px'; k.style.width = e.b + 'px'; k.style.height = e.h + 'px';
    k.style.zIndex = String(e.z || 0);
    var g = e.groesse || 'M';
    var breite = d.konst.dicke[e.dicke] || d.konst.dicke[2];
    var f = e.farbe || '#001436';
    var svg;
    if (e.art === 'zettel') {
      k.style.background = e.farbe || '#FFF6C9';
      k.style.fontSize = d.konst.zettel[g] + 'px';
      k.append(el('div', 'tb-inhalt', e.text || ''));
    } else if (e.art === 'text') {
      k.style.color = f;
      k.style.fontSize = d.konst.text[g] + 'px';
      k.append(el('div', 'tb-inhalt', e.text || ''));
    } else if (e.art === 'strich') {
      svg = leinwand(e.b, e.h);
      var p = e.punkte && e.punkte.length >= 2 ? e.punkte : [0, 0];
      if (p.length <= 4 && p[0] === p[2] && p[1] === p[3]) svg.append(s('circle', { cx: p[0], cy: p[1], r: breite / 2, fill: f }));
      else svg.append(s('polyline', { points: punkteText(p), fill: 'none', stroke: f, 'stroke-width': breite, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      k.append(svg);
    } else if (e.art === 'pfeil' && e.linie && e.spitze) {
      svg = leinwand(e.b, e.h);
      svg.append(s('line', { x1: e.linie[0], y1: e.linie[1], x2: e.linie[2], y2: e.linie[3], stroke: f, 'stroke-width': breite, 'stroke-linecap': 'round' }));
      svg.append(s('polygon', { points: punkteText(e.spitze), fill: f }));
      k.append(svg);
    } else if (e.art === 'form') {
      svg = leinwand(e.b, e.h);
      var r = breite / 2;
      var gemeinsam = { fill: 'none', stroke: f, 'stroke-width': breite };
      var form = e.form === 'kreis'
        ? s('ellipse', Object.assign({ cx: e.b / 2, cy: e.h / 2, rx: Math.max(1, e.b / 2 - r), ry: Math.max(1, e.h / 2 - r) }, gemeinsam))
        : s('rect', Object.assign({ x: r, y: r, width: Math.max(1, e.b - breite), height: Math.max(1, e.h - breite), rx: Math.min(12, e.b / 8, e.h / 8) }, gemeinsam));
      svg.append(form);
      k.append(svg);
    } else if (e.art === 'bild' && e.bildPfad && d.bilder[e.bildPfad]) {
      k.append(bild(d.bilder[e.bildPfad]));
    } else if (e.art === 'sticker' && typeof e.zeichen === 'string' && e.zeichen) {
      if (e.zeichen.indexOf('ehl:') === 0) {
        if (d.bilder[e.zeichen]) k.append(bild(d.bilder[e.zeichen])); else k.classList.add('tb-platzhalter');
      } else {
        k.style.fontSize = Math.round(Math.min(e.b, e.h) * 0.8) + 'px';
        k.append(el('span', 'tb-zeichen', e.zeichen));
      }
    } else k.classList.add('tb-platzhalter');
    return k;
  }

  // ---------- Gerüst ----------
  var wurzel = el('div', 'tx');
  var kopf = el('header', 'tx-kopf');
  var zeile = el('div', 'tx-zeile');
  var titel = el('h1', 'tx-titel', d.titel);
  var gruppeEl = el('span', 'tx-gruppe');
  var namenEl = el('div', 'tx-namen');
  if (d.logo) { var logo = bild(d.logo); logo.className = 'tx-logo'; logo.alt = d.t.logo; zeile.append(logo); }
  else zeile.append(el('b', 'tx-marke', d.marke));
  zeile.append(titel, gruppeEl, el('span', 'tx-platz'));
  var wahl = null;
  if (d.gruppen.length > 1) {
    wahl = el('select', 'tx-wahl');
    wahl.setAttribute('aria-label', d.t.gruppe);
    d.gruppen.forEach(function (g, i) { var o = el('option', null, (i < 9 ? (i + 1) + ' · ' : '') + g.name); o.value = String(i); wahl.append(o); });
    wahl.addEventListener('change', function () { zeigeGruppe(Number(wahl.value)); wahl.blur(); });
    zeile.append(wahl);
  }
  kopf.append(zeile, namenEl);

  var buehne = el('div', 'tx-buehne');
  var welt = el('div', 'tb-welt');
  welt.style.width = d.raster.b + 'px'; welt.style.height = d.raster.h + 'px';
  var zonenEl = el('div', 'tb-zonen');
  d.raster.zonen.forEach(function (z, i) {
    var daten = d.zonen[i];
    var k = el('div', 'tb-zone' + (daten ? '' : ' frei'));
    k.style.left = z.x + 'px'; k.style.top = z.y + 'px'; k.style.width = z.b + 'px'; k.style.height = z.h + 'px';
    if (daten) {
      k.append(el('div', 'tb-zonentitel', daten.text));
      if (daten.inhalt) k.append(el('div', 'tb-zonenhinweis', daten.inhalt));
    }
    zonenEl.append(k);
  });
  var ebene = el('div', 'tb-ebene');
  welt.append(zonenEl, ebene);
  buehne.append(welt);

  var leiste = el('nav', 'tx-leiste');
  leiste.setAttribute('aria-label', d.t.schritte);
  var schritteEl = el('div', 'tx-schritte');
  var knoepfe = d.texte.map(function (text, i) {
    var b = el('button', 'tx-schritt', text);
    b.type = 'button';
    b.addEventListener('click', function () { b.blur(); geheZu(i); });
    schritteEl.append(b);
    return b;
  });
  leiste.append(schritteEl, el('span', 'tx-hilfe', d.t.hilfe));
  wurzel.append(kopf, buehne, leiste);
  document.body.append(wurzel);

  // ---------- Ansicht ----------
  function rechteck() {
    var st = d.schritte[schritt];
    var z = typeof st === 'number' ? d.raster.zonen[st] : null;
    return z || { x: 0, y: 0, b: d.raster.b, h: d.raster.h };
  }
  function anwenden(mitUebergang) {
    var B = buehne.clientWidth, H = buehne.clientHeight, r = rechteck();
    var m = Math.max(0.01, Math.min(B / r.b, H / r.h)) || 0.01;
    var x = (B - r.b * m) / 2 - r.x * m, y = (H - r.h * m) / 2 - r.y * m;
    welt.style.transition = mitUebergang ? 'transform ' + UEBERGANG + 'ms ease, clip-path ' + UEBERGANG + 'ms ease' : 'none';
    welt.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(' + m + ')';
    welt.style.clipPath = typeof d.schritte[schritt] === 'number'
      ? 'inset(' + r.y + 'px ' + (d.raster.b - r.x - r.b) + 'px ' + (d.raster.h - r.y - r.h) + 'px ' + r.x + 'px)'
      : 'inset(-5000px)';
    knoepfe.forEach(function (k, i) { k.classList.toggle('an', i === schritt); if (i === schritt) k.setAttribute('aria-current', 'step'); else k.removeAttribute('aria-current'); });
  }
  function geheZu(i) {
    var n = Math.max(0, Math.min(d.schritte.length - 1, i));
    if (n === schritt) return;
    schritt = n;
    anwenden(true);
  }
  function zeigeGruppe(i) {
    if (i < 0 || i >= d.gruppen.length) return;
    gruppe = i;
    var g = d.gruppen[i];
    gruppeEl.textContent = g.name;
    namenEl.textContent = g.mitglieder.length ? g.mitglieder.slice().sort(function (a, b) { return a.localeCompare(b); }).join(' · ') : d.t.keineMitglieder;
    ebene.replaceChildren.apply(ebene, g.elemente.map(element));
    if (wahl) wahl.value = String(i);
    document.title = [d.titel, g.name].filter(Boolean).join(' · ');
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target && ev.target.closest && ev.target.closest('select')) return;
    var k = ev.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') {
      if (ev.target && ev.target.closest && ev.target.closest('button') && (k === ' ' || k === 'Enter')) return;
      ev.preventDefault(); geheZu(schritt + 1);
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { ev.preventDefault(); geheZu(schritt - 1); }
    else if (k === 'Home') { ev.preventDefault(); geheZu(0); }
    else if (k === 'End') { ev.preventDefault(); geheZu(d.schritte.length - 1); }
    else if (/^[1-9]$/.test(k) && Number(k) <= d.gruppen.length) zeigeGruppe(Number(k) - 1);
  });
  window.addEventListener('resize', function () { anwenden(false); });

  zeigeGruppe(0);
  anwenden(false);
}
