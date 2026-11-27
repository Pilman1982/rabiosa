// Cloche: Druckvorlagen für Ecken (A4 quer, ein Buchstabe pro Blatt) und Schilder (A4 hoch, pro Gruppe).
// Gedruckt wird über den Browser (Drucken oder als PDF sichern).
import { h, logo, BUCHSTABEN } from '../ui.js';
import { t } from '../i18n.js';

/** Antwortfarben wie am Bildschirm (A Blau, B Kupfer, C Petrol, D Gold, E Schiefer, F Bordeaux). */
const FARBEN = ['#1B365F', '#B6633F', '#005779', '#A8842C', '#5A6270', '#7A2E3A'];

/**
 * Vollbild-Ebene mit allen Blättern und den Knöpfen «Drucken» und «Schliessen».
 * gruppen: [{ name, farbe }], bisF: Buchstaben bis F statt bis D.
 */
export function druckAnsicht({ sprache, gruppen, bisF }) {
  const T = (k, w) => t(sprache, k, w);
  const anzahl = bisF ? 6 : 4;
  const buchstaben = [...BUCHSTABEN.slice(0, anzahl)];

  const ecke = (i, wort) => h('section', { class: 'cl-blatt quer' },
    h('div', { class: 'cl-blatt-buchstabe', style: `--f:${FARBEN[i]}` }, BUCHSTABEN[i]),
    wort ? h('div', { class: 'cl-blatt-wort', style: `color:${FARBEN[i]}` }, wort) : null,
    h('div', { class: 'cl-blatt-fuss' }, logo(sprache, 'blau'), h('span', null, 'Cloche')));

  const schild = (i, wort, gruppe) => h('div', { class: 'cl-schild' },
    h('span', { class: 'cl-schild-gruppe' }, gruppe.name),
    h('div', { class: 'cl-schild-buchstabe', style: `--f:${FARBEN[i]}` }, BUCHSTABEN[i]),
    wort ? h('div', { class: 'cl-schild-wort', style: `color:${FARBEN[i]}` }, wort) : null);

  const schilderBlatt = (gruppe, inhalt) => h('section', { class: 'cl-blatt hoch' },
    h('div', { class: 'cl-schilder' + (inhalt.length <= 2 ? ' zwei' : '') }, inhalt.map(([i, wort]) => schild(i, wort, gruppe))),
    h('div', { class: 'cl-blatt-fuss' }, logo(sprache, 'blau'), h('span', null, `Cloche · ${gruppe.name}`)));

  const wahr = T('frage.wahr'), falsch = T('frage.falsch');
  const ecken = [...buchstaben.map((_, i) => ecke(i, null)), ecke(0, wahr), ecke(1, falsch)];
  const schilder = gruppen.flatMap(g => [
    schilderBlatt(g, [[0], [1], [2], [3]]),
    schilderBlatt(g, bisF ? [[4], [5], [0, wahr], [1, falsch]] : [[0, wahr], [1, falsch]]),
  ]);

  const ebene = h('div', { class: 'cl-druck', role: 'dialog', 'aria-label': T('cloche.druckvorlagen') });
  const zu = () => { ebene.remove(); document.removeEventListener('keydown', taste); };
  const taste = e => { if (e.key === 'Escape') zu(); };
  document.addEventListener('keydown', taste);

  const teil = (art, titel, hilfe, blaetter) => h('div', { class: 'cl-druckteil ' + art }, h('h2', null, titel), h('p', null, hilfe), h('div', { class: 'cl-blaetter' }, blaetter));
  const nurEcken = h('input', { type: 'checkbox' });
  const nurSchilder = h('input', { type: 'checkbox' });
  const wahl = () => { ebene.classList.toggle('ohne-schilder', nurEcken.checked); ebene.classList.toggle('ohne-ecken', nurSchilder.checked); };
  nurEcken.addEventListener('change', () => { if (nurEcken.checked) nurSchilder.checked = false; wahl(); });
  nurSchilder.addEventListener('change', () => { if (nurSchilder.checked) nurEcken.checked = false; wahl(); });

  ebene.append(
    h('div', { class: 'cl-druckleiste' },
      h('b', null, T('cloche.druckvorlagen')),
      h('label', null, nurEcken, T('druck.nurEcken')),
      h('label', null, nurSchilder, T('druck.nurSchilder')),
      h('span', { class: 'hilfe' }, T('druck.hinweis')),
      h('button', { class: 'knopf', onclick: () => window.print() }, T('druck.drucken')),
      h('button', { class: 'knopf leise', onclick: zu }, T('druck.schliessen'))),
    teil('ecken', T('druck.ecken'), T('druck.eckenHilfe', { n: ecken.length }), ecken),
    teil('schilder', T('druck.schilder'), T('druck.schilderHilfe', { n: schilder.length }), schilder));
  return ebene;
}
