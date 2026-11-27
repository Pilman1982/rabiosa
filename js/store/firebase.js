// Firebase-Speicher: Dozierende melden sich mit E-Mail und Passwort an (Firebase Auth), alle Daten liegen in
// Cloud Firestore. Studierende melden sich nicht an: Ihr Ausweis ist ein geheimer Zufallsschlüssel, der zugleich
// die Kennung ihres Spieler-Eintrags ist. Wer was darf, steht in firestore.rules.
// Gleiche Schnittstelle wie demo.js. Zeiten gehen als Zahl (ms) an die Aufrufer, in Firestore sind
// «erstellt», «frageStart», «beigetreten» und «zeit» Zeitstempel des Servers.
import { SERVERZEIT, TAG_MS, fehler, spielCode, zufallsKennung } from './gemeinsam.js';
import { ausRest, restAdresse } from './rest.js';

/** Version des Firebase JS SDK (modulare API). Nur hier ändern. */
export const FIREBASE_VERSION = '13.4.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-`;

const BILD_MAX_ZEICHEN = 900_000;   // Data-URL; ein Firestore-Dokument fasst höchstens 1 MiB
const BILDER_IM_KOPF = 40;          // so viele geladene Bilder merkt sich der Speicher (spart Lesezugriffe)
const SCHLUESSEL_MIN = 20;          // wie in firestore.rules
const STAPEL_GROSS = 200;           // Löschungen pro Stapel, wenn der Server gleiche Regel-Zugriffe nur einmal zählt
const STAPEL_KLEIN = 10;            // sonst: höchstens 20 Regel-Zugriffe pro Stapel, bis zu 2 pro Löschung
const AUFRAEUMEN_MAX = 3;           // alte Spiele pro Aufruf von aufraeumen()

const AUTH_FEHLER = {
  'auth/invalid-email': 'email',
  'auth/missing-email': 'email',
  'auth/weak-password': 'passwortKurz',
  'auth/password-does-not-meet-requirements': 'passwortKurz',
  'auth/email-already-in-use': 'vergeben',
  'auth/invalid-credential': 'anmeldung',
  'auth/invalid-login-credentials': 'anmeldung',
  'auth/wrong-password': 'anmeldung',
  'auth/user-not-found': 'anmeldung',
  'auth/user-disabled': 'anmeldung',
  'auth/missing-password': 'anmeldung',
  'auth/too-many-requests': 'zuViele',
  'auth/network-request-failed': 'netz',
  'auth/timeout': 'netz',
  'auth/quota-exceeded': 'limit',
};
const FIRESTORE_FEHLER = {
  'permission-denied': 'verboten',
  'unauthenticated': 'verboten',
  'not-found': 'nichtGefunden',
  'resource-exhausted': 'limit',
  'unavailable': 'netz',
  'deadline-exceeded': 'netz',
};

const istVerweigert = e => !!e && (e.code === 'permission-denied' || e.code === 'unauthenticated');
const istZeit = w => w != null && typeof w.toMillis === 'function';

/** Macht aus einem Fehler von Firebase einen mit unserer Kennung. «ersatz» tauscht Kennungen je nach Aufruf. */
function uebersetze(e, ersatz = {}) {
  if (e && typeof e.message === 'string' && e.message.startsWith('rabiosa:')) return e;
  const roh = e && typeof e.code === 'string' ? e.code : '';
  const code = AUTH_FEHLER[roh] || FIRESTORE_FEHLER[roh] || 'allgemein';
  if (code === 'allgemein') console.error('rabiosa: unerwarteter Fehler', e);
  return fehler(ersatz[code] || code, e);
}
async function versuche(aktion, ersatz) {
  try { return await aktion(); } catch (e) { throw uebersetze(e, ersatz); }
}

/** Was die Regeln als Antwort annehmen: Zahl, Ja/Nein, kurzer Text oder kurze Liste. */
function antwortErlaubt(wert) {
  if (typeof wert === 'number' || typeof wert === 'boolean') return true;
  if (typeof wert === 'string') return wert.length <= 300;   // wie in firestore.rules
  return Array.isArray(wert) && wert.length <= 6 && wert.every(w => w !== undefined && !Array.isArray(w));
}

/**
 * config: die Angaben aus js/config.js. Das SDK wird erst hier geladen, der Demo-Modus berührt das Netz nie.
 * «lade» gibt es nur für Tests (liefert die drei Module app, auth, firestore).
 */
export async function erstelleFirebaseStore(config, { lade = name => import(`${CDN}${name}.js`) } = {}) {
  let appSdk, authSdk, fs;
  try { [appSdk, authSdk, fs] = await Promise.all([lade('app'), lade('auth'), lade('firestore')]); }
  catch (e) { throw fehler('netz', e); }

  const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(config);
  const auth = authSdk.getAuth(app);
  let db;
  // Long-Polling statt Streaming: Safari ab 26.4 (iPhone und Mac) hält gestreamte Antworten von Firestore bis zu
  // 30 Sekunden zurück – Abrufe hängen, Änderungen kommen nicht an (firebase-js-sdk, Issue 9789, Fehler in WebKit).
  // Beim Long-Polling ist jede Antwort eine abgeschlossene Anfrage; das läuft in allen Browsern gleich.
  try { db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalForceLongPolling: true }); }
  catch { db = fs.getFirestore(app); }   // war schon eingerichtet

  const { doc, collection, query, where, limit, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc,
    onSnapshot, writeBatch, serverTimestamp, Timestamp } = fs;

  // ----- Pfade -----
  const profilRef = uid => doc(db, 'dozierende', uid);
  const quizRef = id => doc(db, 'quizze', String(id));
  const bildRef = (quizId, bildId) => doc(db, 'quizze', String(quizId), 'bilder', String(bildId));
  const spielRef = code => doc(db, 'spiele', String(code));
  const privatRef = code => doc(db, 'spiele', String(code), 'privat', 'zustand');
  const spielerRef = (code, schluessel) => doc(db, 'spiele', String(code), 'spieler', String(schluessel));
  const spielerListe = code => collection(db, 'spiele', String(code), 'spieler');
  const antwortListe = code => collection(db, 'spiele', String(code), 'antworten');

  // ----- Zeit -----
  // versatz = Serverzeit minus eigene Uhr. Wird einmal geschätzt, wenn ohnehin ein Zeitstempel des Servers
  // geschrieben wird (Spiel erstellen, beitreten, Frage starten); bis dahin 0.
  let versatz = 0, versatzBekannt = false;
  const jetzt = () => Date.now() + versatz;

  async function schaetzeVersatz(t0, t1, ref, feld) {
    if (versatzBekannt) return;
    try {
      const zeit = (await getDocFromServer(ref)).get(feld);
      if (!istZeit(zeit) || versatzBekannt) return;
      versatz = Math.round(zeit.toMillis() - (t0 + t1) / 2);   // der Server hat zwischen t0 und t1 geschrieben
      versatzBekannt = true;
    } catch { /* ohne Schätzung gilt die eigene Uhr */ }
  }

  /**
   * Daten eines Dokuments, die genannten Zeitstempel als Zahl (ms). Hat der Server einen Zeitstempel noch nicht
   * gesetzt (eigenes Schreiben unterwegs), gilt die eigene Schätzung: Uhr beim Schreiben plus versatz.
   */
  function mitZeiten(snap, felder) {
    const d = snap.data({ serverTimestamps: 'estimate' });
    const fest = snap.metadata.hasPendingWrites ? snap.data() : d;   // ohne Angabe: ausstehende Zeitstempel sind null
    for (const f of felder) {
      if (istZeit(d[f])) d[f] = Math.round(d[f].toMillis()) + (istZeit(fest[f]) ? 0 : versatz);
    }
    return d;
  }
  const spielAus = snap => ({ ...mitZeiten(snap, ['erstellt', 'frageStart']), code: snap.id });
  const spielerAus = snap => mitZeiten(snap, ['beigetreten']);
  const antwortAus = snap => mitZeiten(snap, ['zeit']);
  const mitServerzeit = daten => Object.fromEntries(Object.entries(daten).map(([k, v]) => [k, v === SERVERZEIT ? serverTimestamp() : v]));

  // ----- Beobachten: ein Zuhörer pro Sache, kein Nachfragen im Takt -----
  /**
   * Meldet jeden neuen Stand genau einmal. Vor dem ersten Stand vom Server wird nichts gemeldet: Ohne Verbindung
   * liefert Firestore «gibt es nicht» bzw. eine leere Liste aus dem Zwischenspeicher, und das hiesse für die
   * Ansichten «Spiel vorbei», «entfernt» oder «niemand hat geantwortet».
   */
  function lausche(ziel, lesen, cb) {
    let aktiv = true, vomServer = false, zuletzt;
    const stopp = onSnapshot(ziel, { includeMetadataChanges: true }, snap => {
      if (!snap.metadata.fromCache) vomServer = true;
      if (!aktiv || !vomServer) return;
      const wert = lesen(snap);
      const bild = JSON.stringify(wert);
      if (bild === zuletzt) return;   // nur die Begleitangaben haben sich geändert
      zuletzt = bild;
      cb(wert);
    }, e => console.warn('rabiosa: Beobachtung beendet', e));
    return () => { aktiv = false; stopp(); };
  }

  // ----- Löschen in Stapeln -----
  /**
   * Löscht die Dokumente in der gegebenen Reihenfolge (das Dokument, von dem die Regeln der anderen abhängen,
   * gehört ans Ende). Jede Löschung prüft in den Regeln per get() das Spiel bzw. Quiz, und pro Stapel sind nur
   * 20 solche Zugriffe erlaubt. Zählt der Server gleiche Zugriffe einmal, geht ein grosser Stapel durch;
   * sonst wird er als Ganzes verweigert und in kleinen Stapeln wiederholt.
   */
  async function loescheAlle(refs) {
    let groesse = STAPEL_GROSS;
    for (let i = 0; i < refs.length;) {
      const teil = refs.slice(i, i + groesse);
      const stapel = writeBatch(db);
      for (const ref of teil) stapel.delete(ref);
      try {
        await stapel.commit();
        i += teil.length;
      } catch (e) {
        if (!istVerweigert(e) || teil.length <= STAPEL_KLEIN) throw e;
        groesse = STAPEL_KLEIN;
      }
    }
  }

  /** Antworten, Spieler, privater Teil und zuletzt das Spiel selbst. */
  async function spielLoeschen(code) {
    const [antworten, spieler] = await Promise.all([getDocs(antwortListe(code)), getDocs(spielerListe(code))]);
    await loescheAlle([...antworten.docs.map(d => d.ref), ...spieler.docs.map(d => d.ref), privatRef(code), spielRef(code)]);
  }

  // ----- Konto -----
  let kontoStand;                    // undefined = noch nicht bekannt, null = abgemeldet
  let kontoLauf = 0, kontoSperre = 0;
  const kontoHoerer = new Set();
  const uidJetzt = () => (auth.currentUser ? auth.currentUser.uid : null);

  function kontoMelden(stand) {
    kontoLauf++;
    kontoStand = stand;
    for (const f of [...kontoHoerer]) { try { f(stand); } catch (e) { console.error(e); } }
  }

  /** Liest, ob es das Profil gibt (= freigeschaltet), und meldet den Stand. Ein Lesezugriff. */
  async function kontoPruefen(user) {
    if (!user) { kontoMelden(null); return; }
    const lauf = ++kontoLauf;
    let freigeschaltet = false, name = user.displayName || '';
    try {
      const snap = await getDoc(profilRef(user.uid));
      freigeschaltet = snap.exists();
      if (freigeschaltet) name = snap.data().name || name;
    } catch (e) { console.error('rabiosa: Profil nicht lesbar', e); }
    if (lauf === kontoLauf) kontoMelden({ uid: user.uid, name, email: user.email || '', freigeschaltet });
  }

  // Der einzige Zuhörer auf die Anmeldung. Während registrieren/anmelden/abmelden läuft, schweigt er:
  // Diese melden den Stand am Schluss selbst, damit niemand ein halb angelegtes Konto zu sehen bekommt.
  authSdk.onAuthStateChanged(auth, user => { if (!kontoSperre) kontoPruefen(user); });

  async function kontoWechsel(aktion) {
    await auth.authStateReady();
    const vorher = uidJetzt();
    kontoSperre++;
    try { return await aktion(); }
    finally {
      kontoSperre--;
      if (uidJetzt() !== vorher || kontoStand === undefined) await kontoPruefen(auth.currentUser);
    }
  }

  async function brauchtKonto() {
    await auth.authStateReady();
    if (!auth.currentUser) throw fehler('verboten');
    return auth.currentUser;
  }

  /** Legt das Profil an. Die Regeln lassen das nur zu, wenn der Einladungscode stimmt. */
  async function profilAnlegen(user, name, code) {
    const ref = profilRef(user.uid);
    try {
      await setDoc(ref, { name, email: user.email || '', code, erstellt: serverTimestamp() });
    } catch (e) {
      if (!istVerweigert(e)) throw uebersetze(e);
      // Verweigert heisst: falscher Code – oder das Profil gibt es schon, dann ist alles gut.
      let schonDa = false;
      try { schonDa = (await getDoc(ref)).exists(); } catch { /* bleibt beim Code-Fehler */ }
      if (!schonDa) throw fehler('code', e);
    }
  }

  // ----- Bilder im Kopf -----
  const bilder = new Map();          // 'quizId/bildId' -> Data-URL
  function merkeBild(k, daten) {
    bilder.delete(k);
    bilder.set(k, daten);
    if (bilder.size > BILDER_IM_KOPF) bilder.delete(bilder.keys().next().value);
  }

  let verbindetNeu = false;
  const store = {
    modus: 'firebase',
    jetzt,
    /**
     * Baut die Live-Verbindung neu auf. Nötig, wenn sie still steht, ohne dass das SDK es merkt (Bildschirm war
     * gesperrt, Netz hat gewechselt). Ausstehende Schreibvorgänge bleiben erhalten und gehen danach raus.
     */
    async verbindungNeu() {
      if (verbindetNeu) return;
      verbindetNeu = true;
      try { await fs.disableNetwork(db); } catch { /* war schon aus */ }
      try { await fs.enableNetwork(db); } finally { verbindetNeu = false; }
    },

    konto: {
      beobachten(cb) {
        let aktiv = true;
        const f = stand => { if (aktiv) cb(stand); };
        kontoHoerer.add(f);
        if (kontoStand !== undefined) Promise.resolve().then(() => f(kontoStand));
        return () => { aktiv = false; kontoHoerer.delete(f); };
      },
      async registrieren({ name, email, passwort, code }) {
        name = String(name || '').trim();
        email = String(email || '').trim().toLowerCase();
        code = String(code || '').trim();
        if (!name) throw fehler('name');
        if (!/^\S+@\S+\.\S+$/.test(email)) throw fehler('email');
        if (String(passwort || '').length < 8) throw fehler('passwortKurz');
        if (!code) throw fehler('code');
        await kontoWechsel(async () => {
          const { user } = await versuche(() => authSdk.createUserWithEmailAndPassword(auth, email, passwort));
          await versuche(() => authSdk.updateProfile(user, { displayName: name }));
          // Schlägt das fehl, gibt es das Konto trotzdem – nur nicht freigeschaltet (siehe freischalten).
          await profilAnlegen(user, name, code);
        });
      },
      async anmelden(email, passwort) {
        await kontoWechsel(() => versuche(
          () => authSdk.signInWithEmailAndPassword(auth, String(email || '').trim(), String(passwort || '')),
          { email: 'anmeldung', passwortKurz: 'anmeldung' }));
      },
      async freischalten(code) {
        const user = await brauchtKonto();
        code = String(code || '').trim();
        if (!code) throw fehler('code');
        const name = user.displayName || user.email || '';
        await profilAnlegen(user, name, code);
        kontoMelden({ uid: user.uid, name, email: user.email || '', freigeschaltet: true });
      },
      async abmelden() { await kontoWechsel(() => versuche(() => authSdk.signOut(auth))); },
      async passwortVergessen(email) {
        await versuche(() => authSdk.sendPasswordResetEmail(auth, String(email || '').trim()));
      },
    },

    quiz: {
      async meine() {
        const user = await brauchtKonto();
        const snap = await versuche(() => getDocs(query(collection(db, 'quizze'), where('besitzer', '==', user.uid))));
        return snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.geaendert - a.geaendert);
      },
      async kollegium() {
        const user = await brauchtKonto();
        const snap = await versuche(() => getDocs(query(collection(db, 'quizze'), where('freigegeben', '==', true))));
        return snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(q => q.besitzer !== user.uid)
          .sort((a, b) => String(a.titel).localeCompare(String(b.titel)));
      },
      async laden(id) {
        await brauchtKonto();
        if (!id) throw fehler('nichtGefunden');
        const snap = await versuche(() => getDoc(quizRef(id)));
        if (!snap.exists()) throw fehler('nichtGefunden');
        return { ...snap.data(), id: snap.id };
      },
      async speichern(quiz) {
        const user = await brauchtKonto();
        const id = quiz.id || 'q' + zufallsKennung(12);
        const autor = (kontoStand && kontoStand.uid === user.uid && kontoStand.name) || user.displayName || '';
        // Gehört das Quiz jemand anderem, verweigern die Regeln die Änderung: «verboten».
        await versuche(() => setDoc(quizRef(id), { ...quiz, id, besitzer: user.uid, autor, geaendert: jetzt() }));
        return id;
      },
      async loeschen(id) {
        const user = await brauchtKonto();
        if (!id) return;
        const snap = await versuche(() => getDoc(quizRef(id)));
        if (!snap.exists()) return;
        if (snap.data().besitzer !== user.uid) throw fehler('verboten');
        await versuche(async () => {
          const bildListe = await getDocs(collection(db, 'quizze', String(id), 'bilder'));
          await loescheAlle([...bildListe.docs.map(d => d.ref), quizRef(id)]);
        });
        for (const k of [...bilder.keys()]) if (k.startsWith(id + '/')) bilder.delete(k);
      },
      /** Das Quiz muss schon gespeichert sein: Die Regeln prüfen, wem es gehört. */
      async bildSpeichern(quizId, dataUrl) {
        await brauchtKonto();
        if (typeof dataUrl !== 'string' || dataUrl.length > BILD_MAX_ZEICHEN) throw fehler('limit');
        const bildId = 'b' + zufallsKennung(10);
        await versuche(() => setDoc(bildRef(quizId, bildId), { daten: dataUrl }));
        merkeBild(`${quizId}/${bildId}`, dataUrl);
        return bildId;
      },
      async bildLaden(quizId, bildId) {
        if (!quizId || !bildId) return null;
        const k = `${quizId}/${bildId}`;
        if (bilder.has(k)) return bilder.get(k);
        try {
          const snap = await getDoc(bildRef(quizId, bildId));
          const daten = snap.exists() ? snap.data().daten ?? null : null;
          if (daten) merkeBild(k, daten);
          return daten;
        } catch (e) {
          if (istVerweigert(e)) return null;   // Quiz gelöscht oder nicht mehr freigegeben: wie «kein Bild»
          throw uebersetze(e);
        }
      },
      async bildLoeschen(quizId, bildId) {
        if (!quizId || !bildId) return;
        bilder.delete(`${quizId}/${bildId}`);
        await versuche(() => deleteDoc(bildRef(quizId, bildId)));
      },
    },

    rueckblick: {
      async speichern(rb) {
        const user = await brauchtKonto();
        const id = 'r' + zufallsKennung(10);
        await versuche(() => setDoc(doc(db, 'rueckblicke', id), { ...rb, id, besitzer: user.uid }));
      },
      async liste(quizId) {
        const user = await brauchtKonto();
        // Zwei Gleichheitsfilter, sortiert wird hier: So braucht es keinen zusammengesetzten Index.
        const snap = await versuche(() => getDocs(query(collection(db, 'rueckblicke'),
          where('besitzer', '==', user.uid), where('quizId', '==', quizId))));
        return snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.datum - a.datum);
      },
    },

    spiel: {
      async erstellen(oeffentlich, privat) {
        await brauchtKonto();
        for (let versuch = 0; versuch < 6; versuch++) {
          const code = spielCode();
          const ref = spielRef(code);
          if ((await versuche(() => getDoc(ref))).exists()) continue;   // Code ist vergeben
          const t0 = Date.now();
          await versuche(() => setDoc(ref, { ...mitServerzeit(oeffentlich), code, erstellt: serverTimestamp() }));
          const t1 = Date.now();
          // Der private Teil folgt einzeln: Seine Regel schaut nach, wem das (nun vorhandene) Spiel gehört.
          try { await setDoc(privatRef(code), privat || {}); }
          catch (e) { deleteDoc(ref).catch(() => {}); throw uebersetze(e); }
          await schaetzeVersatz(t0, t1, ref, 'erstellt');
          return code;
        }
        throw fehler('allgemein');
      },
      async aktualisieren(code, patch, privatPatch) {
        const oeffentlich = patch && Object.keys(patch).length > 0;
        const geheim = privatPatch && Object.keys(privatPatch).length > 0;
        if (!oeffentlich && !geheim) return;
        const stapel = writeBatch(db);   // beides zusammen oder gar nicht
        if (oeffentlich) stapel.update(spielRef(code), mitServerzeit(patch));
        if (geheim) stapel.update(privatRef(code), privatPatch);
        const t0 = Date.now();
        await versuche(() => stapel.commit());
        if (oeffentlich && patch.frageStart === SERVERZEIT) schaetzeVersatz(t0, Date.now(), spielRef(code), 'frageStart');
      },
      beobachten: (code, cb) => lausche(spielRef(code), snap => (snap.exists() ? spielAus(snap) : null), cb),
      /**
       * Der Stand jetzt, mit einer gewöhnlichen Web-Anfrage statt über die Live-Verbindung des SDK. So klappt es
       * auch, wenn die Live-Verbindung still steht. Ein Lesezugriff. null = Spiel gibt es nicht.
       */
      async nachsehen(code) {
        const abbruch = new AbortController();
        const frist = setTimeout(() => abbruch.abort(), 8000);
        try {
          const antwort = await fetch(restAdresse(config, 'spiele/' + encodeURIComponent(String(code))), { cache: 'no-store', signal: abbruch.signal });
          if (antwort.status === 404) return null;
          if (!antwort.ok) throw fehler('netz');
          return ausRest(await antwort.json());
        } catch (e) { throw e && e.code ? e : fehler('netz', e); }
        finally { clearTimeout(frist); }
      },
      async privatLaden(code) {
        const snap = await versuche(() => getDoc(privatRef(code)));
        return snap.exists() ? snap.data() : {};
      },
      spielerBeobachten: (code, cb) => lausche(spielerListe(code),
        snap => snap.docs.map(spielerAus).sort((a, b) => a.beigetreten - b.beigetreten), cb),
      antwortenBeobachten: (code, frageNr, cb) => lausche(query(antwortListe(code), where('frageNr', '==', frageNr)),
        snap => snap.docs.map(antwortAus), cb),
      async spielerEntfernen(code, schluessel) {
        await versuche(() => deleteDoc(spielerRef(code, schluessel)));
      },
      async beitreten(code, spieler) {
        const schluessel = String(spieler.schluessel || '');
        const { pid, name, avatar } = spieler;
        try {
          if (schluessel.length < SCHLUESSEL_MIN) throw fehler('verboten');
          const ref = spielerRef(code, schluessel);
          if ((await getDoc(ref)).exists()) {
            await updateDoc(ref, { name, avatar });   // «beigetreten» und «pid» bleiben, wie sie sind
          } else {
            const t0 = Date.now();
            await setDoc(ref, { schluessel, pid, name, avatar, beigetreten: serverTimestamp() });
            await schaetzeVersatz(t0, Date.now(), ref, 'beigetreten');
          }
        } catch (e) {
          if (!istVerweigert(e) && e.code !== 'verboten') throw uebersetze(e);
          // Verweigert: Meist gibt es das Spiel nicht (mehr). Das lässt sich ohne Anmeldung nachsehen.
          let gibtEs = true;
          try { gibtEs = (await getDoc(spielRef(code))).exists(); } catch { /* unklar: bleibt bei «verboten» */ }
          throw fehler(gibtEs ? 'verboten' : 'nichtGefunden', e);
        }
      },
      eigenerSpieler: (code, schluessel, cb) => lausche(spielerRef(code, schluessel),
        snap => (snap.exists() ? spielerAus(snap) : null), cb),
      async antworten(code, frageNr, schluessel, wert) {
        schluessel = String(schluessel || '');
        if (!Number.isInteger(frageNr) || frageNr < 0 || schluessel.length < SCHLUESSEL_MIN || !antwortErlaubt(wert)) throw fehler('verboten');
        const ref = doc(db, 'spiele', String(code), 'antworten', `${frageNr}_${schluessel}`);
        // Gibt es den Eintrag schon, wäre das Schreiben eine Änderung – und die lassen die Regeln nie zu.
        await versuche(() => setDoc(ref, { schluessel, frageNr, wert, zeit: serverTimestamp() }), { verboten: 'schonGeantwortet' });
      },
      async beenden(code) {
        try { await spielLoeschen(code); }
        catch (e) {
          if (istVerweigert(e)) {
            // Gibt es das Spiel gar nicht (mehr), ist nichts zu tun – wie im Demo-Speicher.
            let gibtEs = true;
            try { gibtEs = (await getDoc(spielRef(code))).exists(); } catch { /* unklar */ }
            if (!gibtEs) return;
          }
          throw uebersetze(e);
        }
      },
      async aufraeumen() {
        try {
          await brauchtKonto();
          // Eine Minute Luft: Die Regeln rechnen mit der Uhr des Servers.
          const grenze = Timestamp.fromMillis(jetzt() - TAG_MS - 60_000);
          const alte = await getDocs(query(collection(db, 'spiele'), where('erstellt', '<', grenze), limit(AUFRAEUMEN_MAX)));
          for (const d of alte.docs) { try { await spielLoeschen(d.id); } catch { /* beim nächsten Mal */ } }
        } catch { /* Aufräumen ist freiwillig */ }
      },
    },
  };
  return store;
}
