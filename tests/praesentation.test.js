import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLIEN, neueFolie, neuePraesentation, folienFehler, oeffentlicheFolie, sauberWert, saubereWoerter, stimmen, auswerten,
  ohneAusgeblendete, neueSitzung, folieWechsel, istGeschlossen, istNeuerStand, praesentationsRueckblick, beispielPraesentation,
  istPraesentation, istInteraktiv, OFFEN_MAX, WORT_MAX,
} from '../js/logik/praesentation.js';
import { quizFehler } from '../js/logik/quiz.js';
import { suche } from '../js/logik/ablage.js';

const folie = (typ, rest) => ({ ...neueFolie(typ), text: 'Frage', ...rest });

test('Beispiel-Präsentation: alle Folientypen, ohne Mängel, auch über quizFehler', () => {
  for (const sprache of ['de', 'en']) {
    const p = beispielPraesentation(sprache);
    assert.ok(istPraesentation(p));
    assert.deepEqual(folienFehler(p), []);
    assert.deepEqual(quizFehler(p), []);
    assert.deepEqual([...new Set(p.fragen.map(f => f.typ))].sort(), [...FOLIEN].sort());
  }
});

test('neue Folien sind unvollständig und melden das Richtige', () => {
  const p = { ...neuePraesentation(), titel: 'T', fragen: FOLIEN.map(neueFolie) };
  const codes = folienFehler(p).map(f => `${p.fragen[f.frage].typ}:${f.code}`);
  assert.ok(codes.includes('abstimmung:antworten'));
  assert.ok(codes.includes('skala:aussagen'));
  assert.ok(codes.includes('rangfolge:elemente'));
  assert.ok(codes.includes('punkte:elemente'));
  for (const typ of FOLIEN) assert.ok(codes.includes(typ + ':folieText'), typ);
  assert.deepEqual(folienFehler(neuePraesentation()).map(f => f.code), ['titel', 'keineFolien']);
});

test('Mängel: Skala-Grenzen, doppelte Elemente, Wörter pro Person, unbekannter Typ', () => {
  const fehlerVon = f => folienFehler({ titel: 'T', fragen: [f] }).map(x => x.code);
  assert.deepEqual(fehlerVon(folie('skala', { aussagen: ['a'], max: 4 })), ['skala']);
  assert.deepEqual(fehlerVon(folie('skala', { aussagen: ['a'], min: 0, max: 10 })), []);
  assert.deepEqual(fehlerVon(folie('rangfolge', { elemente: ['A', 'a'] })), ['elemente']);
  assert.deepEqual(fehlerVon(folie('wortwolke', { proPerson: 4 })), ['proPerson']);
  assert.deepEqual(fehlerVon({ typ: 'mc', text: 'x' }), ['typ']);
});

test('öffentliche Folie enthält, was das Handy braucht, aber keine Bildkennung', () => {
  const f = folie('skala', { aussagen: ['a', 'b'], links: 'nie', rechts: 'immer', bildId: 'b123' });
  assert.deepEqual(oeffentlicheFolie(f, 2), { nr: 2, typ: 'skala', text: 'Frage', hatBild: true, aussagen: ['a', 'b'], min: 1, max: 5, links: 'nie', rechts: 'immer' });
  const a = oeffentlicheFolie(folie('abstimmung', { antworten: [{ text: 'x' }, { text: 'y' }], mehrere: true }), 0);
  assert.deepEqual(a.antworten, ['x', 'y']);
  assert.equal(a.mehrere, true);
});

test('sauberWert: Abstimmung mit einer und mit mehreren Stimmen', () => {
  const eine = folie('abstimmung', { antworten: [{ text: 'a' }, { text: 'b' }] });
  assert.equal(sauberWert(eine, 1), 1);
  assert.equal(sauberWert(eine, 2), null);
  assert.equal(sauberWert(eine, [0]), null);
  const mehrere = { ...eine, mehrere: true };
  assert.deepEqual(sauberWert(mehrere, [1, 0, 1, 7]), [0, 1]);
  assert.equal(sauberWert(mehrere, []), null);
  assert.equal(sauberWert(mehrere, 0), null);
});

test('sauberWert: Wortwolke kürzt, trimmt und entfernt Doppelte', () => {
  const f = folie('wortwolke', { proPerson: 2 });
  assert.deepEqual(sauberWert(f, ['  Lächeln ', 'LÄCHELN', 'Zeit', 'mehr']), ['Lächeln', 'Zeit']);
  assert.deepEqual(sauberWert(f, 'Einzeln'), ['Einzeln']);
  assert.equal(sauberWert(f, ['', '   ']), null);
  assert.equal(saubereWoerter(['x'.repeat(40)])[0].length, WORT_MAX);
});

test('sauberWert: Skala, offen, Rangfolge, Punkte', () => {
  const skala = folie('skala', { aussagen: ['a', 'b'], min: 1, max: 5 });
  assert.deepEqual(sauberWert(skala, [1, 5]), [1, 5]);
  assert.equal(sauberWert(skala, [0, 5]), null);
  assert.equal(sauberWert(skala, [3]), null);
  assert.equal(sauberWert(skala, [2.5, 3]), null);
  const offen = folie('offen');
  assert.equal(sauberWert(offen, '  Mehr   Pausen bitte '), 'Mehr Pausen bitte');
  assert.equal(sauberWert(offen, 'x'.repeat(400)).length, OFFEN_MAX);
  assert.equal(sauberWert(offen, '   '), null);
  const reihe = folie('rangfolge', { elemente: ['a', 'b', 'c'] });
  assert.deepEqual(sauberWert(reihe, [2, 0, 1]), [2, 0, 1]);
  assert.equal(sauberWert(reihe, [0, 0, 1]), null);
  assert.equal(sauberWert(reihe, [0, 1]), null);
  const punkte = folie('punkte', { elemente: ['a', 'b', 'c'] });
  assert.deepEqual(sauberWert(punkte, [50, 30, 20]), [50, 30, 20]);
  assert.deepEqual(sauberWert(punkte, [50, 0, 0]), [50, 0, 0]);
  assert.equal(sauberWert(punkte, [60, 30, 20]), null);
  assert.equal(sauberWert(punkte, [0, 0, 0]), null);
  assert.equal(sauberWert(punkte, [-10, 60, 50]), null);
  assert.equal(sauberWert(folie('inhalt'), 'x'), null);
});

test('stimmen: pro Person die erste brauchbare Antwort, nur von Beigetretenen', () => {
  const f = folie('abstimmung', { antworten: [{ text: 'a' }, { text: 'b' }] });
  const antworten = [
    { schluessel: 'A', wert: 1, zeit: 20 }, { schluessel: 'A', wert: 0, zeit: 10 },
    { schluessel: 'B', wert: 9, zeit: 5 }, { schluessel: 'B', wert: 1, zeit: 6 },
    { schluessel: 'X', wert: 0, zeit: 1 },
  ];
  const s = stimmen(f, antworten, [{ schluessel: 'A' }, { schluessel: 'B' }]);
  assert.deepEqual(s.map(x => [x.schluessel, x.wert]), [['B', 1], ['A', 0]]);
  assert.equal(stimmen(f, antworten).length, 3);
});

test('auswerten: Abstimmung zählt jede gewählte Antwort', () => {
  const f = folie('abstimmung', { antworten: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], mehrere: true });
  const e = auswerten(f, [{ wert: [0, 2] }, { wert: [2] }, { wert: [0, 1, 2] }]);
  assert.deepEqual(e, { anzahl: 3, zaehlung: [2, 1, 3] });
});

test('auswerten: Wortwolke fasst Schreibweisen zusammen, häufigste zuerst', () => {
  const f = folie('wortwolke', { proPerson: 3 });
  const e = auswerten(f, [
    { wert: ['Lächeln', 'Zeit'], zeit: 1 }, { wert: ['lächeln '], zeit: 2 }, { wert: ['LÄCHELN', 'Ruhe'], zeit: 3 }, { wert: ['Ruhe'], zeit: 4 },
  ]);
  assert.equal(e.anzahl, 4);
  assert.deepEqual(e.woerter, [{ text: 'Lächeln', anzahl: 3 }, { text: 'Ruhe', anzahl: 2 }, { text: 'Zeit', anzahl: 1 }]);
});

test('auswerten: Skala mit Durchschnitt und Verteilung je Aussage', () => {
  const f = folie('skala', { aussagen: ['a', 'b'], min: 1, max: 5 });
  const e = auswerten(f, [{ wert: [1, 5] }, { wert: [2, 5] }, { wert: [2, 4] }]);
  assert.equal(e.anzahl, 3);
  assert.deepEqual(e.aussagen[0], { schnitt: 1.7, verteilung: [1, 2, 0, 0, 0] });
  assert.deepEqual(e.aussagen[1], { schnitt: 4.7, verteilung: [0, 0, 0, 1, 2] });
  assert.equal(auswerten(f, []).aussagen[0].schnitt, null);
});

test('auswerten: offene Antworten, neueste zuerst; Ausblenden', () => {
  const e = auswerten(folie('offen'), [{ schluessel: 'A', wert: 'alt', zeit: 1 }, { schluessel: 'B', wert: 'neu', zeit: 2 }]);
  assert.deepEqual(e.texte.map(x => x.text), ['neu', 'alt']);
  assert.deepEqual(ohneAusgeblendete(e, ['B']).texte.map(x => x.text), ['alt']);
  assert.equal(ohneAusgeblendete(e).texte.length, 2);
});

test('auswerten: Rangfolge nach durchschnittlichem Platz', () => {
  const f = folie('rangfolge', { elemente: ['Lohn', 'Team', 'Zeit'] });
  // Werte = Elemente in der gewählten Reihenfolge (Platz 1 zuerst).
  const e = auswerten(f, [{ wert: [1, 0, 2] }, { wert: [1, 2, 0] }, { wert: [0, 1, 2] }]);
  assert.deepEqual(e.rang.map(r => f.elemente[r.i]), ['Team', 'Lohn', 'Zeit']);
  assert.deepEqual(e.rang.map(r => r.schnitt), [1.3, 2, 2.7]);
});

test('auswerten: 100 Punkte mit Summe und Durchschnitt', () => {
  const f = folie('punkte', { elemente: ['a', 'b'] });
  const e = auswerten(f, [{ wert: [70, 30] }, { wert: [20, 80] }, { wert: [50, 40] }]);
  assert.deepEqual(e.reihe, [{ i: 1, summe: 150, schnitt: 50 }, { i: 0, summe: 140, schnitt: 46.7 }]);
});

test('Sitzung: Start, Folienwechsel, geschlossene Folien', () => {
  const p = { ...beispielPraesentation(), id: 'q1' };
  const { oeffentlich, privat } = neueSitzung(p, 'u1');
  assert.equal(oeffentlich.art, 'praesentation');
  assert.equal(oeffentlich.folieAnzahl, p.fragen.length);
  assert.equal(privat.quiz.titel, p.titel);
  p.fragen[0].text = 'geändert';
  assert.notEqual(privat.quiz.fragen[0].text, 'geändert');   // eingefroren
  const w = folieWechsel(p, 2, 4, 'JETZT');
  assert.equal(w.folieNr, 2);
  assert.equal(w.stand, 5);
  assert.equal(w.frageStart, 'JETZT');
  assert.equal(w.folie.typ, 'abstimmung');
  assert.equal(istGeschlossen({ geschlossen: { 2: true } }, 2), true);
  assert.equal(istGeschlossen({ geschlossen: {} }, 2), false);
});

test('istNeuerStand: vor und zurück zählt, ältere Stände nicht', () => {
  const a = { stand: 3, erstellt: 1000, status: 'folie' };
  assert.equal(istNeuerStand({ ...a, stand: 4 }, a), true);
  assert.equal(istNeuerStand({ ...a, stand: 2 }, a), false);
  assert.equal(istNeuerStand(a, a), false);
  assert.equal(istNeuerStand(a, undefined), true);
  assert.equal(istNeuerStand(undefined, a), false);
  assert.equal(istNeuerStand(null, a), true);
  assert.equal(istNeuerStand({ ...a, stand: 0, erstellt: 99999 }, a), true);   // anderes Spiel mit gleichem Code
  assert.equal(istNeuerStand({ ...a, status: 'ende' }, a), true);
});

test('Rückblick: nur Folien mit Antworten, ohne Kennungen, ohne Ausgeblendetes', () => {
  const p = { ...beispielPraesentation(), id: 'q1' };
  const nrOffen = p.fragen.findIndex(f => f.typ === 'offen');
  const nrWolke = p.fragen.findIndex(f => f.typ === 'wortwolke');
  const ergebnisse = {
    0: { anzahl: 0 },
    [nrWolke]: { anzahl: 1, woerter: [{ text: 'Lächeln', anzahl: 1 }] },
    [nrOffen]: { anzahl: 2, texte: [{ schluessel: 'A', text: 'gut', zeit: 2 }, { schluessel: 'B', text: 'böse', zeit: 1 }] },
  };
  const rb = praesentationsRueckblick(p, ergebnisse, 7, 123, { [nrOffen]: ['B'] });
  assert.equal(rb.art, 'praesentation');
  assert.equal(rb.spieler, 7);
  assert.deepEqual(rb.folien.map(f => f.nr), [nrWolke, nrOffen]);
  assert.deepEqual(rb.folien[1].ergebnis.texte, [{ text: 'gut', zeit: 2 }]);
  assert.ok(!JSON.stringify(rb).includes('"schluessel"'));
});

test('Ablage: Suche findet Präsentationen über Aussagen und Elemente', () => {
  const p = { ...beispielPraesentation(), id: 'q1' };
  assert.deepEqual(suche([p], 'Weiterbildung').map(q => q.id), ['q1']);
  assert.ok(istInteraktiv(p.fragen[1]) && !istInteraktiv(p.fragen[0]));
});

test('Datenbank-Regeln und Speicher lassen offene Antworten bis OFFEN_MAX zu', async () => {
  const { readFileSync } = await import('node:fs');
  const regeln = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const speicher = readFileSync(new URL('../js/store/firebase.js', import.meta.url), 'utf8');
  const grenze = Number(regeln.match(/d\.wert is string && d\.wert\.size\(\) <= (\d+)/)[1]);
  assert.ok(grenze >= OFFEN_MAX, 'Regeln: ' + grenze);
  assert.ok(speicher.includes(`wert.length <= ${grenze}`), 'firebase.js muss dieselbe Grenze prüfen');
});
