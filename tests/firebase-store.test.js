// Firebase-Speicher: Einrichtung, soweit sie sich ohne Netz prüfen lässt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { erstelleFirebaseStore, FIREBASE_VERSION } from '../js/store/firebase.js';

function falschesSdk(nutzer = null) {
  const gesehen = { firestore: null };
  const module = {
    app: { getApps: () => [], initializeApp: config => ({ config }) },
    auth: { getAuth: () => ({ currentUser: null, authStateReady: async () => {} }), onAuthStateChanged: (auth, cb) => { if (nutzer) Promise.resolve().then(() => cb(nutzer)); return () => {}; } },
    firestore: { initializeFirestore: (app, einstellungen) => { gesehen.firestore = einstellungen; return {}; } },
  };
  return { gesehen, lade: async name => module[name] };
}

test('Firestore läuft über Long-Polling: Safari ab 26.4 hält gestreamte Antworten bis zu 30 Sekunden zurück', async () => {
  const { gesehen, lade } = falschesSdk();
  await erstelleFirebaseStore({ projectId: 'p', apiKey: 'k' }, { lade });
  assert.equal(gesehen.firestore.experimentalForceLongPolling, true);
  assert.equal(gesehen.firestore.ignoreUndefinedProperties, true, 'bisherige Einstellung bleibt');
});

test('index.html lädt genau die SDK-Version vor, die der Speicher benutzt', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const vorab = [...html.matchAll(/rel="modulepreload" href="https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/firebase-(\w+)\.js"/g)];
  assert.deepEqual(vorab.map(m => m[2]).sort(), ['app', 'auth', 'firestore']);
  for (const m of vorab) assert.equal(m[1], FIREBASE_VERSION, 'firebase-' + m[2]);
});

test('Gäste (anonyme Anmeldung) gelten im Studio als abgemeldet', async () => {
  const { lade } = falschesSdk({ uid: 'g', isAnonymous: true });
  const store = await erstelleFirebaseStore({ projectId: 'p', apiKey: 'k' }, { lade });
  const stand = await new Promise(ok => store.konto.beobachten(ok));
  assert.equal(stand, null);
});

test('Gast: anonyme Anmeldung aus -> gastAus; Storage wird nicht vorab geladen', async () => {
  const geladen = [];
  const { lade } = falschesSdk();
  const sdk = await lade('auth');
  sdk.signInAnonymously = async () => { throw Object.assign(new Error('x'), { code: 'auth/admin-restricted-operation' }); };
  const store = await erstelleFirebaseStore({ projectId: 'p', apiKey: 'k' }, { lade: async n => { geladen.push(n); return lade(n); } });
  await assert.rejects(() => store.tafel.gast(), e => e.code === 'gastAus');
  assert.deepEqual(geladen.sort(), ['app', 'auth', 'firestore']);
});

// ----- Whiteboard: Aufrufe an Firestore und Storage aufzeichnen -----
function aufzeichnendesSdk({ nutzer, daten = {}, updateFehler = null }) {
  const log = { gelesen: [], stapel: [], updates: [], sets: [], uploads: [], geloescht: [] };
  const pfad = (...t) => t.slice(1).join('/');
  const snap = p => ({ exists: () => p in daten, data: () => daten[p], id: p.split('/').pop(), metadata: {} });
  const firestore = {
    initializeFirestore: () => ({}),
    doc: (db, ...t) => ({ path: pfad(db, ...t) }),
    collection: (db, ...t) => ({ path: pfad(db, ...t) }),
    query: c => c, where: () => ({}),
    getDoc: async ref => { log.gelesen.push(ref.path); return snap(ref.path); },
    getDocs: async () => ({ docs: [] }),
    setDoc: async (ref, d) => { log.sets.push({ pfad: ref.path, daten: d }); }, deleteDoc: async () => {},
    updateDoc: async (ref, d) => { log.updates.push({ pfad: ref.path, daten: d }); if (updateFehler) throw updateFehler; },
    onSnapshot: () => () => {},
    writeBatch: () => {
      const ops = [];
      return {
        set: (r, d) => { ops.push({ art: 'set', pfad: r.path, daten: d }); },
        update: (r, d) => { ops.push({ art: 'update', pfad: r.path, daten: d }); },
        delete: r => { ops.push({ art: 'delete', pfad: r.path }); },
        commit: async () => { log.stapel.push(ops); },
      };
    },
    serverTimestamp: () => 'ZEIT',
    arrayUnion: (...w) => ({ arrayUnion: w }),
    deleteField: () => 'FELD-WEG',
    Timestamp: {},
  };
  const modul = {
    app: { getApps: () => [], initializeApp: config => ({ config }) },
    auth: { getAuth: () => ({ currentUser: nutzer, authStateReady: async () => {} }), onAuthStateChanged: () => () => {} },
    firestore,
    storage: {
      getStorage: () => ({}), ref: (s, p) => ({ pfad: p }),
      uploadBytes: async (r, blob, opt) => { log.uploads.push({ pfad: r.pfad, opt }); },
      deleteObject: async r => { log.geloescht.push(r.pfad); },
    },
  };
  return { log, lade: async n => modul[n] };
}
const KONFIG = { projectId: 'p', apiKey: 'k' };
const verweigert = () => Object.assign(new Error('x'), { code: 'permission-denied' });

test('elementLoeschen eines Bildes: ein Stapel mit Löschen und Zähler minus eins, letztes = Kennung', async () => {
  const { log, lade } = aufzeichnendesSdk({
    nutzer: { uid: 'g', isAnonymous: true },
    daten: {
      'tafeln/123/elemente/e1': { id: 'e1', gruppe: 0, art: 'bild', bildPfad: 'tafeln/123/0/e1', bildBytes: 500 },
      'tafeln/123/zaehler/0': { bilder: 2, bytes: 1500, letztes: '' },
    },
  });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await store.tafel.elementLoeschen('123', { id: 'e1', gruppe: 0 });
  assert.deepEqual(log.stapel, [[
    { art: 'delete', pfad: 'tafeln/123/elemente/e1' },
    { art: 'update', pfad: 'tafeln/123/zaehler/0', daten: { bilder: 1, bytes: 1000, letztes: 'e1' } },
  ]]);
  assert.deepEqual(log.geloescht, ['tafeln/123/0/e1'], 'Datei erst nach dem Stapel');
});

test('bildHochladen als Gast: das neue Element wird nicht vorab gelesen; Element und Zähler in einem Stapel', async () => {
  const { log, lade } = aufzeichnendesSdk({
    nutzer: { uid: 'g', isAnonymous: true },
    daten: { 'tafeln/123/zaehler/0': { bilder: 0, bytes: 0, letztes: '' } },
  });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  const e = await store.tafel.bildHochladen('123', { id: 'e1', gruppe: 0, x: 1, y: 2 }, { size: 100, type: 'image/png' });
  assert.ok(!log.gelesen.some(p => p.includes('elemente/')), 'kein Lesen auf Elemente: ' + log.gelesen);
  assert.deepEqual(log.uploads, [{ pfad: 'tafeln/123/0/e1', opt: { contentType: 'image/png' } }]);
  assert.equal(log.stapel.length, 1);
  const [el, z] = log.stapel[0];
  assert.equal(el.art, 'set'); assert.equal(el.pfad, 'tafeln/123/elemente/e1');
  assert.equal(el.daten.bildPfad, 'tafeln/123/0/e1'); assert.equal(el.daten.bildBytes, 100);
  assert.deepEqual(z, { art: 'update', pfad: 'tafeln/123/zaehler/0', daten: { bilder: 1, bytes: 100, letztes: 'e1' } });
  assert.equal(e.bildPfad, 'tafeln/123/0/e1');
});

test('bildHochladen: ein veralteter Zähler wird neu gelesen und der Stapel einmal wiederholt', async () => {
  const { log, lade } = aufzeichnendesSdk({
    nutzer: { uid: 'g', isAnonymous: true },
    daten: { 'tafeln/123/zaehler/0': { bilder: 0, bytes: 0, letztes: '' } },
  });
  const sdk = await lade('firestore');
  const wb = sdk.writeBatch; let n = 0;
  sdk.writeBatch = () => { const b = wb(); const c = b.commit; b.commit = async () => { if (n++ === 0) throw verweigert(); return c(); }; return b; };
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await store.tafel.bildHochladen('123', { id: 'e1', gruppe: 0 }, { size: 10, type: 'image/png' });
  assert.equal(n, 2);
  assert.equal(log.stapel.length, 1);
  assert.equal(log.geloescht.length, 0);
});

test('abgeben fügt die eigene Gruppe mit arrayUnion hinzu', async () => {
  const { log, lade } = aufzeichnendesSdk({
    nutzer: { uid: 'g', isAnonymous: true },
    daten: {
      'tafeln/123': { status: 'offen', gesperrt: [0], hostUid: 'h' },
      'tafeln/123/mitglieder/g': { gruppe: 1 },
    },
  });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await store.tafel.abgeben('123');
  assert.deepEqual(log.updates, [{ pfad: 'tafeln/123', daten: { gesperrt: { arrayUnion: [1] } } }]);
});

test('lebenszeichen nach beendet: verweigert, aber kein Fehler', async () => {
  const { lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true }, updateFehler: verweigert() });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await store.tafel.lebenszeichen('123');
});

test('mitgliederBeobachten(null): Gäste bekommen verboten, vor der Anmeldung entscheidet die Regel', async () => {
  const gast = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true } });
  const s1 = await erstelleFirebaseStore(KONFIG, { lade: gast.lade });
  assert.throws(() => s1.tafel.mitgliederBeobachten('123', null, () => {}), e => e.code === 'verboten');
  const offen = aufzeichnendesSdk({ nutzer: null });
  const s2 = await erstelleFirebaseStore(KONFIG, { lade: offen.lade });
  s2.tafel.mitgliederBeobachten('123', null, () => {})();
});

test('Mitglied nach beendet: verweigertes Löschen eines Elements meldet abgegeben', async () => {
  const { lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true } });
  const sdk = await lade('firestore');
  sdk.getDoc = async ref => {
    if (ref.path.includes('elemente/')) throw verweigert();
    return { exists: () => true, data: () => (ref.path.endsWith('mitglieder/g') ? { gruppe: 0 } : { status: 'beendet', gesperrt: [], hostUid: 'h' }) };
  };
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await assert.rejects(() => store.tafel.elementLoeschen('123', { id: 'e9', gruppe: 0 }), e => e.code === 'abgegeben');
});

test('Gelöschtes Element, das ein Mitglied einer offenen Sitzung löschen will: kein Fehler', async () => {
  const { lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true } });
  const sdk = await lade('firestore');
  sdk.getDoc = async ref => {
    if (ref.path.includes('elemente/')) throw verweigert();
    return { exists: () => true, data: () => (ref.path.endsWith('mitglieder/g') ? { gruppe: 0 } : { status: 'offen', gesperrt: [], hostUid: 'h' }) };
  };
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await store.tafel.elementLoeschen('123', { id: 'e9', gruppe: 0 });
});

// ----- Schlussprüfung 1: Gelöschte Elemente kommen nicht zurück -----
const offeneSitzung = ref => ({ exists: () => true, data: () => (ref.path.endsWith('mitglieder/g') ? { gruppe: 0 } : { status: 'offen', gesperrt: [], hostUid: 'h' }) });

test('elementSpeichern: Anlegen nur mit neu (setDoc), Ändern mit updateDoc; fehlende Felder werden gelöscht', async () => {
  const { log, lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true } });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  const el = { id: 'e1', gruppe: 0, art: 'zettel', x: 1, y: 2, b: 3, h: 4, text: 'a', bearbeitet: null };
  assert.equal(await store.tafel.elementSpeichern('123', el, { neu: true }), true);
  assert.deepEqual(log.sets, [{ pfad: 'tafeln/123/elemente/e1', daten: el }]);
  assert.equal(log.updates.length, 0);
  assert.equal(await store.tafel.elementSpeichern('123', { ...el, text: undefined, x: 9 }), true);
  assert.equal(log.sets.length, 1, 'kein zweites setDoc');
  const [u] = log.updates;
  assert.equal(u.pfad, 'tafeln/123/elemente/e1');
  assert.equal(u.daten.x, 9);
  assert.equal(u.daten.text, 'FELD-WEG', 'geleerter Text bleibt nicht stehen (wie beim Ersetzen)');
  assert.equal(u.daten.punkte, 'FELD-WEG');
});

test('elementSpeichern ohne neu auf ein gelöschtes Element: not-found still, false', async () => {
  const { lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true }, updateFehler: Object.assign(new Error('x'), { code: 'not-found' }) });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  assert.equal(await store.tafel.elementSpeichern('123', { id: 'e1', gruppe: 0, art: 'zettel', x: 1 }), false);
});

test('elementSpeichern ohne neu: verweigert, weil das Element fehlt (Leseregel auch) -> still, false', async () => {
  const { log, lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true }, updateFehler: verweigert() });
  const sdk = await lade('firestore');
  sdk.getDoc = async ref => { if (ref.path.includes('elemente/')) throw verweigert(); return offeneSitzung(ref); };
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  assert.equal(await store.tafel.elementSpeichern('123', { id: 'e1', gruppe: 0, art: 'zettel', x: 1 }), false);
  assert.equal(log.sets.length, 0);
});

test('elementSpeichern ohne neu: verweigert, Element da -> verboten bleibt', async () => {
  const { lade } = aufzeichnendesSdk({
    nutzer: { uid: 'g', isAnonymous: true }, updateFehler: verweigert(),
    daten: { 'tafeln/123/elemente/e1': { id: 'e1', gruppe: 1, art: 'zettel' }, 'tafeln/123': { status: 'offen', gesperrt: [], hostUid: 'h' } },
  });
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  await assert.rejects(() => store.tafel.elementSpeichern('123', { id: 'e1', gruppe: 0, art: 'zettel', x: 1 }), e => e.code === 'verboten');
});

test('elementSpeichern eines gelöschten Bildes: kein «verboten», false', async () => {
  const { log, lade } = aufzeichnendesSdk({ nutzer: { uid: 'g', isAnonymous: true } });
  const sdk = await lade('firestore');
  sdk.getDoc = async ref => { if (ref.path.includes('elemente/')) throw verweigert(); return offeneSitzung(ref); };
  const store = await erstelleFirebaseStore(KONFIG, { lade });
  assert.equal(await store.tafel.elementSpeichern('123', { id: 'b1', gruppe: 0, art: 'bild', x: 1 }), false);
  assert.equal(log.sets.length + log.updates.length, 0);
});
