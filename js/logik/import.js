// Import: Ein Quiz als Text einlesen, so wie es eine KI nach dem Prompt in js/prompt.js schreibt.
// Das Format ist das Quiz von Rabiosa als JSON (siehe neueFrage in quiz.js), ohne Kennungen und Bilder.
// Grosszügig beim Lesen: Text um das JSON herum, Code-Zäune, englische Feldnamen, Antworten als blosse Texte.
// Streng beim Ergebnis: Es entsteht immer ein sauberes, eigenes Quiz; was fehlt, zeigt danach der Editor.

import { zufallsId, ZEIT_MIN, ZEIT_MAX, clocheFelder } from './quiz.js';
import { leseZahl } from './pruefen.js';

export const MAX_FRAGEN = 100;

const ZEIT_JE_TYP = { mc: 20, mehrfach: 30, wf: 15, schaetz: 25, reihe: 40, kurz: 30, umfrage: 20 };

// Wie eine KI oder ein Mensch die Typen auch nennen könnte.
const TYP_NAMEN = {
  mc: ['mc', 'multiplechoice', 'single', 'singlechoice', 'einfachauswahl', 'auswahl'],
  mehrfach: ['mehrfach', 'mehrfachauswahl', 'multi', 'multiple', 'multipleanswers', 'multipleanswer', 'multiselect'],
  wf: ['wf', 'richtigoderfalsch', 'richtigfalsch', 'wahrfalsch', 'wahroderfalsch', 'trueorfalse', 'truefalse', 'tf'],
  schaetz: ['schaetz', 'schätz', 'schaetzfrage', 'schätzfrage', 'schaetzen', 'estimate', 'estimation', 'zahl', 'number'],
  reihe: ['reihe', 'reihenfolge', 'ordnen', 'order', 'ordering', 'sort', 'putinorder'],
  kurz: ['kurz', 'kurzantwort', 'short', 'shortanswer', 'text', 'freitext'],
  umfrage: ['umfrage', 'poll', 'survey'],
};
const TYP_VON = new Map(Object.entries(TYP_NAMEN).flatMap(([typ, namen]) => namen.map(n => [n, typ])));

const fehler = code => Object.assign(new Error(code), { code });
const schlicht = s => String(s).toLowerCase().replace(/[^a-zäöü]/g, '');

/** Sauberer Text: nur aus Text oder Zahl, ohne Ränder, höchstens «max» Zeichen. */
function text(v, max) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Erster vorhandener Wert unter mehreren Feldnamen (deutsch, englisch). */
function feld(o, ...namen) {
  for (const n of namen) if (o[n] !== undefined && o[n] !== null) return o[n];
  return undefined;
}

/** true, false oder undefined (nicht zu deuten). */
function wahr(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = schlicht(v);
    if (['true', 'ja', 'yes', 'richtig', 'wahr', 'correct', 'stimmt'].includes(s)) return true;
    if (['false', 'nein', 'no', 'falsch', 'unwahr', 'incorrect', 'wrong', 'stimmtnicht'].includes(s)) return false;
  }
  return undefined;
}

function zahl(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const n = leseZahl(v); return n === null || n === undefined ? NaN : n; }
  return NaN;
}

// ---------- JSON im Text finden ----------
function lies(roh) {
  try { return JSON.parse(roh); } catch { /* zweiter Versuch unten */ }
  // Aus Word oder einem Chat kopiert: typografische Anführungszeichen, Komma vor der schliessenden Klammer.
  const geflickt = roh.replace(/[“”„‟″]/g, '"').replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(geflickt); } catch { return undefined; }
}

function findeJson(eingabe) {
  // Ein Quiz ({ … }) oder nur eine Liste von Fragen ([ … ]): Was im Text zuerst beginnt, wird zuerst versucht.
  const kandidaten = [];
  const a = eingabe.indexOf('{'), b = eingabe.lastIndexOf('}');
  if (a >= 0 && b > a) kandidaten.push([a, eingabe.slice(a, b + 1)]);
  const c = eingabe.indexOf('['), d = eingabe.lastIndexOf(']');
  if (c >= 0 && d > c) kandidaten.push([c, eingabe.slice(c, d + 1)]);
  kandidaten.sort((x, y) => x[0] - y[0]);
  for (const [, k] of kandidaten) {
    const wert = lies(k);
    if (Array.isArray(wert)) return { fragen: wert };
    if (wert && typeof wert === 'object') return wert;
  }
  return undefined;
}

// ---------- Fragen ----------
/** Antworten als [{ text, richtig }]. «richtig» kann an der Antwort stehen oder als Nummer(n) bzw. Text(e) an der Frage. */
function antworten(f, mitRichtig) {
  const liste = feld(f, 'antworten', 'answers', 'optionen', 'options');
  if (!Array.isArray(liste)) return [];
  const sauber = liste.map(a => {
    if (a && typeof a === 'object') return { text: text(feld(a, 'text', 'antwort', 'answer'), 200), richtig: wahr(feld(a, 'richtig', 'correct')) === true };
    return { text: text(a, 200), richtig: false };
  });
  if (!mitRichtig) return sauber.map(a => ({ text: a.text }));
  const angabe = feld(f, 'richtig', 'correct', 'loesung', 'lösung', 'solution');
  if (angabe !== undefined && !sauber.some(a => a.richtig)) {
    for (const r of Array.isArray(angabe) ? angabe : [angabe]) {
      let treffer;
      if (typeof r === 'number') treffer = sauber[r - 1];   // gezählt wird ab 1
      else if (typeof r === 'string') treffer = sauber.find(a => a.text.trim().toLowerCase() === r.trim().toLowerCase());
      if (treffer) treffer.richtig = true;
    }
  }
  return sauber;
}

const texte = (liste, max) => (Array.isArray(liste) ? liste.map(x => text(x, max)).filter(Boolean) : []);

function frage(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const typ = TYP_VON.get(schlicht(feld(f, 'typ', 'type', 'art') ?? ''));
  if (!typ) return null;
  const roheZeit = Number(feld(f, 'zeit', 'time', 'sekunden', 'seconds'));
  const neu = {
    id: zufallsId('f'), typ,
    text: text(feld(f, 'text', 'frage', 'question'), 500),
    bildId: null,
    zeit: Number.isFinite(roheZeit) && roheZeit > 0 ? Math.min(ZEIT_MAX, Math.max(ZEIT_MIN, Math.round(roheZeit))) : ZEIT_JE_TYP[typ],
    erklaerung: text(feld(f, 'erklaerung', 'erklärung', 'explanation'), 500),
  };
  if (typ === 'mc' || typ === 'mehrfach') neu.antworten = antworten(f, true);
  if (typ === 'umfrage') neu.antworten = antworten(f, false);
  if (typ === 'wf') { const w = wahr(feld(f, 'richtig', 'correct', 'loesung', 'lösung', 'solution')); if (w !== undefined) neu.richtig = w; }
  if (typ === 'schaetz') {
    const toleranz = zahl(feld(f, 'toleranz', 'tolerance'));
    Object.assign(neu, { wert: zahl(feld(f, 'wert', 'value', 'loesung', 'lösung', 'solution')), toleranz: Number.isFinite(toleranz) ? Math.abs(toleranz) : 0, einheit: text(feld(f, 'einheit', 'unit'), 12) });
  }
  if (typ === 'reihe') neu.elemente = texte(feld(f, 'elemente', 'items', 'reihenfolge', 'order'), 200);
  if (typ === 'kurz') neu.loesungen = texte(feld(f, 'loesungen', 'lösungen', 'solutions', 'answers', 'antworten'), 60);
  // Für Cloche: Thema (Spalte) und Stufe (1 bis 3), beide freiwillig; Ungültiges fällt weg.
  const cloche = clocheFelder({ thema: text(feld(f, 'thema', 'topic', 'kategorie', 'category'), 60), stufe: feld(f, 'stufe', 'level', 'schwierigkeit', 'difficulty') });
  if (cloche.thema) neu.thema = cloche.thema;
  if (cloche.stufe) neu.stufe = cloche.stufe;
  return neu;
}

/**
 * Text -> { quiz, uebersprungen }. «quiz» hat die Form von neuesQuiz() und ist noch nicht gespeichert;
 * quizFehler(quiz) sagt, was noch fehlt. «uebersprungen» zählt Fragen, die sich nicht lesen liessen.
 * Wirft { code }: importLeer, importKeinJson, importKeineFragen.
 */
export function importiereQuiz(eingabe, { sprache = 'de' } = {}) {
  eingabe = String(eingabe ?? '').replace(/^﻿/, '');
  if (!eingabe.trim()) throw fehler('importLeer');
  const daten = findeJson(eingabe);
  if (!daten) throw fehler('importKeinJson');
  const roh = feld(daten, 'fragen', 'questions');
  if (!Array.isArray(roh)) throw fehler('importKeineFragen');
  const alle = roh.map(frage);
  const fragen = alle.filter(Boolean).slice(0, MAX_FRAGEN);
  if (!fragen.length) throw fehler('importKeineFragen');
  const s = schlicht(feld(daten, 'sprache', 'language') ?? '');
  return {
    quiz: {
      id: null,
      titel: text(feld(daten, 'titel', 'title'), 120),
      fach: text(feld(daten, 'fach', 'subject'), 60),
      sprache: s.startsWith('en') ? 'en' : s.startsWith('de') || s.startsWith('ger') ? 'de' : (sprache === 'en' ? 'en' : 'de'),
      freigegeben: false,
      fragen,
    },
    uebersprungen: roh.length - fragen.length,
  };
}
