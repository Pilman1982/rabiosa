// Zeichnet eine Folie der Präsentation samt Ergebnis: am Beamer (live), in der Vorschau des Editors und im Rückblick.
// Alle Masse in em: Wer einbettet, bestimmt mit der Schriftgrösse, wie gross alles wird.
import { h, BUCHSTABEN } from '../ui.js';
import { t } from '../i18n.js';

const FARBEN = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const komma = (sprache, z) => String(z).replace('.', sprache === 'en' ? '.' : ',');
const prozent = (n, von) => (von ? Math.round(n / von * 100) : 0) + ' %';

/** Text einer Inhaltsfolie: Leerzeile oder neue Zeile = Absatz, Zeilen mit «-» oder «•» = Aufzählung. */
export function inhaltText(text) {
  const teile = [];
  let liste = null;
  for (const roh of String(text || '').split(/\r?\n/)) {
    const zeile = roh.trim();
    const punkt = zeile.match(/^[-•*]\s*(.*)$/);
    if (punkt) {
      if (!liste) { liste = h('ul'); teile.push(liste); }
      liste.append(h('li', null, punkt[1]));
      continue;
    }
    liste = null;
    if (zeile) teile.push(h('p', null, zeile));
  }
  return h('div', { class: 'pf-inhalt' }, teile);
}

function saeulen(f, e, sprache) {
  const zaehlung = e?.zaehlung || f.antworten.map(() => 0);
  const hoechst = Math.max(1, ...zaehlung);
  const personen = e?.anzahl || 0;
  return h('div', { class: 'pf-saeulen' + (f.antworten.length > 4 ? ' eng' : '') }, f.antworten.map((text, i) => h('div', { class: 'pf-saeule' },
    h('div', { class: 'pf-wert' }, h('b', null, zaehlung[i]), h('span', null, prozent(zaehlung[i], personen))),
    h('div', { class: 'pf-schacht' }, h('i', { class: FARBEN[i], style: `height:${Math.round(zaehlung[i] / hoechst * 100)}%` })),
    h('div', { class: 'pf-beschriftung' }, h('i', { class: 'pf-buchstabe ' + FARBEN[i] }, BUCHSTABEN[i]), h('span', null, text)))));
}

/** Die grössten Wörter in die Mitte, die kleinen nach aussen (abwechselnd links und rechts). */
function mitteZuerst(liste) {
  const raus = [];
  liste.forEach((w, i) => { if (i % 2) raus.unshift(w); else raus.push(w); });
  return raus;
}

function wolke(e, sprache) {
  const woerter = e?.woerter || [];
  if (!woerter.length) return leer(sprache);
  const hoechst = Math.max(...woerter.map(w => w.anzahl));
  const viele = woerter.length > 30;
  return h('div', { class: 'pf-wolke' }, mitteZuerst(woerter.map((w, i) => {
    const anteil = Math.sqrt(w.anzahl / hoechst);
    const groesse = (viele ? 0.8 : 1) * (0.85 + 3.3 * anteil);
    return h('span', { class: 'pf-wort w' + (i % 5), style: `font-size:${groesse.toFixed(2)}em`, title: String(w.anzahl) }, w.text);
  })));
}

function skala(f, e, sprache) {
  const T = (k, w) => t(sprache, k, w);
  const stufen = f.max - f.min + 1;
  const marken = Array.from({ length: stufen }, (_, i) => f.min + i);
  return h('div', { class: 'pf-skala' + (f.aussagen.length > 3 ? ' eng' : '') },
    (f.links || f.rechts) ? h('div', { class: 'pf-skala-zeile pf-skala-kopf' }, h('span'),
      h('div', { class: 'pf-pole' }, h('span', null, f.links || ''), h('span', null, f.rechts || '')), h('span')) : null,
    f.aussagen.map((aussage, i) => {
      const a = e?.aussagen?.[i];
      const verteilung = a?.verteilung || Array(stufen).fill(0);
      const hoechst = Math.max(1, ...verteilung);
      // Jede Stufe ist ein gleich breites Feld; die Zahl steht in seiner Mitte, der Durchschnitt dazwischen.
      const lage = a && a.schnitt !== null ? (a.schnitt - f.min + 0.5) / stufen * 100 : null;
      return h('div', { class: 'pf-skala-zeile' },
        h('span', { class: 'pf-aussage' }, aussage),
        h('div', { class: 'pf-spur' },
          h('div', { class: 'pf-saeulchen' }, verteilung.map(n => h('i', { style: `height:${Math.round(n / hoechst * 100)}%` }))),
          h('div', { class: 'pf-linie' }, lage === null ? null : h('b', { class: 'pf-mittel', style: `left:${lage}%` })),
          h('div', { class: 'pf-marken' }, marken.map(m => h('span', null, m)))),
        h('span', { class: 'pf-schnitt' }, a && a.schnitt !== null ? T('pb.schnitt', { n: komma(sprache, a.schnitt) }) : '–'));
    }));
}

function wand(e, sprache, { ausblenden, ausgeblendet = [] } = {}) {
  const weg = new Set(ausgeblendet);
  const texte = (e?.texte || []).filter(x => !x.schluessel || !weg.has(x.schluessel));
  if (!texte.length) return leer(sprache);
  const spalten = texte.length > 8 ? 4 : texte.length > 3 ? 3 : texte.length;
  return h('div', { class: 'pf-wand' + (texte.length <= 6 ? ' wenige' : ''), style: `column-count:${spalten}` }, texte.map((x, i) => {
    const karte = h('div', { class: 'pf-karte k' + (i % 4) + (x.text.length > 120 ? ' lang' : '') }, h('p', null, x.text));
    if (ausblenden && x.schluessel) {
      karte.append(h('button', { type: 'button', class: 'pf-weg', title: t(sprache, 'pb.ausblenden'), 'aria-label': t(sprache, 'pb.ausblenden'),
        onclick: ev => { ev.currentTarget.blur(); ausblenden(x.schluessel); } }, '✕'));
    }
    return karte;
  }));
}

function rangliste(f, e, sprache) {
  const T = (k, w) => t(sprache, k, w);
  const rang = e?.rang?.length ? e.rang : f.elemente.map((_, i) => ({ i, schnitt: null, punkte: 0 }));
  const hoechst = Math.max(1, ...rang.map(r => r.punkte));
  return h('ol', { class: 'pf-rang' }, rang.map((r, platz) => h('li', null,
    h('span', { class: 'pf-platz' }, e?.anzahl ? platz + 1 : '·'),
    h('span', { class: 'pf-element' }, f.elemente[r.i]),
    h('span', { class: 'pf-balken' }, h('i', { class: FARBEN[platz % 6], style: `width:${Math.round(r.punkte / hoechst * 100)}%` })),
    h('span', { class: 'pf-zahl' }, r.schnitt === null ? '' : T('pb.platz', { n: komma(sprache, r.schnitt) })))));
}

function punkte(f, e, sprache) {
  const T = (k, w) => t(sprache, k, w);
  const reihe = e?.reihe?.length ? e.reihe : f.elemente.map((_, i) => ({ i, summe: 0, schnitt: 0 }));
  const hoechst = Math.max(1, ...reihe.map(r => r.summe));
  return h('ol', { class: 'pf-rang pf-punkte' }, reihe.map(r => h('li', null,
    h('span', { class: 'pf-element' }, f.elemente[r.i]),
    h('span', { class: 'pf-balken' }, h('i', { class: FARBEN[r.i % 6], style: `width:${Math.round(r.summe / hoechst * 100)}%` })),
    h('span', { class: 'pf-zahl' }, e?.anzahl ? T('pb.punkteSchnitt', { n: komma(sprache, r.schnitt) }) : ''))));
}

const leer = sprache => h('p', { class: 'pf-leer' }, t(sprache, 'pb.nochNichts'));

/**
 * Der Ergebnisteil einer Folie. f: öffentliche Folie (oeffentlicheFolie), e: Ergebnis (auswerten) oder null.
 * mehr: { verborgen, ausblenden(schluessel), ausgeblendet: [schluessel] }
 */
export function zeichneErgebnis(f, e, sprache, mehr = {}) {
  if (mehr.verborgen) return h('div', { class: 'pf-verborgen' }, h('span', { 'aria-hidden': 'true' }, '◌'), t(sprache, 'pb.verborgen'));
  switch (f.typ) {
    case 'abstimmung': return saeulen(f, e, sprache);
    case 'wortwolke': return wolke(e, sprache);
    case 'skala': return skala(f, e, sprache);
    case 'offen': return wand(e, sprache, mehr);
    case 'rangfolge': return rangliste(f, e, sprache);
    case 'punkte': return punkte(f, e, sprache);
    case 'inhalt': return inhaltText(f.inhalt);
    default: return h('div');
  }
}

/** Ganze Folie: Kopf (Art), Frage, Bild und Ergebnis. bild: <img> oder null. */
export function zeichneFolie(f, e, sprache, mehr = {}) {
  const istInhalt = f.typ === 'inhalt';
  const text = f.text || '';
  return h('div', { class: 'pf-folie pf-' + f.typ + (mehr.bild ? ' mit-bild' : '') },
    istInhalt ? null : h('p', { class: 'pf-art' }, t(sprache, 'folie.' + f.typ)),
    h('h2', { class: 'pf-frage' + (istInhalt ? ' gross' : '') + (text.length > 110 ? ' lang' : '') }, text),
    h('div', { class: 'pf-koerper' }, h('div', { class: 'pf-ergebnis' }, zeichneErgebnis(f, e, sprache, mehr)), mehr.bild || null));
}
