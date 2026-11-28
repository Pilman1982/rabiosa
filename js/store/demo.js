// Demo-Speicher: alles im Browser (localStorage), mehrere Fenster sprechen über BroadcastChannel.
// Dient zum Ausprobieren und Testen ohne Firebase. Einladungscode im Demo-Modus: «demo».
import { SERVERZEIT, TAG_MS, fehler, spielCode, zufallsKennung } from './gemeinsam.js';
import { saubereOrdnerliste } from '../logik/ablage.js';
import { saeubereElement, bildErlaubt, NAME_MAX } from '../logik/tafel.js';

export function erstelleDemoStore({ speicher = globalThis.localStorage, kanal, jetzt = Date.now, name = 'rabiosa-demo' } = {}) {
  const P = name + ':';
  if (kanal === undefined && typeof BroadcastChannel !== 'undefined') kanal = new BroadcastChannel(name);

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

  // ----- Whiteboard: Hilfen -----
  const gastKennung = () => {
    let id = speicher.getItem('rabiosa-gast');
    if (!id) { id = 'gast-' + zufallsKennung(16); speicher.setItem('rabiosa-gast', id); }
    return id;
  };
  // Angemeldet = die Kontokennung (wie bei Firebase, wo das bestehende Konto weiterverwendet wird).
  const meineKennung = () => konto()?.uid ?? gastKennung();
  /** Wer bin ich in dieser Sitzung? Leitung = angemeldet und hostUid; Mitglied nach Gast-Kennung. */
  function rolle(code) {
    const s = lies('tafel:' + code);
    if (!s) throw fehler('nichtGefunden');
    const k = konto();
    return { s, leitung: !!k && k.uid === s.hostUid, mitglied: lies(`tafel:${code}:mitglieder`, {})[meineKennung()] ?? null };
  }
  const nurLeitung = code => { const r = rolle(code); if (!r.leitung) throw fehler('verboten'); return r; };
  /** Schreibrecht für eine Gruppe, wie in den Firestore-Regeln. */
  function schreibRecht(code, gruppe) {
    const r = rolle(code);
    if (r.leitung) return r;
    if (!r.mitglied || r.mitglied.gruppe !== gruppe) throw fehler('verboten');
    if (r.s.status !== 'offen' || (r.s.gesperrt || []).includes(gruppe)) throw fehler('abgegeben');
    return r;
  }
  /** Leserecht: Leitung immer, Mitglied nur die eigene Gruppe und nur solange die Sitzung offen ist. */
  function leseRecht(code, gruppe) {
    const s = lies('tafel:' + code);
    if (!s) return false;
    const k = konto();
    if (k && k.uid === s.hostUid) return true;
    const m = lies(`tafel:${code}:mitglieder`, {})[meineKennung()];
    return !!m && s.status === 'offen' && gruppe !== null && m.gruppe === gruppe;
  }
  const dateiSchluessel = pfad => 'tafelbild:' + pfad;
  const zaehlerAlle = code => lies(`tafel:${code}:zaehler`, {});
  const meldeTafel = (code, ...teile) => { for (const t of teile) melde(`tafel:${code}${t}`); };
  async function alsDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
  }
  function elementSchreiben(code, element) {
    const alle = lies(`tafel:${code}:elemente`, {});
    alle[element.id] = element;
    schreib(`tafel:${code}:elemente`, alle);
  }

  const store = {
    modus: 'demo',
    jetzt,
    /** Im Demo-Modus gibt es keine Live-Verbindung, die still stehen könnte. */
    async verbindungNeu() {},

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
      /** Nur Fach und Ordner ändern; «geaendert» bleibt, damit «Zuletzt bearbeitet» stimmt. */
      async verschieben(id, { fach, ordner }) {
        const k = brauchtKonto();
        const alle = lies('quizze', {});
        if (!alle[id]) throw fehler('nichtGefunden');
        if (alle[id].besitzer !== k.uid) throw fehler('verboten');
        alle[id] = { ...alle[id], fach: String(fach ?? ''), ordner: String(ordner ?? '') };
        schreib('quizze', alle);
      },
    },

    // Leere Ordner im Studio, eine Liste pro Person.
    ordner: {
      async laden() {
        const k = brauchtKonto();
        const liste = lies('ordner:' + k.uid, []);
        return Array.isArray(liste) ? liste : [];
      },
      async speichern(liste) {
        const k = brauchtKonto();
        schreib('ordner:' + k.uid, saubereOrdnerliste(liste));
      },
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
        do { code = spielCode(); } while (lies('spiel:' + code) || lies('tafel:' + code));
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
      /** Der Stand jetzt, einmalig und ohne zu beobachten (siehe js/logik/waechter.js). */
      async nachsehen(code) { return lies('spiel:' + code); },
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

    // Whiteboard: Rechte wie in den Firestore-Regeln (Leitung, Mitglied derselben Gruppe, offen, nicht gesperrt).
    tafel: {
      async erstellen(sitzung) {
        const k = brauchtKonto();
        let code;
        do { code = spielCode(); } while (lies('spiel:' + code) || lies('tafel:' + code));
        const gruppen = Array.isArray(sitzung.gruppen) ? sitzung.gruppen : [];
        schreib('tafel:' + code, { ...sitzung, code, hostUid: k.uid, erstellt: jetzt() });
        schreib(`tafel:${code}:zaehler`, Object.fromEntries(gruppen.map((_, i) => [i, { bilder: 0, bytes: 0, letztes: '' }])));
        return code;
      },
      async nachsehen(code) { return lies('tafel:' + code); },
      beobachten: (code, cb) => beobachte(`tafel:${code}`, () => lies('tafel:' + code), cb),
      async aktualisieren(code, patch) {
        const { s } = nurLeitung(code);
        const neu = { ...s };
        for (const f of ['status', 'gesperrt', 'gruppen']) if (patch && f in patch) neu[f] = patch[f];
        schreib('tafel:' + code, neu);
        meldeTafel(code, '', ':elemente', ':mitglieder');
      },
      async abgeben(code) {
        const { s, mitglied } = rolle(code);
        if (!mitglied) throw fehler('verboten');
        if (s.status !== 'offen') throw fehler('abgegeben');
        if (!(s.gesperrt || []).includes(mitglied.gruppe)) {
          schreib('tafel:' + code, { ...s, gesperrt: [...(s.gesperrt || []), mitglied.gruppe] });
          meldeTafel(code, '', ':elemente');
        }
      },
      async meine(vorlageId) {
        const k = brauchtKonto();
        const liste = [];
        for (const key of alleSchluessel()) {
          if (!/^tafel:\d+$/.test(key)) continue;
          const s = lies(key);
          if (s && s.hostUid === k.uid && (vorlageId == null || s.vorlageId === vorlageId)) liste.push(s);
        }
        return liste.sort((a, b) => (b.erstellt || 0) - (a.erstellt || 0));
      },
      async loeschen(code) {
        nurLeitung(code);
        for (const key of alleSchluessel()) {
          if (key === 'tafel:' + code || key.startsWith(`tafel:${code}:`) || key.startsWith(`tafelbild:tafeln/${code}/`)) entferne(key);
        }
        meldeTafel(code, '', ':mitglieder', ':elemente');
      },
      async gast() { return meineKennung(); },
      async beitreten(code, { gruppe, name }) {
        const s = lies('tafel:' + code);
        if (!s) throw fehler('nichtGefunden');
        if (s.status !== 'offen') throw fehler('abgegeben');
        const n = String(name ?? '').trim().slice(0, NAME_MAX);
        if (!n || !Number.isInteger(gruppe) || gruppe < 0 || gruppe >= s.gruppen.length) throw fehler('verboten');
        const uid = meineKennung();
        const alle = lies(`tafel:${code}:mitglieder`, {});
        alle[uid] = { uid, gruppe, name: n, zuletzt: jetzt() };   // gleiche Kennung = gleicher Eintrag
        schreib(`tafel:${code}:mitglieder`, alle);
        meldeTafel(code, ':mitglieder', ':elemente');
      },
      ichBeobachten: (code, cb) => beobachte(`tafel:${code}:mitglieder`, () => lies(`tafel:${code}:mitglieder`, {})[meineKennung()] ?? null, cb),
      mitgliederBeobachten(code, gruppe, cb) {
        if (gruppe === null && !(konto() && konto().uid === lies('tafel:' + code)?.hostUid)) throw fehler('verboten');
        return beobachte(`tafel:${code}:mitglieder`, () => {
          const s = lies('tafel:' + code);
          if (!s) return [];
          const alle = lies(`tafel:${code}:mitglieder`, {});
          if (gruppe === null) return Object.values(alle);
          const k = konto();
          const erlaubt = (k && k.uid === s.hostUid) || alle[meineKennung()]?.gruppe === gruppe;
          return erlaubt ? Object.values(alle).filter(m => m.gruppe === gruppe) : [];
        }, cb);
      },
      async lebenszeichen(code) {
        const { mitglied } = rolle(code);
        if (!mitglied) return;
        const alle = lies(`tafel:${code}:mitglieder`, {});
        alle[mitglied.uid] = { ...mitglied, zuletzt: jetzt() };
        schreib(`tafel:${code}:mitglieder`, alle);
        meldeTafel(code, ':mitglieder');
      },
      async mitgliedEntfernen(code, uid) {
        const { leitung } = rolle(code);
        if (!leitung && uid !== meineKennung()) throw fehler('verboten');
        const alle = lies(`tafel:${code}:mitglieder`, {});
        delete alle[uid];
        schreib(`tafel:${code}:mitglieder`, alle);
        meldeTafel(code, ':mitglieder', ':elemente');
      },
      elementeBeobachten: (code, gruppe, cb) => beobachte(`tafel:${code}:elemente`, () => {
        if (!leseRecht(code, gruppe)) return [];
        return Object.values(lies(`tafel:${code}:elemente`, {})).filter(e => gruppe === null || e.gruppe === gruppe);
      }, cb),
      async elementSpeichern(code, roh) {
        const e = saeubereElement(roh);
        if (!e) throw fehler('verboten');
        schreibRecht(code, e.gruppe);
        const alt = lies(`tafel:${code}:elemente`, {})[e.id];
        if (alt && alt.gruppe !== e.gruppe) throw fehler('verboten');
        if (e.art === 'bild') {
          if (!alt || alt.art !== 'bild') throw fehler('verboten');   // Bilder entstehen nur über bildHochladen
          e.bildPfad = alt.bildPfad; e.bildBytes = alt.bildBytes;
        } else if (alt && alt.art === 'bild') throw fehler('verboten');
        elementSchreiben(code, e);
        meldeTafel(code, ':elemente');
      },
      async elementLoeschen(code, element) {
        const alle = lies(`tafel:${code}:elemente`, {});
        const e = alle[element.id];
        if (!e) return;
        schreibRecht(code, e.gruppe);
        delete alle[e.id];
        schreib(`tafel:${code}:elemente`, alle);
        if (e.art === 'bild' && e.bildPfad) {
          entferne(dateiSchluessel(e.bildPfad));
          const z = zaehlerAlle(code);
          const a = z[e.gruppe] || { bilder: 0, bytes: 0, letztes: '' };
          z[e.gruppe] = { bilder: Math.max(0, a.bilder - 1), bytes: Math.max(0, a.bytes - (e.bildBytes || 0)), letztes: a.letztes === e.id ? '' : a.letztes };
          schreib(`tafel:${code}:zaehler`, z);
          meldeTafel(code, `:zaehler:${e.gruppe}`);
        }
        meldeTafel(code, ':elemente');
      },
      zaehlerBeobachten: (code, gruppe, cb) => beobachte(`tafel:${code}:zaehler:${gruppe}`, () => {
        if (!leseRecht(code, gruppe)) return null;
        return zaehlerAlle(code)[gruppe] ?? { bilder: 0, bytes: 0, letztes: '' };
      }, cb),
      async bildHochladen(code, roh, blob) {
        const e = saeubereElement({ ...roh, art: 'bild' });
        if (!e) throw fehler('verboten');
        schreibRecht(code, e.gruppe);
        const alt = lies(`tafel:${code}:elemente`, {})[e.id];
        if (alt && (alt.gruppe !== e.gruppe || alt.art !== 'bild')) throw fehler('verboten');
        const z = zaehlerAlle(code);
        const a = z[e.gruppe] || { bilder: 0, bytes: 0, letztes: '' };
        // Ersetzt das neue Bild ein altes desselben Elements, zählt das alte nicht mit.
        const frei = alt ? { bilder: a.bilder - 1, bytes: a.bytes - (alt.bildBytes || 0) } : a;
        if (bildErlaubt(frei, blob.size)) throw fehler('grenze');
        const pfad = `tafeln/${code}/${e.gruppe}/${e.id}`;
        try { schreib(dateiSchluessel(pfad), await alsDataUrl(blob)); } catch (err) { throw fehler('limit', err); }
        e.bildPfad = pfad; e.bildBytes = blob.size;
        elementSchreiben(code, e);
        z[e.gruppe] = { bilder: frei.bilder + 1, bytes: frei.bytes + blob.size, letztes: e.id };
        schreib(`tafel:${code}:zaehler`, z);
        meldeTafel(code, ':elemente', `:zaehler:${e.gruppe}`);
        return e;
      },
      async bildLaden(pfad) {
        const url = lies('tafelbild:' + pfad);
        const m = typeof url === 'string' ? /^data:([^;]*);base64,(.*)$/s.exec(url) : null;
        if (!m) return null;
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: m[1] });
      },
    },
  };
  return store;
}
