// Cloche: Board mit Gruppen vor einem Bildschirm. Reine Spielregeln, ohne Browser testbar.
// Zufall und Speicher werden hereingereicht. Werte und Karten stehen hier an einer Stelle.
import { clocheFelder } from './quiz.js';

export const PUNKTE_JE_STUFE = { 1: 100, 2: 200, 3: 300 };
export const MAX_FELDER = 36, MAX_SPALTEN = 8, MIN_GRUPPEN = 2, MAX_GRUPPEN = 8, NAME_MAX = 20;
export const ANTEIL_UEBERRASCHUNG = 0.2;
export const KARTEN = ['trinkgeld', 'doppelt', 'inspektor', 'mundraub', 'tischwechsel', 'spendierrunde'];
export const MIT_ZIEL = new Set(['mundraub', 'tischwechsel', 'spendierrunde']);
export const KARTEN_WERT = { trinkgeld: 200, inspektor: 200, mundraub: 200, spendierrunde: 200 };
export const SPEICHER_KEY = 'rabiosa-cloche-v1';
const VERSION = 1, VERLAUF_MAX = 20;
const PHASEN = new Set(['board', 'frage', 'karte', 'ende']);

export const wertVon = frage => PUNKTE_JE_STUFE[clocheFelder(frage).stufe] ?? 100;

function mische(liste, zufall) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Board aus den Fragen: Spalten nach Thema (höchstens 8), sonst nummerierte Felder. Höchstens 36 Felder. */
export function baueBoard(fragen, zufall = Math.random) {
  let indizes = fragen.map((_, i) => i);
  if (indizes.length > MAX_FELDER) indizes = mische(indizes, zufall).slice(0, MAX_FELDER).sort((a, b) => a - b);
  const info = indizes.map(i => ({ frage: i, wert: wertVon(fragen[i]), thema: clocheFelder(fragen[i]).thema }));

  const reihenfolge = [];
  const gruppen = new Map();
  for (const f of info) {
    const schluessel = f.thema.toLowerCase();
    if (!gruppen.has(schluessel)) { gruppen.set(schluessel, []); if (schluessel) reihenfolge.push(schluessel); }
    gruppen.get(schluessel).push(f);
  }
  if (gruppen.has('')) reihenfolge.push('');
  const mitThemen = reihenfolge.some(Boolean) && reihenfolge.length <= MAX_SPALTEN;

  if (!mitThemen) return { art: 'nummern', spalten: [], felder: info.map((f, i) => ({ nr: i + 1, ...f })) };

  const felder = [], spalten = [];
  for (const schluessel of reihenfolge) {
    const liste = [...gruppen.get(schluessel)].sort((a, b) => a.wert - b.wert || a.frage - b.frage);
    const nrs = liste.map(f => { felder.push({ nr: felder.length + 1, ...f }); return felder.length; });
    spalten.push({ thema: liste[0].thema, felder: nrs });
  }
  return { art: 'themen', spalten, felder };
}

/** Neues Spiel aus einem vollständigen Quiz. */
export function neuesCloche(quiz, { gruppen, karten }, zufall = Math.random) {
  const en = quiz.sprache === 'en';
  const board = baueBoard(quiz.fragen, zufall);
  const aktiv = mische(KARTEN.filter(k => karten.includes(k)), zufall);
  const anzahl = aktiv.length ? Math.min(board.felder.length, Math.round(board.felder.length * ANTEIL_UEBERRASCHUNG)) : 0;
  const verteilt = {};
  mische(board.felder.map(f => f.nr), zufall).slice(0, anzahl).forEach((nr, i) => { verteilt[nr] = aktiv[i % aktiv.length]; });
  const gr = gruppen.slice(0, MAX_GRUPPEN).map((g, i) => ({
    name: String(g.name ?? '').trim().slice(0, NAME_MAX) || (en ? 'Group ' : 'Gruppe ') + (i + 1),
    farbe: g.farbe,
    punkte: 0,
  }));
  return {
    version: VERSION, quizId: quiz.id, quizTitel: quiz.titel, sprache: quiz.sprache || 'de',
    board, karten: verteilt, gruppen: gr,
    amZug: Math.floor(zufall() * gr.length),
    gespielt: {}, phase: 'board', offen: null, richtig: null, zurueck: [],
  };
}

/** Wirkung einer Karte für die Gruppe am Zug. Gibt neue Gruppen zurück; die Eingabe bleibt unverändert. */
export function wendeKarteAn(gruppen, karte, amZug, ziel, feldWert, lagRichtig) {
  const g = gruppen.map(x => ({ ...x }));
  const a = g[amZug];
  const zielOk = Number.isInteger(ziel) && ziel !== amZug && ziel >= 0 && ziel < g.length;
  if (!a || (MIT_ZIEL.has(karte) && !zielOk)) return g;
  const z = g[ziel];
  const w = KARTEN_WERT[karte];
  if (karte === 'trinkgeld') a.punkte += w;
  else if (karte === 'doppelt') { if (lagRichtig) a.punkte += feldWert; }
  else if (karte === 'inspektor') a.punkte = Math.max(0, a.punkte - w);
  else if (karte === 'mundraub') { const m = Math.min(w, z.punkte); z.punkte -= m; a.punkte += m; }
  else if (karte === 'tischwechsel') [a.punkte, z.punkte] = [z.punkte, a.punkte];
  else if (karte === 'spendierrunde') { const m = Math.min(w, a.punkte); a.punkte -= m; z.punkte += m; }
  return g;
}

const ohneVerlauf = ({ zurueck, ...rest }) => structuredClone(rest);

function weiter(s) {
  const fertig = s.board.felder.every(f => f.nr in s.gespielt);
  return { ...s, amZug: (s.amZug + 1) % s.gruppen.length, offen: null, richtig: null, phase: fertig ? 'ende' : 'board' };
}

/** Ein Spielschritt. Gibt immer ein neues Objekt zurück; ungültige Aktionen ändern nichts. */
export function schritt(stand, aktion) {
  const s = { ...ohneVerlauf(stand), zurueck: [...(stand.zurueck || []), ohneVerlauf(stand)].slice(-VERLAUF_MAX) };
  const unveraendert = () => ({ ...ohneVerlauf(stand), zurueck: [...(stand.zurueck || [])] });
  const feld = s.board.felder.find(f => f.nr === s.offen);
  switch (aktion?.typ) {
    case 'oeffne': {
      const nr = aktion.feld;
      if (s.phase !== 'board' || !s.board.felder.some(f => f.nr === nr) || nr in s.gespielt) return unveraendert();
      return { ...s, phase: 'frage', offen: nr };
    }
    case 'bewerte': {
      if (s.phase !== 'frage' || !feld) return unveraendert();
      const richtig = s.gruppen.map((_, i) => aktion.richtig?.[i] === true);
      s.gruppen = s.gruppen.map((g, i) => (richtig[i] ? { ...g, punkte: g.punkte + feld.wert } : g));
      s.gespielt = { ...s.gespielt, [feld.nr]: s.amZug };
      if (s.karten[feld.nr]) return { ...s, phase: 'karte', richtig };
      return weiter(s);
    }
    case 'karte': {
      if (s.phase !== 'karte' || !feld) return unveraendert();
      const ziel = Number.isInteger(aktion.ziel) ? aktion.ziel : null;
      s.gruppen = wendeKarteAn(s.gruppen, s.karten[feld.nr], s.amZug, ziel, feld.wert, !!s.richtig?.[s.amZug]);
      return weiter(s);
    }
    case 'korrigiere': {
      const i = aktion.gruppe;
      if (!s.gruppen[i] || !Number.isFinite(aktion.delta)) return unveraendert();
      s.gruppen = s.gruppen.map((g, j) => (j === i ? { ...g, punkte: Math.max(0, g.punkte + aktion.delta) } : g));
      return s;
    }
    case 'beende':
      return { ...s, phase: 'ende', offen: null, richtig: null };
    default:
      return unveraendert();
  }
}

export function rueckgaengig(stand) {
  const verlauf = stand.zurueck || [];
  if (!verlauf.length) return { ...stand, zurueck: [] };
  return { ...verlauf[verlauf.length - 1], zurueck: verlauf.slice(0, -1) };
}

/** Rangliste: absteigend nach Punkten, gleiche Punkte gleicher Rang. */
export function rangliste(gruppen) {
  const sortiert = gruppen.map((g, i) => ({ ...g, i })).sort((a, b) => b.punkte - a.punkte || a.i - b.i);
  return sortiert.map(({ i, ...g }) => ({ ...g, rang: 1 + sortiert.filter(x => x.punkte > g.punkte).length }));
}

export function sichereStand(speicher, stand) {
  try { speicher.setItem(SPEICHER_KEY, JSON.stringify({ ...stand, zurueck: [] })); } catch { /* voller oder gesperrter Speicher */ }
}

/** Gesicherter Stand oder null, wenn keiner da, kaputt oder aus einer anderen Version. */
export function ladeStand(speicher) {
  try {
    const s = JSON.parse(speicher.getItem(SPEICHER_KEY));
    const gueltig = s && s.version === VERSION && PHASEN.has(s.phase) && Array.isArray(s.gruppen) && s.gruppen.length >= 1
      && s.board && Array.isArray(s.board.felder) && s.gespielt && typeof s.gespielt === 'object' && s.karten && typeof s.amZug === 'number';
    return gueltig ? { ...s, zurueck: [] } : null;
  } catch { return null; }
}
