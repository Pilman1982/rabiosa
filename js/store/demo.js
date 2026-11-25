// Demo-Speicher: alles im Browser (localStorage), mehrere Fenster sprechen über BroadcastChannel.
// Dient zum Ausprobieren und Testen ohne Firebase. Einladungscode im Demo-Modus: «demo».
import { SERVERZEIT, TAG_MS, fehler, spielCode, zufallsKennung } from './gemeinsam.js';

const P = 'rabiosa-demo:';

export function erstelleDemoStore({ speicher = globalThis.localStorage, kanal, jetzt = Date.now } = {}) {
  if (kanal === undefined && typeof BroadcastChannel !== 'undefined') kanal = new BroadcastChannel('rabiosa-demo');

  const lies = (k, sonst = null) => { const v = speicher.getItem(P + k); return v === null ? sonst : JSON.parse(v); };
  const schreib = (k, v) => speicher.setItem(P + k, JSON.stringify(v));
  const entferne = k => speicher.removeItem(P + k);
  const alleSchluessel = () => {
    const liste = [];
    for (let i = 0; i < speicher.length; i++) { const k = speicher.key(i); if (k && k.startsWith(P)) liste.push(k.slice(P.length)); }
    return liste;
  };

  // ----- Benachrichtigung: gleiche Seite direkt, andere Fenster über den Kanal -----
  const hoerer = new Map();   // thema -> Set(funktion)
  const rufe = thema => { for (const f of hoerer.get(thema) || []) Promise.resolve().then(f); };
  const melde = thema => { rufe(thema); kanal?.postMessage(thema); };
  if (kanal) kanal.onmessage = e => rufe(e.data);
  function beobachte(thema, lesen, cb) {
    let aktiv = true;
    const f = () => { if (aktiv) cb(lesen()); };
    if (!hoerer.has(thema)) hoerer.set(thema, new Set());
    hoerer.get(thema).add(f);
    Promise.resolve().then(f);
    return () => { aktiv = false; hoerer.get(thema)?.delete(f); };
  }

  // ----- Konto -----
  const konto = () => lies('konto');
  const brauchtKonto = () => { const k = konto(); if (!k) throw fehler('verboten'); return k; };
  const oeffentlichesKonto = k => (k ? { uid: k.uid, name: k.name, email: k.email, freigeschaltet: true } : null);

  const store = {
    modus: 'demo',
    jetzt,

    konto: {
      beobachten: cb => beobachte('konto', () => oeffentlichesKonto(konto()), cb),
      async registrieren({ name, email, passwort, code }) {
        email = String(email || '').trim().toLowerCase();
        if (!String(name || '').trim()) throw fehler('name');
        if (!/^\S+@\S+\.\S+$/.test(email)) throw fehler('email');
        if (String(passwort || '').length < 8) throw fehler('passwortKurz');
        if (String(code || '').trim().toLowerCase() !== 'demo') throw fehler('code');
        const konten = lies('konten', {});
        if (konten[email]) throw fehler('vergeben');
        konten[email] = { uid: 'demo-' + zufallsKennung(8), name: name.trim(), email, passwort };
        schreib('konten', konten);
        schreib('konto', konten[email]);
        melde('konto');
      },
      async anmelden(email, passwort) {
        const k = lies('konten', {})[String(email || '').trim().toLowerCase()];
        if (!k || k.passwort !== passwort) throw fehler('anmeldung');
        schreib('konto', k);
        melde('konto');
      },
      async freischalten() { /* im Demo-Modus ist jedes Konto freigeschaltet */ },
      async abmelden() { entferne('konto'); melde('konto'); },
      async passwortVergessen() { /* im Demo-Modus gibt es kein Mail */ },
    },

    quiz: {
      async meine() {
        const k = brauchtKonto();
        return Object.values(lies('quizze', {})).filter(q => q.besitzer === k.uid).sort((a, b) => b.geaendert - a.geaendert);
      },
      async kollegium() {
        const k = brauchtKonto();
        return Object.values(lies('quizze', {})).filter(q => q.freigegeben && q.besitzer !== k.uid).sort((a, b) => a.titel.localeCompare(b.titel));
      },
      async laden(id) {
        const k = brauchtKonto();
        const q = lies('quizze', {})[id];
        if (!q) throw fehler('nichtGefunden');
        if (q.besitzer !== k.uid && !q.freigegeben) throw fehler('verboten');
        return q;
      },
      async speichern(quiz) {
        const k = brauchtKonto();
        const alle = lies('quizze', {});
        const id = quiz.id || 'q' + zufallsKennung(12);
        if (alle[id] && alle[id].besitzer !== k.uid) throw fehler('verboten');
        alle[id] = { ...quiz, id, besitzer: k.uid, autor: k.name, geaendert: jetzt() };
        schreib('quizze', alle);
        return id;
      },
      async loeschen(id) {
        const k = brauchtKonto();
        const alle = lies('quizze', {});
        if (!alle[id]) return;
        if (alle[id].besitzer !== k.uid) throw fehler('verboten');
        delete alle[id];
        schreib('quizze', alle);
        for (const s of alleSchluessel()) if (s.startsWith(`bild:${id}/`)) entferne(s);
      },
      async bildSpeichern(quizId, dataUrl) {
        brauchtKonto();
        const bildId = 'b' + zufallsKennung(10);
        try { schreib(`bild:${quizId}/${bildId}`, dataUrl); } catch (e) { throw fehler('limit', e); }
        return bildId;
      },
      async bildLaden(quizId, bildId) { return lies(`bild:${quizId}/${bildId}`); },
      async bildLoeschen(quizId, bildId) { entferne(`bild:${quizId}/${bildId}`); },
    },

    rueckblick: {
      async speichern(rb) {
        const k = brauchtKonto();
        schreib('rueckblicke', [...lies('rueckblicke', []), { ...rb, id: 'r' + zufallsKennung(10), besitzer: k.uid }]);
      },
      async liste(quizId) {
        const k = brauchtKonto();
        return lies('rueckblicke', []).filter(r => r.besitzer === k.uid && r.quizId === quizId).sort((a, b) => b.datum - a.datum);
      },
    },

    spiel: {
      async erstellen(oeffentlich, privat) {
        let code;
        do { code = spielCode(); } while (lies('spiel:' + code));
        schreib('spiel:' + code, { ...oeffentlich, code, erstellt: jetzt() });
        schreib('privat:' + code, privat || {});
        return code;
      },
      async aktualisieren(code, patch, privatPatch) {
        const s = lies('spiel:' + code);
        if (!s) throw fehler('nichtGefunden');
        const neu = { ...s, ...patch };
        if (patch && patch.frageStart === SERVERZEIT) neu.frageStart = jetzt();
        schreib('spiel:' + code, neu);
        if (privatPatch) schreib('privat:' + code, { ...lies('privat:' + code, {}), ...privatPatch });
        melde('spiel:' + code);
      },
      beobachten: (code, cb) => beobachte('spiel:' + code, () => lies('spiel:' + code), cb),
      async privatLaden(code) { return lies('privat:' + code, {}); },
      spielerBeobachten: (code, cb) => beobachte('spieler:' + code, () => Object.values(lies('spieler:' + code, {})), cb),
      antwortenBeobachten: (code, frageNr, cb) => beobachte('antworten:' + code,
        () => Object.values(lies('antworten:' + code, {})).filter(a => a.frageNr === frageNr), cb),
      async spielerEntfernen(code, schluessel) {
        const alle = lies('spieler:' + code, {});
        delete alle[schluessel];
        schreib('spieler:' + code, alle);
        melde('spieler:' + code);
      },
      async beitreten(code, spieler) {
        if (!lies('spiel:' + code)) throw fehler('nichtGefunden');
        const alle = lies('spieler:' + code, {});
        alle[spieler.schluessel] = { ...spieler, beigetreten: alle[spieler.schluessel]?.beigetreten ?? jetzt() };
        schreib('spieler:' + code, alle);
        melde('spieler:' + code);
      },
      eigenerSpieler: (code, schluessel, cb) => beobachte('spieler:' + code, () => lies('spieler:' + code, {})[schluessel] ?? null, cb),
      async antworten(code, frageNr, schluessel, wert) {
        const alle = lies('antworten:' + code, {});
        const k = frageNr + '_' + schluessel;
        if (alle[k]) throw fehler('schonGeantwortet');
        alle[k] = { schluessel, frageNr, wert, zeit: jetzt() };
        schreib('antworten:' + code, alle);
        melde('antworten:' + code);
      },
      async beenden(code) {
        for (const art of ['spiel:', 'privat:', 'spieler:', 'antworten:']) entferne(art + code);
        melde('spiel:' + code);
        melde('spieler:' + code);
      },
      async aufraeumen() {
        const grenze = jetzt() - TAG_MS;
        for (const k of alleSchluessel()) {
          if (!k.startsWith('spiel:')) continue;
          const s = lies(k);
          if (s && s.erstellt < grenze) await store.spiel.beenden(s.code);
        }
      },
    },
  };
  return store;
}
