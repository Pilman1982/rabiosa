// Spielleitung als reine Funktionen: Der Laptop der Lehrperson ist der Schiedsrichter.
import { punkte } from './punkte.js';
import { anteil, normalisiere } from './pruefen.js';
import { oeffentlicheFrage } from './quiz.js';
import { saubererAvatar } from '../avatar.js';

/** Zusätzliche Frist für den Weg der Antwort zum Server. */
export const KULANZ_MS = 1000;

/** Vertauschung von 0..n-1, nie die Ausgangsreihenfolge (sonst wäre die Lösung schon sichtbar). */
export function mische(n, zufall = Math.random) {
  const m = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [m[i], m[j]] = [m[j], m[i]];
  }
  if (n > 1 && m.every((v, i) => v === i)) m.push(m.shift());
  return m;
}

export function neuesSpiel(quiz, hostUid) {
  return {
    oeffentlich: {
      hostUid, quizTitel: quiz.titel, sprache: quiz.sprache || 'de', status: 'warteraum',
      frageNr: -1, frageAnzahl: quiz.fragen.length, frage: null, frageStart: null, aufloesung: null, rangliste: [],
    },
    // Das Quiz wird eingefroren: Ändert es jemand während des Spiels, bleibt dieses Spiel davon unberührt.
    privat: { quizId: quiz.id, quiz: JSON.parse(JSON.stringify(quiz)), mischungen: {}, statistik: [], gesperrt: [] },
  };
}

export function frageStarten(quiz, nr, zufall = Math.random) {
  const frage = quiz.fragen[nr];
  const mischung = frage.typ === 'reihe' ? mische(frage.elemente.length, zufall) : null;
  return { frage: oeffentlicheFrage(frage, nr, mischung), mischung };
}

/** Gültig ist die früheste Antwort jedes bekannten Spielers innerhalb der Fragezeit. */
export function gueltigeAntworten(antworten, spieler, frageStart, zeit) {
  const bekannt = new Set(spieler.map(s => s.schluessel));
  const ende = frageStart + zeit * 1000 + KULANZ_MS;
  const erste = new Map();
  for (const a of [...antworten].sort((x, y) => x.zeit - y.zeit)) {
    if (!bekannt.has(a.schluessel) || erste.has(a.schluessel)) continue;
    if (!(a.zeit >= frageStart) || a.zeit > ende) continue;
    erste.set(a.schluessel, a);
  }
  return erste;
}

function verteilung(frage, werte, anteile) {
  const zaehle = (n, treffer) => { const v = Array(n).fill(0); treffer.forEach(i => { if (Number.isInteger(i) && i >= 0 && i < n) v[i]++; }); return v; };
  switch (frage.typ) {
    case 'mc': case 'umfrage':
      return zaehle(frage.antworten.length, werte);
    case 'mehrfach':
      return zaehle(frage.antworten.length, werte.flatMap(w => Array.isArray(w) ? [...new Set(w)] : []));
    case 'wf':
      return [werte.filter(w => w === true).length, werte.filter(w => w === false).length];
    case 'schaetz':
      return { werte: werte.filter(w => typeof w === 'number' && Number.isFinite(w)).sort((a, b) => a - b), treffer: anteile.filter(a => a > 0).length };
    case 'reihe':
      return { ganz: anteile.filter(a => a === 1).length, teil: anteile.filter(a => a > 0 && a < 1).length, falsch: anteile.filter(a => a === 0).length };
    case 'kurz': {
      const gruppen = new Map();
      werte.forEach((w, i) => {
        const k = normalisiere(w);
        if (!k) return;
        const g = gruppen.get(k) || { text: String(w).trim().slice(0, 40), anzahl: 0, richtig: anteile[i] === 1 };
        g.anzahl++;
        gruppen.set(k, g);
      });
      return [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, 8);
    }
    default:
      return null;
  }
}

function loesung(frage) {
  switch (frage.typ) {
    case 'mc': return frage.antworten.findIndex(a => a.richtig);
    case 'mehrfach': return frage.antworten.flatMap((a, i) => a.richtig ? [i] : []);
    case 'wf': return frage.richtig;
    case 'schaetz': return { wert: frage.wert, toleranz: frage.toleranz, einheit: frage.einheit || '' };
    case 'reihe': return [...frage.elemente];
    case 'kurz': return frage.loesungen.filter(l => l.trim());
    default: return null;
  }
}

/** Vergibt Ränge; die Liste muss sortiert sein. Gleiche Punkte = gleicher Rang, danach wird übersprungen. */
function mitRang(liste) {
  liste.forEach((e, i) => { e.rang = i > 0 && liste[i - 1].punkte === e.punkte ? liste[i - 1].rang : i + 1; });
  return liste;
}

/**
 * Wertet eine Frage aus.
 * spieler: [{ schluessel, pid, name, avatar }], antworten: [{ schluessel, wert, zeit }],
 * rangVorher: Rangliste nach der vorherigen Frage (aus dem öffentlichen Spiel-Eintrag).
 */
export function auswerten({ frage, mischung, spieler, antworten, frageStart, rangVorher }) {
  const gueltig = gueltigeAntworten(antworten, spieler, frageStart, frage.zeit);
  const vorher = new Map((rangVorher || []).map(e => [e.pid, e.punkte]));
  const werte = [], anteile = [];
  const liste = spieler.map(s => {
    const a = gueltig.get(s.schluessel);
    let teil = null, plus = 0;
    if (a) {
      teil = anteil(frage, a.wert, mischung);
      werte.push(a.wert);
      anteile.push(teil);
      if (teil) plus = punkte(teil, (a.zeit - frageStart) / 1000, frage.zeit);
    }
    return { pid: s.pid, name: s.name, avatar: s.avatar, punkte: (vorher.get(s.pid) || 0) + plus, plus, anteil: teil };
  });
  liste.sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name));
  return {
    rangliste: mitRang(liste),
    aufloesung: { loesung: loesung(frage), verteilung: verteilung(frage, werte, anteile), erklaerung: frage.erklaerung || '' },
    statistik: {
      beantwortet: gueltig.size, spieler: spieler.length, richtig: anteile.filter(a => a === 1).length,
      schnitt: spieler.length ? anteile.reduce((s, a) => s + (a || 0), 0) / spieler.length : 0,
    },
  };
}

/** Rückblick für die Lehrperson: Fragen, Lösungen, Verteilungen. Keine Namen. */
export function rueckblick(quiz, statistikListe, anzahlSpieler, datum) {
  return {
    quizId: quiz.id, quizTitel: quiz.titel, datum, spieler: anzahlSpieler,
    fragen: statistikListe.flatMap((s, platz) => {
      if (!s) return [];
      const nr = s.nr ?? platz;
      const f = quiz.fragen[nr];
      if (!f) return [];
      const eintrag = { nr, text: f.text, typ: f.typ };
      if (f.antworten) eintrag.antworten = f.antworten.map(a => a.text);
      return [{ ...eintrag, loesung: s.aufloesung.loesung, verteilung: s.aufloesung.verteilung,
        beantwortet: s.beantwortet, spieler: s.spieler, richtig: s.richtig, schnitt: s.schnitt }];
    }),
  };
}

/** Doppelte Spitznamen bekommen in der Reihenfolge des Beitritts eine Nummer («Anna», «Anna 2»). */
export function eindeutigeNamen(spieler) {
  const gezaehlt = new Map();
  return [...spieler].sort((a, b) => (a.beigetreten || 0) - (b.beigetreten || 0)).map(s => {
    const name = String(s.name || '').trim();
    const k = name.toLowerCase();
    const n = (gezaehlt.get(k) || 0) + 1;
    gezaehlt.set(k, n);
    return { ...s, name: n > 1 ? `${name} ${n}` : name };
  });
}

/** Setzt die Statistik einer Frage an ihren Platz (auch wenn schon ein anderes Fenster sie geschrieben hat). */
export function statistikSetzen(liste, nr, eintrag) {
  const neu = Array.from({ length: Math.max((liste || []).length, nr + 1) }, (_, i) => (liste || [])[i] ?? null);
  neu[nr] = { nr, ...eintrag };
  return neu;
}

/**
 * Spieler-Einträge kommen von fremden Handys: nur brauchbare behalten, Namen und Avatare bereinigen.
 * Bei doppelter öffentlicher Kennung zählt, wer zuerst da war (sonst könnte man fremde Punkte übernehmen).
 */
export function saubereSpieler(spieler, gesperrt = []) {
  const gesehen = new Set();
  const liste = (spieler || [])
    .filter(s => s && typeof s.schluessel === 'string' && s.schluessel && typeof s.pid === 'string' && s.pid && !gesperrt.includes(s.schluessel))
    .sort((a, b) => (Number(a.beigetreten) || 0) - (Number(b.beigetreten) || 0))
    .filter(s => !gesehen.has(s.pid) && gesehen.add(s.pid))
    .map(s => ({
      schluessel: s.schluessel, pid: s.pid.slice(0, 16),
      name: (typeof s.name === 'string' ? s.name.replace(/\s+/g, ' ').trim().slice(0, 16) : '') || '?',
      avatar: saubererAvatar(s.avatar), beigetreten: Number(s.beigetreten) || 0,
    }));
  return eindeutigeNamen(liste);
}
