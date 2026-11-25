// Ausführen mit: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { punkte } from '../js/logik/punkte.js';
import { anteil, normalisiere, leseZahl } from '../js/logik/pruefen.js';
import { TYPEN, neueFrage, quizFehler, oeffentlicheFrage, beispielQuiz } from '../js/logik/quiz.js';

const mc = { typ: 'mc', antworten: [{ text: 'a', richtig: false }, { text: 'b', richtig: true }, { text: 'c', richtig: false }] };
const mehrfach = { typ: 'mehrfach', antworten: [{ text: 'a', richtig: true }, { text: 'b', richtig: false }, { text: 'c', richtig: true }] };
const schaetz = { typ: 'schaetz', wert: 72, toleranz: 4, einheit: '°C' };
const reihe = { typ: 'reihe', elemente: ['eins', 'zwei', 'drei', 'vier'] };
const kurz = { typ: 'kurz', loesungen: ['Rösti', 'Crème brûlée'] };

test('punkte: sofort 1000, am Ende 500, dazwischen gleichmässig', () => {
  assert.equal(punkte(1, 0, 20), 1000);
  assert.equal(punkte(1, 20, 20), 500);
  assert.equal(punkte(1, 10, 20), 750);
});

test('punkte: Teilpunkte werden mit dem Anteil multipliziert', () => {
  assert.equal(punkte(0.5, 0, 20), 500);
  assert.equal(punkte(0, 3, 20), 0);
});

test('punkte: Zeit ausserhalb des Bereichs wird begrenzt', () => {
  assert.equal(punkte(1, 99, 20), 500);
  assert.equal(punkte(1, -2, 20), 1000);
});

test('anteil mc: richtig oder nichts', () => {
  assert.equal(anteil(mc, 1), 1);
  assert.equal(anteil(mc, 0), 0);
});

test('anteil wf', () => {
  assert.equal(anteil({ typ: 'wf', richtig: false }, false), 1);
  assert.equal(anteil({ typ: 'wf', richtig: false }, true), 0);
});

test('anteil mehrfach: richtig gewählte minus falsch gewählte, mindestens 0', () => {
  assert.equal(anteil(mehrfach, [0, 2]), 1);
  assert.equal(anteil(mehrfach, [2]), 0.5);
  assert.equal(anteil(mehrfach, [0, 1]), 0);
  assert.equal(anteil(mehrfach, [1]), 0);
  assert.equal(anteil(mehrfach, []), 0);
});

test('anteil mehrfach: doppelt gesendete Auswahl zählt nur einmal', () => {
  assert.equal(anteil(mehrfach, [0, 0]), 0.5);
});

test('anteil schaetz: je näher desto mehr, ausserhalb der Toleranz nichts', () => {
  assert.equal(anteil(schaetz, 72), 1);
  assert.equal(anteil(schaetz, 74), 0.75);
  assert.equal(anteil(schaetz, 76), 0.5);
  assert.equal(anteil(schaetz, 68), 0.5);
  assert.equal(anteil(schaetz, 76.1), 0);
});

test('anteil schaetz ohne Toleranz: nur der exakte Wert', () => {
  const f = { typ: 'schaetz', wert: 5, toleranz: 0 };
  assert.equal(anteil(f, 5), 1);
  assert.equal(anteil(f, 5.1), 0);
});

test('anteil reihe: Anteil der Elemente am richtigen Platz', () => {
  // mischung[i] = ursprünglicher Platz des Elements, das gemischt an Stelle i steht
  const mischung = [2, 0, 3, 1];
  assert.equal(anteil(reihe, [1, 3, 0, 2], mischung), 1);
  assert.equal(anteil(reihe, [1, 3, 2, 0], mischung), 0.5);
});

test('anteil kurz: Gross/Klein, Leerzeichen, Akzente und ä/ae sind egal', () => {
  assert.equal(anteil(kurz, ' roesti '), 1);
  assert.equal(anteil(kurz, 'CREME  BRULEE'), 1);
  assert.equal(anteil(kurz, 'Pommes'), 0);
});

test('anteil umfrage: keine Wertung', () => {
  assert.equal(anteil({ typ: 'umfrage', antworten: [{ text: 'a' }, { text: 'b' }] }, 0), null);
});

test('anteil: unbrauchbare Eingaben geben 0 statt einen Fehler', () => {
  assert.equal(anteil(mc, 'x'), 0);
  assert.equal(anteil(mc, 7), 0);
  assert.equal(anteil(mehrfach, 'x'), 0);
  assert.equal(anteil(schaetz, 'viel'), 0);
  assert.equal(anteil(reihe, [0, 0, 0, 0], [0, 1, 2, 3]), 0);
  assert.equal(anteil(reihe, [0, 1], [0, 1, 2, 3]), 0);
  assert.equal(anteil(kurz, 42), 0);
  assert.equal(anteil(kurz, undefined), 0);
});

test('normalisiere', () => {
  assert.equal(normalisiere(' Rösti '), normalisiere('roesti'));
  assert.equal(normalisiere('Crème brûlée'), 'creme brulee');
  assert.equal(normalisiere('Strasse'), normalisiere('Straße'));
});

test('leseZahl versteht Komma und Apostroph', () => {
  assert.equal(leseZahl('72,5'), 72.5);
  assert.equal(leseZahl("1'000"), 1000);
  assert.equal(leseZahl(' 12 '), 12);
  assert.ok(Number.isNaN(leseZahl('abc')));
  assert.ok(Number.isNaN(leseZahl('')));
});

function gutesQuiz() {
  return { titel: 'Test', fach: 'Küche', sprache: 'de', fragen: [{ ...neueFrage('wf'), text: 'Stimmt das?' }] };
}
const codes = quiz => quizFehler(quiz).map(f => f.code);

test('quizFehler: gültiges Quiz hat keine Fehler', () => {
  assert.deepEqual(quizFehler(gutesQuiz()), []);
});

test('quizFehler: leerer Titel und keine Fragen', () => {
  assert.deepEqual(codes({ ...gutesQuiz(), titel: '  ' }), ['titel']);
  assert.deepEqual(codes({ ...gutesQuiz(), fragen: [] }), ['keineFragen']);
});

test('quizFehler: Multiple Choice braucht genau eine richtige Antwort', () => {
  const q = gutesQuiz();
  const f = { ...neueFrage('mc'), text: 'Frage?' };
  f.antworten = [{ text: 'a', richtig: false }, { text: 'b', richtig: false }];
  q.fragen = [f];
  assert.deepEqual(quizFehler(q), [{ frage: 0, code: 'richtig' }]);
  f.antworten = [{ text: 'a', richtig: true }, { text: 'b', richtig: true }];
  assert.deepEqual(codes(q), ['richtig']);
  f.antworten = [{ text: 'a', richtig: true }, { text: ' ', richtig: false }];
  assert.deepEqual(codes(q), ['antworten']);
});

test('quizFehler: Zeit nur 5 bis 240 Sekunden', () => {
  const q = gutesQuiz();
  q.fragen[0].zeit = 4;
  assert.deepEqual(codes(q), ['zeit']);
  q.fragen[0].zeit = 241;
  assert.deepEqual(codes(q), ['zeit']);
  q.fragen[0].zeit = 240;
  assert.deepEqual(codes(q), []);
});

test('quizFehler: Reihenfolge braucht 3 bis 6 verschiedene Elemente, Kurzantwort eine Lösung, Schätzfrage eine Zahl', () => {
  const q = gutesQuiz();
  q.fragen = [
    { ...neueFrage('reihe'), text: 'Ordne', elemente: ['a', 'b'] },
    { ...neueFrage('reihe'), text: 'Ordne', elemente: ['a', 'b', 'a'] },
    { ...neueFrage('kurz'), text: 'Wie heisst es?', loesungen: [' '] },
    { ...neueFrage('schaetz'), text: 'Wie viel?', wert: NaN },
    { ...neueFrage('umfrage'), text: '' , antworten: [{ text: 'a' }, { text: 'b' }] },
  ];
  assert.deepEqual(quizFehler(q), [
    { frage: 0, code: 'elemente' }, { frage: 1, code: 'elemente' }, { frage: 2, code: 'loesungen' },
    { frage: 3, code: 'wert' }, { frage: 4, code: 'text' },
  ]);
});

test('beispielQuiz ist in beiden Sprachen gültig und enthält jeden Fragetyp', () => {
  for (const sprache of ['de', 'en']) {
    const q = beispielQuiz(sprache);
    assert.deepEqual(quizFehler(q), []);
    assert.deepEqual([...new Set(q.fragen.map(f => f.typ))].sort(), [...TYPEN].sort());
  }
});

test('oeffentlicheFrage verrät bei keinem Typ die Lösung', () => {
  const q = beispielQuiz('de');
  q.fragen.forEach((frage, nr) => {
    const mischung = frage.typ === 'reihe' ? frage.elemente.map((_, i) => (i + 1) % frage.elemente.length) : null;
    const o = oeffentlicheFrage(frage, nr, mischung);
    for (const feld of ['richtig', 'wert', 'toleranz', 'loesungen', 'erklaerung']) assert.ok(!(feld in o), frage.typ + ' enthält ' + feld);
    for (const a of o.antworten || []) assert.equal(typeof a, 'string');
    assert.equal(o.nr, nr);
    assert.equal(o.zeit, frage.zeit);
    if (frage.typ === 'reihe') {
      assert.notDeepEqual(o.elemente, frage.elemente);
      assert.deepEqual([...o.elemente].sort(), [...frage.elemente].sort());
      assert.equal(o.elemente[0], frage.elemente[mischung[0]]);
    }
    if (frage.antworten) assert.deepEqual(o.antworten, frage.antworten.map(a => a.text));
  });
});

test('normalisiere: typografischer Apostroph, Ligaturen und zerlegte Umlaute', () => {
  assert.equal(normalisiere('Maître d’hôtel'), normalisiere("maitre d'hotel"));
  assert.equal(normalisiere('Hors-d‘œuvre'), "hors-d'oeuvre");
  assert.equal(normalisiere('Rösti'), normalisiere('Roesti'));
  assert.equal(normalisiere('Cæsar'), 'caesar');
});

test('leseZahl versteht negative Zahlen, auch mit typografischem Minus', () => {
  assert.equal(leseZahl('-18'), -18);
  assert.equal(leseZahl('−18,5'), -18.5);
  assert.equal(leseZahl('– 4'), -4);
});
