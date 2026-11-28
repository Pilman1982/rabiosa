// Ablage der freigegebenen Quiz: zuoberst das Fach, darunter frei wählbare Ordner («HS26/Final»), dazu die Suche.
// Die Ordner stehen als Text im Quiz (Feld «ordner»). Wer denselben Text schreibt, legt im selben Ordner ab.

export const ORDNER_TIEFE = 4;
export const ORDNER_LAENGE = 80;
export const FACH_LAENGE = 40;       // wie das Feld «Fach» im Editor
export const LEERE_MAX = 300;        // leere Ordner pro Person, wie in firestore.rules
export const ARTEN = ['quiz', 'praesentation', 'whiteboard'];

/** Zum Vergleichen: ohne Akzente, klein, ohne Rand. «Käse» und «KASE» sind derselbe Ordner. */
const gleich = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const ordne = (a, b) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

/** «  HS26 //  Final / » -> ['HS26', 'Final'] */
export function ordnerTeile(text) {
  return String(text ?? '').split(/[/\\>]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, ORDNER_TIEFE);
}

/** Wo ein Quiz liegt: [Fach, Ordner, Unterordner, …]. */
export function pfadVon(quiz, ohneFach) {
  return [String(quiz?.fach ?? '').trim() || ohneFach, ...ordnerTeile(quiz?.ordner)];
}

/**
 * Was in einem Ordner liegt: seine Unterordner (mit der Zahl aller Inhalte darunter) und die Inhalte genau dieser Stufe.
 * «leere» sind Einträge { fach, ordner } aus der Liste der leeren Ordner: Sie bilden Ordner, zählen aber nicht mit.
 */
export function inhaltVon(quizze, pfad, ohneFach, leere = []) {
  const ziel = pfad.map(gleich);
  const ordner = new Map();   // Vergleichsform -> { name, anzahl }
  const hier = [];
  const passt = p => p.length >= ziel.length && ziel.every((teil, i) => gleich(p[i]) === teil);
  const zaehle = (name, n) => {
    const k = gleich(name);
    if (!ordner.has(k)) ordner.set(k, { name, anzahl: 0 });
    ordner.get(k).anzahl += n;
  };
  for (const quiz of quizze) {
    const p = pfadVon(quiz, ohneFach);
    if (!passt(p)) continue;
    if (p.length === ziel.length) hier.push(quiz);
    else zaehle(p[ziel.length], 1);
  }
  for (const eintrag of leere) {
    const p = pfadVon(eintrag, ohneFach);
    if (passt(p) && p.length > ziel.length) zaehle(p[ziel.length], 0);
  }
  return {
    ordner: [...ordner.values()].sort((a, b) => ordne(a.name, b.name)),
    quizze: hier.sort((a, b) => ordne(String(a.titel ?? ''), String(b.titel ?? ''))),
  };
}

const kopfText = q => gleich([q?.titel, q?.fach, q?.ordner, q?.autor].filter(Boolean).join(' '));
function inhaltText(q) {
  const teile = [];
  for (const f of Array.isArray(q?.fragen) ? q.fragen : []) {
    if (!f) continue;
    teile.push(f.text, f.erklaerung, f.inhalt, f.links, f.rechts);
    for (const a of f.aussagen || []) teile.push(a);
    for (const a of f.antworten || []) teile.push(a?.text);
    for (const e of f.elemente || []) teile.push(e);
    for (const l of f.loesungen || []) teile.push(l);
  }
  return gleich(teile.filter(Boolean).join(' '));
}

/**
 * Alle Wörter der Anfrage müssen vorkommen: in Titel, Fach, Ordner oder Name der Person («Kopf») oder in den Fragen
 * und Antworten. Treffer, die ganz im Kopf liegen, stehen vorn.
 */
export function suche(quizze, anfrage) {
  const woerter = gleich(anfrage).split(/\s+/).filter(Boolean);
  if (!woerter.length) return [];
  const treffer = [];
  for (const quiz of quizze) {
    const kopf = kopfText(quiz);
    if (woerter.every(w => kopf.includes(w))) { treffer.push({ quiz, rang: 0 }); continue; }
    const alles = kopf + ' ' + inhaltText(quiz);
    if (woerter.every(w => alles.includes(w))) treffer.push({ quiz, rang: 1 });
  }
  return treffer.sort((a, b) => a.rang - b.rang || ordne(String(a.quiz.titel ?? ''), String(b.quiz.titel ?? ''))).map(x => x.quiz);
}

/** Alle benutzten Ablagen als Vorschläge fürs Eingabefeld, jede einmal. */
export function bekannteOrdner(quizze) {
  const gesehen = new Map();
  for (const quiz of quizze) {
    const text = ordnerTeile(quiz?.ordner).join('/');
    if (text && !gesehen.has(gleich(text))) gesehen.set(gleich(text), text);
  }
  return [...gesehen.values()].sort(ordne);
}

// ---------- Arten ----------

/** Ein Inhalt ohne gültiges Feld «art» ist ein Quiz (so war es vor der Präsentation). */
export const artVon = quiz => (ARTEN.includes(quiz?.art) ? quiz.art : 'quiz');

/** Nur die Inhalte einer Art; «alle» lässt alles durch. Die Reihenfolge bleibt. */
export const nachArt = (quizze, art) => quizze.filter(q => art === 'alle' || artVon(q) === art);

export function artZahlen(quizze) {
  const zahlen = { alle: quizze.length, quiz: 0, praesentation: 0, whiteboard: 0 };
  for (const q of quizze) zahlen[artVon(q)]++;
  return zahlen;
}

/** Die zuletzt geänderten Inhalte; ohne Datum zählen sie als ganz alt. */
export const zuletzt = (quizze, n = 5) => [...quizze]
  .sort((a, b) => (Number(b.geaendert) || 0) - (Number(a.geaendert) || 0) || ordne(String(a.titel ?? ''), String(b.titel ?? '')))
  .slice(0, n);

// ---------- Ordner verwalten ----------

/** Pfad im Studio (Fach zuerst) -> Felder des Inhalts. Der Ersatztext für «ohne Fach» wird wieder zu ''. */
export function zielVon(pfad, ohneFach) {
  if (!pfad.length) return { fach: '', ordner: '' };
  return { fach: gleich(pfad[0]) === gleich(ohneFach) ? '' : pfad[0], ordner: pfad.slice(1).join('/') };
}

/** Liegt ein Inhalt (oder Eintrag { fach, ordner }) auf oder unter diesem Pfad? */
export function istUnter(x, pfad, ohneFach) {
  const p = pfadVon(x, ohneFach);
  return p.length >= pfad.length && pfad.every((teil, i) => gleich(p[i]) === gleich(teil));
}

const sauber = name => String(name ?? '').trim().replace(/\s+/g, ' ');

/** Was gegen einen neuen Ordnernamen auf dieser Stufe spricht, oder null. «geschwister» = Namen auf derselben Stufe. */
export function ordnerNameFehler(name, pfad, geschwister) {
  const n = sauber(name);
  if (!n) return 'leer';
  if (/[/\\>]/.test(n)) return 'zeichen';
  if (pfad.length > ORDNER_TIEFE) return 'tief';
  if (pfad.length === 0 ? n.length > FACH_LAENGE : [...pfad.slice(1), n].join('/').length > ORDNER_LAENGE) return 'lang';
  if (geschwister.some(g => gleich(g) === gleich(n))) return 'doppelt';
  return null;
}

/**
 * Benennt den Ordner am Ende von «pfad» um (nicht das Fach): neue Felder für alle Inhalte darunter und die
 * angepasste Liste der leeren Ordner. Speichern tut die Ansicht.
 */
export function umbenennen(quizze, leere, pfad, neuerName, ohneFach) {
  if (pfad.length < 2) throw new Error('Nur Ordner unter einem Fach lassen sich umbenennen.');
  const neu = sauber(neuerName), stufe = pfad.length - 2;   // Stelle in ordnerTeile
  const mitNeuemNamen = x => { const teile = ordnerTeile(x.ordner); teile[stufe] = neu; return teile.join('/'); };
  const aenderungen = quizze.filter(q => istUnter(q, pfad, ohneFach))
    .map(q => ({ id: q.id, fach: q.fach ?? '', ordner: mitNeuemNamen(q) }));
  return {
    aenderungen,
    leere: leere.map(e => (istUnter(e, pfad, ohneFach) ? { fach: e.fach ?? '', ordner: mitNeuemNamen(e) } : e)),
  };
}

/** Leere Ordner auf und unter dem Pfad aus der Liste nehmen. */
export const ordnerEntfernen = (leere, pfad, ohneFach) => leere.filter(e => !istUnter(e, pfad, ohneFach));

/** Liste der leeren Ordner sauber halten: ohne Doppel, ohne Ordner, in denen etwas liegt, höchstens LEERE_MAX. */
export function leereAufraeumen(leere, quizze, ohneFach) {
  const gesehen = new Set(), rest = [];
  for (const e of Array.isArray(leere) ? leere : []) {
    const eintrag = { fach: String(e?.fach ?? ''), ordner: String(e?.ordner ?? '') };
    const p = pfadVon(eintrag, ohneFach), k = p.map(gleich).join('/');
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    if (quizze.some(q => istUnter(q, p, ohneFach))) continue;
    rest.push(eintrag);
  }
  return rest.slice(-LEERE_MAX);
}

/** Alle Ordner (auch Fächer und Zwischenstufen) für die Auswahl beim Verschieben, Stufe für Stufe sortiert. */
export function alleOrdner(quizze, leere, ohneFach) {
  const pfade = new Map();
  for (const x of [...quizze, ...leere]) {
    const p = pfadVon(x, ohneFach);
    for (let i = 1; i <= p.length; i++) {
      const k = p.slice(0, i).map(gleich).join('/');
      if (!pfade.has(k)) pfade.set(k, p.slice(0, i));
    }
  }
  const vergleiche = (a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const v = ordne(a[i], b[i]); if (v) return v; }
    return a.length - b.length;
  };
  return [...pfade.values()].sort(vergleiche);
}

/** Was in die Datenbank geht: nur { fach, ordner } als Text in den Grenzen des Editors, höchstens LEERE_MAX. */
export const saubereOrdnerliste = liste => (Array.isArray(liste) ? liste : []).slice(-LEERE_MAX)
  .map(e => ({ fach: String(e?.fach ?? '').slice(0, FACH_LAENGE), ordner: String(e?.ordner ?? '').slice(0, ORDNER_LAENGE) }));
