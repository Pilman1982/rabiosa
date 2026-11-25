import test from 'node:test';
import assert from 'node:assert/strict';
import { erstelleDemoStore } from '../js/store/demo.js';
import { SERVERZEIT } from '../js/store/gemeinsam.js';
import { eindeutigeNamen } from '../js/logik/spiel.js';

function nachbau() {
  const daten = new Map();
  const speicher = {
    getItem: k => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => { daten.set(k, String(v)); },
    removeItem: k => { daten.delete(k); },
    key: i => [...daten.keys()][i] ?? null,
    get length() { return daten.size; },
  };
  let uhr = 1_000_000;
  const store = erstelleDemoStore({ speicher, kanal: null, jetzt: () => uhr });
  return { store, daten, vor: ms => { uhr += ms; } };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const oeffentlich = { hostUid: 'x', quizTitel: 'T', sprache: 'de', status: 'warteraum', frageNr: -1, frageAnzahl: 1, frage: null, frageStart: null, aufloesung: null, rangliste: [] };

async function fehlerCode(versprechen) {
  try { await versprechen; } catch (e) { return e.code; }
  return null;
}

test('Konto: registrieren braucht den Einladungscode, danach ist man freigeschaltet', async () => {
  const { store } = nachbau();
  const gesehen = [];
  store.konto.beobachten(k => gesehen.push(k));
  await tick();
  assert.deepEqual(gesehen, [null]);
  assert.equal(await fehlerCode(store.konto.registrieren({ name: 'A', email: 'a@b.ch', passwort: '12345678', code: 'falsch' })), 'code');
  await store.konto.registrieren({ name: 'Anna Muster', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  await tick();
  const k = gesehen.at(-1);
  assert.equal(k.name, 'Anna Muster');
  assert.equal(k.freigeschaltet, true);
  await store.konto.abmelden();
  await tick();
  assert.equal(gesehen.at(-1), null);
  assert.equal(await fehlerCode(store.konto.anmelden('a@b.ch', 'falsches')), 'anmeldung');
  await store.konto.anmelden('a@b.ch', '12345678');
  await tick();
  assert.equal(gesehen.at(-1).uid, k.uid);
});

test('Quiz: speichern vergibt Kennung und Besitzer; meine und kollegium sind getrennt', async () => {
  const { store } = nachbau();
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  const id = await store.quiz.speichern({ id: null, titel: 'Eins', fach: 'Küche', sprache: 'de', freigegeben: true, fragen: [] });
  assert.equal((await store.quiz.laden(id)).autor, 'Anna');
  assert.deepEqual((await store.quiz.meine()).map(q => q.titel), ['Eins']);
  assert.deepEqual(await store.quiz.kollegium(), []);
  await store.konto.abmelden();
  await store.konto.registrieren({ name: 'Ben', email: 'b@b.ch', passwort: '12345678', code: 'demo' });
  assert.deepEqual(await store.quiz.meine(), []);
  assert.deepEqual((await store.quiz.kollegium()).map(q => q.titel), ['Eins']);
  assert.equal(await fehlerCode(store.quiz.speichern({ ...(await store.quiz.laden(id)), titel: 'Geklaut' })), 'verboten');
  assert.equal(await fehlerCode(store.quiz.loeschen(id)), 'verboten');
});

test('Quiz: Bilder speichern, laden, mit dem Quiz löschen', async () => {
  const { store, daten } = nachbau();
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  const id = await store.quiz.speichern({ id: null, titel: 'Eins', fach: '', sprache: 'de', freigegeben: false, fragen: [] });
  const bildId = await store.quiz.bildSpeichern(id, 'data:image/jpeg;base64,AAAA');
  assert.equal(await store.quiz.bildLaden(id, bildId), 'data:image/jpeg;base64,AAAA');
  await store.quiz.loeschen(id);
  assert.equal(await store.quiz.bildLaden(id, bildId), null);
  assert.ok(![...daten.values()].some(v => v.includes('AAAA')));
});

test('Spiel: erstellen vergibt einen sechsstelligen Code; aktualisieren setzt die Serverzeit', async () => {
  const { store, vor } = nachbau();
  const code = await store.spiel.erstellen(oeffentlich, { quizId: 'q' });
  assert.match(code, /^\d{6}$/);
  const gesehen = [];
  const stopp = store.spiel.beobachten(code, s => gesehen.push(s));
  await tick();
  assert.equal(gesehen.at(-1).status, 'warteraum');
  assert.equal(gesehen.at(-1).code, code);
  vor(5000);
  await store.spiel.aktualisieren(code, { status: 'frage', frageStart: SERVERZEIT }, { mischungen: { 0: [1, 0] } });
  await tick();
  assert.equal(gesehen.at(-1).frageStart, 1_005_000);
  assert.deepEqual((await store.spiel.privatLaden(code)).mischungen, { 0: [1, 0] });
  assert.equal((await store.spiel.privatLaden(code)).quizId, 'q');
  stopp();
  await store.spiel.aktualisieren(code, { status: 'aufloesung' });
  await tick();
  assert.equal(gesehen.at(-1).status, 'frage');
});

test('Spiel: beitreten, Spielerliste, entfernen meldet dem Handy null', async () => {
  const { store } = nachbau();
  const code = await store.spiel.erstellen(oeffentlich, {});
  const liste = [], eigener = [];
  store.spiel.spielerBeobachten(code, s => liste.push(s));
  await store.spiel.beitreten(code, { schluessel: 'geheim-anna', pid: 'p1', name: 'Anna', avatar: { beruf: 'kueche' } });
  store.spiel.eigenerSpieler(code, 'geheim-anna', s => eigener.push(s));
  await tick();
  assert.deepEqual(liste.at(-1).map(s => [s.schluessel, s.pid, s.name]), [['geheim-anna', 'p1', 'Anna']]);
  assert.equal(eigener.at(-1).name, 'Anna');
  await store.spiel.spielerEntfernen(code, 'geheim-anna');
  await tick();
  assert.deepEqual(liste.at(-1), []);
  assert.equal(eigener.at(-1), null);
  assert.equal(await fehlerCode(store.spiel.beitreten('000000', { schluessel: 'x', pid: 'p', name: 'X', avatar: {} })), 'nichtGefunden');
});

test('Spiel: die zweite Antwort desselben Schlüssels zur gleichen Frage wird abgelehnt', async () => {
  const { store, vor } = nachbau();
  const code = await store.spiel.erstellen(oeffentlich, {});
  const gesehen = [];
  store.spiel.antwortenBeobachten(code, 0, a => gesehen.push(a));
  vor(700);
  await store.spiel.antworten(code, 0, 'geheim-anna', 2);
  assert.equal(await fehlerCode(store.spiel.antworten(code, 0, 'geheim-anna', 1)), 'schonGeantwortet');
  await store.spiel.antworten(code, 1, 'geheim-anna', 3);
  await tick();
  assert.deepEqual(gesehen.at(-1), [{ schluessel: 'geheim-anna', frageNr: 0, wert: 2, zeit: 1_000_700 }]);
});

test('Spiel: beenden löscht Spiel, Spieler und Antworten und meldet null', async () => {
  const { store, daten } = nachbau();
  const code = await store.spiel.erstellen(oeffentlich, { quizId: 'q' });
  await store.spiel.beitreten(code, { schluessel: 'geheim-anna', pid: 'p1', name: 'Anna', avatar: {} });
  await store.spiel.antworten(code, 0, 'geheim-anna', 2);
  const gesehen = [];
  store.spiel.beobachten(code, s => gesehen.push(s));
  await store.spiel.beenden(code);
  await tick();
  assert.equal(gesehen.at(-1), null);
  assert.ok(![...daten.keys()].some(k => k.includes(code)));
});

test('Spiel: aufraeumen löscht nur Spiele, die älter als 24 Stunden sind', async () => {
  const { store, vor } = nachbau();
  const alt = await store.spiel.erstellen(oeffentlich, {});
  vor(25 * 3600 * 1000);
  const neu = await store.spiel.erstellen(oeffentlich, {});
  await store.spiel.aufraeumen();
  const zustand = {};
  store.spiel.beobachten(alt, s => { zustand.alt = s; });
  store.spiel.beobachten(neu, s => { zustand.neu = s; });
  await tick();
  assert.equal(zustand.alt, null);
  assert.equal(zustand.neu.code, neu);
});

test('Rückblick: speichern und nur die eigenen eines Quiz auflisten, neueste zuerst', async () => {
  const { store } = nachbau();
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  await store.rueckblick.speichern({ quizId: 'q1', quizTitel: 'T', datum: 10, spieler: 3, fragen: [] });
  await store.rueckblick.speichern({ quizId: 'q1', quizTitel: 'T', datum: 20, spieler: 5, fragen: [] });
  await store.rueckblick.speichern({ quizId: 'q2', quizTitel: 'U', datum: 30, spieler: 1, fragen: [] });
  assert.deepEqual((await store.rueckblick.liste('q1')).map(r => r.datum), [20, 10]);
});

test('eindeutigeNamen: doppelte Namen bekommen in der Reihenfolge des Beitritts eine Nummer', () => {
  const s = [
    { schluessel: 'c', pid: '3', name: 'anna', beigetreten: 30 },
    { schluessel: 'a', pid: '1', name: 'Anna', beigetreten: 10 },
    { schluessel: 'b', pid: '2', name: 'Ben', beigetreten: 20 },
    { schluessel: 'd', pid: '4', name: 'Anna ', beigetreten: 40 },
  ];
  assert.deepEqual(eindeutigeNamen(s).map(x => [x.pid, x.name]), [['1', 'Anna'], ['2', 'Ben'], ['3', 'anna 2'], ['4', 'Anna 3']]);
});
