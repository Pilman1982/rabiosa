import test from 'node:test';
import assert from 'node:assert/strict';
import { ordnerTeile, pfadVon, inhaltVon, suche, bekannteOrdner } from '../js/logik/ablage.js';

const q = (titel, fach, ordner, mehr = {}) => ({ id: titel, titel, fach, ordner, autor: 'Anna Muster', fragen: [], ...mehr });

test('ordnerTeile: trennt an /, räumt Leerzeichen und leere Stufen weg, höchstens vier Stufen', () => {
  assert.deepEqual(ordnerTeile('  HS26 //  Final  Teil 1 / '), ['HS26', 'Final Teil 1']);
  assert.deepEqual(ordnerTeile('a\\b > c'), ['a', 'b', 'c']);
  assert.deepEqual(ordnerTeile('1/2/3/4/5/6'), ['1', '2', '3', '4']);
  assert.deepEqual(ordnerTeile(undefined), []);
  assert.deepEqual(ordnerTeile(null), []);
});

test('pfadVon: das Fach ist die oberste Stufe; ohne Fach steht der Ersatztext', () => {
  assert.deepEqual(pfadVon(q('A', ' Küche ', 'HS26/Final'), 'Ohne Fach'), ['Küche', 'HS26', 'Final']);
  assert.deepEqual(pfadVon(q('A', '', ''), 'Ohne Fach'), ['Ohne Fach']);
  assert.deepEqual(pfadVon({ titel: 'alt' }, 'Ohne Fach'), ['Ohne Fach'], 'Quiz von früher haben kein Feld «ordner»');
});

test('inhaltVon: zuoberst stehen die Fächer mit der Zahl aller Quiz darunter', () => {
  const alle = [q('A', 'Küche', 'HS26'), q('B', 'Küche', ''), q('C', 'Hygiene', 'HS26/Final'), q('D', '', '')];
  assert.deepEqual(inhaltVon(alle, [], 'Ohne Fach'), {
    ordner: [{ name: 'Hygiene', anzahl: 1 }, { name: 'Küche', anzahl: 2 }, { name: 'Ohne Fach', anzahl: 1 }],
    quizze: [],
  });
});

test('inhaltVon: in einem Ordner liegen seine Unterordner und die Quiz genau dieser Stufe, nach Titel sortiert', () => {
  const alle = [q('Zwiebel', 'Küche', 'HS26'), q('Apfel', 'Küche', 'HS26'), q('Tief', 'Küche', 'HS26/Final'), q('Oben', 'Küche', ''), q('Fremd', 'Hygiene', 'HS26')];
  const hs26 = inhaltVon(alle, ['Küche', 'HS26'], 'Ohne Fach');
  assert.deepEqual(hs26.ordner, [{ name: 'Final', anzahl: 1 }]);
  assert.deepEqual(hs26.quizze.map(x => x.titel), ['Apfel', 'Zwiebel']);
  assert.deepEqual(inhaltVon(alle, ['Küche'], 'Ohne Fach').quizze.map(x => x.titel), ['Oben']);
  assert.deepEqual(inhaltVon(alle, ['Gibt es nicht'], 'Ohne Fach'), { ordner: [], quizze: [] });
});

test('inhaltVon: Schreibweisen desselben Ordners fallen zusammen (Gross/Klein, Akzente), der erste Name gilt', () => {
  const alle = [q('A', 'Küche', 'Käse'), q('B', 'küche', 'KASE'), q('C', 'KÜCHE ', 'käse/Buffet')];
  assert.deepEqual(inhaltVon(alle, [], 'Ohne Fach').ordner, [{ name: 'Küche', anzahl: 3 }]);
  const kueche = inhaltVon(alle, ['küche'], 'Ohne Fach');
  assert.deepEqual(kueche.ordner, [{ name: 'Käse', anzahl: 3 }]);
  assert.deepEqual(inhaltVon(alle, ['Küche', 'kase'], 'Ohne Fach').quizze.map(x => x.titel), ['A', 'B']);
});

test('inhaltVon: Ordner mit Zahlen stehen in Zahlenreihenfolge', () => {
  const alle = [q('A', 'K', 'SW10'), q('B', 'K', 'SW2'), q('C', 'K', 'SW1')];
  assert.deepEqual(inhaltVon(alle, ['K'], '-').ordner.map(o => o.name), ['SW1', 'SW2', 'SW10']);
});

test('suche: findet in Titel, Fach, Ordner und Namen der Person, ohne Rücksicht auf Gross/Klein und Akzente', () => {
  const alle = [q('Käse und Käsebuffet', 'Küche', 'HS26'), q('Lagerung', 'Hygiene', 'Final'), q('Fisch', 'Küche', '', { autor: 'Beat Beispiel' })];
  assert.deepEqual(suche(alle, 'kase').map(x => x.titel), ['Käse und Käsebuffet']);
  assert.deepEqual(suche(alle, 'HYGIENE').map(x => x.titel), ['Lagerung']);
  assert.deepEqual(suche(alle, 'final').map(x => x.titel), ['Lagerung']);
  assert.deepEqual(suche(alle, 'beispiel').map(x => x.titel), ['Fisch']);
  assert.deepEqual(suche(alle, 'gibtesnicht'), []);
  assert.deepEqual(suche(alle, '   '), [], 'leere Suche findet nichts');
});

test('suche: mehrere Wörter müssen alle vorkommen', () => {
  const alle = [q('Fisch', 'Küche', 'HS26'), q('Fisch', 'Küche', 'FS27'), q('Fleisch', 'Küche', 'HS26')];
  assert.deepEqual(suche(alle, 'fisch hs26').map(x => x.ordner), ['HS26']);
});

test('suche: findet auch Stichworte in Fragen und Antworten; Treffer im Kopf stehen vor Treffern im Inhalt', () => {
  const mitFrage = q('Repetition', 'Küche', '', { fragen: [
    { typ: 'mc', text: 'Welcher Käse ist ein Extrahartkäse?', antworten: [{ text: 'Sbrinz', richtig: true }, { text: 'Brie', richtig: false }] },
    { typ: 'reihe', text: 'Ordnen', elemente: ['Blanchieren', 'Abschrecken'] },
    { typ: 'kurz', text: 'Fluss?', loesungen: ['Rhein'] },
  ] });
  const alle = [mitFrage, q('Sbrinz und Co.', 'Küche', '')];
  assert.deepEqual(suche(alle, 'sbrinz').map(x => x.titel), ['Sbrinz und Co.', 'Repetition']);
  assert.deepEqual(suche(alle, 'extrahartkäse').map(x => x.titel), ['Repetition']);
  assert.deepEqual(suche(alle, 'abschrecken').map(x => x.titel), ['Repetition']);
  assert.deepEqual(suche(alle, 'rhein').map(x => x.titel), ['Repetition']);
});

test('suche: kaputte Einträge (ohne Fragenliste, ohne Titel) werfen nicht', () => {
  assert.deepEqual(suche([{ id: 'x' }, { id: 'y', titel: null, fragen: [null, {}] }], 'a'), []);
});

test('bekannteOrdner: jede Ablage einmal, in sauberer Schreibweise, sortiert', () => {
  const alle = [q('A', 'K', ' HS26 / Final'), q('B', 'K', 'hs26/final'), q('C', 'K', 'FS27'), q('D', 'K', '')];
  assert.deepEqual(bekannteOrdner(alle), ['FS27', 'HS26/Final']);
});
