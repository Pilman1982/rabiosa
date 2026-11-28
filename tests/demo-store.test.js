import test from 'node:test';
import assert from 'node:assert/strict';
import { erstelleDemoStore } from '../js/store/demo.js';
import { SERVERZEIT } from '../js/store/gemeinsam.js';
import { eindeutigeNamen } from '../js/logik/spiel.js';
import { sitzungAusVorlage, beispielTafel } from '../js/logik/tafel.js';

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

test('Ordner: leere Liste pro Konto, verschieben behält geaendert', async () => {
  const { store, vor } = nachbau();
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  assert.deepEqual(await store.ordner.laden(), []);
  await store.ordner.speichern([{ fach: 'KUT', ordner: 'HS26', fremd: 1 }]);
  assert.deepEqual(await store.ordner.laden(), [{ fach: 'KUT', ordner: 'HS26' }]);
  const id = await store.quiz.speichern({ titel: 'T', fragen: [], fach: '', ordner: '' });
  const vorher = (await store.quiz.laden(id)).geaendert;
  vor(5000);
  await store.quiz.verschieben(id, { fach: 'KUT', ordner: 'HS26/Final' });
  const nachher = await store.quiz.laden(id);
  assert.equal(nachher.fach, 'KUT'); assert.equal(nachher.ordner, 'HS26/Final'); assert.equal(nachher.geaendert, vorher);
  assert.equal(await fehlerCode(store.quiz.verschieben('gibtsnicht', { fach: '', ordner: '' })), 'nichtGefunden');
  await store.konto.abmelden();
  await store.konto.registrieren({ name: 'Ben', email: 'b@b.ch', passwort: '12345678', code: 'demo' });
  assert.deepEqual(await store.ordner.laden(), [], 'Jede Person hat ihre eigene Liste');
  assert.equal(await fehlerCode(store.quiz.verschieben(id, { fach: 'X', ordner: '' })), 'verboten');
});

// Lehrperson und Gast sind zwei Stores auf denselben Daten: der Gast-Store sieht das Konto und die
// Gast-Kennung («rabiosa-gast») nicht, sondern hat seine eigenen; so ist er ein anderes Gerät.
function gastNachbau(daten, kennung, name = 'rabiosa-demo') {
  const eigen = new Map();
  const privat = k => k === 'rabiosa-gast' || k === name + ':konto';
  const speicher = {
    getItem: k => { const m = privat(k) ? eigen : daten; return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { (privat(k) ? eigen : daten).set(k, String(v)); },
    removeItem: k => { (privat(k) ? eigen : daten).delete(k); },
    key: i => [...daten.keys()][i] ?? null,
    get length() { return daten.size; },
  };
  eigen.set('rabiosa-gast', kennung);
  return erstelleDemoStore({ speicher, kanal: null, jetzt: () => 1_000_000, name });
}
async function tafelMitLeitung(gruppen = ['A', 'B']) {
  const n = nachbau();
  await n.store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  const code = await n.store.tafel.erstellen(sitzungAusVorlage({ ...beispielTafel('de'), id: 'q1' }, gruppen, 'IGNORIERT'));
  return { ...n, code, gast: kennung => gastNachbau(n.daten, kennung) };
}
const klein = () => new Blob(['x'], { type: 'image/png' });

test('Tafel: erstellen, beitreten, Element live, gleiche Kennung = ein Element (Review Focus 1, 2)', async () => {
  const { store } = nachbau();
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  const code = await store.tafel.erstellen(sitzungAusVorlage({ ...beispielTafel('de'), id: 'q1' }, ['A', 'B'], 'IGNORIERT'));
  assert.match(code, /^\d{6}$/);
  assert.equal((await store.tafel.nachsehen(code)).gruppen.length, 2);
  await store.tafel.beitreten(code, { gruppe: 1, name: 'Lena' });
  await store.tafel.beitreten(code, { gruppe: 1, name: 'Lena' });
  const mitglieder = []; store.tafel.mitgliederBeobachten(code, null, l => mitglieder.push(l)); await tick();
  assert.equal(mitglieder.at(-1).length, 1, 'wieder beitreten legt keinen zweiten Eintrag an');
  await store.tafel.elementSpeichern(code, { id: 'e1', gruppe: 1, art: 'zettel', x: 0, y: 0, b: 200, h: 120, text: 'a' }, { neu: true });
  await store.tafel.elementSpeichern(code, { id: 'e1', gruppe: 1, art: 'zettel', x: 50, y: 0, b: 200, h: 120, text: 'b' });
  const el = []; store.tafel.elementeBeobachten(code, 1, l => el.push(l)); await tick();
  assert.equal(el.at(-1).length, 1); assert.equal(el.at(-1)[0].text, 'b');
});

test('Tafel: gesperrte Gruppe und beendete Sitzung verweigern mit «abgegeben» (Review Focus 4)', async () => {
  const { store, code, gast } = await tafelMitLeitung();
  const g0 = gast('g-null'), g1 = gast('g-eins');
  await g0.tafel.beitreten(code, { gruppe: 0, name: 'Lena' });
  await g1.tafel.beitreten(code, { gruppe: 1, name: 'Ben' });
  const el = { id: 'e1', gruppe: 0, art: 'zettel', x: 0, y: 0, b: 200, h: 120, text: 'a' };
  await g0.tafel.elementSpeichern(code, el, { neu: true });
  await g0.tafel.abgeben(code);
  assert.deepEqual((await store.tafel.nachsehen(code)).gesperrt, [0]);
  await g1.tafel.abgeben(code);
  assert.deepEqual((await store.tafel.nachsehen(code)).gesperrt, [0, 1], 'jede Gruppe gibt nur sich selbst ab');
  await store.tafel.aktualisieren(code, { gesperrt: [0] });
  assert.equal(await fehlerCode(g0.tafel.elementSpeichern(code, { ...el, text: 'b' })), 'abgegeben');
  await store.tafel.elementSpeichern(code, { ...el, text: 'von der Leitung' });
  assert.equal((await store.tafel.nachsehen(code)).gesperrt.length, 1);
  await store.tafel.aktualisieren(code, { status: 'beendet' });
  const gesehen = []; g1.tafel.elementeBeobachten(code, 1, l => gesehen.push(l)); await tick();
  assert.deepEqual(gesehen.at(-1), []);
  assert.equal(await fehlerCode(g1.tafel.elementSpeichern(code, { ...el, id: 'e2', gruppe: 1 }, { neu: true })), 'abgegeben');
  assert.equal(await fehlerCode(g1.tafel.abgeben(code)), 'abgegeben');
});

test('Tafel: Bilder zählen, Grenze 40, Löschen gibt Platz frei, Datei weg', async () => {
  const { store, code } = await tafelMitLeitung();
  const zaehler = []; store.tafel.zaehlerBeobachten(code, 0, z => zaehler.push(z)); await tick();
  assert.deepEqual(zaehler.at(-1), { bilder: 0, bytes: 0, letztes: '' });
  let letztes;
  for (let i = 0; i < 40; i++) {
    letztes = await store.tafel.bildHochladen(code, { id: 'b' + i, gruppe: 0, art: 'bild', x: 0, y: 0, b: 100, h: 100 }, klein());
  }
  await tick();
  assert.equal(zaehler.at(-1).bilder, 40);
  assert.equal(zaehler.at(-1).bytes, 40);
  assert.equal(zaehler.at(-1).letztes, 'b39');
  assert.equal(letztes.bildBytes, 1);
  assert.equal(await fehlerCode(store.tafel.bildHochladen(code, { id: 'b40', gruppe: 0, art: 'bild' }, klein())), 'grenze');
  assert.equal((await store.tafel.bildLaden(letztes.bildPfad)).size, 1);
  await store.tafel.elementLoeschen(code, letztes);
  await tick();
  assert.equal(zaehler.at(-1).bilder, 39);
  assert.equal(await store.tafel.bildLaden(letztes.bildPfad), null);
  assert.equal(await fehlerCode(store.tafel.elementSpeichern(code, { id: 'neu', gruppe: 0, art: 'bild' }, { neu: true })), 'verboten', 'Bilder nur über bildHochladen');
  await store.tafel.bildHochladen(code, { id: 'b40', gruppe: 0, art: 'bild' }, klein());
});

test('Tafel: fremde Gruppe sieht und ändert nichts, Leitung sieht alles', async () => {
  const { store, code, gast } = await tafelMitLeitung();
  const g0 = gast('g-null');
  await g0.tafel.beitreten(code, { gruppe: 0, name: 'Lena' });
  await store.tafel.elementSpeichern(code, { id: 'e1', gruppe: 0, art: 'zettel', x: 0, y: 0, text: 'a' }, { neu: true });
  await store.tafel.elementSpeichern(code, { id: 'e2', gruppe: 1, art: 'zettel', x: 0, y: 0, text: 'b' }, { neu: true });
  const fremd = []; g0.tafel.elementeBeobachten(code, 1, l => fremd.push(l));
  const eigen = []; g0.tafel.elementeBeobachten(code, 0, l => eigen.push(l));
  const alle = []; store.tafel.elementeBeobachten(code, null, l => alle.push(l));
  await tick();
  assert.deepEqual(fremd.at(-1), []);
  assert.equal(eigen.at(-1).length, 1);
  assert.equal(alle.at(-1).length, 2);
  assert.equal(await fehlerCode(g0.tafel.elementSpeichern(code, { id: 'e3', gruppe: 1, art: 'zettel', x: 0, y: 0 }, { neu: true })), 'verboten');
  assert.equal(await fehlerCode(g0.tafel.elementSpeichern(code, { id: 'e2', gruppe: 0, art: 'zettel', x: 0, y: 0 })), 'verboten', 'fremdes Element nicht übernehmen');
  assert.throws(() => g0.tafel.mitgliederBeobachten(code, null, () => {}), { code: 'verboten' });
});

test('Tafel: zaehlerLesen liefert alle Gruppen einmalig, nur der Leitung; Löschen räumt Bilder und Zähler weg, andere Sitzung bleibt', async () => {
  const { store, daten, code, gast } = await tafelMitLeitung();
  const zweite = await store.tafel.erstellen(sitzungAusVorlage({ ...beispielTafel('de'), id: 'q1' }, ['A', 'B'], 'IGNORIERT'));
  const a = await store.tafel.bildHochladen(code, { id: 'a1', gruppe: 0, art: 'bild', x: 0, y: 0, b: 10, h: 10 }, klein());
  const b = await store.tafel.bildHochladen(zweite, { id: 'b1', gruppe: 1, art: 'bild', x: 0, y: 0, b: 10, h: 10 }, klein());
  assert.deepEqual(await store.tafel.zaehlerLesen(code), [{ bilder: 1, bytes: 1, letztes: 'a1' }, { bilder: 0, bytes: 0, letztes: '' }]);
  assert.equal(await fehlerCode(gast('fremd').tafel.zaehlerLesen(code)), 'verboten');
  assert.equal((await store.tafel.meine('q1')).length, 2);
  await store.tafel.loeschen(code);
  const da = pfad => [...daten.keys()].some(k => k.endsWith('tafelbild:' + pfad));
  assert.equal(da(a.bildPfad), false, 'Bild der gelöschten Sitzung weg');
  assert.equal(da(b.bildPfad), true, 'Bild der anderen bleibt');
  assert.deepEqual((await store.tafel.meine('q1')).map(s => s.code), [zweite]);
  assert.equal(await store.tafel.nachsehen(code), null);
});

test('Tafel: Ändern eines fehlenden Elements tut still nichts, Anlegen nur mit neu (Schlussprüfung 1)', async () => {
  const { store, code, gast } = await tafelMitLeitung();
  const g0 = gast('g-null');
  await g0.tafel.beitreten(code, { gruppe: 0, name: 'Lena' });
  const el = { id: 'e1', gruppe: 0, art: 'zettel', x: 0, y: 0, b: 200, h: 120, text: 'a' };
  assert.equal(await g0.tafel.elementSpeichern(code, { ...el, x: 5 }), false, 'ohne neu entsteht nichts');
  assert.equal(await g0.tafel.elementSpeichern(code, el, { neu: true }), true);
  assert.equal(await g0.tafel.elementSpeichern(code, { ...el, text: 'b' }), true, 'Ändern eines vorhandenen Elements');
  await store.tafel.elementLoeschen(code, el);   // die Lehrperson löscht, während der Gast noch zieht
  assert.equal(await g0.tafel.elementSpeichern(code, { ...el, x: 40 }), false, 'Autosave und Loslassen legen es nicht wieder an');
  const bild = await g0.tafel.bildHochladen(code, { id: 'b1', gruppe: 0, art: 'bild', x: 0, y: 0, b: 10, h: 10 }, klein());
  await store.tafel.elementLoeschen(code, bild);
  assert.equal(await g0.tafel.elementSpeichern(code, { ...bild, x: 9 }), false, 'gelöschtes Bild verschieben: kein Fehler');
  const gesehen = []; store.tafel.elementeBeobachten(code, null, l => gesehen.push(l)); await tick();
  assert.deepEqual(gesehen.at(-1), []);
  assert.equal(await g0.tafel.elementSpeichern(code, el, { neu: true }), true, 'bewusst wieder anlegen (Rückgängig)');
  assert.equal(await fehlerCode(g0.tafel.elementSpeichern(code, { id: 'b2', gruppe: 0, art: 'bild' }, { neu: true })), 'verboten', 'Bilder nur über bildHochladen');
});
