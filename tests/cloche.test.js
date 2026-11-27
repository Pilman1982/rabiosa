// Spielregeln von Cloche (Board mit Gruppen). Ausführen mit: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { clocheFelder } from '../js/logik/quiz.js';
import {
  KARTEN, MIT_ZIEL, wertVon, baueBoard, neuesCloche, schritt, rueckgaengig,
  wendeKarteAn, rangliste, SPEICHER_KEY, sichereStand, ladeStand,
} from '../js/logik/cloche.js';

/** Reproduzierbarer Zufall. */
function zufallAus(start = 1) {
  let s = start;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const frage = (thema, stufe, typ = 'mc') => ({ typ, text: 'F', thema, stufe });
const themenFragen = (themen, stufen = [1, 2, 3]) => themen.flatMap(t => stufen.map(s => frage(t, s)));
const ACHT = ['Mikro', 'Gefahren', 'Lagerung', 'LMG', 'HACCP', 'Deklaration', 'Allergene', 'Gesetz'];
const quizMit = fragen => ({ id: 'q1', titel: 'Test', sprache: 'de', fragen });
const gruppen = n => Array.from({ length: n }, (_, i) => ({ name: 'G' + (i + 1), farbe: 'a' + (i + 1) }));
const speicher = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('clocheFelder: Thema getrimmt und gekürzt, Stufe nur 1 bis 3', () => {
  assert.deepEqual(clocheFelder({ thema: '  Lagerung ', stufe: '2' }), { thema: 'Lagerung', stufe: 2 });
  assert.equal(clocheFelder({ stufe: 4 }).stufe, null);
  assert.equal(clocheFelder({ stufe: 0 }).stufe, null);
  assert.equal(clocheFelder({}).thema, '');
  assert.equal(clocheFelder({ thema: 'x'.repeat(50) }).thema.length, 40);
});

test('wertVon: Stufe 1 bis 3 gibt 100 bis 300, sonst 100', () => {
  assert.equal(wertVon({ stufe: 1 }), 100);
  assert.equal(wertVon({ stufe: 3 }), 300);
  assert.equal(wertVon({}), 100);
  assert.equal(wertVon({ stufe: 7 }), 100);
});

test('baueBoard: 8 Themen × 3 Stufen ergeben 8 Spalten in Reihenfolge, nach Wert sortiert', () => {
  const fragen = themenFragen(ACHT, [3, 1, 2]);
  const b = baueBoard(fragen, zufallAus());
  assert.equal(b.art, 'themen');
  assert.deepEqual(b.spalten.map(s => s.thema), ACHT);
  for (const s of b.spalten) {
    const werte = s.felder.map(nr => b.felder.find(f => f.nr === nr).wert);
    assert.deepEqual(werte, [100, 200, 300]);
  }
  assert.equal(b.felder.length, 24);
  assert.deepEqual(b.felder.map(f => f.nr), Array.from({ length: 24 }, (_, i) => i + 1));
});

test('baueBoard: ohne Themen nummerierte Felder', () => {
  const b = baueBoard([1, 2, 3, 4, 5].map(() => frage('', null)), zufallAus());
  assert.equal(b.art, 'nummern');
  assert.deepEqual(b.spalten, []);
  assert.deepEqual(b.felder.map(f => f.nr), [1, 2, 3, 4, 5]);
  assert.deepEqual(b.felder.map(f => f.frage), [0, 1, 2, 3, 4]);
});

test('baueBoard: mehr als 8 Themen ergeben nummerierte Felder', () => {
  const b = baueBoard(themenFragen([...ACHT, 'Neun'], [1]), zufallAus());
  assert.equal(b.art, 'nummern');
});

test('baueBoard: Fragen ohne Thema kommen in eine letzte Spalte', () => {
  const fragen = [frage('A', 1), frage('', 1), frage('B', 2), frage('', 2)];
  const b = baueBoard(fragen, zufallAus());
  assert.equal(b.art, 'themen');
  assert.deepEqual(b.spalten.map(s => s.thema), ['A', 'B', '']);
  assert.equal(b.spalten[2].felder.length, 2);
});

test('baueBoard: höchstens 36 Felder, jede Frage nur einmal', () => {
  const fragen = Array.from({ length: 72 }, () => frage('', null));
  const b = baueBoard(fragen, zufallAus());
  assert.equal(b.felder.length, 36);
  assert.equal(new Set(b.felder.map(f => f.frage)).size, 36);
});

test('baueBoard: eine einzige Frage', () => {
  const b = baueBoard([frage('A', 2)], zufallAus());
  assert.equal(b.felder.length, 1);
  assert.equal(b.felder[0].wert, 200);
});

test('neuesCloche: etwa jedes fünfte Feld trägt eine Karte', () => {
  const q = quizMit(themenFragen(ACHT));
  assert.equal(Object.keys(neuesCloche(q, { gruppen: gruppen(4), karten: KARTEN }, zufallAus()).karten).length, 5);
  assert.equal(Object.keys(neuesCloche(q, { gruppen: gruppen(4), karten: [] }, zufallAus()).karten).length, 0);
  const klein = neuesCloche(quizMit(themenFragen(['A'], [1, 2, 3, 1])), { gruppen: gruppen(2), karten: KARTEN }, zufallAus());
  assert.ok(Object.keys(klein.karten).length <= 1);
  for (const k of Object.values(neuesCloche(q, { gruppen: gruppen(4), karten: ['trinkgeld'] }, zufallAus()).karten)) assert.equal(k, 'trinkgeld');
});

test('neuesCloche: leere Namen werden «Gruppe n», lange gekürzt, alle bei 0', () => {
  const s = neuesCloche(quizMit(themenFragen(['A'])), { gruppen: [{ name: '', farbe: 'a1' }, { name: 'Sehr langer Gruppenname über zwanzig', farbe: 'a2' }], karten: [] }, zufallAus());
  assert.equal(s.gruppen[0].name, 'Gruppe 1');
  assert.equal(s.gruppen[1].name.length, 20);
  assert.deepEqual(s.gruppen.map(g => g.punkte), [0, 0]);
  assert.equal(s.phase, 'board');
  assert.equal(s.version, 1);
  assert.ok(s.amZug >= 0 && s.amZug < 2);
  assert.equal(neuesCloche({ ...quizMit(themenFragen(['A'])), sprache: 'en' }, { gruppen: [{ name: ' ', farbe: 'a1' }, { name: 'B', farbe: 'a2' }], karten: [] }, zufallAus()).gruppen[0].name, 'Group 1');
});

/** Spiel mit 4 Gruppen, Gruppe 0 am Zug, ohne Karten. */
function spiel(karten = {}) {
  const s = neuesCloche(quizMit(themenFragen(['A', 'B'])), { gruppen: gruppen(4), karten: [] }, zufallAus());
  return { ...s, amZug: 0, karten };
}
const feldMitWert = (s, wert) => s.board.felder.find(f => f.wert === wert).nr;

test('schritt oeffne: öffnet ein freies Feld, ein gespieltes nicht', () => {
  const s = spiel();
  const nr = feldMitWert(s, 200);
  const offen = schritt(s, { typ: 'oeffne', feld: nr });
  assert.equal(offen.phase, 'frage');
  assert.equal(offen.offen, nr);
  const danach = schritt(offen, { typ: 'bewerte', richtig: [false, false, false, false] });
  const nochmals = schritt(danach, { typ: 'oeffne', feld: nr });
  assert.equal(nochmals.phase, 'board');
  assert.equal(nochmals.offen, null);
});

test('schritt bewerte: richtige Gruppen bekommen den Feldwert, nächste Gruppe am Zug', () => {
  const s = spiel();
  const nr = feldMitWert(s, 200);
  const b = schritt(schritt(s, { typ: 'oeffne', feld: nr }), { typ: 'bewerte', richtig: [true, false, true, false] });
  assert.deepEqual(b.gruppen.map(g => g.punkte), [200, 0, 200, 0]);
  assert.equal(b.phase, 'board');
  assert.equal(b.gespielt[nr], 0);
  assert.equal(b.amZug, 1);
  const umlauf = { ...spiel(), amZug: 3 };
  assert.equal(schritt(schritt(umlauf, { typ: 'oeffne', feld: nr }), { typ: 'bewerte', richtig: [false, false, false, false] }).amZug, 0);
});

test('schritt bewerte auf einem Feld mit Karte: erst die Karte, dann die nächste Gruppe', () => {
  const s0 = spiel();
  const nr = feldMitWert(s0, 100);
  const s = { ...s0, karten: { [nr]: 'trinkgeld' } };
  const b = schritt(schritt(s, { typ: 'oeffne', feld: nr }), { typ: 'bewerte', richtig: [false, true, false, false] });
  assert.equal(b.phase, 'karte');
  assert.equal(b.amZug, 0);
  const k = schritt(b, { typ: 'karte' });
  assert.equal(k.phase, 'board');
  assert.equal(k.amZug, 1);
  assert.deepEqual(k.gruppen.map(g => g.punkte), [200, 100, 0, 0]);
});

test('schritt: letztes Feld führt zum Ende, beende geht aus jeder Phase', () => {
  let s = spiel();
  for (const f of s.board.felder) s = schritt(schritt(s, { typ: 'oeffne', feld: f.nr }), { typ: 'bewerte', richtig: [false, false, false, false] });
  assert.equal(s.phase, 'ende');
  const frage = schritt(spiel(), { typ: 'oeffne', feld: 1 });
  const ende = schritt(frage, { typ: 'beende' });
  assert.equal(ende.phase, 'ende');
  assert.equal(ende.offen, null);
});

test('wendeKarteAn: alle Karten, nie unter 0', () => {
  const g = punkte => punkte.map((p, i) => ({ name: 'G' + i, farbe: 'a1', punkte: p }));
  const p = gr => gr.map(x => x.punkte);
  assert.deepEqual(p(wendeKarteAn(g([0, 0]), 'trinkgeld', 0, null, 300, false)), [200, 0]);
  assert.deepEqual(p(wendeKarteAn(g([300, 0]), 'doppelt', 0, null, 300, true)), [600, 0]);
  assert.deepEqual(p(wendeKarteAn(g([300, 0]), 'doppelt', 0, null, 300, false)), [300, 0]);
  assert.deepEqual(p(wendeKarteAn(g([100, 0]), 'inspektor', 0, null, 300, false)), [0, 0]);
  assert.deepEqual(p(wendeKarteAn(g([0, 50]), 'mundraub', 0, 1, 300, false)), [50, 0]);
  assert.deepEqual(p(wendeKarteAn(g([0, 500]), 'mundraub', 0, 1, 300, false)), [200, 300]);
  assert.deepEqual(p(wendeKarteAn(g([100, 900]), 'tischwechsel', 0, 1, 300, false)), [900, 100]);
  assert.deepEqual(p(wendeKarteAn(g([120, 0]), 'spendierrunde', 0, 1, 300, false)), [0, 120]);
  assert.deepEqual(p(wendeKarteAn(g([500, 0]), 'spendierrunde', 0, 1, 300, false)), [300, 200]);
});

test('wendeKarteAn: Karte mit Ziel ohne gültiges Ziel verfällt', () => {
  const g = [{ name: 'A', farbe: 'a1', punkte: 100 }, { name: 'B', farbe: 'a2', punkte: 400 }];
  for (const k of MIT_ZIEL) {
    assert.deepEqual(wendeKarteAn(g, k, 0, null, 100, false).map(x => x.punkte), [100, 400]);
    assert.deepEqual(wendeKarteAn(g, k, 0, 0, 100, false).map(x => x.punkte), [100, 400]);
  }
  assert.equal(g[0].punkte, 100, 'Eingabe bleibt unverändert');
});

test('schritt karte: Ziel aus der Aktion', () => {
  const s0 = spiel();
  const nr = feldMitWert(s0, 100);
  let s = { ...s0, karten: { [nr]: 'tischwechsel' } };
  s = schritt(s, { typ: 'korrigiere', gruppe: 2, delta: 700 });
  s = schritt(schritt(s, { typ: 'oeffne', feld: nr }), { typ: 'bewerte', richtig: [true, false, false, false] });
  s = schritt(s, { typ: 'karte', ziel: 2 });
  assert.deepEqual(s.gruppen.map(g => g.punkte), [700, 0, 100, 0]);
});

test('schritt korrigiere: nie unter 0', () => {
  let s = schritt(spiel(), { typ: 'korrigiere', gruppe: 1, delta: 300 });
  s = schritt(s, { typ: 'korrigiere', gruppe: 1, delta: -500 });
  assert.equal(s.gruppen[1].punkte, 0);
});

test('rueckgaengig: stellt Punkte, gespielte Felder und Phase wieder her', () => {
  const s = spiel();
  const nr = feldMitWert(s, 300);
  const offen = schritt(s, { typ: 'oeffne', feld: nr });
  const b = schritt(offen, { typ: 'bewerte', richtig: [true, true, false, false] });
  const z = rueckgaengig(b);
  assert.equal(z.phase, 'frage');
  assert.deepEqual(z.gruppen.map(g => g.punkte), [0, 0, 0, 0]);
  assert.equal(z.gespielt[nr], undefined);
  assert.equal(rueckgaengig(z).phase, 'board');
  assert.equal(rueckgaengig(spiel()).phase, 'board', 'ohne Verlauf bleibt alles');
  let viel = spiel();
  for (let i = 0; i < 30; i++) viel = schritt(viel, { typ: 'korrigiere', gruppe: 0, delta: 100 });
  assert.equal(viel.zurueck.length, 20);
});

test('rangliste: absteigend, gleiche Punkte gleicher Rang', () => {
  const r = rangliste([{ name: 'A', punkte: 100 }, { name: 'B', punkte: 300 }, { name: 'C', punkte: 100 }, { name: 'D', punkte: 0 }]);
  assert.deepEqual(r.map(x => [x.name, x.rang]), [['B', 1], ['A', 2], ['C', 2], ['D', 4]]);
});

test('ladeStand: kaputt oder alt gibt null, gesicherter Stand kommt zurück', () => {
  const sp = speicher();
  assert.equal(ladeStand(sp), null);
  sp.setItem(SPEICHER_KEY, '{kaputt');
  assert.equal(ladeStand(sp), null);
  sp.setItem(SPEICHER_KEY, JSON.stringify({ ...spiel(), version: 0 }));
  assert.equal(ladeStand(sp), null);
  const s = schritt(schritt(spiel(), { typ: 'oeffne', feld: 1 }), { typ: 'korrigiere', gruppe: 0, delta: 100 });
  sichereStand(sp, s);
  const zurueck = ladeStand(sp);
  assert.deepEqual(zurueck, { ...s, zurueck: [] });
  assert.equal(JSON.parse(sp.getItem(SPEICHER_KEY)).zurueck.length, 0);
});

test('gemischteReihe: echte Mischung, für dasselbe Feld immer gleich', async () => {
  const { gemischteReihe } = await import('../js/logik/cloche.js');
  for (const n of [3, 4, 5, 6]) for (const nr of [1, 2, 7, 24]) {
    const r = gemischteReihe(n, nr);
    assert.deepEqual([...r].sort(), Array.from({ length: n }, (_, i) => i), `n=${n} nr=${nr} keine Permutation`);
    assert.ok(r.some((j, i) => j !== i), `n=${n} nr=${nr} nicht gemischt`);
    assert.deepEqual(gemischteReihe(n, nr), r);
  }
});

test('Prüfung: ein einziges Thema oder sehr ungleiche Spalten ergeben nummerierte Felder', () => {
  assert.equal(baueBoard(Array.from({ length: 24 }, () => frage('Hygiene', 1)), zufallAus()).art, 'nummern');
  const schief = [frage('A', 1), frage('A', 2), frage('A', 3), ...Array.from({ length: 30 }, () => frage('', null))];
  assert.equal(baueBoard(schief, zufallAus()).art, 'nummern');
  assert.equal(baueBoard(themenFragen(['A'], [1, 2, 3]), zufallAus()).art, 'nummern', 'eine Spalte allein ist kein Board');
});

test('Prüfung: 8 Themen und eine Frage ohne Thema bleiben ein Themen-Board', () => {
  const b = baueBoard([...themenFragen(ACHT), frage('', 1)], zufallAus());
  assert.equal(b.art, 'themen');
  assert.equal(b.spalten.length, 9);
  assert.equal(b.spalten[8].thema, '');
});

test('Prüfung: Karte mit Ziel ohne gültiges Ziel wird nicht verbraucht', () => {
  const s0 = spiel();
  const nr = feldMitWert(s0, 100);
  let s = { ...s0, karten: { [nr]: 'mundraub' } };
  s = schritt(schritt(s, { typ: 'oeffne', feld: nr }), { typ: 'bewerte', richtig: [false, false, false, false] });
  assert.equal(s.phase, 'karte');
  assert.equal(schritt(s, { typ: 'karte' }).phase, 'karte');
  assert.equal(schritt(s, { typ: 'karte', ziel: s.amZug }).phase, 'karte');
  assert.equal(schritt(s, { typ: 'karte', ziel: 1 }).phase, 'board');
});

test('Prüfung: zurueckInDieFrage nur, wenn Rückgängig eine andere Phase verlässt', async () => {
  const { zurueckInDieFrage } = await import('../js/logik/cloche.js');
  const offen = schritt(spiel(), { typ: 'oeffne', feld: 1 });
  const korrigiert = schritt(offen, { typ: 'korrigiere', gruppe: 0, delta: 100 });
  assert.equal(zurueckInDieFrage(korrigiert, rueckgaengig(korrigiert)), false, 'Korrektur in derselben Frage');
  const bewertet = schritt(offen, { typ: 'bewerte', richtig: [true, false, false, false] });
  assert.equal(zurueckInDieFrage(bewertet, rueckgaengig(bewertet)), true, 'Bewertung zurückgenommen');
});
