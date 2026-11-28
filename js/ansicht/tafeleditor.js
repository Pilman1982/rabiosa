// Editor für Whiteboard-Vorlagen: Auftrag, Gruppen-Vorgabe und Zonen erfassen, laufend speichern;
// rechts eine Vorschau des Rasters mit den Zonentiteln.
import { h, marke, meldung, fehlerText, vorgeschlageneOrdner } from '../ui.js';
import { t } from '../i18n.js';
import { istWhiteboard, tafelFehler, zonenRaster, ZONEN_MAX, GRUPPEN_MIN, GRUPPEN_MAX, GRUPPEN_VORGABE,
  AUFTRAG_MAX, ZONE_TITEL_MAX, ZONE_HINWEIS_MAX } from '../logik/tafel.js';
import { istPraesentation } from '../logik/praesentation.js';

export function zeige(wurzel, ctx, quizId) {
  const { store } = ctx;
  const s = ctx.sprache;
  const T = (k, w) => t(s, k, w);
  let p = null, abgebaut = false;
  let speicherUhr = null, kette = Promise.resolve(true);

  const standEl = h('span', { class: 'speicherstand' });
  const maengelEl = h('div');
  const zonenEl = h('div', { class: 'te-zonen' });
  const gruppenEl = h('div', { class: 'chips' });
  const vorschauEl = h('div', { class: 'te-vorschau' });

  // ---------- Speichern ----------
  function setzeStand(k, fehler = false) { standEl.textContent = T(k); standEl.classList.toggle('fehler', fehler); }
  function speichere() {
    clearTimeout(speicherUhr);
    speicherUhr = null;
    kette = kette.then(async () => {
      setzeStand('editor.speichert');
      try { await store.quiz.speichern(p); setzeStand('editor.gespeichert'); return true; }
      catch (e) { console.error(e); setzeStand('editor.nichtGespeichert', true); return false; }
    });
    return kette;
  }
  /** Eine Eingabe: speichern, Mängel und Vorschau nachführen; die Felder selbst bleiben stehen (Fokus). */
  function geaendert() {
    clearTimeout(speicherUhr);
    speicherUhr = setTimeout(speichere, 700);
    zeichneMaengel();
    zeichneVorschau();
  }
  /** Der Aufbau ändert sich (Zone hinzugefügt, entfernt, verschoben): alles nachzeichnen. */
  const neu = () => { geaendert(); zeichneZonen(); zeichneGruppen(); };

  // ---------- Mängel, Vorschau ----------
  function zeichneMaengel() {
    const fehler = tafelFehler(p);
    maengelEl.replaceChildren(fehler.length
      ? h('div', { class: 'maengel' }, h('b', null, T('te.maengel')), h('ul', null, fehler.map(f => h('li', null, T('mangelT.' + f.code, { nr: (f.frage ?? 0) + 1 })))))
      : h('p', { class: 'spielbar' }, '✓ ' + T('te.bereit')));
  }

  function zeichneVorschau() {
    const zonen = p.fragen;
    const r = zonenRaster(zonen.length);
    vorschauEl.replaceChildren(
      h('p', { class: 'lab' }, T('te.vorschau')),
      h('div', { class: 'te-raster', style: `grid-template-columns: repeat(${r.spalten}, 1fr); aspect-ratio: ${r.b} / ${r.h};` },
        r.zonen.map((_, i) => h('div', { class: 'te-zone' + (zonen.length ? '' : ' frei') },
          zonen.length ? [h('span', { class: 'nr' }, i + 1), h('span', { class: 'titel' }, zonen[i].text || '…')] : h('span', { class: 'titel' }, T('te.freieFlaeche'))))));
  }

  // ---------- Formular ----------
  const symbol = (zeichen, titel, klick, aus = false) => h('button', { type: 'button', class: 'symbolknopf', title: titel, 'aria-label': titel, disabled: aus, onclick: klick }, zeichen);
  const chip = (an, text, klick) => h('button', { type: 'button', class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(!!an), onclick: klick }, text);
  const eingabe = (wert, beiAenderung, mehr = {}) => {
    const el = h('input', { class: 'feld', value: wert ?? '', ...mehr });
    el.addEventListener('input', () => { beiAenderung(el.value); geaendert(); });
    return el;
  };

  function zeichneGruppen() {
    gruppenEl.replaceChildren(...Array.from({ length: GRUPPEN_MAX - GRUPPEN_MIN + 1 }, (_, i) => GRUPPEN_MIN + i)
      .map(n => chip(p.gruppenVorgabe === n, String(n), () => { p.gruppenVorgabe = n; neu(); })));
  }

  function zeichneZonen() {
    const letzte = p.fragen.length - 1;
    const tausche = (i, j) => { [p.fragen[i], p.fragen[j]] = [p.fragen[j], p.fragen[i]]; neu(); };
    zonenEl.replaceChildren(
      ...p.fragen.map((z, i) => h('div', { class: 'te-zonenkarte' },
        h('div', { class: 'te-zonenkopf' },
          h('span', { class: 'nr' }, String(i + 1)),
          eingabe(z.text, v => { z.text = v; }, { maxlength: String(ZONE_TITEL_MAX), placeholder: T('te.zoneTitel', { n: i + 1 }), 'aria-label': T('te.zoneTitel', { n: i + 1 }) }),
          symbol('▲', T('te.hoch'), () => tausche(i - 1, i), i === 0),
          symbol('▼', T('te.runter'), () => tausche(i, i + 1), i === letzte),
          symbol('✕', T('te.entfernen'), () => { p.fragen.splice(i, 1); neu(); })),
        eingabe(z.inhalt, v => { z.inhalt = v; }, { maxlength: String(ZONE_HINWEIS_MAX), placeholder: T('te.zoneHinweis'), 'aria-label': T('te.zoneHinweis') }))),
      p.fragen.length < ZONEN_MAX
        ? h('button', { type: 'button', class: 'chip', onclick: () => { p.fragen.push({ typ: 'zone', text: '', inhalt: '' }); neu(); } }, '+ ' + T('te.zoneNeu'))
        : null);
  }

  function zeichneAlles() {
    p.gruppenVorgabe = Number.isInteger(p.gruppenVorgabe) ? p.gruppenVorgabe : GRUPPEN_VORGABE;
    const sprachwahl = h('select', { class: 'feld' }, h('option', { value: 'de' }, T('editor.deutsch')), h('option', { value: 'en' }, T('editor.englisch')));
    sprachwahl.value = p.sprache || 'de';
    sprachwahl.addEventListener('change', () => { p.sprache = sprachwahl.value; geaendert(); });
    const titel = h('input', { class: 'titelfeld', value: p.titel || '', maxlength: '80', placeholder: T('te.unbenannt'), 'aria-label': T('editor.titel') });
    titel.addEventListener('input', () => { p.titel = titel.value; geaendert(); });
    const auftrag = h('textarea', { class: 'feld', rows: '5', maxlength: String(AUFTRAG_MAX), 'aria-label': T('te.auftrag') });
    auftrag.value = p.auftrag || '';
    auftrag.addEventListener('input', () => { p.auftrag = auftrag.value; geaendert(); });
    const frei = h('input', { type: 'checkbox', checked: !!p.freigegeben });
    frei.addEventListener('change', () => { p.freigegeben = frei.checked; geaendert(); });
    wurzel.replaceChildren(h('div', { class: 'studio editor fe te' },
      h('header', { class: 'studiokopf' },
        h('a', { class: 'marke-klein', href: '#/studio' }, marke()), titel, standEl,
        h('button', { class: 'knopf klein', onclick: async () => { if (await speichere()) ctx.geh('#/studio'); } }, T('editor.fertig'))),
      h('div', { class: 'ed-meta' },
        h('label', null, h('span', { class: 'lab' }, T('editor.fach')), eingabe(p.fach, v => { p.fach = v; }, { maxlength: '40' })),
        h('label', null, h('span', { class: 'lab' }, T('editor.ordner')),
          eingabe(p.ordner, v => { p.ordner = v; }, { maxlength: '80', placeholder: T('editor.ordnerBeispiel'), list: 'ordner-vorschlaege', autocomplete: 'off' })),
        h('datalist', { id: 'ordner-vorschlaege' }, vorgeschlageneOrdner().map(o => h('option', { value: o }))),
        h('label', null, h('span', { class: 'lab' }, T('editor.sprache')), sprachwahl),
        h('label', { class: 'schalter' }, frei, T('te.freigeben'))),
      h('p', { class: 'hilfe' }, T('editor.ordnerHilfe')),
      maengelEl,
      h('div', { class: 'ed-spalten te-spalten' },
        h('section', { class: 'ed-frage te-formular' },
          h('div', { class: 'ed-block' }, h('label', null, h('span', { class: 'lab' }, T('te.auftrag')), auftrag), h('p', { class: 'hilfe' }, T('te.auftragHilfe'))),
          h('div', { class: 'ed-block' }, h('span', { class: 'lab' }, T('te.gruppen')), gruppenEl),
          h('div', { class: 'ed-block' }, h('span', { class: 'lab' }, T('te.zonen')), h('p', { class: 'hilfe' }, T('te.zonenHilfe')), zonenEl)),
        vorschauEl)));
    zeichneMaengel();
    zeichneGruppen();
    zeichneZonen();
    zeichneVorschau();
    setzeStand('editor.gespeichert');
  }

  wurzel.replaceChildren(h('p', { class: 'laedt' }, T('allg.laedt')));
  let geladen = false;
  const stopp = store.konto.beobachten(async konto => {
    if (!konto || !konto.freigeschaltet) { ctx.geh('#/studio'); return; }
    if (geladen) return;
    geladen = true;
    try {
      const q = await store.quiz.laden(quizId);
      if (q.besitzer !== konto.uid) { ctx.geh('#/studio'); return; }
      if (!istWhiteboard(q)) { ctx.geh((istPraesentation(q) ? '#/studio/folien/' : '#/studio/quiz/') + quizId); return; }
      if (abgebaut) return;
      p = JSON.parse(JSON.stringify(q));
      zeichneAlles();
    } catch (e) { meldung(fehlerText(s, e)); ctx.geh('#/studio'); }
  });

  const beimVerlassen = () => { if (speicherUhr && p) speichere(); };
  window.addEventListener('pagehide', beimVerlassen);

  return () => {
    abgebaut = true;
    stopp();
    window.removeEventListener('pagehide', beimVerlassen);
    if (speicherUhr && p) speichere();
  };
}
