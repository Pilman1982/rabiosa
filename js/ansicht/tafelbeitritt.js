// Handy in einem Whiteboard: Gruppe wählen und Vornamen eingeben, dann ins Brett. Adresse #/t/123456.
// Wer den Code auf der Startseite eintippt, kommt über spieler.js hierher. Wer schon Mitglied ist, geht ohne Frage ins Brett.
import { h, marke, fehlerText } from '../ui.js';
import { t } from '../i18n.js';
import { NAME_MAX } from '../logik/tafel.js';
import { zeigeBrett } from './tafelbrett.js';

export function zeige(wurzel, ctx, code) {
  const { store } = ctx;
  let sitzung;                 // undefined = lädt, null = gibt es nicht, sonst die Sitzung
  let ich;                     // undefined = noch unbekannt, null = noch nicht beigetreten, sonst das Mitglied
  let gastFehler = null, gezeichnet = '', zu = false, abbauBrett = null;

  const sprache = () => (sitzung && sitzung.sprache) || ctx.sprache;
  const T = (k, w) => t(sprache(), k, w);
  const codeText = code.slice(0, 3) + ' ' + code.slice(3);
  const seite = (...inhalt) => h('div', { class: 'handy' },
    h('header', { class: 'h-kopf' }, h('b', null, marke()), h('span', null, codeText)), h('div', { class: 'h-in' }, inhalt));
  const mitte = (...inhalt) => h('div', { class: 'mitte' }, inhalt);
  const hinweisSeite = text => seite(mitte(h('p', { class: 'stark' }, text), h('a', { class: 'knopf leise', href: '#/' }, T('ende.zurueck'))));

  // Das Board der eigenen Gruppe; es beobachtet Sitzung, Mitglieder und Elemente selbst.
  function brettSeite() {
    const ziel = h('div', { class: 'tbr-wurzel' });
    abbauBrett = zeigeBrett(ziel, ctx, { code, gruppe: ich.gruppe, rolle: 'gast' });
    return ziel;
  }

  function wahlSeite() {
    let gruppe = null;
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    const knoepfe = sitzung.gruppen.map((name, i) => {
      const k = h('button', { type: 'button', class: 'tb-gruppe', 'aria-pressed': 'false' }, name);
      k.addEventListener('click', () => {
        gruppe = i; hinweis.textContent = '';
        knoepfe.forEach((x, j) => { x.classList.toggle('an', j === i); x.setAttribute('aria-pressed', String(j === i)); });
      });
      return k;
    });
    const feld = h('input', { class: 'feld', maxlength: String(NAME_MAX), autocomplete: 'given-name', enterkeyhint: 'go', 'aria-label': T('tb.name'), placeholder: T('tb.name') });
    const knopf = h('button', { class: 'knopf gross', type: 'submit' }, T('tb.los'));
    const los = async e => {
      e.preventDefault();
      const name = feld.value.trim();
      if (gruppe === null) { hinweis.textContent = T('tb.gruppeFehlt'); return; }
      if (!name) { hinweis.textContent = T('tb.nameFehlt'); feld.focus(); return; }
      knopf.disabled = true;
      try {
        await store.tafel.beitreten(code, { gruppe, name: name.slice(0, NAME_MAX) });
        // Der Eintrag kommt über ichBeobachten und schaltet auf das Brett um.
      } catch (err) {
        knopf.disabled = false;
        hinweis.textContent = err.code === 'nichtGefunden' ? T('tb.ende') : fehlerText(sprache(), err);
      }
    };
    return h('form', { class: 'handy', onsubmit: los },
      h('header', { class: 'h-kopf' }, h('b', null, marke()), h('span', null, codeText)),
      h('div', { class: 'h-in mit-knopf' },
        h('h2', { class: 'tb-titel' }, sitzung.titel || T('tb.titel')),
        h('p', { class: 'hilfe' }, T('tb.gruppe')),
        h('div', { class: 'tb-gruppen' }, knoepfe),
        feld, hinweis),
      knopf);
  }

  function zeichne() {
    if (zu) return;
    let kennung, baue;
    if (gastFehler) { kennung = 'gast:' + gastFehler.code; baue = () => hinweisSeite(fehlerText(sprache(), gastFehler)); }
    else if (sitzung === undefined || ich === undefined) { kennung = 'laedt'; baue = () => seite(mitte(h('p', null, T('allg.laedt')))); }
    else if (sitzung === null || sitzung.status !== 'offen') { kennung = 'weg'; baue = () => hinweisSeite(T('tb.ende')); }
    else if (ich) { kennung = 'brett:' + ich.gruppe + ':' + ich.name; baue = brettSeite; }
    else { kennung = 'wahl'; baue = wahlSeite; }
    if (kennung === gezeichnet) return;   // gleiche Ansicht: Eingaben bleiben stehen
    gezeichnet = kennung;
    abbauBrett?.();
    abbauBrett = null;
    document.documentElement.lang = sprache();
    wurzel.replaceChildren(baue());
  }

  let stoppSitzung = () => {}, stoppIch = () => {};
  (async () => {
    try {
      sitzung = await store.tafel.nachsehen(code);
      if (zu) return;
      if (!sitzung || sitzung.status !== 'offen') { if (!sitzung) sitzung = null; ich = null; zeichne(); return; }
      await store.tafel.gast();
    } catch (e) {
      if (zu) return;
      if (e && e.code === 'gastAus') { gastFehler = e; zeichne(); return; }
      sitzung = null; ich = null; zeichne(); return;
    }
    if (zu) return;
    stoppIch = store.tafel.ichBeobachten(code, m => { ich = m || null; zeichne(); });
    stoppSitzung = store.tafel.beobachten(code, s => { if (s !== undefined) { sitzung = s; zeichne(); } });
  })();
  zeichne();

  return () => { zu = true; stoppSitzung(); stoppIch(); abbauBrett?.(); };
}
