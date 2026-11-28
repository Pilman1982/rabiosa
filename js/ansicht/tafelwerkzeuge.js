// Whiteboard: Werkzeugleiste und Gesten auf dem Board (Auswählen, Stift, Text, Zettel, Pfeil/Linie, Form, Radierer).
// Bekommt vom Board (tafelbrett.js) eine kleine Schnittstelle «b» und schreibt nur über sie.
// Eine Linie ist ein Strich mit zwei Punkten; ein Pfeil hat die Art «pfeil» (Spitze am Ende).
import { h, svg } from '../ui.js';
import { FARBEN, TEXT_MAX } from '../logik/tafel.js';
import {
  strichAus, rechteckAus, linieAus, verschiebe, skaliere, getroffen, zVorn, zHinten,
  TEXTGROESSE, ZETTELGROESSE, ZETTEL_SEITE, TEXT_BREITE,
} from '../logik/tafelbrett.js';

const ICON = {
  auswaehlen: '<path d="M6 3l13 8-6 1.6L10 19z"/>',
  stift: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  zettel: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>',
  pfeil: '<path d="M5 19L19 5M10 5h9v9"/>',
  form: '<rect x="3" y="3" width="10" height="10" rx="1"/><circle cx="16" cy="16" r="5"/>',
  bild: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 17l5-5 4 4 3-3 6 6"/><circle cx="9" cy="9.5" r="1.5"/>',
  sticker: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01"/>',
  radierer: '<path d="M3 16l9-9 6 6-6 6H7z"/><path d="M11 20h10M8 11l6 6"/>',
  zurueck: '<path d="M9 5L4 10l5 5"/><path d="M4 10h10a5 5 0 0 1 0 10h-4"/>',
  vor: '<path d="M15 5l5 5-5 5"/><path d="M20 10H10a5 5 0 0 0 0 10h4"/>',
};
const icon = name => svg(`<svg class="tbw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`);
const WERKZEUGE = ['auswaehlen', 'stift', 'text', 'zettel', 'pfeil', 'form', 'bild', 'sticker', 'radierer'];
const NAMEN = {
  auswaehlen: 'brett.auswaehlen', stift: 'brett.stift', text: 'brett.text', zettel: 'brett.zettel', pfeil: 'brett.pfeil',
  form: 'brett.form', bild: 'brett.bild', sticker: 'brett.sticker', radierer: 'brett.radierer',
};
const AKTION = new Set(['bild', 'sticker']);   // Knöpfe ohne Werkzeug: öffnen die Dateiauswahl bzw. die Sticker
const ARTEN_RADIERBAR = ['zettel', 'text', 'strich', 'pfeil', 'form', 'sticker'];   // Bilder löscht man mit Rückfrage über Auswahl + Löschen
const STIFTFARBE = new Set(['strich', 'pfeil', 'form', 'text']);

export function erstelleWerkzeuge(b) {
  const T = b.T;
  const wahl = { werkzeug: 'auswaehlen', stift: 0, zettel: 0, dicke: 2, groesse: 'M', pfeil: 'pfeil', form: 'rechteck' };
  let geste = null;          // laufendes Ziehen
  let bearbeitung = null;    // offenes Textfeld
  let optionenKennung = '';

  // ---------- Leiste ----------
  const knopf = (name, titel, f, extra = {}) => h('button', { type: 'button', class: 'tbw-knopf', title: titel, 'aria-label': titel, onclick: f, ...extra }, icon(name), h('span', null, titel));
  const aktion = {
    bild: () => { beendeBearbeitung(); b.bilder.dateiWaehlen(); },
    sticker: () => { beendeBearbeitung(); b.bilder.stickerWahl(); },
  };
  const werkzeugKnoepfe = WERKZEUGE.map(name => knopf(name, T(NAMEN[name]),
    AKTION.has(name) ? aktion[name] : () => waehleWerkzeug(name),
    AKTION.has(name) ? (name === 'bild' ? { title: T('bild.waehlen') } : { 'data-tbs-knopf': '' }) : { 'aria-pressed': 'false' }));
  const zurueckKnopf = knopf('zurueck', T('brett.zurueck'), () => b.zurueck());
  const vorKnopf = knopf('vor', T('brett.vor'), () => b.vor());
  const optionen = h('div', { class: 'tbw-optionen' });
  const leiste = h('div', { class: 'tbw-leiste', role: 'toolbar', 'aria-label': T('brett.werkzeuge') },
    h('div', { class: 'tbw-gruppe' }, werkzeugKnoepfe), h('span', { class: 'tbw-trenner' }),
    h('div', { class: 'tbw-gruppe' }, zurueckKnopf, vorKnopf), optionen);

  function waehleWerkzeug(name) {
    beendeBearbeitung();
    wahl.werkzeug = name;
    if (name !== 'auswaehlen') b.waehle(null);
    aktualisiere();
  }

  const chip = (text, an, f) => h('button', { type: 'button', class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(an), onclick: f }, text);
  function farbwahl(palette, aktuell, setze) {
    return h('div', { class: 'tbw-farben' }, palette.map((f, i) => {
      const k = h('button', { type: 'button', class: 'farbe' + (f === aktuell ? ' an' : ''), title: T('brett.farbe', { n: i + 1 }), 'aria-label': T('brett.farbe', { n: i + 1 }), 'aria-pressed': String(f === aktuell), onclick: () => setze(i, f) });
      k.style.background = f;
      return k;
    }));
  }
  const dickenwahl = () => h('div', { class: 'tbw-farben' }, [1, 2, 3].map(d => {
    const k = h('button', { type: 'button', class: 'tbw-dicke' + (wahl.dicke === d ? ' an' : ''), title: T('brett.dicke', { n: d }), 'aria-label': T('brett.dicke', { n: d }), 'aria-pressed': String(wahl.dicke === d), onclick: () => { wahl.dicke = d; aktualisiere(); } }, h('i'));
    k.firstChild.style.height = (d * 2) + 'px';
    return k;
  }));
  const groessenwahl = (aktuell, setze) => h('div', { class: 'tbw-farben' }, ['S', 'M', 'L'].map(g => chip(g, aktuell === g, () => setze(g))));

  function baueOptionen() {
    const w = wahl.werkzeug;
    const a = w === 'auswaehlen' && b.auswahl() ? b.element(b.auswahl()) : null;
    const kennung = JSON.stringify([wahl, a && [a.id, a.art, a.farbe, a.groesse]]);
    if (kennung === optionenKennung) return;
    optionenKennung = kennung;
    const teile = [];
    const stiftFarben = () => farbwahl(FARBEN.stift, FARBEN.stift[wahl.stift], i => { wahl.stift = i; aktualisiere(); });
    if (w === 'stift') teile.push(stiftFarben(), dickenwahl());
    else if (w === 'text') teile.push(stiftFarben(), groessenwahl(wahl.groesse, g => { wahl.groesse = g; aktualisiere(); }));
    else if (w === 'zettel') teile.push(farbwahl(FARBEN.zettel, FARBEN.zettel[wahl.zettel], i => { wahl.zettel = i; aktualisiere(); }));
    else if (w === 'pfeil') teile.push(h('div', { class: 'tbw-farben' }, chip(T('brett.pfeil'), wahl.pfeil === 'pfeil', () => { wahl.pfeil = 'pfeil'; aktualisiere(); }), chip(T('brett.linie'), wahl.pfeil === 'linie', () => { wahl.pfeil = 'linie'; aktualisiere(); })), stiftFarben(), dickenwahl());
    else if (w === 'form') teile.push(h('div', { class: 'tbw-farben' }, chip(T('brett.rechteck'), wahl.form === 'rechteck', () => { wahl.form = 'rechteck'; aktualisiere(); }), chip(T('brett.kreis'), wahl.form === 'kreis', () => { wahl.form = 'kreis'; aktualisiere(); })), stiftFarben(), dickenwahl());
    else if (w === 'radierer') teile.push(h('span', { class: 'tbw-hilfe' }, T('brett.radiererHilfe')));
    else if (a) {
      const aendere = felder => { const neu = { ...a, ...felder }; if (felder.groesse && (a.art === 'text' || a.art === 'zettel')) neu.h = Math.max(a.art === 'zettel' ? a.h : 0, b.messe(neu)); b.speichern(neu, a); };
      if (a.art === 'zettel') teile.push(farbwahl(FARBEN.zettel, a.farbe, (i, f) => aendere({ farbe: f })));
      else if (STIFTFARBE.has(a.art)) teile.push(farbwahl(FARBEN.stift, a.farbe, (i, f) => aendere({ farbe: f })));
      if (a.art === 'text' || a.art === 'zettel') teile.push(groessenwahl(a.groesse || 'M', g => aendere({ groesse: g })));
      teile.push(h('div', { class: 'tbw-farben' },
        h('button', { type: 'button', class: 'knopf leise klein', onclick: () => b.speichern({ ...a, z: zVorn(b.elemente()) }, a) }, T('brett.vorn')),
        h('button', { type: 'button', class: 'knopf leise klein', onclick: () => b.speichern({ ...a, z: zHinten(b.elemente()) }, a) }, T('brett.hinten')),
        h('button', { type: 'button', class: 'knopf leise klein gefahr', onclick: () => b.loeschen(a) }, T('brett.loeschen'))));
    } else teile.push(h('span', { class: 'tbw-hilfe' }, T('brett.auswaehlenHilfe')));
    optionen.replaceChildren(...teile);
  }

  function aktualisiere() {
    WERKZEUGE.forEach((name, i) => {
      if (AKTION.has(name)) return;
      werkzeugKnoepfe[i].classList.toggle('an', wahl.werkzeug === name);
      werkzeugKnoepfe[i].setAttribute('aria-pressed', String(wahl.werkzeug === name));
    });
    const k = b.kann();
    zurueckKnopf.disabled = !k.zurueck;
    vorKnopf.disabled = !k.vor;
    b.markiere(wahl.werkzeug);
    baueOptionen();
  }

  // ---------- Neue Elemente ----------
  const neu = (art, felder) => b.neu(art, felder);
  const stiftFarbe = () => FARBEN.stift[wahl.stift];

  // ---------- Textfeld ----------
  function bearbeite(e, istNeu) {
    beendeBearbeitung();
    const feld = h('textarea', { class: 'tb-editor tb-editor-' + e.art, maxlength: String(TEXT_MAX), 'aria-label': T(NAMEN[e.art] || 'brett.text'), spellcheck: 'true' });
    feld.value = e.text || '';
    const groesse = ['S', 'M', 'L'].includes(e.groesse) ? e.groesse : 'M';
    Object.assign(feld.style, {
      left: e.x + 'px', top: e.y + 'px', width: e.b + 'px', height: e.h + 'px',
      fontSize: (e.art === 'zettel' ? ZETTELGROESSE : TEXTGROESSE)[groesse] + 'px',
      color: e.art === 'zettel' ? '' : (e.farbe || ''),
      zIndex: '2',
    });
    const wachse = () => { feld.style.height = 'auto'; feld.style.height = Math.max(e.h, feld.scrollHeight) + 'px'; };
    bearbeitung = { e, vorher: istNeu ? null : e, feld, geschrieben: false };
    feld.addEventListener('input', () => {
      wachse();
      if (!istNeu) { bearbeitung.geschrieben = true; b.zwischenspeichern({ ...e, text: feld.value.slice(0, TEXT_MAX) }); }
    });
    feld.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); beendeBearbeitung(); }
    });
    feld.addEventListener('blur', () => beendeBearbeitung());
    feld.addEventListener('pointerdown', ev => ev.stopPropagation());
    b.vorschau({ ...e, text: '' });
    b.editorEbene.append(feld);
    wachse();
    feld.focus({ preventScroll: true });
    feld.setSelectionRange(feld.value.length, feld.value.length);
  }

  /** Schliesst ein offenes Textfeld und speichert es. true = es war eines offen. */
  function beendeBearbeitung() {
    if (!bearbeitung) return false;
    const { e, vorher, feld, geschrieben } = bearbeitung;
    bearbeitung = null;
    const text = feld.value.slice(0, TEXT_MAX);
    feld.remove();
    const nachher = { ...e, text };
    const gemessen = b.messe(nachher);
    nachher.h = e.art === 'text' ? Math.max(gemessen, Math.round(TEXTGROESSE[e.groesse || 'M'] * 1.3)) : Math.max(e.h, gemessen);
    const leer = e.art === 'text' && !text.trim();
    b.verwerfen(e.id);
    if (!vorher) { if (!leer) b.speichern(nachher, null); return true; }
    if (leer) b.loeschen(vorher);
    else if (text !== (vorher.text || '') || nachher.h !== vorher.h) b.speichern(nachher, vorher);
    else if (geschrieben) b.stillSpeichern(vorher);
    return true;
  }

  // ---------- Gesten ----------
  const amGriff = (a, p, s) => Math.abs(p.x - (a.x + (a.b || 0) + 6 / s)) <= 12 / s && Math.abs(p.y - (a.y + (a.h || 0) + 6 / s)) <= 12 / s;
  const treffer = (p, arten) => getroffen(b.elemente().filter(e => !arten || arten.includes(e.art)), p.x, p.y, 6 / b.massstab());

  function radiere(p) {
    const e = treffer(p, ARTEN_RADIERBAR);
    if (!e || geste.weg.has(e.id)) return;
    geste.weg.add(e.id);
    b.loeschen(e);
  }

  /** warOffen: Der Klick hat eben ein Textfeld geschlossen; Text und Zettel legen dann nichts Neues an. */
  function unten(ev, p, warOffen) {
    if (!b.schreibbar()) return;
    const s = b.massstab();
    switch (wahl.werkzeug) {
      case 'auswaehlen': {
        const a = b.auswahl() && b.element(b.auswahl());
        if (a && amGriff(a, p, s)) { geste = { art: 'groesse', vorher: a, start: p, aktuell: null }; return; }
        const e = treffer(p);
        if (e) { b.waehle(e.id); geste = { art: 'bewegen', vorher: e, start: p, aktuell: null }; }
        else { b.waehle(null); b.starteSchwenk(ev); }
        return;
      }
      case 'stift': {
        geste = { art: 'stift', id: b.neueKennung(), z: zVorn(b.elemente()), punkte: [p.x, p.y] };
        b.vorschau(strichElement(0));
        return;
      }
      case 'text': {
        if (warOffen) return;
        const e = treffer(p, ['text']);
        if (e) bearbeite(e, false);
        else { const g = TEXTGROESSE[wahl.groesse]; bearbeite(neu('text', { x: p.x, y: p.y - g * 0.65, b: TEXT_BREITE, h: Math.round(g * 1.3), farbe: stiftFarbe(), groesse: wahl.groesse, text: '' }), true); }
        return;
      }
      case 'zettel': {
        if (warOffen) return;
        const e = treffer(p, ['zettel']);
        if (e) bearbeite(e, false);
        else bearbeite(neu('zettel', { x: p.x - ZETTEL_SEITE / 2, y: p.y - ZETTEL_SEITE / 2, b: ZETTEL_SEITE, h: ZETTEL_SEITE, farbe: FARBEN.zettel[wahl.zettel], groesse: 'M', text: '' }), true);
        return;
      }
      case 'pfeil': case 'form':
        geste = { art: wahl.werkzeug, id: b.neueKennung(), z: zVorn(b.elemente()), start: p, ende: p };
        return;
      case 'radierer':
        geste = { art: 'radieren', letzter: p, weg: new Set() };
        radiere(p);
        return;
      default:
    }
  }

  function strichElement(toleranz) {
    const { x, y, b: breite, h: hoehe, punkte } = strichAus(geste.punkte, toleranz);
    return { ...neu('strich', { x, y, b: breite, h: hoehe, punkte, farbe: stiftFarbe(), dicke: wahl.dicke }), id: geste.id, z: geste.z };
  }
  function linieElement() {
    const { start: a, ende: e } = geste;
    if (geste.art === 'form') {
      return { ...neu('form', { ...rechteckAus(a.x, a.y, e.x, e.y), form: wahl.form, farbe: stiftFarbe(), dicke: wahl.dicke }), id: geste.id, z: geste.z };
    }
    const art = wahl.pfeil === 'linie' ? 'strich' : 'pfeil';
    return { ...neu(art, { ...linieAus(a.x, a.y, e.x, e.y), farbe: stiftFarbe(), dicke: wahl.dicke }), id: geste.id, z: geste.z };
  }

  function ziehen(ev, p) {
    if (!geste) return;
    const s = b.massstab();
    if (geste.art === 'bewegen' || geste.art === 'groesse') {
      const dx = p.x - geste.start.x, dy = p.y - geste.start.y;
      if (!geste.aktuell && Math.hypot(dx, dy) * s < 3) return;
      const v = geste.vorher;
      let e;
      if (geste.art === 'bewegen') e = verschiebe(v, dx, dy);
      else {
        let nb = (v.b || 0) + dx, nh = (v.h || 0) + dy;
        if (ev.shiftKey || v.art === 'sticker' || v.art === 'bild') { const f = Math.max(nb / (v.b || 1), nh / (v.h || 1)); nb = (v.b || 1) * f; nh = (v.h || 1) * f; }
        e = skaliere(v, nb, nh);
        if (v.art === 'text') e.h = Math.max(b.messe(e), 20);
      }
      geste.aktuell = e;
      b.vorschau(e);
      b.zwischenspeichern(e);
    } else if (geste.art === 'stift') {
      const n = geste.punkte.length;
      if (Math.hypot(p.x - geste.punkte[n - 2], p.y - geste.punkte[n - 1]) * s < 1.5) return;
      geste.punkte.push(p.x, p.y);
      b.vorschau(strichElement(0));
    } else if (geste.art === 'pfeil' || geste.art === 'form') {
      geste.ende = p;
      b.vorschau(linieElement());
    } else if (geste.art === 'radieren') {
      const l = geste.letzter, schritt = 4 / s, d = Math.hypot(p.x - l.x, p.y - l.y);
      for (let t = schritt; t < d; t += schritt) radiere({ x: l.x + (p.x - l.x) * t / d, y: l.y + (p.y - l.y) * t / d });
      radiere(p);
      geste.letzter = p;
    }
  }

  function los() {
    const g = geste;
    geste = null;
    if (!g) return;
    const s = b.massstab();
    if (g.art === 'bewegen' || g.art === 'groesse') { if (g.aktuell) b.speichern(g.aktuell, g.vorher); }
    else if (g.art === 'stift') { geste = g; const e = strichElement(Math.max(0.5, 1.5 / s)); geste = null; b.speichern(e, null); }
    else if (g.art === 'pfeil' || g.art === 'form') {
      const laenge = Math.hypot(g.ende.x - g.start.x, g.ende.y - g.start.y) * s;
      geste = g;
      let e = linieElement();
      geste = null;
      if (laenge < 6) {
        if (g.art === 'pfeil') { b.verwerfen(g.id); return; }
        e = { ...e, x: g.start.x - 150, y: g.start.y - 100, b: 300, h: 200 };   // ein Klick: eine Form in Standardgrösse
      }
      b.speichern(e, null);
    }
  }

  function doppel(p) {
    if (wahl.werkzeug !== 'auswaehlen' || !b.schreibbar()) return false;
    const e = treffer(p, ['text', 'zettel']);
    if (!e) return false;
    geste = null;
    bearbeite(e, false);
    return true;
  }

  function taste(ev) {
    const a = b.auswahl() && b.element(b.auswahl());
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && a && b.schreibbar()) { b.loeschen(a); return true; }
    if (ev.key === 'Escape') { if (geste) los(); else b.waehle(null); return true; }
    return false;
  }

  /** Eingefügten Text (Strg+V ohne Bild) als Textfeld an die Stelle p legen. Ergebnis: Kennung. */
  function textEinfuegen(text, p) {
    const g = TEXTGROESSE[wahl.groesse];
    const e = neu('text', { x: Math.round(p.x), y: Math.round(p.y), b: TEXT_BREITE, h: Math.round(g * 1.3), farbe: stiftFarbe(), groesse: wahl.groesse, text: text.slice(0, TEXT_MAX) });
    e.h = Math.max(b.messe(e), Math.round(g * 1.3));
    b.speichern(e, null);
    return e.id;
  }

  /**
   * Alles Laufende beenden (Sperre, Rückgängig, Abbau). Bewegtes wird still festgehalten, Neues verworfen.
   * weg: Das Element in Arbeit ist inzwischen gelöscht; dann wird nichts festgehalten.
   */
  function abbrechen(weg = false) {
    if (bearbeitung) {
      const { e, vorher, feld, geschrieben } = bearbeitung;
      bearbeitung = null;
      feld.remove();
      b.verwerfen(e.id);
      if (vorher && geschrieben && !weg) b.stillSpeichern(vorher);
    }
    const g = geste;
    geste = null;
    if (!g) return;
    if (g.id) b.verwerfen(g.id);
    if ((g.art === 'bewegen' || g.art === 'groesse') && g.aktuell) { b.verwerfen(g.aktuell.id); if (!weg) b.stillSpeichern(g.aktuell); }
  }

  /** Kennung des vorhandenen Elements, das gerade beschrieben, verschoben oder in der Grösse geändert wird, sonst null. */
  function inArbeit() {
    if (bearbeitung && bearbeitung.vorher) return bearbeitung.e.id;
    if (geste && (geste.art === 'bewegen' || geste.art === 'groesse')) return geste.vorher.id;
    return null;
  }

  return { leiste, aktualisiere, abbrechen, inArbeit, beendeBearbeitung, unten, ziehen, los, doppel, taste, textEinfuegen, waehle: waehleWerkzeug };
}
