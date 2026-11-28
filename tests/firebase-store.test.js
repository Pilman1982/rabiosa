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
