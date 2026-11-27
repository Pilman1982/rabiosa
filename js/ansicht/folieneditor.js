// Editor für Präsentationen: Folien erfassen, ordnen, laufend speichern; rechts eine Vorschau wie am Beamer.
import { h, marke, meldung, fehlerText, rueckfrage, BUCHSTABEN } from '../ui.js';
import { t } from '../i18n.js';
import { FOLIEN, WORTE_MAX, neueFolie, folienFehler, oeffentlicheFolie, istPraesentation } from '../logik/praesentation.js';
import { verkleinere } from './editor.js';
import { zeichneFolie as folieBild } from './folien.js';

const SKALEN = [[1, 5], [1, 7], [1, 10], [0, 10]];
const neueId = () => 'f' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function zeige(wurzel, ctx, quizId) {
  const { store } = ctx;
  const s = ctx.sprache;
  const T = (k, w) => t(s, k, w);
  let p = null, gewaehlt = 0, abgebaut = false;
  let speicherUhr = null, kette = Promise.resolve(true);
  const bilder = new Map();

  const standEl = h('span', { class: 'speicherstand' });
  const maengelEl = h('div');
  const listeEl = h('aside', { class: 'ed-liste' });
  const folieEl = h('section', { class: 'ed-frage' });
  const vorschauEl = h('div', { class: 'fe-vorschau' });

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
  function geaendert() {
    clearTimeout(speicherUhr);
    speicherUhr = setTimeout(speichere, 700);
    zeichneMaengel();
    zeichneListe();
    zeichneVorschau();
  }
  const neu = () => { geaendert(); zeichneFolie(); };

  // ---------- Kopf, Mängel, Liste, Vorschau ----------
  function zeichneMaengel() {
    const fehler = folienFehler(p);
    maengelEl.replaceChildren(fehler.length
      ? h('div', { class: 'maengel' }, h('b', null, T('fe.maengel')), h('ul', null, fehler.map(f => h('li', null, T('mangelF.' + f.code, { nr: (f.frage ?? 0) + 1 })))))
      : h('p', { class: 'spielbar' }, '✓ ' + T('fe.bereit')));
  }

  function zeichneListe() {
    const mitMangel = new Set(folienFehler(p).filter(f => f.frage !== null).map(f => f.frage));
    listeEl.replaceChildren(
      h('ol', null, p.fragen.map((f, i) => h('li', null,
        h('button', { type: 'button', class: 'ed-punkt' + (i === gewaehlt ? ' an' : '') + (mitMangel.has(i) ? ' mangel' : ''), onclick: () => { gewaehlt = i; zeichneListe(); zeichneFolie(); } },
          h('span', { class: 'nr' }, i + 1),
          h('span', null, h('span', { class: 'art' }, T('folie.' + f.typ)), h('span', { class: 'auszug' }, f.text || '…')))))),
      h('p', { class: 'lab' }, T('fe.folieNeu')),
      h('div', { class: 'typwahl' }, FOLIEN.map(typ => h('button', { type: 'button', class: 'chip', onclick: () => { p.fragen.splice(gewaehlt + 1, 0, neueFolie(typ)); gewaehlt = Math.min(gewaehlt + 1, p.fragen.length - 1); neu(); } }, '+ ' + T('folie.' + typ)))));
  }

  function bildVon(f) {
    if (!f.bildId) return null;
    const img = h('img', { class: 'pf-bild', alt: '' });
    const setze = d => { if (d) img.src = d; else img.remove(); };
    if (bilder.has(f.bildId)) setze(bilder.get(f.bildId));
    else store.quiz.bildLaden(p.id, f.bildId).then(d => { bilder.set(f.bildId, d); setze(d); }).catch(() => img.remove());
    return img;
  }

  function zeichneVorschau() {
    const f = p.fragen[gewaehlt];
    if (!f) { vorschauEl.replaceChildren(); return; }
    vorschauEl.replaceChildren(
      h('p', { class: 'lab' }, T('fe.vorschau')),
      h('div', { class: 'fe-leinwand' }, h('div', { class: 'buehne' }, h('div', { class: 'pb-buehne' }, folieBild(oeffentlicheFolie(f, gewaehlt), null, p.sprache || s, { bild: bildVon(f) })))));
  }

  // ---------- Formular einer Folie ----------
  const eingabe = (wert, beiAenderung, mehr = {}) => {
    const el = h('input', { class: 'feld', value: wert ?? '', ...mehr });
    el.addEventListener('input', () => { beiAenderung(el.value); geaendert(); });
    return el;
  };
  const textfeld = (wert, beiAenderung, mehr = {}) => {
    const el = h('textarea', { class: 'feld', ...mehr });
    el.value = wert ?? '';
    el.addEventListener('input', () => { beiAenderung(el.value); geaendert(); });
    return el;
  };
  const block = (titel, ...inhalt) => h('div', { class: 'ed-block' }, titel ? h('span', { class: 'lab' }, titel) : null, inhalt);
  const symbol = (zeichen, titel, klick, aus = false) => h('button', { type: 'button', class: 'symbolknopf', title: titel, 'aria-label': titel, disabled: aus, onclick: klick }, zeichen);
  const chip = (an, text, klick) => h('button', { type: 'button', class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(!!an), onclick: klick }, text);

  /** Liste von Texten (Antworten, Aussagen, Optionen). zuText/vonText für Antworten als { text }. */
  function liste(werte, min, max, beschriftung, neuText, { marke = null, zuText = x => x, vonText = (_, v) => v, leerWert = '' } = {}) {
    const zeilen = werte.map((wert, i) => h('div', { class: 'ed-antwort' },
      marke ? h('i', { class: 'marke ' + marke(i) }, marke === buchstabe ? BUCHSTABEN[i] : i + 1) : null,
      eingabe(zuText(wert), v => { werte[i] = vonText(werte[i], v); }, { maxlength: '120', placeholder: T(beschriftung, { n: i + 1 }), 'aria-label': T(beschriftung, { n: i + 1 }) }),
      symbol('▲', T('frage.hoch'), () => { [werte[i - 1], werte[i]] = [werte[i], werte[i - 1]]; neu(); }, i === 0),
      symbol('▼', T('frage.runter'), () => { [werte[i + 1], werte[i]] = [werte[i], werte[i + 1]]; neu(); }, i === werte.length - 1),
      symbol('✕', T('editor.entfernen'), () => { werte.splice(i, 1); neu(); }, werte.length <= min)));
    return [zeilen, werte.length < max ? h('button', { type: 'button', class: 'chip', onclick: () => { werte.push(typeof leerWert === 'function' ? leerWert() : leerWert); neu(); } }, '+ ' + T(neuText)) : null];
  }
  const buchstabe = i => 'a' + (i + 1);

  function bildBlock(f) {
    const vorschau = h('div');
    if (f.bildId) store.quiz.bildLaden(p.id, f.bildId).then(d => { if (d) vorschau.replaceChildren(h('img', { class: 'bildvorschau', src: d, alt: '' })); }).catch(() => {});
    const wahl = h('input', { type: 'file', accept: 'image/*', hidden: true });
    wahl.addEventListener('change', async () => {
      const datei = wahl.files[0];
      if (!datei) return;
      try {
        const daten = await verkleinere(datei);
        const alt = f.bildId;
        f.bildId = await store.quiz.bildSpeichern(p.id, daten);
        bilder.set(f.bildId, daten);
        if (alt) store.quiz.bildLoeschen(p.id, alt).catch(() => {});
        neu();
      } catch (e) { meldung(e.code === 'bildZuGross' ? T('editor.bildZuGross') : fehlerText(s, e)); }
    });
    return block(null, vorschau, wahl,
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => wahl.click() }, T('editor.bildWaehlen')),
        f.bildId ? h('button', { type: 'button', class: 'chip', onclick: () => { store.quiz.bildLoeschen(p.id, f.bildId).catch(() => {}); f.bildId = null; neu(); } }, T('editor.bildEntfernen')) : null));
  }

  function typFelder(f) {
    if (f.typ === 'abstimmung') {
      return block(null,
        liste(f.antworten, 2, 6, 'editor.antwort', 'editor.antwortNeu', { marke: buchstabe, zuText: a => a.text, vonText: (a, v) => ({ ...a, text: v }), leerWert: () => ({ text: '' }) }),
        h('label', { class: 'schalter' }, h('input', { type: 'checkbox', checked: !!f.mehrere, onchange: e => { f.mehrere = e.target.checked; geaendert(); } }), T('fe.mehrere')));
    }
    if (f.typ === 'wortwolke') {
      return block(T('fe.proPerson'), h('div', { class: 'chips' },
        Array.from({ length: WORTE_MAX }, (_, i) => chip(f.proPerson === i + 1, String(i + 1), () => { f.proPerson = i + 1; neu(); }))));
    }
    if (f.typ === 'skala') {
      return [
        block(null, liste(f.aussagen, 1, 6, 'fe.aussage', 'fe.aussageNeu')),
        block(T('fe.skala'), h('div', { class: 'chips' }, SKALEN.map(([von, bis]) => chip(f.min === von && f.max === bis, `${von}–${bis}`, () => { f.min = von; f.max = bis; neu(); })))),
        h('div', { class: 'ed-zeile' },
          h('label', null, h('span', { class: 'lab' }, T('fe.links')), eingabe(f.links, v => { f.links = v; }, { maxlength: '30', placeholder: T('fe.linksBeispiel') })),
          h('label', null, h('span', { class: 'lab' }, T('fe.rechts')), eingabe(f.rechts, v => { f.rechts = v; }, { maxlength: '30', placeholder: T('fe.rechtsBeispiel') }))),
      ];
    }
    if (f.typ === 'rangfolge' || f.typ === 'punkte') return block(null, liste(f.elemente, 2, 6, 'fe.element', 'fe.elementNeu', { marke: i => 'a' + (i % 6 + 1) }));
    if (f.typ === 'inhalt') return block(T('fe.inhalt'), textfeld(f.inhalt, v => { f.inhalt = v; }, { maxlength: '900', rows: '6' }), h('p', { class: 'hilfe' }, T('fe.inhaltHilfe')));
    return null;
  }

  function zeichneFolie() {
    const f = p.fragen[gewaehlt];
    if (!f) { folieEl.replaceChildren(h('p', { class: 'ed-leer' }, T('mangelF.keineFolien'))); zeichneVorschau(); return; }
    const i = gewaehlt, letzte = p.fragen.length - 1;
    const tausche = j => { [p.fragen[i], p.fragen[j]] = [p.fragen[j], p.fragen[i]]; gewaehlt = j; neu(); };
    folieEl.replaceChildren(
      h('div', { class: 'ed-werkzeug' },
        h('h2', null, `${i + 1} · ${T('folie.' + f.typ)}`),
        h('div', null,
          symbol('▲', T('fe.hoch'), () => tausche(i - 1), i === 0),
          symbol('▼', T('fe.runter'), () => tausche(i + 1), i === letzte),
          symbol('⧉', T('fe.duplizieren'), async () => {
            const kopie = JSON.parse(JSON.stringify(f));
            kopie.id = neueId();
            if (f.bildId) { const d = await store.quiz.bildLaden(p.id, f.bildId).catch(() => null); kopie.bildId = d ? await store.quiz.bildSpeichern(p.id, d).catch(() => null) : null; }
            p.fragen.splice(i + 1, 0, kopie); gewaehlt = i + 1; neu();
          }),
          symbol('🗑', T('fe.loeschen'), async () => {
            if (!await rueckfrage(s, T('fe.loeschen') + '?', T('studio.loeschen'))) return;
            if (f.bildId) store.quiz.bildLoeschen(p.id, f.bildId).catch(() => {});
            p.fragen.splice(i, 1); gewaehlt = Math.max(0, Math.min(i, p.fragen.length - 1)); neu();
          }))),
      h('p', { class: 'hilfe' }, T('fe.hilfe.' + f.typ)),
      block(T(f.typ === 'inhalt' ? 'fe.titel' : 'fe.frageText'), textfeld(f.text, v => { f.text = v; }, { maxlength: '200', rows: '2' })),
      h('div', null, typFelder(f)),   // replaceChildren packt keine Listen aus
      bildBlock(f));
    zeichneVorschau();
  }

  function bekannteOrdner() {
    try { const l = JSON.parse(sessionStorage.getItem('rabiosa-ordner') || '[]'); return Array.isArray(l) ? l.filter(o => typeof o === 'string').slice(0, 200) : []; }
    catch { return []; }
  }

  function zeichneAlles() {
    const sprachwahl = h('select', { class: 'feld' }, h('option', { value: 'de' }, T('editor.deutsch')), h('option', { value: 'en' }, T('editor.englisch')));
    sprachwahl.value = p.sprache || 'de';
    sprachwahl.addEventListener('change', () => { p.sprache = sprachwahl.value; geaendert(); });
    const titel = h('input', { class: 'titelfeld', value: p.titel || '', maxlength: '80', placeholder: T('fe.unbenannt'), 'aria-label': T('editor.titel') });
    titel.addEventListener('input', () => { p.titel = titel.value; geaendert(); });
    wurzel.replaceChildren(h('div', { class: 'studio editor fe' },
      h('header', { class: 'studiokopf' },
        h('a', { class: 'marke-klein', href: '#/studio' }, marke()), titel, standEl,
        h('button', { class: 'knopf klein', onclick: async () => { if (await speichere()) ctx.geh('#/studio'); } }, T('editor.fertig'))),
      h('div', { class: 'ed-meta' },
        h('label', null, h('span', { class: 'lab' }, T('editor.fach')), eingabe(p.fach, v => { p.fach = v; }, { maxlength: '40' })),
        h('label', null, h('span', { class: 'lab' }, T('editor.ordner')),
          eingabe(p.ordner, v => { p.ordner = v; }, { maxlength: '80', placeholder: T('editor.ordnerBeispiel'), list: 'ordner-vorschlaege', autocomplete: 'off' })),
        h('datalist', { id: 'ordner-vorschlaege' }, bekannteOrdner().map(o => h('option', { value: o }))),
        h('label', null, h('span', { class: 'lab' }, T('editor.sprache')), sprachwahl)),
      h('p', { class: 'hilfe' }, T('editor.ordnerHilfe')),
      maengelEl,
      h('div', { class: 'ed-spalten fe-spalten' }, listeEl, h('div', { class: 'fe-rechts' }, folieEl, vorschauEl))));
    zeichneMaengel();
    zeichneListe();
    zeichneFolie();
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
      if (!istPraesentation(q)) { ctx.geh('#/studio/quiz/' + quizId); return; }
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
