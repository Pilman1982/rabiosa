// Präsentation: Folien mit Abstimmung, Wortwolke, Skala, offener Frage, Rangfolge, 100 Punkten und Inhalt.
// Die Klasse antwortet am Handy, ohne Namen und ohne Punkte; der Beamer zeigt die Ergebnisse live.
// Eine Präsentation ist ein Quiz-Dokument mit art: 'praesentation'; die Folien stehen im Feld «fragen»
// (so gelten dieselben Datenbank-Regeln, dieselbe Ablage, Suche, Freigabe und Kopie wie bei Quiz).
import { normalisiere } from './pruefen.js';

export const ART = 'praesentation';
export const FOLIEN = ['abstimmung', 'wortwolke', 'skala', 'offen', 'rangfolge', 'punkte', 'inhalt'];
export const OFFEN_MAX = 250;        // Zeichen pro offener Antwort (wie in firestore.rules)
export const WORT_MAX = 25;          // Zeichen pro Wort der Wortwolke
export const WORTE_MAX = 3;          // Wörter pro Person
export const PUNKTE_SUMME = 100;     // zu verteilende Punkte
export const SKALA_GRENZEN = [5, 7, 10];
export const WOLKE_MAX = 60;         // so viele verschiedene Wörter zeigt die Wolke höchstens

export const istPraesentation = q => !!q && q.art === ART;
export const istInteraktiv = folie => !!folie && folie.typ !== 'inhalt';

const zufallsId = () => 'f' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const leer = s => typeof s !== 'string' || !s.trim();
const text = s => (typeof s === 'string' ? s : '');

export function neueFolie(typ) {
  const f = { id: zufallsId(), typ, text: '', bildId: null };
  if (typ === 'abstimmung') Object.assign(f, { antworten: [{ text: '' }, { text: '' }, { text: '' }], mehrere: false });
  if (typ === 'wortwolke') f.proPerson = 1;
  if (typ === 'skala') Object.assign(f, { aussagen: [''], min: 1, max: 5, links: '', rechts: '' });
  if (typ === 'rangfolge' || typ === 'punkte') f.elemente = ['', '', ''];
  if (typ === 'inhalt') f.inhalt = '';
  return f;
}

export function neuePraesentation(sprache = 'de') {
  return { id: null, art: ART, titel: '', fach: '', sprache, freigegeben: false, fragen: [] };
}

/** Mängel einer Präsentation: [{ frage: Nummer | null, code }]. Leer = bereit. */
export function folienFehler(p) {
  const fehler = [];
  if (leer(p.titel)) fehler.push({ frage: null, code: 'titel' });
  if (!Array.isArray(p.fragen) || !p.fragen.length) fehler.push({ frage: null, code: 'keineFolien' });
  (p.fragen || []).forEach((f, nr) => {
    const melde = code => fehler.push({ frage: nr, code });
    if (!FOLIEN.includes(f.typ)) { melde('typ'); return; }
    if (leer(f.text)) melde('folieText');
    if (f.typ === 'abstimmung') {
      const a = f.antworten || [];
      if (a.length < 2 || a.length > 6 || a.some(x => leer(x.text))) melde('antworten');
    } else if (f.typ === 'wortwolke') {
      if (!Number.isInteger(f.proPerson) || f.proPerson < 1 || f.proPerson > WORTE_MAX) melde('proPerson');
    } else if (f.typ === 'skala') {
      const a = f.aussagen || [];
      if (a.length < 1 || a.length > 6 || a.some(leer)) melde('aussagen');
      if (!(f.min === 0 || f.min === 1) || !SKALA_GRENZEN.includes(f.max)) melde('skala');
    } else if (f.typ === 'rangfolge' || f.typ === 'punkte') {
      const e = f.elemente || [];
      const verschieden = new Set(e.map(x => String(x).trim().toLowerCase())).size === e.length;
      if (e.length < 2 || e.length > 6 || e.some(leer) || !verschieden) melde('elemente');
    }
  });
  return fehler;
}

/** Was die Handys von einer Folie sehen. */
export function oeffentlicheFolie(f, nr) {
  const o = { nr, typ: f.typ, text: text(f.text), hatBild: !!f.bildId };
  if (f.typ === 'abstimmung') Object.assign(o, { antworten: f.antworten.map(a => a.text), mehrere: !!f.mehrere });
  if (f.typ === 'wortwolke') o.proPerson = f.proPerson;
  if (f.typ === 'skala') Object.assign(o, { aussagen: [...f.aussagen], min: f.min, max: f.max, links: text(f.links), rechts: text(f.rechts) });
  if (f.typ === 'rangfolge' || f.typ === 'punkte') o.elemente = [...f.elemente];
  if (f.typ === 'inhalt') o.inhalt = text(f.inhalt);
  return o;
}

// ---------- Antworten bereinigen (sie kommen von fremden Handys) ----------
const ganzIn = (w, von, bis) => Number.isInteger(w) && w >= von && w <= bis;
const saubererText = (w, max) => (typeof w === 'string' ? w.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Wörter der Wortwolke: getrimmt, kurz, ohne Doppelte (nach Schreibweise). */
export function saubereWoerter(wert, proPerson = WORTE_MAX) {
  const liste = Array.isArray(wert) ? wert : [wert];
  const gesehen = new Set(), raus = [];
  for (const w of liste) {
    const t = saubererText(w, WORT_MAX), k = normalisiere(t);
    if (!k || gesehen.has(k)) continue;
    gesehen.add(k);
    raus.push(t);
    if (raus.length >= proPerson) break;
  }
  return raus;
}

/** Bereinigter Wert einer Antwort oder null, wenn sie nicht zur Folie passt. */
export function sauberWert(f, wert) {
  switch (f.typ) {
    case 'abstimmung': {
      const n = f.antworten.length;
      if (!f.mehrere) return ganzIn(wert, 0, n - 1) ? wert : null;
      if (!Array.isArray(wert)) return null;
      const liste = [...new Set(wert.filter(w => ganzIn(w, 0, n - 1)))].sort((a, b) => a - b);
      return liste.length ? liste : null;
    }
    case 'wortwolke': {
      const w = saubereWoerter(wert, f.proPerson || 1);
      return w.length ? w : null;
    }
    case 'skala': {
      if (!Array.isArray(wert) || wert.length !== f.aussagen.length) return null;
      return wert.every(w => ganzIn(w, f.min, f.max)) ? [...wert] : null;
    }
    case 'offen': {
      const t = saubererText(wert, OFFEN_MAX);
      return t || null;
    }
    case 'rangfolge': {
      const n = f.elemente.length;
      if (!Array.isArray(wert) || wert.length !== n || !wert.every(w => ganzIn(w, 0, n - 1))) return null;
      return new Set(wert).size === n ? [...wert] : null;
    }
    case 'punkte': {
      if (!Array.isArray(wert) || wert.length !== f.elemente.length || !wert.every(w => ganzIn(w, 0, PUNKTE_SUMME))) return null;
      const summe = wert.reduce((s, w) => s + w, 0);
      return summe > 0 && summe <= PUNKTE_SUMME ? [...wert] : null;
    }
    default:
      return null;
  }
}

/**
 * Pro Person zählt die erste brauchbare Antwort. Ist «spieler» gegeben, nur von Beigetretenen.
 * antworten: [{ schluessel, wert, zeit }] → [{ schluessel, wert, zeit }]
 */
export function stimmen(f, antworten, spieler) {
  const bekannt = spieler ? new Set(spieler.map(s => s.schluessel)) : null;
  const erste = new Map();
  for (const a of [...(antworten || [])].sort((x, y) => (x.zeit || 0) - (y.zeit || 0))) {
    if (!a || typeof a.schluessel !== 'string' || erste.has(a.schluessel)) continue;
    if (bekannt && !bekannt.has(a.schluessel)) continue;
    const wert = sauberWert(f, a.wert);
    if (wert !== null) erste.set(a.schluessel, { schluessel: a.schluessel, wert, zeit: a.zeit || 0 });
  }
  return [...erste.values()];
}

const runde = (z, stellen = 1) => Math.round(z * 10 ** stellen) / 10 ** stellen;

/** Ergebnis einer Folie aus den Stimmen. «anzahl» = Personen mit Antwort. */
export function auswerten(f, liste) {
  const anzahl = liste.length;
  switch (f.typ) {
    case 'abstimmung': {
      const zaehlung = f.antworten.map(() => 0);
      for (const s of liste) for (const i of (Array.isArray(s.wert) ? s.wert : [s.wert])) zaehlung[i]++;
      return { anzahl, zaehlung };
    }
    case 'wortwolke': {
      const gruppen = new Map();
      for (const s of liste) for (const w of s.wert) {
        const k = normalisiere(w);
        const g = gruppen.get(k) || { text: w, anzahl: 0, erst: s.zeit };
        g.anzahl++;
        gruppen.set(k, g);
      }
      const woerter = [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl || a.erst - b.erst).slice(0, WOLKE_MAX)
        .map(({ text: t, anzahl: n }) => ({ text: t, anzahl: n }));
      return { anzahl, woerter };
    }
    case 'skala': {
      const stufen = f.max - f.min + 1;
      const aussagen = f.aussagen.map((_, i) => {
        const verteilung = Array(stufen).fill(0);
        let summe = 0;
        for (const s of liste) { verteilung[s.wert[i] - f.min]++; summe += s.wert[i]; }
        return { schnitt: anzahl ? runde(summe / anzahl) : null, verteilung };
      });
      return { anzahl, aussagen };
    }
    case 'offen':
      return { anzahl, texte: [...liste].sort((a, b) => b.zeit - a.zeit).map(s => ({ schluessel: s.schluessel, text: s.wert, zeit: s.zeit })) };
    case 'rangfolge': {
      const n = f.elemente.length;
      // Platz 1 gibt n Punkte, der letzte Platz 1 Punkt. Sortiert wird nach dem durchschnittlichen Platz.
      const platzSumme = Array(n).fill(0);
      for (const s of liste) s.wert.forEach((element, platz) => { platzSumme[element] += platz + 1; });
      const rang = f.elemente.map((_, i) => ({ i, schnitt: anzahl ? runde(platzSumme[i] / anzahl) : null, punkte: anzahl * (n + 1) - platzSumme[i] }))
        .sort((a, b) => b.punkte - a.punkte || a.i - b.i);
      return { anzahl, rang };
    }
    case 'punkte': {
      const summe = f.elemente.map(() => 0);
      for (const s of liste) s.wert.forEach((w, i) => { summe[i] += w; });
      const reihe = f.elemente.map((_, i) => ({ i, summe: summe[i], schnitt: anzahl ? runde(summe[i] / anzahl) : 0 }))
        .sort((a, b) => b.summe - a.summe || a.i - b.i);
      return { anzahl, reihe };
    }
    default:
      return { anzahl: 0 };
  }
}

/** Offene Antworten ohne die ausgeblendeten (Moderation am Beamer). */
export function ohneAusgeblendete(ergebnis, ausgeblendet = []) {
  if (!ergebnis || !Array.isArray(ergebnis.texte)) return ergebnis;
  const weg = new Set(ausgeblendet);
  return { ...ergebnis, texte: ergebnis.texte.filter(e => !weg.has(e.schluessel)) };
}

// ---------- Sitzung ----------
export function neueSitzung(p, hostUid) {
  return {
    oeffentlich: {
      art: ART, hostUid, quizTitel: p.titel, sprache: p.sprache || 'de', status: 'warteraum', stand: 0,
      folieNr: -1, folieAnzahl: p.fragen.length, folie: null, frageStart: null, geschlossen: {},
    },
    // Eingefroren wie beim Quiz: Änderungen im Editor wirken erst in der nächsten Sitzung.
    privat: { quizId: p.id, quiz: JSON.parse(JSON.stringify(p)), ausgeblendet: {} },
  };
}

/** Änderung des öffentlichen Stands, um auf Folie nr zu wechseln. */
export function folieWechsel(p, nr, stand, serverzeit) {
  return { status: 'folie', folieNr: nr, folie: oeffentlicheFolie(p.fragen[nr], nr), frageStart: serverzeit, stand: (stand || 0) + 1 };
}

/** Ist eine Folie für Antworten geschlossen? (Die Lehrperson kann jede Folie schliessen und wieder öffnen.) */
export const istGeschlossen = (sitzung, nr) => !!(sitzung && sitzung.geschlossen && sitzung.geschlossen[String(nr)]);

/** Fürs Handy: Ist ein Stand neuer als der bisherige? Vor und zurück blättern zählt beides als neu (Zähler «stand»). */
export function istNeuerStand(neu, alt) {
  if (neu === undefined) return false;
  if (alt === undefined) return true;
  if (neu === null || alt === null) return neu !== alt;
  if (typeof neu.erstellt === 'number' && typeof alt.erstellt === 'number' && Math.abs(neu.erstellt - alt.erstellt) > 1000) return true;
  if (neu.status === 'ende' && alt.status !== 'ende') return true;
  return (neu.stand || 0) > (alt.stand || 0);
}

/** Rückblick: die Ergebnisse aller Folien mit Antworten, ohne Kennungen der Handys und ohne Ausgeblendetes. */
export function praesentationsRueckblick(p, ergebnisse, teilnehmende, datum, ausgeblendet = {}) {
  return {
    art: ART, quizId: p.id, quizTitel: p.titel, datum, spieler: teilnehmende,
    folien: p.fragen.flatMap((f, nr) => {
      const e = ergebnisse[nr];
      if (!istInteraktiv(f) || !e) return [];
      let ergebnis = ohneAusgeblendete(e, ausgeblendet[nr] || []);
      if (ergebnis.texte) ergebnis = { ...ergebnis, texte: ergebnis.texte.map(({ text: t, zeit }) => ({ text: t, zeit })) };
      return [{ ...oeffentlicheFolie(f, nr), ergebnis }];
    }),
  };
}

/** Eine kleine Präsentation zum Ausprobieren. */
export function beispielPraesentation(sprache = 'de') {
  const de = sprache !== 'en';
  const f = (typ, text, rest = {}) => ({ ...neueFolie(typ), text, ...rest });
  return {
    ...neuePraesentation(de ? 'de' : 'en'),
    titel: de ? 'Beispiel: Einstieg in die Lektion' : 'Sample: Starting the lesson',
    fach: de ? 'Beispiel' : 'Sample',
    fragen: [
      f('inhalt', de ? 'Willkommen!' : 'Welcome!', { inhalt: de ? 'Handy bereit? Code scannen und mitmachen.\nAlle Antworten sind anonym.' : 'Phone ready? Scan the code and join in.\nAll answers are anonymous.' }),
      f('wortwolke', de ? 'Was kommt dir zuerst in den Sinn, wenn du an «Gastfreundschaft» denkst?' : 'What comes to mind first when you think of «hospitality»?', { proPerson: 3 }),
      f('abstimmung', de ? 'Wie bist du heute zur Schule gekommen?' : 'How did you get to school today?',
        { antworten: (de ? ['Zu Fuss', 'Bus oder Zug', 'Auto', 'Velo'] : ['On foot', 'Bus or train', 'Car', 'Bike']).map(t => ({ text: t })) }),
      f('skala', de ? 'Wie sicher fühlst du dich?' : 'How confident do you feel?',
        { aussagen: de ? ['Mise en place planen', 'Rezepte umrechnen', 'Hygiene im Service'] : ['Planning mise en place', 'Scaling recipes', 'Hygiene in service'], min: 1, max: 5,
          links: de ? 'unsicher' : 'unsure', rechts: de ? 'sehr sicher' : 'very confident' }),
      f('rangfolge', de ? 'Was ist dir an einem Arbeitsplatz am wichtigsten?' : 'What matters most to you in a job?',
        { elemente: de ? ['Lohn', 'Team', 'Arbeitszeiten', 'Weiterbildung'] : ['Pay', 'Team', 'Working hours', 'Training'] }),
      f('punkte', de ? 'Verteile 100 Punkte: Wofür sollen wir in der nächsten Lektion Zeit einsetzen?' : 'Share out 100 points: what should we spend time on next lesson?',
        { elemente: de ? ['Theorie', 'Übungen', 'Fragen klären'] : ['Theory', 'Exercises', 'Questions'] }),
      f('offen', de ? 'Was möchtest du mir noch sagen?' : 'Anything else you would like to tell me?'),
    ],
  };
}
