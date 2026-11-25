// Wächter: Das Handy holt den Stand selbst nach, wenn die Live-Verbindung still steht.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fortschritt, istNeuer, istAelter, anderesSpiel, sollNachsehen, NACHSEHEN_MS } from '../js/logik/waechter.js';
import { ausRest, restAdresse } from '../js/store/rest.js';
import { erstelleDemoStore } from '../js/store/demo.js';

const spiel = (status, frageNr = -1, mehr = {}) => ({ status, frageNr, erstellt: 1000, ...mehr });

test('fortschritt: ein Spiel läuft nur vorwärts', () => {
  const folge = [spiel('warteraum'), spiel('frage', 0), spiel('aufloesung', 0), spiel('frage', 1), spiel('aufloesung', 1), spiel('podest', 1), spiel('ende', 1)];
  const werte = folge.map(fortschritt);
  for (let i = 1; i < werte.length; i++) assert.ok(werte[i] > werte[i - 1], `${folge[i].status} ${folge[i].frageNr} kommt nach ${folge[i - 1].status}`);
});

test('istNeuer: nachgesehener Stand ersetzt nur einen älteren', () => {
  assert.equal(istNeuer(spiel('frage', 1), spiel('aufloesung', 0)), true, 'nächste Frage verpasst');
  assert.equal(istNeuer(spiel('aufloesung', 0), spiel('frage', 0)), true, 'Auflösung verpasst');
  assert.equal(istNeuer(spiel('aufloesung', 0), spiel('aufloesung', 0)), false, 'gleicher Stand');
  assert.equal(istNeuer(spiel('aufloesung', 0), spiel('frage', 1)), false, 'älterer Stand darf nie zurückstellen');
});

test('istNeuer: erster Stand, gelöschtes Spiel, neues Spiel mit gleichem Code', () => {
  assert.equal(istNeuer(spiel('warteraum'), undefined), true, 'noch gar kein Stand da');
  assert.equal(istNeuer(null, undefined), true, 'Spiel gibt es nicht');
  assert.equal(istNeuer(null, spiel('podest', 3)), true, 'Spiel wurde beendet und gelöscht');
  assert.equal(istNeuer(null, null), false);
  assert.equal(istNeuer(spiel('warteraum'), null), true, 'unter dem Code läuft wieder ein Spiel');
  assert.equal(istNeuer(spiel('warteraum', -1, { erstellt: 9000 }), spiel('aufloesung', 4)), true, 'anderes Spiel, gleicher Code');
});

test('anderesSpiel: nur bei deutlich anderem Startzeitpunkt', () => {
  assert.equal(anderesSpiel(spiel('frage', 0), spiel('frage', 0, { erstellt: 1001 })), false, 'eine Millisekunde ist Rundung');
  assert.equal(anderesSpiel(spiel('frage', 0), spiel('frage', 0, { erstellt: 5000 })), true);
  assert.equal(anderesSpiel(spiel('frage', 0), { status: 'frage', frageNr: 0 }), false, 'ohne Angabe: gleiches Spiel');
  assert.equal(anderesSpiel(null, spiel('frage', 0)), false);
});

test('istAelter: die Live-Verbindung darf einen nachgesehenen Stand nicht zurückstellen', () => {
  assert.equal(istAelter(spiel('aufloesung', 0), spiel('frage', 1)), true);
  assert.equal(istAelter(spiel('frage', 1), spiel('frage', 1)), false, 'gleicher Stand wird übernommen');
  assert.equal(istAelter(spiel('frage', 2), spiel('frage', 1)), false);
  assert.equal(istAelter(null, spiel('frage', 1)), false, 'gelöscht ist nie älter');
  assert.equal(istAelter(spiel('warteraum'), undefined), false);
  assert.equal(istAelter(spiel('warteraum', -1, { erstellt: 9000 }), spiel('frage', 3)), false, 'anderes Spiel');
});

test('ausRest: Zeitstempel werden gerundet wie beim Live-Stand', () => {
  const dok = { name: 'x/spiele/1', fields: { a: { timestampValue: '2026-11-25T15:38:00.123678Z' }, b: { timestampValue: '2026-11-25T15:38:00.1234Z' }, c: { timestampValue: '2026-11-25T15:38:00Z' } } };
  const basis = Date.parse('2026-11-25T15:38:00Z');
  assert.deepEqual(ausRest(dok), { a: basis + 124, b: basis + 123, c: basis, code: '1' });
});

test('sollNachsehen: nur sichtbar, nur beim Warten, nur nach einer Pause', () => {
  const ja = { sichtbar: true, wartet: true, seitKontakt: NACHSEHEN_MS, seitNachsehen: NACHSEHEN_MS };
  assert.equal(sollNachsehen(ja), true);
  assert.equal(sollNachsehen({ ...ja, sichtbar: false }), false, 'Bildschirm aus: nichts tun');
  assert.equal(sollNachsehen({ ...ja, wartet: false }), false, 'Frage offen: nichts erwartet');
  assert.equal(sollNachsehen({ ...ja, seitKontakt: NACHSEHEN_MS - 1 }), false, 'eben erst ein Stand gekommen');
  assert.equal(sollNachsehen({ ...ja, seitNachsehen: NACHSEHEN_MS - 1 }), false, 'eben erst nachgesehen');
});

test('sollNachsehen: nach dem Aufwachen sofort, aber nicht im Sekundentakt', () => {
  const wach = { sichtbar: true, wartet: true, geweckt: true, seitKontakt: 0, seitNachsehen: 2000 };
  assert.equal(sollNachsehen(wach), true, 'Bildschirm wieder an: gleich nachsehen');
  assert.equal(sollNachsehen({ ...wach, seitNachsehen: 500 }), false, 'gerade eben nachgesehen');
  assert.equal(sollNachsehen({ ...wach, wartet: false }), true, 'nach dem Aufwachen auch mitten in einer Frage');
  assert.equal(sollNachsehen({ ...wach, sichtbar: false }), false);
});

test('ausRest: Dokument der Firestore-REST-Schnittstelle wird ein einfaches Objekt', () => {
  const dok = {
    name: 'projects/p/databases/(default)/documents/spiele/123456',
    fields: {
      status: { stringValue: 'frage' },
      frageNr: { integerValue: '2' },
      frageStart: { timestampValue: '2026-11-25T15:40:10.250Z' },
      erstellt: { timestampValue: '2026-11-25T15:38:00Z' },
      aufloesung: { nullValue: null },
      offen: { booleanValue: true },
      frage: { mapValue: { fields: {
        nr: { integerValue: '2' }, zeit: { integerValue: '20' }, toleranz: { doubleValue: 0.5 },
        antworten: { arrayValue: { values: [{ stringValue: 'A' }, { stringValue: 'B' }] } },
        leer: { arrayValue: {} }, nichts: { mapValue: {} },
      } } },
    },
  };
  assert.deepEqual(ausRest(dok), {
    status: 'frage', frageNr: 2,
    frageStart: Date.parse('2026-11-25T15:40:10.250Z'), erstellt: Date.parse('2026-11-25T15:38:00Z'),
    aufloesung: null, offen: true,
    frage: { nr: 2, zeit: 20, toleranz: 0.5, antworten: ['A', 'B'], leer: [], nichts: {} },
    code: '123456',
  });
});

test('ausRest: leeres Dokument und fehlende Angaben', () => {
  assert.deepEqual(ausRest({ name: 'x/spiele/000001' }), { code: '000001' });
  assert.equal(ausRest(null), null);
});

test('restAdresse: Projekt, Pfad und Schlüssel', () => {
  assert.equal(
    restAdresse({ projectId: 'rabiosa-x', apiKey: 'K y' }, 'spiele/123456'),
    'https://firestore.googleapis.com/v1/projects/rabiosa-x/databases/(default)/documents/spiele/123456?key=K%20y');
});

test('Demo-Speicher: nachsehen liefert den aktuellen Stand, ohne zu beobachten', async () => {
  const daten = new Map();
  const speicher = { getItem: k => (daten.has(k) ? daten.get(k) : null), setItem: (k, v) => daten.set(k, String(v)), removeItem: k => daten.delete(k) };
  const store = erstelleDemoStore({ speicher, kanal: null });
  await store.konto.registrieren({ name: 'Anna', email: 'a@b.ch', passwort: '12345678', code: 'demo' });
  assert.equal(await store.spiel.nachsehen('000000'), null, 'unbekannter Code');
  const code = await store.spiel.erstellen({ status: 'warteraum', frageNr: -1, hostUid: 'x' }, {});
  assert.equal((await store.spiel.nachsehen(code)).status, 'warteraum');
  await store.spiel.aktualisieren(code, { status: 'frage', frageNr: 0 });
  const stand = await store.spiel.nachsehen(code);
  assert.equal(stand.status, 'frage');
  assert.equal(stand.code, code);
});
