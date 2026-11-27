// Studio der Dozierenden: anmelden, eigene Quiz verwalten, Quiz des Kollegiums spielen oder kopieren.
import { h, svg, marke, rueckfrage, meldung, fehlerText } from '../ui.js';
import { t } from '../i18n.js';
import { neuesQuiz, beispielQuiz, quizFehler } from '../logik/quiz.js';
import { oeffneImport } from './importfenster.js';
import { neuesSpiel } from '../logik/spiel.js';
import { inhaltVon, suche, pfadVon, ordnerTeile, bekannteOrdner } from '../logik/ablage.js';
import { istPraesentation, neuePraesentation, beispielPraesentation, neueSitzung } from '../logik/praesentation.js';

/** Kopiert ein Quiz samt Bildern ins eigene Konto. */
export async function kopiereQuiz(store, quiz, titel) {
  const kopie = { ...quiz, id: null, titel, freigegeben: false, fragen: quiz.fragen.map(f => ({ ...f })) };
  const id = await store.quiz.speichern(kopie);
  let mitBild = false;
  for (const f of kopie.fragen) {
    if (!f.bildId) continue;
    mitBild = true;
    const daten = await store.quiz.bildLaden(quiz.id, f.bildId).catch(() => null);
    f.bildId = daten ? await store.quiz.bildSpeichern(id, daten) : null;
  }
  if (mitBild) await store.quiz.speichern({ ...kopie, id });
  return id;
}

export function zeige(wurzel, ctx) {
  const { store } = ctx;
  let konto;                      // undefined = lädt
  let reiter = 'meine';
  let meine = null, kollegium = null;
  let pfad = [], anfrage = '';    // Ablage der Freigaben: geöffneter Ordner und Suchtext
  let form = 'anmelden';          // 'anmelden' | 'registrieren'
  let beschaeftigt = false;

  const s = () => ctx.sprache;
  const T = (k, w) => t(s(), k, w);
  const sprachwahl = () => h('div', { class: 'sprachwahl' }, ['de', 'en'].map(k =>
    h('button', { type: 'button', class: 'sprachknopf' + (s() === k ? ' an' : ''), onclick: () => { ctx.sprache = k; zeichne(); } }, k.toUpperCase())));

  async function lade() {
    try {
      const [m, k] = await Promise.all([store.quiz.meine(), store.quiz.kollegium()]);
      meine = m;
      kollegium = k.filter(q => !quizFehler(q).length);   // Unvollständiges erscheint im Kollegium nicht
      // Vorschläge fürs Ordnerfeld im Editor, damit alle dieselben Ordner benutzen.
      try { sessionStorage.setItem('rabiosa-ordner', JSON.stringify(bekannteOrdner([...m, ...kollegium]))); } catch { /* ohne Speicher */ }
    } catch (e) { meldung(fehlerText(s(), e)); meine ??= []; kollegium ??= []; }
    zeichne();
  }

  /** Führt eine Aktion aus, zeigt Fehler als Meldung und lädt danach die Listen neu. */
  async function tue(aktion, neuLaden = true) {
    if (beschaeftigt) return;
    beschaeftigt = true;
    try { await aktion(); } catch (e) { meldung(fehlerText(s(), e)); }
    beschaeftigt = false;
    if (neuLaden) await lade();
  }

  const spiele = alt => tue(async () => {
    const quiz = await store.quiz.laden(alt.id);   // frischer Stand, falls die Liste schon länger offen ist
    if (quizFehler(quiz).length) { if (quiz.besitzer === konto.uid) ctx.geh('#/studio/quiz/' + quiz.id); else await lade(); return; }
    const praes = istPraesentation(quiz);
    const { oeffentlich, privat } = praes ? neueSitzung(quiz, konto.uid) : neuesSpiel(quiz, konto.uid);
    const code = await store.spiel.erstellen(oeffentlich, privat);
    ctx.geh((praes ? '#/praesentation/' : '#/beamer/') + code);
  }, false);

  /** Quiz aus der Antwort einer KI: einlesen, speichern, im Editor zum Durchlesen öffnen. */
  async function importiere() {
    const ergebnis = await oeffneImport(s());
    if (!ergebnis) return;
    tue(async () => {
      const id = await store.quiz.speichern(ergebnis.quiz);
      const n = ergebnis.quiz.fragen.length, m = ergebnis.uebersprungen;
      meldung(m ? T('import.fertigAusgelassen', { n, m }) : T('import.fertig', { n }));
      ctx.geh('#/studio/quiz/' + id);
    }, false);
  }

  // ---------- Anmeldung ----------
  function anmeldung() {
    const registrieren = form === 'registrieren';
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    const feld = (name, text, art, mehr = {}) => {
      const eingabe = h('input', { class: 'feld', name, type: art, required: true, ...mehr });
      return [h('label', null, h('span', { class: 'lab' }, text), eingabe), eingabe];
    };
    const [nameL, nameF] = feld('name', T('studio.name'), 'text', { autocomplete: 'name', maxlength: '60' });
    const [mailL, mailF] = feld('email', T('studio.email'), 'email', { autocomplete: 'username' });
    const [pwL, pwF] = feld('passwort', T('studio.passwort'), 'password', { autocomplete: registrieren ? 'new-password' : 'current-password', minlength: registrieren ? '8' : null });
    const [codeL, codeF] = feld('code', T('studio.code'), 'text', { autocomplete: 'off' });
    const knopf = h('button', { class: 'knopf gross', type: 'submit' }, T(registrieren ? 'studio.registrieren' : 'studio.anmelden'));
    const los = async e => {
      e.preventDefault();
      knopf.disabled = true;
      hinweis.textContent = '';
      try {
        if (registrieren) await store.konto.registrieren({ name: nameF.value, email: mailF.value, passwort: pwF.value, code: codeF.value.trim() });
        else await store.konto.anmelden(mailF.value.trim(), pwF.value);
      } catch (err) {
        hinweis.textContent = fehlerText(s(), err);
        knopf.disabled = false;
      }
    };
    const vergessen = async () => {
      if (!mailF.value.trim()) { hinweis.textContent = T('studio.vergessenEmail'); mailF.focus(); return; }
      try { await store.konto.passwortVergessen(mailF.value.trim()); } catch { /* keine Auskunft, ob es das Konto gibt */ }
      hinweis.textContent = T('studio.vergessenOk');
    };
    return h('div', { class: 'anmeldung' }, h('form', { class: 'anmeldekarte', onsubmit: los },
      sprachwahl(),
      h('a', { class: 'marke-klein', href: '#/' }, marke()),
      h('p', { class: 'unter' }, T('studio.titel')),
      ctx.demo ? h('p', { class: 'demohinweis' }, T('allg.demo'), ' ', T('studio.demoCode')) : null,
      registrieren ? nameL : null, mailL, pwL,
      registrieren ? h('p', { class: 'hilfe' }, T('studio.passwortHilfe')) : null,
      registrieren ? [codeL, h('p', { class: 'hilfe' }, T('studio.codeHilfe'))] : null,
      hinweis, knopf,
      h('button', { type: 'button', class: 'textknopf', onclick: () => { form = registrieren ? 'anmelden' : 'registrieren'; zeichne(); } }, T(registrieren ? 'studio.schonKonto' : 'studio.neuHier')),
      registrieren ? null : h('button', { type: 'button', class: 'textknopf', onclick: vergessen }, T('studio.vergessen'))));
  }

  function freischaltung() {
    const hinweis = h('p', { class: 'fehler', role: 'alert' });
    const codeF = h('input', { class: 'feld', autocomplete: 'off', required: true });
    const los = async e => {
      e.preventDefault();
      try { await store.konto.freischalten(codeF.value.trim()); } catch (err) { hinweis.textContent = fehlerText(s(), err); }
    };
    return h('div', { class: 'anmeldung' }, h('form', { class: 'anmeldekarte', onsubmit: los },
      h('a', { class: 'marke-klein', href: '#/' }, marke()),
      h('p', { class: 'unter' }, T('studio.titel')),
      h('p', null, T('studio.gesperrt')),
      h('label', null, h('span', { class: 'lab' }, T('studio.code')), codeF),
      h('p', { class: 'hilfe' }, T('studio.codeHilfe')),
      hinweis,
      h('button', { class: 'knopf gross', type: 'submit' }, T('studio.freischalten')),
      h('button', { type: 'button', class: 'textknopf', onclick: () => store.konto.abmelden() }, T('studio.abmelden'))));
  }

  // ---------- Listen ----------
  const meta = q => [q.fach || T('studio.ohneFach'), T(istPraesentation(q) ? 'studio.folien' : 'studio.fragen', { n: q.fragen.length }), (q.sprache || 'de').toUpperCase()].join(' · ');
  const bearbeiten = q => (istPraesentation(q) ? '#/studio/folien/' : '#/studio/quiz/') + q.id;
  const artEtikett = q => (istPraesentation(q) ? h('span', { class: 'etikett art' }, T('studio.artPraesentation')) : null);
  /** Knöpfe zum Starten: Präsentationen werden präsentiert, Quiz live oder als Cloche gespielt. */
  const startKnoepfe = q => (istPraesentation(q)
    ? [kleinerKnopf(T('studio.praesentieren'), () => spiele(q), '')]
    : [kleinerKnopf(T('studio.spielen'), () => spiele(q), ''), kleinerKnopf(T('studio.cloche'), () => ctx.geh('#/cloche/' + q.id), '')]);
  const rueckblickText = q => T(istPraesentation(q) ? 'studio.ergebnisse' : 'studio.rueckblicke');
  const kleinerKnopf = (text, klick, klasse = 'leise') => h('button', { class: 'knopf klein ' + klasse, onclick: klick }, text);

  function meineKarte(q) {
    const titel = q.titel || T('editor.unbenannt');
    const unvollstaendig = quizFehler(q).length > 0;
    const haken = h('input', { type: 'checkbox', checked: !!q.freigegeben });
    // Erst frisch laden: Die Liste kann älter sein als die letzte Änderung im Editor.
    haken.addEventListener('change', () => { const frei = haken.checked; tue(async () => store.quiz.speichern({ ...await store.quiz.laden(q.id), freigegeben: frei })); });
    return h('article', { class: 'karte' },
      artEtikett(q),
      h('h3', null, titel),
      h('p', { class: 'meta' }, meta(q)),
      ordnerTeile(q.ordner).length ? ablageort(q) : null,
      unvollstaendig ? h('span', { class: 'etikett' }, T('studio.unvollstaendig')) : null,
      h('label', { class: 'schalter' }, haken, T('studio.freigeben')),
      h('div', { class: 'kartenknoepfe' },
        unvollstaendig ? null : startKnoepfe(q),
        h('a', { class: 'knopf klein leise', href: bearbeiten(q) }, T('studio.bearbeiten')),
        h('a', { class: 'knopf klein leise', href: '#/studio/rueckblick/' + q.id }, rueckblickText(q)),
        kleinerKnopf(T('studio.duplizieren'), () => tue(() => kopiereQuiz(store, q, `${titel} (${T('studio.kopie')})`))),
        kleinerKnopf(T('studio.loeschen'), async () => { if (await rueckfrage(s(), T('studio.loeschenFrage', { titel }), T('studio.loeschen'))) tue(() => store.quiz.loeschen(q.id)); }, 'leise gefahr')));
  }

  const ablageort = q => h('p', { class: 'ablageort' }, pfadVon(q, T('studio.ohneFach')).join(' › '));

  function kollegiumKarte(q, mitOrt) {
    return h('article', { class: 'karte' },
      artEtikett(q),
      h('h3', null, q.titel),
      h('p', { class: 'meta' }, T('studio.von', { autor: q.autor || '?' })),
      h('p', { class: 'meta' }, meta(q)),
      mitOrt ? ablageort(q) : null,
      h('div', { class: 'kartenknoepfe' },
        startKnoepfe(q),
        h('a', { class: 'knopf klein leise', href: '#/studio/rueckblick/' + q.id }, rueckblickText(q)),
        kleinerKnopf(T('studio.kopieren'), () => tue(async () => { await kopiereQuiz(store, q, q.titel); meldung(T('studio.kopiert')); }))));
  }

  function inhalt() {
    if (reiter === 'meine') {
      if (!meine) return h('p', { class: 'leer' }, T('allg.laedt'));
      return [
        h('div', { class: 'aktionen' },
          h('button', { class: 'knopf', onclick: () => tue(async () => { ctx.geh('#/studio/quiz/' + await store.quiz.speichern(neuesQuiz(s()))); }, false) }, '+ ' + T('studio.neu')),
          h('button', { class: 'knopf', onclick: () => tue(async () => { ctx.geh('#/studio/folien/' + await store.quiz.speichern(neuePraesentation(s()))); }, false) }, '+ ' + T('studio.neuPraesentation')),
          h('button', { class: 'knopf leise', onclick: importiere }, T('studio.import')),
          h('button', { class: 'knopf leise', onclick: () => tue(() => store.quiz.speichern(beispielQuiz(s()))) }, T('studio.beispiel')),
          h('button', { class: 'knopf leise', onclick: () => tue(() => store.quiz.speichern(beispielPraesentation(s()))) }, T('studio.beispielPraesentation'))),
        meine.length ? h('div', { class: 'karten' }, meine.map(meineKarte)) : h('p', { class: 'leer' }, T('studio.leer')),
      ];
    }
    if (!kollegium) return h('p', { class: 'leer' }, T('allg.laedt'));
    if (!kollegium.length) return h('p', { class: 'leer' }, T('studio.kollegiumLeer'));
    return ablage();
  }

  /** Freigaben als Ordner (Fach, darunter die Ordner aus dem Editor) mit Suche über alles. */
  function ablage() {
    const ohne = T('studio.ohneFach');
    const feld = h('input', { class: 'feld suchfeld', type: 'search', value: anfrage, placeholder: T('studio.suchen'), 'aria-label': T('studio.suchen') });
    const bereich = h('div', { class: 'ablage' });
    const geheZu = neu => { pfad = neu; fuelle(); };
    const krume = (text, ziel, hier) => hier
      ? h('span', { 'aria-current': 'page' }, text)
      : h('button', { type: 'button', class: 'krume', onclick: () => geheZu(ziel) }, text);
    const ordnerKnopf = o => h('button', { type: 'button', class: 'ordner', onclick: () => geheZu([...pfad, o.name]) },
      svg('<svg class="ordnerbild" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor"/></svg>'),
      h('span', { class: 'ordnername' }, o.name), h('span', { class: 'ordnerzahl' }, String(o.anzahl)));
    // Nur dieser Bereich wird neu gezeichnet: Das Suchfeld behält beim Tippen den Fokus.
    function fuelle() {
      if (anfrage.trim()) {
        const treffer = suche(kollegium, anfrage);
        bereich.replaceChildren(
          h('p', { class: 'trefferzahl', role: 'status' }, treffer.length ? T('studio.treffer', { n: treffer.length }) : T('studio.keineTreffer')),
          h('div', { class: 'karten' }, treffer.map(q => kollegiumKarte(q, true))));
        return;
      }
      let inhalt = inhaltVon(kollegium, pfad, ohne);
      // Der geöffnete Ordner ist leer geworden (Freigabe zurückgezogen): eine Stufe hinauf.
      while (pfad.length && !inhalt.ordner.length && !inhalt.quizze.length) { pfad = pfad.slice(0, -1); inhalt = inhaltVon(kollegium, pfad, ohne); }
      bereich.replaceChildren(...[   // replaceChildren schriebe «null» als Text hin, darum gefiltert
        pfad.length ? h('nav', { class: 'brotkrumen', 'aria-label': T('studio.ablage') },
          krume(T('studio.kollegium'), [], false),
          pfad.map((teil, i) => [h('span', { 'aria-hidden': 'true' }, '›'), krume(teil, pfad.slice(0, i + 1), i === pfad.length - 1)])) : null,
        inhalt.ordner.length ? h('div', { class: 'ordnerliste' }, inhalt.ordner.map(ordnerKnopf)) : null,
        inhalt.quizze.length ? h('div', { class: 'karten' }, inhalt.quizze.map(q => kollegiumKarte(q, false))) : null,
      ].filter(Boolean));
    }
    feld.addEventListener('input', () => { anfrage = feld.value; fuelle(); });
    fuelle();
    return [h('div', { class: 'suchzeile' }, feld), bereich];
  }

  function studio() {
    const reiterKnopf = (k, text) => h('button', { class: 'reiterknopf' + (reiter === k ? ' an' : ''), onclick: () => { reiter = k; zeichne(); } }, text);
    return h('div', { class: 'studio' },
      h('header', { class: 'studiokopf' },
        h('a', { class: 'marke-klein', href: '#/' }, marke()), h('h1', null, T('studio.titel')),
        h('nav', { class: 'reiter' }, reiterKnopf('meine', T('studio.meine')), reiterKnopf('kollegium', T('studio.kollegium'))),
        h('span', { class: 'platzhalter' }),
        h('span', { class: 'wer' }, konto.name),
        sprachwahl(),
        h('button', { class: 'knopf klein leise', onclick: () => store.konto.abmelden() }, T('studio.abmelden'))),
      ctx.demo ? h('p', { class: 'demohinweis' }, T('allg.demo')) : null,
      laufend ? h('p', { class: 'laufend' }, h('a', { class: 'knopf klein', href: (laufendArt === 'praesentation' ? '#/praesentation/' : '#/beamer/') + laufend }, T('studio.fortsetzen', { code: laufend.slice(0, 3) + ' ' + laufend.slice(3) }))) : null,
      inhalt());
  }

  function zeichne() {
    document.documentElement.lang = s();
    if (konto === undefined) { wurzel.replaceChildren(h('p', { class: 'laedt' }, T('allg.laedt'))); return; }
    wurzel.replaceChildren(konto === null ? anmeldung() : konto.freigeschaltet ? studio() : freischaltung());
  }

  let aufgeraeumt = false, laufend = null, laufendArt = null, stoppLaufend = null;
  /** Läuft noch ein eigenes Spiel (Fenster versehentlich geschlossen)? Dann einen Weg zurück anbieten. */
  function sucheLaufendes() {
    let code = null;
    try { code = localStorage.getItem('rabiosa-laufend'); } catch { /* ohne Speicher */ }
    if (!/^\d{6}$/.test(code || '') || stoppLaufend) return;
    stoppLaufend = store.spiel.beobachten(code, s => {
      const neu = s && s.hostUid === konto?.uid && s.status !== 'ende' ? code : null;
      const art = s?.art || null;
      if (neu !== laufend || art !== laufendArt) { laufend = neu; laufendArt = art; zeichne(); }
    });
  }
  const stopp = store.konto.beobachten(k => {
    konto = k;
    if (k && k.freigeschaltet) {
      sucheLaufendes();
      if (!aufgeraeumt) { aufgeraeumt = true; store.spiel.aufraeumen().catch(() => {}); }
      lade();
    } else { meine = kollegium = null; }
    zeichne();
  });
  zeichne();
  return () => { stopp(); stoppLaufend?.(); };
}
