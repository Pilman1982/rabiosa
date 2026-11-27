// Ablage der freigegebenen Quiz: zuoberst das Fach, darunter frei wählbare Ordner («HS26/Final»), dazu die Suche.
// Die Ordner stehen als Text im Quiz (Feld «ordner»). Wer denselben Text schreibt, legt im selben Ordner ab.

export const ORDNER_TIEFE = 4;
export const ORDNER_LAENGE = 80;

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

/** Was in einem Ordner liegt: seine Unterordner (mit der Zahl aller Quiz darunter) und die Quiz genau dieser Stufe. */
export function inhaltVon(quizze, pfad, ohneFach) {
  const ziel = pfad.map(gleich);
  const ordner = new Map();   // Vergleichsform -> { name, anzahl }
  const hier = [];
  for (const quiz of quizze) {
    const p = pfadVon(quiz, ohneFach);
    if (p.length < ziel.length || ziel.some((teil, i) => gleich(p[i]) !== teil)) continue;
    if (p.length === ziel.length) { hier.push(quiz); continue; }
    const name = p[ziel.length], k = gleich(name);
    if (!ordner.has(k)) ordner.set(k, { name, anzahl: 0 });
    ordner.get(k).anzahl++;
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
    teile.push(f.text, f.erklaerung);
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
