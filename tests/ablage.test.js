import test from 'node:test';
import assert from 'node:assert/strict';
import { ordnerTeile, pfadVon, inhaltVon, suche, bekannteOrdner, artVon, nachArt, artZahlen, zuletzt, zielVon, istUnter, ordnerNameFehler, umbenennen, ordnerEntfernen, leereAufraeumen, alleOrdner, LEERE_MAX, quelleMerken, alleVerschieben, editorAdresse } from '../js/logik/ablage.js';

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

// ---------- Studio-Ordnung: Arten, leere Ordner, Umbenennen ----------

test('artVon / nachArt / artZahlen: ohne gültige Art ist es ein Quiz', () => {
  const alle = [q('A', 'K', ''), q('B', 'K', '', { art: 'praesentation' }), q('C', 'K', '', { art: 'whiteboard' }), q('D', 'K', '', { art: 'unsinn' })];
  assert.deepEqual(alle.map(artVon), ['quiz', 'praesentation', 'whiteboard', 'quiz']);
  assert.deepEqual(nachArt(alle, 'quiz').map(x => x.id), ['A', 'D']);
  assert.equal(nachArt(alle, 'alle').length, 4);
  assert.deepEqual(artZahlen(alle), { alle: 4, quiz: 2, praesentation: 1, whiteboard: 1 });
});

test('nachArt nach suche: nur Treffer der gewählten Art', () => {
  const alle = [q('Saison Quiz', 'K', ''), q('Saison Folien', 'K', '', { art: 'praesentation' })];
  assert.deepEqual(nachArt(suche(alle, 'saison'), 'praesentation').map(x => x.id), ['Saison Folien']);
});

test('zuletzt: neuste zuerst, ohne geaendert hinten, höchstens n', () => {
  const alle = [q('A', 'K', '', { geaendert: 5 }), q('B', 'K', ''), q('C', 'K', '', { geaendert: 9 }), q('D', 'K', '', { geaendert: 7 })];
  assert.deepEqual(zuletzt(alle, 3).map(x => x.id), ['C', 'D', 'A']);
  assert.deepEqual(zuletzt(alle).map(x => x.id), ['C', 'D', 'A', 'B']);
});

test('inhaltVon mit leeren Ordnern: erscheinen mit 0, Zwischenstufen inbegriffen', () => {
  const alle = [q('A', 'KUT', 'HS26')];
  const leere = [{ fach: 'KUT', ordner: 'HS26/Final' }, { fach: 'KUT', ordner: 'FS27/Midterm' }, { fach: 'HYLM', ordner: '' }];
  assert.deepEqual(inhaltVon(alle, [], 'Ohne Fach', leere).ordner, [{ name: 'HYLM', anzahl: 0 }, { name: 'KUT', anzahl: 1 }]);
  assert.deepEqual(inhaltVon(alle, ['KUT'], 'Ohne Fach', leere).ordner, [{ name: 'FS27', anzahl: 0 }, { name: 'HS26', anzahl: 1 }]);
  assert.deepEqual(inhaltVon(alle, ['KUT', 'HS26'], 'Ohne Fach', leere).ordner, [{ name: 'Final', anzahl: 0 }]);
  assert.deepEqual(inhaltVon(alle, ['KUT', 'HS26'], 'Ohne Fach', leere).quizze.map(x => x.id), ['A']);
});

test('zielVon / istUnter: Ohne Fach wird zu leerem Fach', () => {
  assert.deepEqual(zielVon(['KUT', 'HS26', 'Final'], 'Ohne Fach'), { fach: 'KUT', ordner: 'HS26/Final' });
  assert.deepEqual(zielVon(['Ohne Fach', 'X'], 'Ohne Fach'), { fach: '', ordner: 'X' });
  assert.deepEqual(zielVon([], 'Ohne Fach'), { fach: '', ordner: '' });
  assert.ok(istUnter(q('A', 'kut', 'hs26/final'), ['KUT', 'HS26'], 'Ohne Fach'));
  assert.ok(!istUnter(q('A', 'KUT', 'HS26x'), ['KUT', 'HS26'], 'Ohne Fach'));
});

test('ordnerNameFehler: leer, Trennzeichen, Doppel nach Schreibweise, Tiefe, Länge', () => {
  assert.equal(ordnerNameFehler('  ', ['KUT'], []), 'leer');
  assert.equal(ordnerNameFehler('a/b', ['KUT'], []), 'zeichen');
  assert.equal(ordnerNameFehler('a\\b', ['KUT'], []), 'zeichen');
  assert.equal(ordnerNameFehler('a > b', ['KUT'], []), 'zeichen');
  assert.equal(ordnerNameFehler('hs26', ['KUT'], ['HS26']), 'doppelt');
  assert.equal(ordnerNameFehler('X', ['KUT', '1', '2', '3', '4'], []), 'tief');
  assert.equal(ordnerNameFehler('x'.repeat(81), ['KUT'], []), 'lang');
  assert.equal(ordnerNameFehler('x'.repeat(41), [], []), 'lang', 'Auf oberster Stufe ist der Name ein Fach');
  assert.equal(ordnerNameFehler('Final', ['KUT', 'HS26'], ['Midterm']), null);
});

test('umbenennen: ändert alle Inhalte und leeren Ordner darunter, sonst nichts', () => {
  const alle = [q('A', 'KUT', 'HS26'), q('B', 'KUT', 'HS26/Final'), q('C', 'KUT', 'HS260'), q('D', 'HYLM', 'HS26')];
  const leere = [{ fach: 'KUT', ordner: 'HS26/Leer' }, { fach: 'HYLM', ordner: 'HS26/Leer' }];
  const r = umbenennen(alle, leere, ['KUT', 'HS26'], 'HS 2026', 'Ohne Fach');
  assert.deepEqual(r.aenderungen, [{ id: 'A', fach: 'KUT', ordner: 'HS 2026' }, { id: 'B', fach: 'KUT', ordner: 'HS 2026/Final' }]);
  assert.deepEqual(r.leere, [{ fach: 'KUT', ordner: 'HS 2026/Leer' }, { fach: 'HYLM', ordner: 'HS26/Leer' }]);
  assert.throws(() => umbenennen(alle, leere, ['KUT'], 'X', 'Ohne Fach'));
});

test('ordnerEntfernen / leereAufraeumen / alleOrdner', () => {
  const leere = [{ fach: 'KUT', ordner: 'A' }, { fach: 'KUT', ordner: 'A/B' }, { fach: 'kut', ordner: 'a' }, { fach: 'KUT', ordner: 'Voll' }];
  assert.deepEqual(ordnerEntfernen(leere, ['KUT', 'A'], 'Ohne Fach'), [{ fach: 'KUT', ordner: 'Voll' }]);
  assert.deepEqual(leereAufraeumen(leere, [q('X', 'KUT', 'Voll')], 'Ohne Fach'), [{ fach: 'KUT', ordner: 'A' }, { fach: 'KUT', ordner: 'A/B' }]);
  const viele = Array.from({ length: LEERE_MAX + 5 }, (_, i) => ({ fach: 'K', ordner: 'O' + i }));
  const rest = leereAufraeumen(viele, [], 'Ohne Fach');
  assert.equal(rest.length, LEERE_MAX);
  assert.equal(rest.at(-1).ordner, 'O' + (LEERE_MAX + 4));
  assert.deepEqual(alleOrdner([q('Z', '', 'X')], [{ fach: 'KUT', ordner: 'HS26/Final' }], 'Ohne Fach'),
    [['KUT'], ['KUT', 'HS26'], ['KUT', 'HS26', 'Final'], ['Ohne Fach'], ['Ohne Fach', 'X']]);
});

test('Regeln: ordnerlisten nur für die eigene Person, Grenze wie LEERE_MAX', async () => {
  const { readFileSync } = await import('node:fs');
  const regeln = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const start = regeln.indexOf('match /ordnerlisten/{uid}');
  assert.ok(start > 0, 'Block ordnerlisten fehlt');
  const block = regeln.slice(start, regeln.indexOf('}', regeln.indexOf('allow create, update', start)) + 1);
  assert.ok(block.includes('request.auth.uid == uid'));
  assert.equal(Number(block.match(/liste\.size\(\) <= (\d+)/)[1]), LEERE_MAX);
  const speicher = readFileSync(new URL('../js/store/firebase.js', import.meta.url), 'utf8');
  assert.ok(speicher.includes("doc(db, 'ordnerlisten', "), 'firebase.js muss dieselbe Sammlung benutzen');
});

test('quelleMerken: wird ein Ordner durch Verschieben leer, bleibt er als leerer Ordner stehen', () => {
  const a = q('A', 'KUT', 'HS26/Final'), b = q('B', 'KUT', 'HS26/Final'), c = q('C', 'KUT', 'HS26');
  assert.deepEqual(quelleMerken([a, b, c], [], a, 'Ohne Fach'), [], 'B liegt noch im Ordner');
  assert.deepEqual(quelleMerken([a, c], [], a, 'Ohne Fach'), [{ fach: 'KUT', ordner: 'HS26/Final' }]);
  assert.deepEqual(quelleMerken([c], [{ fach: 'X', ordner: '' }], c, 'Ohne Fach'), [{ fach: 'X', ordner: '' }, { fach: 'KUT', ordner: 'HS26' }]);
  assert.deepEqual(quelleMerken([q('D', '', '')], [], q('D', '', ''), 'Ohne Fach'), [], '«Ohne Fach» selbst wird nicht gemerkt');
});

test('umbenennen: meldet zuLang, wenn ein Inhalt oder leerer Ordner darunter über ORDNER_LAENGE käme', () => {
  const lang = 'B'.repeat(60);
  const alle = [q('A', 'KUT', 'A/' + lang)];
  assert.equal(umbenennen(alle, [], ['KUT', 'A'], 'C'.repeat(30), 'Ohne Fach').zuLang, true);
  assert.equal(umbenennen([], [{ fach: 'KUT', ordner: 'A/' + lang }], ['KUT', 'A'], 'C'.repeat(30), 'Ohne Fach').zuLang, true);
  assert.equal(umbenennen(alle, [], ['KUT', 'A'], 'C', 'Ohne Fach').zuLang, false);
});

test('alleVerschieben: macht nach einem Fehler weiter und zählt die Fehler', async () => {
  const gemacht = [];
  const schritt = async a => { if (a.id === 'X') throw new Error('nichtGefunden'); gemacht.push(a.id); };
  const fehler = await alleVerschieben([{ id: 'A' }, { id: 'X' }, { id: 'B' }], schritt);
  assert.equal(fehler, 1);
  assert.deepEqual(gemacht, ['A', 'B']);
});

test('alleOrdner: «Ohne Fach» ist immer als Ziel dabei', () => {
  assert.deepEqual(alleOrdner([q('A', 'KUT', '')], [], 'Ohne Fach'), [['KUT'], ['Ohne Fach']]);
});

test('editorAdresse: jede Art in ihrem Editor; ein Whiteboard nie im Quiz- oder Folieneditor (Schlussprüfung 4)', () => {
  assert.equal(editorAdresse({ id: 'a1', art: 'whiteboard' }), '#/studio/whiteboard/a1');
  assert.equal(editorAdresse({ id: 'a2', art: 'praesentation' }), '#/studio/folien/a2');
  assert.equal(editorAdresse({ id: 'a3', art: 'quiz' }), '#/studio/quiz/a3');
  assert.equal(editorAdresse({ id: 'a4' }), '#/studio/quiz/a4', 'ohne Art: Quiz');
  assert.equal(editorAdresse({ art: 'whiteboard' }, 'x9'), '#/studio/whiteboard/x9', 'Kennung aus der Adresse');
});
