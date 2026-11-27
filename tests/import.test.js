// Import: Eine KI schreibt ein Quiz als JSON, Rabiosa liest es ein.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importiereQuiz, MAX_FRAGEN } from '../js/logik/import.js';
import { importPrompt } from '../js/prompt.js';
import { quizFehler, TYPEN, ZEIT_MIN, ZEIT_MAX } from '../js/logik/quiz.js';

const alle = {
  titel: 'Repetition Milch', fach: 'Küchentheorie', sprache: 'de',
  fragen: [
    { typ: 'mc', text: 'Welche Milch ist am fettreichsten?', zeit: 20, erklaerung: 'Vollmilch hat rund 3,5 % Fett.',
      antworten: [{ text: 'Magermilch' }, { text: 'Vollmilch', richtig: true }, { text: 'Drinkmilch' }] },
    { typ: 'mehrfach', text: 'Was ist ein Sauermilchprodukt?', antworten: [{ text: 'Joghurt', richtig: true }, { text: 'Butter', richtig: false }, { text: 'Kefir', richtig: true }] },
    { typ: 'wf', text: 'UHT-Milch ist ungeöffnet ungekühlt haltbar.', richtig: true },
    { typ: 'schaetz', text: 'Wie viele Liter Milch braucht es für 1 kg Hartkäse?', wert: 12, toleranz: 2, einheit: 'l' },
    { typ: 'reihe', text: 'Ordne nach Fettgehalt, das Magerste zuerst.', elemente: ['Magermilch', 'Vollmilch', 'Halbrahm', 'Vollrahm'] },
    { typ: 'kurz', text: 'Wie heisst das Erhitzen auf 72 °C für 15 Sekunden?', loesungen: ['Pasteurisieren', 'Pasteurisation'] },
    { typ: 'umfrage', text: 'Wie sicher fühlen Sie sich?', antworten: [{ text: 'Sicher' }, { text: 'Unsicher' }] },
  ],
};

test('Musterformat mit allen sieben Typen ergibt ein spielbares Quiz', () => {
  const { quiz, uebersprungen } = importiereQuiz(JSON.stringify(alle));
  assert.equal(uebersprungen, 0);
  assert.deepEqual(quizFehler(quiz), []);
  assert.equal(quiz.titel, 'Repetition Milch');
  assert.equal(quiz.fach, 'Küchentheorie');
  assert.equal(quiz.sprache, 'de');
  assert.equal(quiz.id, null);
  assert.equal(quiz.freigegeben, false, 'nie von selbst fürs Kollegium freigegeben');
  assert.deepEqual(quiz.fragen.map(f => f.typ), TYPEN);
  assert.equal(new Set(quiz.fragen.map(f => f.id)).size, 7, 'jede Frage bekommt eine eigene Kennung');
  assert.ok(quiz.fragen.every(f => f.bildId === null));
  assert.deepEqual(quiz.fragen[0].antworten, [{ text: 'Magermilch', richtig: false }, { text: 'Vollmilch', richtig: true }, { text: 'Drinkmilch', richtig: false }]);
  assert.equal(quiz.fragen[0].erklaerung, 'Vollmilch hat rund 3,5 % Fett.');
  assert.deepEqual(quiz.fragen[6].antworten, [{ text: 'Sicher' }, { text: 'Unsicher' }], 'Umfrage hat keine richtige Antwort');
  assert.deepEqual(quiz.fragen[4].elemente, ['Magermilch', 'Vollmilch', 'Halbrahm', 'Vollrahm']);
});

test('Antwort einer KI mit Text drumherum, Code-Zaun und Komma am Schluss', () => {
  const text = 'Gerne, hier ist das Quiz:\n\n```json\n{ "titel": "Test", "fragen": [ { "typ": "wf", "text": "Stimmt das?", "richtig": false, }, ], }\n```\n\nViel Erfolg!';
  const { quiz } = importiereQuiz(text);
  assert.equal(quiz.titel, 'Test');
  assert.equal(quiz.fragen[0].richtig, false);
  assert.deepEqual(quizFehler(quiz), []);
});

test('Typografische Anführungszeichen statt gerader (aus Word kopiert)', () => {
  const text = '{ “titel”: “Test”, “fragen”: [ { “typ”: “kurz”, “text”: “Hauptstadt von Graubünden?”, “loesungen”: [“Chur”] } ] }';
  const { quiz } = importiereQuiz(text);
  assert.deepEqual(quiz.fragen[0].loesungen, ['Chur']);
});

test('Andere Schreibweisen: Antworten als Texte, richtige Antwort als Nummer oder Text', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ titel: 'T', fragen: [
    { typ: 'mc', text: 'A?', antworten: ['eins', 'zwei', 'drei'], richtig: 2 },
    { typ: 'mc', text: 'B?', antworten: ['eins', 'zwei', 'drei'], richtig: 'Drei' },
    { typ: 'mehrfach', text: 'C?', antworten: ['eins', 'zwei', 'drei'], richtig: [1, 'drei'] },
    { typ: 'wf', text: 'D?', richtig: 'falsch' },
    { typ: 'schaetz', text: 'E?', wert: '58,5', toleranz: '5' },
  ] }));
  assert.deepEqual(quiz.fragen[0].antworten.map(a => a.richtig), [false, true, false], 'Nummer zählt ab 1');
  assert.deepEqual(quiz.fragen[1].antworten.map(a => a.richtig), [false, false, true]);
  assert.deepEqual(quiz.fragen[2].antworten.map(a => a.richtig), [true, false, true]);
  assert.equal(quiz.fragen[3].richtig, false);
  assert.equal(quiz.fragen[4].wert, 58.5);
  assert.equal(quiz.fragen[4].toleranz, 5);
  assert.deepEqual(quizFehler(quiz), []);
});

test('Englische Feldnamen und Typnamen', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ title: 'Dairy', subject: 'Culinary Theory', language: 'en', questions: [
    { type: 'multiple choice', question: 'Which one?', time: 30, explanation: 'Because.', answers: [{ text: 'a', correct: true }, { text: 'b' }] },
    { type: 'true or false', text: 'Is it?', correct: true },
    { type: 'order', text: 'Sort.', items: ['a', 'b', 'c'] },
    { type: 'short answer', text: 'Name it.', solutions: ['x'] },
    { type: 'estimate', text: 'How many?', value: 3, tolerance: 1, unit: 'kg' },
    { type: 'poll', text: 'How was it?', answers: ['good', 'bad'] },
    { type: 'multiple answers', text: 'Which ones?', answers: [{ text: 'a', correct: true }, { text: 'b', correct: true }] },
  ] }));
  assert.equal(quiz.titel, 'Dairy');
  assert.equal(quiz.fach, 'Culinary Theory');
  assert.equal(quiz.sprache, 'en');
  assert.deepEqual(quiz.fragen.map(f => f.typ), ['mc', 'wf', 'reihe', 'kurz', 'schaetz', 'umfrage', 'mehrfach']);
  assert.equal(quiz.fragen[0].zeit, 30);
  assert.equal(quiz.fragen[0].erklaerung, 'Because.');
  assert.deepEqual(quizFehler(quiz), []);
});

test('Nur eine Liste von Fragen: Titel fehlt, Sprache kommt von der Oberfläche', () => {
  const { quiz } = importiereQuiz('[{"typ":"wf","text":"Ja?","richtig":true}]', { sprache: 'en' });
  assert.equal(quiz.fragen.length, 1);
  assert.equal(quiz.sprache, 'en');
  assert.deepEqual(quizFehler(quiz).map(f => f.code), ['titel'], 'der Editor zeigt, dass der Titel fehlt');
});

test('Zeit: fehlend = Vorgabe je Typ, sonst ganze Sekunden innerhalb der Grenzen', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ titel: 'T', fragen: [
    { typ: 'wf', text: 'a', richtig: true },
    { typ: 'wf', text: 'b', richtig: true, zeit: 2 },
    { typ: 'wf', text: 'c', richtig: true, zeit: 999 },
    { typ: 'wf', text: 'd', richtig: true, zeit: '45' },
    { typ: 'wf', text: 'e', richtig: true, zeit: 12.6 },
    { typ: 'reihe', text: 'f', elemente: ['a', 'b', 'c'] },
  ] }));
  assert.deepEqual(quiz.fragen.map(f => f.zeit), [15, ZEIT_MIN, ZEIT_MAX, 45, 13, 40]);
});

test('Unbekannter Fragetyp wird ausgelassen und gezählt, der Rest kommt an', () => {
  const { quiz, uebersprungen } = importiereQuiz(JSON.stringify({ titel: 'T', fragen: [
    { typ: 'lueckentext', text: 'Die ___ ist rund.' }, 'nur Text', null,
    { typ: 'wf', text: 'Ja?', richtig: true },
  ] }));
  assert.equal(uebersprungen, 3);
  assert.equal(quiz.fragen.length, 1);
});

test('Unvollständiges bleibt erhalten und wird als Mangel sichtbar, statt zu verschwinden', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ titel: 'T', fragen: [
    { typ: 'mc', text: 'Ohne richtige Antwort?', antworten: ['a', 'b'] },
    { typ: 'kurz', text: 'Ohne Lösung?' },
  ] }));
  assert.deepEqual(quizFehler(quiz).map(f => [f.frage, f.code]), [[0, 'richtig'], [1, 'loesungen']]);
});

test('Fremde Werte werden zu sauberem Text: nichts Verschachteltes, keine Überlängen', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ titel: { böse: 1 }, fach: 7, freigegeben: true, id: 'fremd', besitzer: 'jemand', fragen: [
    { typ: 'mc', id: 'x', bildId: 'fremdesBild', text: '  Frage?  ', antworten: [{ text: 12, richtig: 'ja' }, { text: 'b'.repeat(500), richtig: 0 }], erklaerung: ['a'] },
  ] }));
  assert.equal(quiz.titel, '');
  assert.equal(quiz.fach, '7');
  assert.equal(quiz.freigegeben, false);
  assert.equal(quiz.id, null);
  assert.equal('besitzer' in quiz, false);
  const f = quiz.fragen[0];
  assert.notEqual(f.id, 'x');
  assert.equal(f.bildId, null);
  assert.equal(f.text, 'Frage?');
  assert.equal(f.erklaerung, '');
  assert.deepEqual(f.antworten[0], { text: '12', richtig: true });
  assert.equal(f.antworten[1].text.length, 200);
  assert.equal(f.antworten[1].richtig, false);
});

test('Sehr viele Fragen: nur die ersten werden übernommen', () => {
  const fragen = Array.from({ length: MAX_FRAGEN + 5 }, (_, i) => ({ typ: 'wf', text: 'Frage ' + i, richtig: true }));
  const { quiz, uebersprungen } = importiereQuiz(JSON.stringify({ titel: 'T', fragen }));
  assert.equal(quiz.fragen.length, MAX_FRAGEN);
  assert.equal(uebersprungen, 5);
});

test('Fehler: leer, kein JSON, keine Fragen', () => {
  const code = text => { try { importiereQuiz(text); } catch (e) { return e.code; } return null; };
  assert.equal(code(''), 'importLeer');
  assert.equal(code('   \n '), 'importLeer');
  assert.equal(code('Hier ist leider kein Quiz.'), 'importKeinJson');
  assert.equal(code('{ "titel": "kaputt", "fragen": [ { "typ": '), 'importKeinJson');
  assert.equal(code('{ "titel": "ohne Fragen" }'), 'importKeineFragen');
  assert.equal(code('{ "titel": "T", "fragen": [ { "typ": "unbekannt" } ] }'), 'importKeineFragen');
});

test('Prompt: nennt alle Fragetypen, und sein Beispiel lässt sich ohne Mängel einlesen', () => {
  for (const sprache of ['de', 'en']) {
    const prompt = importPrompt(sprache);
    for (const typ of TYPEN) assert.ok(prompt.includes(`"${typ}"`), `${sprache}: Typ ${typ} fehlt im Prompt`);
    const { quiz, uebersprungen } = importiereQuiz(prompt);   // das Beispiel ist der einzige JSON-Block im Prompt
    assert.equal(uebersprungen, 0);
    assert.deepEqual(quizFehler(quiz), [], `${sprache}: Beispiel im Prompt ist nicht spielbar`);
    assert.deepEqual([...new Set(quiz.fragen.map(f => f.typ))].sort(), [...TYPEN].sort(), `${sprache}: Beispiel zeigt nicht jeden Typ`);
    assert.equal(quiz.sprache, sprache);
  }
});

test('Prompt: verbietet Prüfungsfragen und verlangt reines JSON', () => {
  assert.match(importPrompt('de'), /Prüfung/);
  assert.match(importPrompt('de'), /nie|NIE/);
  assert.match(importPrompt('de'), /JSON/);
  assert.match(importPrompt('en'), /exam/i);
  assert.match(importPrompt('en'), /never/i);
});

test('Cloche: Thema und Stufe werden gelesen, auch unter englischen Namen', () => {
  const { quiz } = importiereQuiz(JSON.stringify({ titel: 'T', fragen: [
    { typ: 'wf', text: 'A', richtig: true, thema: ' Lagerung ', stufe: 2 },
    { typ: 'wf', text: 'B', richtig: true, topic: 'HACCP', level: '3' },
    { typ: 'wf', text: 'C', richtig: true, kategorie: 'LMG', schwierigkeit: 1 },
    { typ: 'wf', text: 'D', richtig: true, category: 'Allergene', difficulty: 5 },
    { typ: 'wf', text: 'E', richtig: true },
  ] }));
  assert.deepEqual(quiz.fragen.map(f => [f.thema, f.stufe]), [['Lagerung', 2], ['HACCP', 3], ['LMG', 1], ['Allergene', undefined], [undefined, undefined]]);
  assert.ok(!('stufe' in quiz.fragen[3]), 'ungültige Stufe fehlt ganz');
  assert.deepEqual(quizFehler(quiz), []);
});

test('Prompt: das Beispiel zeigt Thema und Stufe für Cloche', () => {
  for (const sprache of ['de', 'en']) {
    const { quiz } = importiereQuiz(importPrompt(sprache));
    assert.ok(quiz.fragen.some(f => f.thema && f.stufe), `${sprache}: Beispiel ohne Thema und Stufe`);
    assert.match(importPrompt(sprache), /Cloche/);
  }
});
