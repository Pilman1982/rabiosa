import test from 'node:test';
import assert from 'node:assert/strict';
import { mische, neuesSpiel, frageStarten, auswerten, rueckblick, saubereSpieler, statistikSetzen } from '../js/logik/spiel.js';
import { beispielQuiz } from '../js/logik/quiz.js';

const spieler = [
  { schluessel: 'K-anna', pid: 'p1', name: 'Anna', avatar: { beruf: 'kueche' } },
  { schluessel: 'K-ben', pid: 'p2', name: 'Ben', avatar: { beruf: 'service' } },
  { schluessel: 'K-cem', pid: 'p3', name: 'Cem', avatar: { beruf: 'direktion' } },
];
const mc = { id: 'f1', typ: 'mc', text: 'Frage?', zeit: 20, erklaerung: 'Darum.',
  antworten: [{ text: 'a', richtig: false }, { text: 'b', richtig: true }, { text: 'c', richtig: false }] };
const START = 1_000_000;
const nach = sek => START + sek * 1000;
const eintrag = (r, pid) => r.rangliste.find(e => e.pid === pid);

test('mische liefert eine Vertauschung, die nie die Ausgangsreihenfolge ist', () => {
  for (let i = 0; i < 50; i++) {
    const m = mische(4, Math.random);
    assert.deepEqual([...m].sort(), [0, 1, 2, 3]);
    assert.notDeepEqual(m, [0, 1, 2, 3]);
  }
  assert.deepEqual(mische(1, Math.random), [0]);
});

test('neuesSpiel startet im Warteraum ohne Frage und ohne Lösungen', () => {
  const quiz = { ...beispielQuiz('de'), id: 'q1' };
  const { oeffentlich, privat } = neuesSpiel(quiz, 'host1');
  assert.equal(oeffentlich.status, 'warteraum');
  assert.equal(oeffentlich.frageNr, -1);
  assert.equal(oeffentlich.frageAnzahl, quiz.fragen.length);
  assert.equal(oeffentlich.frage, null);
  assert.deepEqual(oeffentlich.rangliste, []);
  assert.equal(oeffentlich.hostUid, 'host1');
  assert.equal(oeffentlich.sprache, 'de');
  assert.equal(privat.quizId, 'q1');
  assert.ok(!JSON.stringify(oeffentlich).includes('richtig'));
});

test('frageStarten liefert die öffentliche Frage und bei Reihenfolge eine Mischung', () => {
  const quiz = beispielQuiz('de');
  const nr = quiz.fragen.findIndex(f => f.typ === 'reihe');
  const { frage, mischung } = frageStarten(quiz, nr, Math.random);
  assert.equal(frage.nr, nr);
  assert.equal(mischung.length, quiz.fragen[nr].elemente.length);
  assert.equal(frageStarten(quiz, quiz.fragen.findIndex(f => f.typ === 'mc'), Math.random).mischung, null);
});

test('auswerten: Punkte nach Tempo, Rangliste sortiert, plus = Punkte dieser Frage', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [{ pid: 'p3', punkte: 2000 }],
    antworten: [
      { schluessel: 'K-anna', wert: 1, zeit: nach(0) },
      { schluessel: 'K-ben', wert: 1, zeit: nach(10) },
      { schluessel: 'K-cem', wert: 0, zeit: nach(2) },
    ] });
  assert.deepEqual(r.rangliste.map(e => [e.pid, e.punkte, e.plus, e.anteil, e.rang]), [
    ['p3', 2000, 0, 0, 1], ['p1', 1000, 1000, 1, 2], ['p2', 750, 750, 1, 3],
  ]);
  assert.equal(eintrag(r, 'p1').name, 'Anna');
  assert.deepEqual(eintrag(r, 'p1').avatar, { beruf: 'kueche' });
  assert.equal(r.aufloesung.loesung, 1);
  assert.deepEqual(r.aufloesung.verteilung, [1, 2, 0]);
  assert.equal(r.aufloesung.erklaerung, 'Darum.');
});

test('auswerten: nur die erste Antwort pro Schlüssel zählt', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [
      { schluessel: 'K-anna', wert: 0, zeit: nach(3) },
      { schluessel: 'K-anna', wert: 1, zeit: nach(5) },
    ] });
  assert.equal(eintrag(r, 'p1').punkte, 0);
  assert.deepEqual(r.aufloesung.verteilung, [1, 0, 0]);
});

test('auswerten: Antwort nach Zeit + 1 s wird verworfen, bis dahin zählt sie mit 500', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [
      { schluessel: 'K-anna', wert: 1, zeit: nach(21.1) },
      { schluessel: 'K-ben', wert: 1, zeit: nach(20.9) },
    ] });
  assert.equal(eintrag(r, 'p1').punkte, 0);
  assert.equal(eintrag(r, 'p1').anteil, null);
  assert.equal(eintrag(r, 'p2').punkte, 500);
  assert.equal(r.statistik.beantwortet, 1);
});

test('auswerten: Antworten vor dem Start und von Unbekannten werden verworfen', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [
      { schluessel: 'K-anna', wert: 1, zeit: START - 5 },
      { schluessel: 'K-fremd', wert: 1, zeit: nach(1) },
    ] });
  assert.deepEqual(r.rangliste.map(e => e.punkte), [0, 0, 0]);
  assert.deepEqual(r.aufloesung.verteilung, [0, 0, 0]);
});

test('auswerten: leere Antwortliste und leerer Raum geben keine Fehler', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [], antworten: [] });
  assert.equal(r.rangliste.length, 3);
  assert.deepEqual(r.rangliste.map(e => e.rang), [1, 1, 1]);
  assert.equal(r.statistik.beantwortet, 0);
  const leer = auswerten({ frage: mc, mischung: null, spieler: [], frageStart: START, rangVorher: [], antworten: [] });
  assert.deepEqual(leer.rangliste, []);
  assert.equal(leer.statistik.schnitt, 0);
});

test('auswerten: Gleichstand ergibt gleichen Rang, danach wird übersprungen', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START,
    rangVorher: [{ pid: 'p1', punkte: 500 }, { pid: 'p2', punkte: 500 }, { pid: 'p3', punkte: 100 }], antworten: [] });
  assert.deepEqual(r.rangliste.map(e => [e.name, e.rang]), [['Anna', 1], ['Ben', 1], ['Cem', 3]]);
});

test('auswerten: wer später dazukommt, startet mit 0; wer weg ist, fällt aus der Rangliste', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler: spieler.slice(0, 2), frageStart: START,
    rangVorher: [{ pid: 'p1', punkte: 300 }, { pid: 'p9', punkte: 9000 }], antworten: [] });
  assert.deepEqual(r.rangliste.map(e => [e.pid, e.punkte]), [['p1', 300], ['p2', 0]]);
});

test('auswerten umfrage: keine Punkte, aber Verteilung', () => {
  const frage = { id: 'u', typ: 'umfrage', text: 'Was?', zeit: 20, antworten: [{ text: 'a' }, { text: 'b' }] };
  const r = auswerten({ frage, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [{ schluessel: 'K-anna', wert: 1, zeit: nach(1) }] });
  assert.equal(eintrag(r, 'p1').plus, 0);
  assert.equal(eintrag(r, 'p1').anteil, null);
  assert.equal(r.aufloesung.loesung, null);
  assert.deepEqual(r.aufloesung.verteilung, [0, 1]);
});

test('auswerten: Auflösung und Verteilung je Typ', () => {
  const basis = { mischung: null, spieler, frageStart: START, rangVorher: [] };
  const a = (wA, wB, wC) => [
    { schluessel: 'K-anna', wert: wA, zeit: nach(1) }, { schluessel: 'K-ben', wert: wB, zeit: nach(1) }, { schluessel: 'K-cem', wert: wC, zeit: nach(1) }];

  const wf = auswerten({ ...basis, frage: { typ: 'wf', text: 't', zeit: 20, richtig: false }, antworten: a(true, false, false) });
  assert.equal(wf.aufloesung.loesung, false);
  assert.deepEqual(wf.aufloesung.verteilung, [1, 2]);

  const mehr = auswerten({ ...basis, frage: { typ: 'mehrfach', text: 't', zeit: 20,
    antworten: [{ text: 'a', richtig: true }, { text: 'b', richtig: false }, { text: 'c', richtig: true }] }, antworten: a([0, 2], [0], [1]) });
  assert.deepEqual(mehr.aufloesung.loesung, [0, 2]);
  assert.deepEqual(mehr.aufloesung.verteilung, [2, 1, 1]);

  const sch = auswerten({ ...basis, frage: { typ: 'schaetz', text: 't', zeit: 20, wert: 72, toleranz: 4, einheit: '°C' }, antworten: a(80, 72, 70) });
  assert.deepEqual(sch.aufloesung.loesung, { wert: 72, toleranz: 4, einheit: '°C' });
  assert.deepEqual(sch.aufloesung.verteilung, { werte: [70, 72, 80], treffer: 2 });

  const rei = auswerten({ ...basis, mischung: [1, 0, 2], frage: { typ: 'reihe', text: 't', zeit: 20, elemente: ['x', 'y', 'z'] },
    antworten: a([1, 0, 2], [0, 1, 2], [2, 1, 0]) });
  assert.deepEqual(rei.aufloesung.loesung, ['x', 'y', 'z']);
  assert.deepEqual(rei.aufloesung.verteilung, { ganz: 1, teil: 1, falsch: 1 });

  const kurz = auswerten({ ...basis, frage: { typ: 'kurz', text: 't', zeit: 20, loesungen: ['Rösti'] }, antworten: a('Rösti', ' roesti', 'Pommes') });
  assert.deepEqual(kurz.aufloesung.loesung, ['Rösti']);
  assert.deepEqual(kurz.aufloesung.verteilung, [{ text: 'Rösti', anzahl: 2, richtig: true }, { text: 'Pommes', anzahl: 1, richtig: false }]);
});

test('auswerten: Statistik für den Rückblick', () => {
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [{ schluessel: 'K-anna', wert: 1, zeit: nach(1) }, { schluessel: 'K-ben', wert: 0, zeit: nach(1) }] });
  assert.deepEqual(r.statistik, { beantwortet: 2, spieler: 3, richtig: 1, schnitt: 1 / 3 });
});

test('rueckblick fasst Fragen, Lösungen und Verteilungen ohne Namen zusammen', () => {
  const quiz = { id: 'q1', titel: 'Hygiene', fragen: [mc] };
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [{ schluessel: 'K-anna', wert: 1, zeit: nach(1) }] });
  const rb = rueckblick(quiz, [{ ...r.statistik, aufloesung: r.aufloesung }], 3, 1234);
  assert.equal(rb.quizId, 'q1');
  assert.equal(rb.quizTitel, 'Hygiene');
  assert.equal(rb.datum, 1234);
  assert.equal(rb.spieler, 3);
  assert.deepEqual(rb.fragen[0], { nr: 0, text: 'Frage?', typ: 'mc', antworten: ['a', 'b', 'c'], loesung: 1, verteilung: [0, 1, 0],
    beantwortet: 1, spieler: 3, richtig: 1, schnitt: 1 / 3 });
  assert.ok(!JSON.stringify(rb).includes('Anna'));
});

test('Zustand lässt sich aus öffentlich + privat wiederherstellen: zweite Frage baut auf der gespeicherten Rangliste auf', () => {
  const erste = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [],
    antworten: [{ schluessel: 'K-anna', wert: 1, zeit: nach(0) }] });
  const gespeichert = JSON.parse(JSON.stringify(erste.rangliste));   // so liegt sie in der Datenbank
  const zweite = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: gespeichert,
    antworten: [{ schluessel: 'K-anna', wert: 1, zeit: nach(20) }] });
  assert.equal(eintrag(zweite, 'p1').punkte, 1500);
  assert.equal(eintrag(zweite, 'p1').plus, 500);
});

test('saubereSpieler: unbrauchbare Einträge fallen weg, Namen und Avatare werden bereinigt', () => {
  const liste = saubereSpieler([
    { schluessel: 'k1', pid: 'p1', name: '  Anna   Maria  ', avatar: { beruf: '<script>' }, beigetreten: 10 },
    { schluessel: 'k2', pid: 'p2', name: 'x'.repeat(500), avatar: null, beigetreten: 20 },
    { schluessel: 'k3', pid: 'p3', name: 42, beigetreten: 30 },
    { schluessel: 'k4', name: 'ohne pid', beigetreten: 40 },
    { pid: 'p5', name: 'ohne schluessel', beigetreten: 50 },
    null,
  ]);
  assert.deepEqual(liste.map(s => [s.schluessel, s.pid, s.name]), [['k1', 'p1', 'Anna Maria'], ['k2', 'p2', 'x'.repeat(16)], ['k3', 'p3', '?']]);
  assert.equal(liste[0].avatar.beruf, 'kueche');
  assert.deepEqual(Object.keys(liste[1].avatar).sort(), ['bart', 'beruf', 'brille', 'frisur', 'haar', 'haut']);
});

test('saubereSpieler: eine doppelte öffentliche Kennung erbt keine fremden Punkte – wer zuerst da war, behält sie', () => {
  const liste = saubereSpieler([
    { schluessel: 'k-dieb', pid: 'p1', name: 'Dieb', avatar: {}, beigetreten: 99 },
    { schluessel: 'k-anna', pid: 'p1', name: 'Anna', avatar: {}, beigetreten: 10 },
  ]);
  assert.deepEqual(liste.map(s => s.schluessel), ['k-anna']);
});

test('saubereSpieler: gesperrte fallen weg, doppelte Namen bekommen eine Nummer', () => {
  const liste = saubereSpieler([
    { schluessel: 'k1', pid: 'p1', name: 'Luca', avatar: {}, beigetreten: 10 },
    { schluessel: 'k2', pid: 'p2', name: 'luca', avatar: {}, beigetreten: 20 },
    { schluessel: 'k3', pid: 'p3', name: 'Weg', avatar: {}, beigetreten: 30 },
  ], ['k3']);
  assert.deepEqual(liste.map(s => s.name), ['Luca', 'luca 2']);
});

test('neuesSpiel friert das Quiz im privaten Teil ein', () => {
  const quiz = { ...beispielQuiz('de'), id: 'q1' };
  const { oeffentlich, privat } = neuesSpiel(quiz, 'host1');
  assert.deepEqual(privat.quiz, quiz);
  quiz.fragen.pop();
  assert.equal(privat.quiz.fragen.length, quiz.fragen.length + 1);
  assert.ok(!('quiz' in oeffentlich));
});

test('statistikSetzen legt den Eintrag an seine Fragenummer, auch wenn er schon da ist', () => {
  const a = statistikSetzen([], 1, { beantwortet: 2 });
  assert.deepEqual(a, [null, { nr: 1, beantwortet: 2 }]);
  const b = statistikSetzen(a, 0, { beantwortet: 3 });
  assert.deepEqual(b, [{ nr: 0, beantwortet: 3 }, { nr: 1, beantwortet: 2 }]);
  assert.deepEqual(statistikSetzen(b, 1, { beantwortet: 9 }), [{ nr: 0, beantwortet: 3 }, { nr: 1, beantwortet: 9 }]);
  assert.deepEqual(a, [null, { nr: 1, beantwortet: 2 }]);
});

test('rueckblick überspringt Lücken und ordnet jede Statistik ihrer Frage zu', () => {
  const quiz = { id: 'q1', titel: 'T', fragen: [mc, { ...mc, text: 'Zweite?' }] };
  const r = auswerten({ frage: mc, mischung: null, spieler, frageStart: START, rangVorher: [], antworten: [] });
  const liste = statistikSetzen([], 1, { ...r.statistik, aufloesung: r.aufloesung });
  const rb = rueckblick(quiz, [...liste, { nr: 7, ...r.statistik, aufloesung: r.aufloesung }], 3, 1);
  assert.deepEqual(rb.fragen.map(f => [f.nr, f.text]), [[1, 'Zweite?']]);
});
