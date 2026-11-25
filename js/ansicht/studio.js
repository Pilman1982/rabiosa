// Studio der Dozierenden: anmelden, eigene Quiz verwalten, Quiz des Kollegiums spielen oder kopieren.
import { h, rueckfrage, meldung, fehlerText } from '../ui.js';
import { t } from '../i18n.js';
import { neuesQuiz, beispielQuiz, quizFehler } from '../logik/quiz.js';
import { oeffneImport } from './importfenster.js';
import { neuesSpiel } from '../logik/spiel.js';

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
    const { oeffentlich, privat } = neuesSpiel(quiz, konto.uid);
    const code = await store.spiel.erstellen(oeffentlich, privat);
    ctx.geh('#/beamer/' + code);
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
      h('a', { class: 'marke-klein', href: '#/' }, 'RABIOSA'),
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
      h('a', { class: 'marke-klein', href: '#/' }, 'RABIOSA'),
      h('p', { class: 'unter' }, T('studio.titel')),
      h('p', null, T('studio.gesperrt')),
      h('label', null, h('span', { class: 'lab' }, T('studio.code')), codeF),
      h('p', { class: 'hilfe' }, T('studio.codeHilfe')),
      hinweis,
      h('button', { class: 'knopf gross', type: 'submit' }, T('studio.freischalten')),
      h('button', { type: 'button', class: 'textknopf', onclick: () => store.konto.abmelden() }, T('studio.abmelden'))));
  }

  // ---------- Listen ----------
  const meta = q => [q.fach || T('studio.ohneFach'), T('studio.fragen', { n: q.fragen.length }), (q.sprache || 'de').toUpperCase()].join(' · ');
  const kleinerKnopf = (text, klick, klasse = 'leise') => h('button', { class: 'knopf klein ' + klasse, onclick: klick }, text);

  function meineKarte(q) {
    const titel = q.titel || T('editor.unbenannt');
    const unvollstaendig = quizFehler(q).length > 0;
    const haken = h('input', { type: 'checkbox', checked: !!q.freigegeben });
    // Erst frisch laden: Die Liste kann älter sein als die letzte Änderung im Editor.
    haken.addEventListener('change', () => { const frei = haken.checked; tue(async () => store.quiz.speichern({ ...await store.quiz.laden(q.id), freigegeben: frei })); });
    return h('article', { class: 'karte' },
      h('h3', null, titel),
      h('p', { class: 'meta' }, meta(q)),
      unvollstaendig ? h('span', { class: 'etikett' }, T('studio.unvollstaendig')) : null,
      h('label', { class: 'schalter' }, haken, T('studio.freigeben')),
      h('div', { class: 'kartenknoepfe' },
        unvollstaendig ? null : kleinerKnopf(T('studio.spielen'), () => spiele(q), ''),
        h('a', { class: 'knopf klein leise', href: '#/studio/quiz/' + q.id }, T('studio.bearbeiten')),
        h('a', { class: 'knopf klein leise', href: '#/studio/rueckblick/' + q.id }, T('studio.rueckblicke')),
        kleinerKnopf(T('studio.duplizieren'), () => tue(() => kopiereQuiz(store, q, `${titel} (${T('studio.kopie')})`))),
        kleinerKnopf(T('studio.loeschen'), async () => { if (await rueckfrage(s(), T('studio.loeschenFrage', { titel }), T('studio.loeschen'))) tue(() => store.quiz.loeschen(q.id)); }, 'leise gefahr')));
  }

  function kollegiumKarte(q) {
    return h('article', { class: 'karte' },
      h('h3', null, q.titel),
      h('p', { class: 'meta' }, T('studio.von', { autor: q.autor || '?' })),
      h('p', { class: 'meta' }, meta(q)),
      h('div', { class: 'kartenknoepfe' },
        kleinerKnopf(T('studio.spielen'), () => spiele(q), ''),
        h('a', { class: 'knopf klein leise', href: '#/studio/rueckblick/' + q.id }, T('studio.rueckblicke')),
        kleinerKnopf(T('studio.kopieren'), () => tue(async () => { await kopiereQuiz(store, q, q.titel); meldung(T('studio.kopiert')); }))));
  }

  function inhalt() {
    if (reiter === 'meine') {
      if (!meine) return h('p', { class: 'leer' }, T('allg.laedt'));
      return [
        h('div', { class: 'aktionen' },
          h('button', { class: 'knopf', onclick: () => tue(async () => { ctx.geh('#/studio/quiz/' + await store.quiz.speichern(neuesQuiz(s()))); }, false) }, '+ ' + T('studio.neu')),
          h('button', { class: 'knopf leise', onclick: importiere }, T('studio.import')),
          h('button', { class: 'knopf leise', onclick: () => tue(() => store.quiz.speichern(beispielQuiz(s()))) }, T('studio.beispiel'))),
        meine.length ? h('div', { class: 'karten' }, meine.map(meineKarte)) : h('p', { class: 'leer' }, T('studio.leer')),
      ];
    }
    if (!kollegium) return h('p', { class: 'leer' }, T('allg.laedt'));
    if (!kollegium.length) return h('p', { class: 'leer' }, T('studio.kollegiumLeer'));
    const faecher = new Map();
    for (const q of kollegium) { const f = q.fach || T('studio.ohneFach'); if (!faecher.has(f)) faecher.set(f, []); faecher.get(f).push(q); }
    return [...faecher.keys()].sort((a, b) => a.localeCompare(b)).map(f => [h('h2', { class: 'fachtitel' }, f), h('div', { class: 'karten' }, faecher.get(f).map(kollegiumKarte))]);
  }

  function studio() {
    const reiterKnopf = (k, text) => h('button', { class: 'reiterknopf' + (reiter === k ? ' an' : ''), onclick: () => { reiter = k; zeichne(); } }, text);
    return h('div', { class: 'studio' },
      h('header', { class: 'studiokopf' },
        h('a', { class: 'marke-klein', href: '#/' }, 'RABIOSA'), h('h1', null, T('studio.titel')),
        h('nav', { class: 'reiter' }, reiterKnopf('meine', T('studio.meine')), reiterKnopf('kollegium', T('studio.kollegium'))),
        h('span', { class: 'platzhalter' }),
        h('span', { class: 'wer' }, konto.name),
        sprachwahl(),
        h('button', { class: 'knopf klein leise', onclick: () => store.konto.abmelden() }, T('studio.abmelden'))),
      ctx.demo ? h('p', { class: 'demohinweis' }, T('allg.demo')) : null,
      laufend ? h('p', { class: 'laufend' }, h('a', { class: 'knopf klein', href: '#/beamer/' + laufend }, T('studio.fortsetzen', { code: laufend.slice(0, 3) + ' ' + laufend.slice(3) }))) : null,
      inhalt());
  }

  function zeichne() {
    document.documentElement.lang = s();
    if (konto === undefined) { wurzel.replaceChildren(h('p', { class: 'laedt' }, T('allg.laedt'))); return; }
    wurzel.replaceChildren(konto === null ? anmeldung() : konto.freigeschaltet ? studio() : freischaltung());
  }

  let aufgeraeumt = false, laufend = null, stoppLaufend = null;
  /** Läuft noch ein eigenes Spiel (Fenster versehentlich geschlossen)? Dann einen Weg zurück anbieten. */
  function sucheLaufendes() {
    let code = null;
    try { code = localStorage.getItem('rabiosa-laufend'); } catch { /* ohne Speicher */ }
    if (!/^\d{6}$/.test(code || '') || stoppLaufend) return;
    stoppLaufend = store.spiel.beobachten(code, s => {
      const neu = s && s.hostUid === konto?.uid && s.status !== 'ende' ? code : null;
      if (neu !== laufend) { laufend = neu; zeichne(); }
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
