// Cloche: Board mit Gruppen vor einem Bildschirm. Die Lehrperson spielt allein auf ihrem Laptop;
// das Quiz wird einmal geladen, danach braucht das Spiel keine Datenbank. Der Stand liegt in localStorage.
import { h, svg, logo, rueckfrage, BUCHSTABEN } from '../ui.js';
import { t, zahl } from '../i18n.js';
import { quizFehler } from '../logik/quiz.js';
import {
  KARTEN, MIT_ZIEL, KARTEN_WERT, MIN_GRUPPEN, MAX_GRUPPEN, NAME_MAX,
  baueBoard, neuesCloche, gemischteReihe, zurueckInDieFrage, schritt, rueckgaengig, rangliste, sichereStand, ladeStand, SPEICHER_KEY,
} from '../logik/cloche.js';
import ton from '../ton.js';

/** Gruppenfarben: die gedämpften Antwortfarben, dazu zwei weitere aus der EHL-Palette. */
export const GRUPPEN_FARBEN = ['#1B365F', '#B6633F', '#005779', '#A8842C', '#5A6270', '#7A2E3A', '#3E7CB1', '#6B7F3A'];
const PLUS = 15, ENDSPURT = 5, KORREKTUR = 100;

const CLOCHE_SVG = `<svg class="cl-glocke" viewBox="0 0 120 84" aria-hidden="true">
  <ellipse cx="60" cy="76" rx="56" ry="6" fill="#00143622"/>
  <path d="M12 68 C12 32 32 18 60 18 C88 18 108 32 108 68 Z" fill="#cfd5dd"/>
  <path d="M24 60 C24 38 38 27 56 25" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/>
  <rect x="4" y="66" width="112" height="7" rx="3.5" fill="#9aa3ae"/>
  <circle cx="60" cy="13" r="6" fill="#9aa3ae"/></svg>`;

export function zeige(wurzel, ctx, quizId) {
  const { store } = ctx;
  let quiz = null, stand = null, abgebaut = false, geladen = false;
  let teil = 'frage';                 // während einer Frage: 'frage' | 'loesung'
  let richtigWahl = [];               // Bewertung, bevor sie bestätigt ist
  let ziel = null;                    // Zielgruppe einer Karte
  let korrektur = false;              // Punkte von Hand ändern
  let uhr = null;                     // { ende, rest, pause, gesamt, endspurt, um }
  let primaer = null;
  const bilder = new Map();
  const vorb = { anzahl: 4, namen: [], karten: new Set(KARTEN) };

  const sprache = () => quiz?.sprache || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);

  // ---------- Stand ----------
  function setze(neu) {
    stand = neu;
    sichereStand(localStorage, stand);
    zeichne();
  }
  function tue(aktion) {
    const vorher = stand;
    const neu = schritt(stand, aktion);
    if (aktion.typ === 'oeffne' && neu.phase === 'frage' && vorher.phase === 'board') { teil = 'frage'; setzeUhrFuer(neu); ton.effekt('aufdecken'); }
    if (aktion.typ === 'bewerte' && neu.gruppen.some((g, i) => g.punkte > vorher.gruppen[i].punkte)) ton.effekt('richtig');
    if (neu.phase === 'karte' && vorher.phase !== 'karte') { ziel = null; ton.effekt('ueberraschung'); }
    if (neu.phase === 'ende' && vorher.phase !== 'ende') { uhr = null; ton.spiele('podest'); }
    setze(neu);
  }
  function zurueck() {
    if (!stand?.zurueck?.length) return;
    const neu = rueckgaengig(stand);
    ziel = null;
    // Nur wenn Rückgängig eine Bewertung oder Karte zurücknimmt, zeigt die Frage wieder die Lösung.
    // Eine Korrektur während der laufenden Frage lässt Uhr, Ansicht und Bewertung, wie sie sind.
    if (zurueckInDieFrage(stand, neu)) { teil = 'loesung'; richtigWahl = neu.gruppen.map(() => false); stoppeUhr(); }
    if (neu.phase === 'board') stoppeUhr();
    setze(neu);
  }

  const feldVon = s => s.board.felder.find(f => f.nr === s.offen);
  const feldOffen = () => feldVon(stand);
  const frageVon = feld => quiz.fragen[feld.frage];

  // ---------- Uhr ----------
  function setzeUhrFuer(s) {
    const f = frageVon(feldVon(s));
    uhr = { gesamt: f.zeit, ende: Date.now() + f.zeit * 1000, rest: f.zeit, pause: false, endspurt: false, um: false };
    ton.spiele('frage');
  }
  function stoppeUhr() { uhr = null; ton.stopp(); }
  function takt() {
    if (!uhr || uhr.pause || uhr.um || teil !== 'frage') return;
    uhr.rest = Math.max(0, (uhr.ende - Date.now()) / 1000);
    if (!uhr.endspurt && uhr.rest <= ENDSPURT && uhr.rest > 0) { uhr.endspurt = true; ton.spiele('endspurt'); }
    if (uhr.rest <= 0) { uhr.um = true; ton.spiele('gong'); }
    zeigeUhr();
  }
  function zeigeUhr() {
    const el = document.getElementById('cl-uhr');
    if (!el || !uhr) return;
    el.textContent = uhr.um ? '0' : String(Math.ceil(uhr.rest));
    el.classList.toggle('knapp', uhr.rest <= ENDSPURT);
    el.classList.toggle('pause', uhr.pause);
    const ablauf = document.getElementById('cl-ablauf');
    if (ablauf) ablauf.style.width = (100 * uhr.rest / uhr.gesamt) + '%';
  }
  function pausiere() {
    if (!uhr || uhr.um) return;
    if (uhr.pause) { uhr.pause = false; uhr.ende = Date.now() + uhr.rest * 1000; ton.spiele(uhr.endspurt ? 'endspurt' : 'frage'); }
    else { uhr.pause = true; ton.stopp(); }
    zeichne();
  }
  function mehrZeit() {
    if (!uhr) return;
    uhr.rest += PLUS;
    uhr.gesamt = Math.max(uhr.gesamt, uhr.rest);
    uhr.ende = Date.now() + uhr.rest * 1000;
    if (uhr.um || uhr.endspurt) { uhr.um = false; uhr.endspurt = uhr.rest <= ENDSPURT; if (!uhr.pause) ton.spiele('frage'); }
    zeichne();
  }
  function stoppeZeit() {
    if (!uhr || uhr.um) return;
    uhr.rest = 0; uhr.um = true; uhr.pause = false;
    ton.spiele('gong');
    zeichne();
  }
  function zeigeLoesung() {
    stoppeUhr();
    teil = 'loesung';
    richtigWahl = stand.gruppen.map(() => false);
    zeichne();
  }

  // ---------- Bausteine ----------
  function werkzeug() {
    const knopf = (zeichen, titel, klick, an = false) => h('button', { class: 'wz' + (an ? ' an' : ''), title: titel, 'aria-label': titel, onclick: e => { e.currentTarget.blur(); klick(); } }, zeichen);
    const imSpiel = stand && stand.phase !== 'ende';
    return h('div', { class: 'werkzeug' },
      knopf(ton.stumm ? '🔇' : '🔊', T(ton.stumm ? 'beamer.tonAn' : 'beamer.tonAus'), () => { ton.stumm = !ton.stumm; zeichne(); }),
      knopf('⛶', T('beamer.vollbild'), () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }),
      imSpiel && stand.zurueck.length ? knopf('↶', T('cloche.rueckgaengig'), zurueck) : null,
      imSpiel && stand.phase !== 'frage' ? knopf('±', T('cloche.korrigieren'), () => { korrektur = !korrektur; zeichne(); }, korrektur) : null,
      imSpiel ? knopf('✕', T('cloche.beenden'), async () => { if (await rueckfrage(sprache(), T('cloche.beendenFrage'), T('cloche.beenden'))) tue({ typ: 'beende' }); }) : null,
      knopf('⌂', T('cloche.zumStudio'), () => ctx.geh('#/studio')));
  }
  function haupt(text, aktion, frei = true) {
    primaer = frei ? aktion : null;
    return h('div', { class: 'hauptknopf' },
      h('span', { class: 'tastenhinweis' }, T('beamer.leertaste')),
      h('button', { class: 'start', disabled: !frei, onclick: aktion }, text));
  }
  const buehne = (klasse, ...inhalt) => h('div', { class: 'beamerseite ' + klasse }, h('div', { class: 'buehne cl' }, werkzeug(), inhalt));
  const punkt = farbe => h('i', { class: 'cl-punkt', style: `background:${farbe}` });

  /** Punktestand aller Gruppen; mit «±» lassen sich Punkte ändern. */
  function gruppenLeiste(hell) {
    return h('div', { class: 'cl-gruppen' + (hell ? ' hell' : '') }, stand.gruppen.map((g, i) =>
      h('div', { class: 'cl-gruppe' + (i === stand.amZug && stand.phase !== 'ende' ? ' amzug' : '') },
        punkt(g.farbe),
        h('span', { class: 'name' }, g.name),
        h('b', null, zahl(g.punkte)),
        korrektur ? h('span', { class: 'cl-korr' },
          h('button', { onclick: () => tue({ typ: 'korrigiere', gruppe: i, delta: -KORREKTUR }) }, '−' + KORREKTUR),
          h('button', { onclick: () => tue({ typ: 'korrigiere', gruppe: i, delta: KORREKTUR }) }, '+' + KORREKTUR)) : null)));
  }

  // ---------- Seiten ----------
  function hinweisSeite(text) {
    primaer = null;
    return h('div', { class: 'beamerseite b-navy' }, h('div', { class: 'buehne cl' },
      h('div', { class: 'vorlauf' }, h('div', { class: 'cl-marke' }, 'Cloche'), h('p', { class: 'bereit' }, text),
        h('a', { class: 'start statisch', href: '#/studio' }, T('cloche.zumStudio'))), logo(sprache(), 'weiss')));
  }

  function vorbereitungSeite() {
    const board = baueBoard(quiz.fragen, () => 0);
    const art = board.art === 'themen' ? T('cloche.infoThemen', { n: board.felder.length, s: board.spalten.length }) : T('cloche.infoNummern', { n: board.felder.length });
    const anzahlKnopf = (zeichen, d) => h('button', { class: 'cl-rund', disabled: vorb.anzahl + d < MIN_GRUPPEN || vorb.anzahl + d > MAX_GRUPPEN, onclick: () => { vorb.anzahl += d; zeichne(); } }, zeichen);
    const namen = Array.from({ length: vorb.anzahl }, (_, i) => {
      const feld = h('input', { class: 'cl-name', maxlength: String(NAME_MAX), value: vorb.namen[i] ?? '', placeholder: T('cloche.gruppeN', { n: i + 1 }), 'aria-label': T('cloche.gruppeN', { n: i + 1 }) });
      feld.addEventListener('input', () => { vorb.namen[i] = feld.value; });
      return h('label', { class: 'cl-namezeile' }, punkt(GRUPPEN_FARBEN[i]), feld);
    });
    const karte = k => {
      const haken = h('input', { type: 'checkbox', checked: vorb.karten.has(k) });
      haken.addEventListener('change', () => { if (haken.checked) vorb.karten.add(k); else vorb.karten.delete(k); zeichne(); });
      return h('label', { class: 'cl-kartenwahl' }, haken, h('span', null, h('b', null, T('karte.' + k)), ' · ', T('karte.' + k + '.kurz', { w: KARTEN_WERT[k] ?? 0 })));
    };
    const keine = h('input', { type: 'checkbox', checked: vorb.karten.size === 0 });
    keine.addEventListener('change', () => { vorb.karten = keine.checked ? new Set() : new Set(KARTEN); zeichne(); });
    return buehne('b-navy',
      h('div', { class: 'cl-vorb' },
        h('div', { class: 'cl-kopf' }, h('div', { class: 'cl-marke' }, 'Cloche'), h('p', { class: 'unter' }, quiz.titel), h('p', { class: 'cl-info' }, art)),
        h('div', { class: 'cl-vorb-spalten' },
          h('section', null,
            h('h3', null, T('cloche.gruppen')),
            h('div', { class: 'cl-anzahl' }, anzahlKnopf('−', -1), h('b', null, vorb.anzahl), anzahlKnopf('+', 1)),
            h('div', { class: 'cl-namen' }, namen)),
          h('section', null,
            h('h3', null, T('cloche.ueberraschungen')),
            h('div', { class: 'cl-karten' }, KARTEN.map(karte)),
            h('label', { class: 'cl-kartenwahl keine' }, keine, h('span', null, T('cloche.keineUeberraschungen'))),
            h('button', { class: 'cl-druckknopf', onclick: oeffneDruck }, '⎙ ' + T('cloche.druckvorlagen'))))),
      logo(sprache(), 'weiss'),
      haupt(T('cloche.starten'), starte));
  }

  function boardSeite() {
    const b = stand.board;
    const amZug = stand.gruppen[stand.amZug];
    const feld = f => {
      const von = stand.gespielt[f.nr];
      if (von !== undefined) {
        return h('div', { class: 'cl-feld gespielt', style: `--g:${stand.gruppen[von]?.farbe || '#999'}` },
          h('span', { class: 'teller' }), h('span', { class: 'wert' }, zahl(f.wert)));
      }
      return h('button', { class: 'cl-feld', onclick: () => tue({ typ: 'oeffne', feld: f.nr }), 'aria-label': (f.thema ? f.thema + ' ' : '') + zahl(f.wert) },
        svg(CLOCHE_SVG), b.art === 'nummern' ? h('span', { class: 'nr' }, f.nr) : null, h('span', { class: 'wert' }, zahl(f.wert)));
    };
    const felderVon = nrs => nrs.map(nr => feld(b.felder.find(f => f.nr === nr)));
    const spaltenZahl = b.felder.length > 24 ? 9 : b.felder.length > 12 ? 6 : Math.min(b.felder.length, 4);
    const raster = b.art === 'themen'
      ? h('div', { class: 'cl-board themen', style: `grid-template-columns:repeat(${b.spalten.length},minmax(0,1fr));--zeilen:${Math.max(...b.spalten.map(s => s.felder.length))}` },
        b.spalten.map(s => h('div', { class: 'cl-spalte' }, h('div', { class: 'cl-thema' }, s.thema || T('cloche.weitere')), felderVon(s.felder))))
      : h('div', { class: 'cl-board nummern', style: `grid-template-columns:repeat(${spaltenZahl},minmax(0,1fr))` }, b.felder.map(feld));
    primaer = null;
    return buehne('b-papier',
      h('div', { class: 'cl-boardseite' },
        h('div', { class: 'cl-zug' }, punkt(amZug.farbe), T('cloche.waehlt', { name: amZug.name })),
        raster),
      gruppenLeiste(true),
      logo(sprache(), 'blau'));
  }

  function antwortTeil(f, nr, mitLoesung) {
    const markiere = (el, richtig) => { if (mitLoesung) el.classList.add(richtig ? 'richtig' : 'falsch'); return el; };
    if (f.typ === 'mc' || f.typ === 'mehrfach' || f.typ === 'umfrage') {
      return h('div', { class: 'antw' + (f.antworten.length > 4 ? ' eng' : '') }, f.antworten.map((a, i) =>
        markiere(h('div', { class: 'a a' + (i + 1) }, h('i', null, BUCHSTABEN[i]), h('span', null, a.text), mitLoesung && a.richtig ? h('em', null, '✓') : null), f.typ === 'umfrage' || !!a.richtig)));
    }
    if (f.typ === 'wf') {
      return h('div', { class: 'antw' },
        markiere(h('div', { class: 'a a1' }, h('i', null, 'A'), h('span', null, T('frage.wahr')), mitLoesung && f.richtig ? h('em', null, '✓') : null), f.richtig === true),
        markiere(h('div', { class: 'a a2' }, h('i', null, 'B'), h('span', null, T('frage.falsch')), mitLoesung && !f.richtig ? h('em', null, '✓') : null), f.richtig === false));
    }
    if (f.typ === 'reihe') {
      const reihenfolge = gemischteReihe(f.elemente.length, nr);
      if (mitLoesung) {
        return h('div', { class: 'cl-reihe' }, f.elemente.map((text, i) => h('div', { class: 'a neutral' }, h('i', null, BUCHSTABEN[reihenfolge.indexOf(i)]), h('span', null, `${i + 1}. ${text}`))));
      }
      return h('div', { class: 'antw' + (f.elemente.length > 4 ? ' eng' : '') }, reihenfolge.map((j, i) => h('div', { class: 'a neutral' }, h('i', null, BUCHSTABEN[i]), h('span', null, f.elemente[j]))));
    }
    if (!mitLoesung) return h('p', { class: 'eingabehinweis' }, T(f.typ === 'schaetz' ? 'cloche.zahlHinweis' : 'cloche.kurzHinweis'), f.einheit ? ` (${f.einheit})` : '');
    if (f.typ === 'schaetz') {
      const z = v => String(v).replace('.', sprache() === 'en' ? '.' : ',');
      return h('p', { class: 'cl-loesung' }, z(f.wert), f.einheit ? ' ' + f.einheit : '', f.toleranz ? h('span', null, ` (± ${z(f.toleranz)})`) : null);
    }
    return h('p', { class: 'cl-loesung' }, (f.loesungen || []).filter(Boolean).join(' / '));
  }

  function bildKnoten(f) {
    if (!f.bildId || !bilder.get(f.bildId)) return null;
    return h('img', { class: 'fr-bild', alt: '', src: bilder.get(f.bildId) });
  }

  function frageSeite() {
    const feld = feldOffen();
    const f = frageVon(feld);
    const amZug = stand.gruppen[stand.amZug];
    const kopf = h('div', { class: 'fr-kopf cl-frkopf' },
      h('span', null, [feld.thema || null, T('cloche.punkteWert', { p: zahl(feld.wert) }), T('typ.' + f.typ)].filter(Boolean).join(' · ')),
      h('span', { class: 'cl-kopfzug' }, punkt(amZug.farbe), amZug.name));
    if (teil !== 'loesung') {
      const bild = bildKnoten(f);
      const wz = (zeichen, titel, klick) => h('button', { class: 'wz', title: titel, 'aria-label': titel, onclick: e => { e.currentTarget.blur(); klick(); } }, zeichen);
      return buehne('b-papier' + (bild ? ' mit-bild' : ''),
        h('div', { class: 'frage' }, kopf,
          h('div', { class: 'fr-mitte' }, h('p', { class: 'fr-text' + (f.text.length > 110 ? ' lang' : '') }, f.text), bild),
          antwortTeil(f, feld.nr, false)),
        h('div', { class: 'uhr', id: 'cl-uhr' }, uhr ? String(Math.ceil(uhr.rest)) : ''),
        h('div', { class: 'cl-uhrknoepfe' },
          wz(uhr?.pause ? '▶' : '❚❚', T(uhr?.pause ? 'cloche.weiterlaufen' : 'cloche.pause'), pausiere),
          wz('+' + PLUS, T('cloche.mehrZeit', { s: PLUS }), mehrZeit),
          wz('■', T('cloche.zeitStopp'), stoppeZeit)),
        h('div', { class: 'cl-zeitzeile' }, h('div', { class: 'cl-zeitbalken', id: 'cl-ablauf' })),
        logo(sprache(), 'blau'),
        h('div', { class: 'cl-deckel' }, svg(CLOCHE_SVG)),
        haupt(T('cloche.loesungZeigen'), zeigeLoesung));
    }
    const umfrage = f.typ === 'umfrage';
    const umschalter = stand.gruppen.map((g, i) => h('button', {
      class: 'cl-bew' + (richtigWahl[i] ? ' ja' : ''), disabled: umfrage, style: `--g:${g.farbe}`,
      onclick: e => { e.currentTarget.blur(); richtigWahl[i] = !richtigWahl[i]; zeichne(); },
    }, h('span', { class: 'haken' }, richtigWahl[i] ? '✓' : '✕'), h('span', null, g.name)));
    return buehne('b-papier',
      h('div', { class: 'frage aufgeloest cl-aufgeloest' }, kopf,
        h('p', { class: 'fr-text klein' }, f.text),
        antwortTeil(f, feld.nr, true),
        f.erklaerung ? h('p', { class: 'erklaerung' }, f.erklaerung) : null),
      h('div', { class: 'cl-bewertung' },
        h('p', null, T(umfrage ? 'cloche.umfrageKeinePunkte' : 'cloche.werHatteRecht', { p: zahl(feld.wert) })),
        h('div', { class: 'cl-bew-reihe' }, umschalter)),
      logo(sprache(), 'blau'),
      haupt(T(stand.karten[feld.nr] ? 'cloche.bestaetigenKarte' : 'cloche.bestaetigen'), () => tue({ typ: 'bewerte', richtig: umfrage ? [] : richtigWahl })));
  }

  function karteSeite() {
    const feld = feldOffen();
    const k = stand.karten[feld.nr];
    const amZug = stand.gruppen[stand.amZug];
    const mitZiel = MIT_ZIEL.has(k);
    const wahl = mitZiel ? h('div', { class: 'cl-zielwahl' },
      h('p', null, T('cloche.zielWaehlen', { name: amZug.name })),
      h('div', { class: 'cl-bew-reihe' }, stand.gruppen.map((g, i) => i === stand.amZug ? null
        : h('button', { class: 'cl-bew' + (ziel === i ? ' ja' : ''), style: `--g:${g.farbe}`, onclick: e => { e.currentTarget.blur(); ziel = i; zeichne(); } },
          h('span', { class: 'haken' }, ziel === i ? '✓' : ''), h('span', null, `${g.name} · ${zahl(g.punkte)}`))))) : null;
    const lagRichtig = !!stand.richtig?.[stand.amZug];
    return buehne('b-navy',
      h('div', { class: 'cl-kartenseite' },
        h('p', { class: 'unter' }, T('cloche.ueberraschungFuer', { name: amZug.name })),
        h('div', { class: 'cl-karte' },
          h('div', { class: 'cl-karte-ornament' }, '✦'),
          h('h2', null, T('karte.' + k)),
          h('p', null, T('karte.' + k + '.lang', { w: KARTEN_WERT[k] ?? 0, p: zahl(feld.wert) })),
          k === 'doppelt' ? h('p', { class: 'cl-karte-folge' }, T(lagRichtig ? 'cloche.doppeltJa' : 'cloche.doppeltNein', { p: zahl(feld.wert) })) : null),
        wahl),
      gruppenLeiste(false),
      logo(sprache(), 'weiss'),
      haupt(T('cloche.anwenden'), () => tue({ typ: 'karte', ziel: mitZiel ? ziel : undefined }), !mitZiel || ziel !== null));
  }

  function endeSeite() {
    primaer = null;
    const r = rangliste(stand.gruppen);
    const platz = (e, klasse) => e ? h('div', { class: 'pl cl-pl ' + klasse },
      h('div', { class: 'cl-medaille', style: `background:${e.farbe}` }, e.rang),
      h('b', null, e.name), h('span', null, T('beamer.punkte', { n: zahl(e.punkte) }))) : null;
    return buehne('b-navy',
      h('div', { class: 'podest' }, h('h2', null, T('beamer.siegerehrung')), h('p', { class: 'unter' }, stand.quizTitel)),
      h('div', { class: 'berge' }, svg(`<svg viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 420 L0 300 L120 230 L210 280 L330 170 L420 250 L520 120 L600 60 L690 150 L780 110 L860 200 L960 150 L1060 260 L1140 220 L1200 270 L1200 420Z" fill="#0f2a5a"/>
        <path d="M0 420 L0 350 L160 300 L300 340 L470 250 L600 190 L720 260 L880 230 L1030 320 L1200 300 L1200 420Z" fill="#17376f"/>
        <path d="M0 395 C200 370 400 410 600 388 S1000 372 1200 396" fill="none" stroke="#B6633F" stroke-width="3"/></svg>`)),
      platz(r[0], 'eins'), platz(r[1], 'zwei'), platz(r[2], 'drei'),
      r.length > 3 ? h('div', { class: 'liste' }, r.slice(3).map(e => h('div', null, h('span', null, h('em', null, e.rang), e.name), h('span', null, zahl(e.punkte))))) : null,
      logo(sprache(), 'weiss'),
      // Ohne Leertaste und mit Rückfrage: Ein Tastendruck zu viel soll die Rangliste nicht löschen.
      h('div', { class: 'hauptknopf' }, h('button', { class: 'start', onclick: async e => {
        e.currentTarget.blur();
        if (await rueckfrage(sprache(), T('cloche.neuesSpielFrage'), T('cloche.neuesSpiel'))) neuesSpiel();
      } }, T('cloche.neuesSpiel'))));
  }

  // ---------- Abläufe ----------
  async function starte() {
    ton.wecke();
    const alt = ladeStand(localStorage);
    if (alt && alt.phase !== 'ende' && alt.quizId !== quiz.id && !await rueckfrage(sprache(), T('cloche.ersetzenFrage', { titel: alt.quizTitel }), T('cloche.starten'))) return;
    const gruppen = Array.from({ length: vorb.anzahl }, (_, i) => ({ name: vorb.namen[i] ?? '', farbe: GRUPPEN_FARBEN[i] }));
    korrektur = false;
    setze(neuesCloche(quiz, { gruppen, karten: [...vorb.karten] }));
  }
  function neuesSpiel() {
    try { localStorage.removeItem(SPEICHER_KEY); } catch { /* ohne Speicher */ }
    vorb.namen = stand.gruppen.map(g => g.name);
    vorb.anzahl = stand.gruppen.length;
    stand = null;
    stoppeUhr();
    zeichne();
  }
  async function oeffneDruck() {
    const { druckAnsicht } = await import('./cloche-druck.js');
    const gruppen = Array.from({ length: vorb.anzahl }, (_, i) => ({ name: (vorb.namen[i] ?? '').trim() || T('cloche.gruppeN', { n: i + 1 }), farbe: GRUPPEN_FARBEN[i] }));
    const bisF = quiz.fragen.some(f => (f.typ === 'mc' || f.typ === 'mehrfach') && f.antworten.length > 4);
    document.body.append(druckAnsicht({ sprache: sprache(), gruppen, bisF }));
  }

  // ---------- Zeichnen ----------
  function zeichne() {
    if (abgebaut) return;
    document.documentElement.lang = sprache();
    let seite;
    if (!stand) seite = vorbereitungSeite();
    else if (stand.phase === 'board') seite = boardSeite();
    else if (stand.phase === 'frage') seite = frageSeite();
    else if (stand.phase === 'karte') seite = karteSeite();
    else seite = endeSeite();
    wurzel.replaceChildren(seite);
    zeigeUhr();
  }

  // ---------- Laden ----------
  wurzel.replaceChildren(h('p', { class: 'laedt' }, T('allg.laedt')));
  const stoppKonto = store.konto.beobachten(async konto => {
    if (!konto || !konto.freigeschaltet) { ctx.geh('#/studio'); return; }
    if (geladen) return;
    geladen = true;
    try {
      const q = await store.quiz.laden(quizId);
      if (abgebaut) return;
      if (!q || q.art === 'praesentation' || quizFehler(q).length) { wurzel.replaceChildren(hinweisSeite(T('cloche.nichtLadbar'))); return; }
      quiz = q;
      await Promise.all(quiz.fragen.filter(f => f.bildId).map(f => store.quiz.bildLaden(quiz.id, f.bildId).then(d => bilder.set(f.bildId, d)).catch(() => {})));
      if (abgebaut) return;
      const gesichert = ladeStand(localStorage);
      if (gesichert && gesichert.quizId === quiz.id && gesichert.board.felder.every(f => quiz.fragen[f.frage])) {
        stand = gesichert;
        if (stand.phase === 'frage') setzeUhrFuer(stand);
      }
      zeichne();
    } catch (e) {
      console.error(e);
      if (!abgebaut) wurzel.replaceChildren(hinweisSeite(T('cloche.nichtLadbar')));
    }
  });

  const taste = e => {
    ton.wecke();
    if (e.repeat) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea')) { e.preventDefault(); zurueck(); return; }
    if (e.target.closest?.('input, textarea, select, dialog, button, a')) return;
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') && primaer && !document.querySelector('dialog[open], .cl-druck')) {
      e.preventDefault();
      primaer();
    }
  };
  const klick = () => ton.wecke();
  document.addEventListener('keydown', taste);
  document.addEventListener('pointerdown', klick);
  const uhrwerk = setInterval(takt, 200);

  return () => {
    abgebaut = true;
    clearInterval(uhrwerk);
    document.removeEventListener('keydown', taste);
    document.removeEventListener('pointerdown', klick);
    document.querySelector('.cl-druck')?.remove();
    stoppKonto();
    ton.stopp();
  };
}
