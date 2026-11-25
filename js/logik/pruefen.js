// Prüft eine Antwort. Ergebnis: Anteil 0..1 (null = keine Wertung, z. B. Umfrage).

export function normalisiere(text) {
  if (typeof text !== 'string') return '';
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function leseZahl(text) {
  const s = String(text ?? '').replace(/['’\s]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const ganzzahlIn = (w, n) => Number.isInteger(w) && w >= 0 && w < n;

export function anteil(frage, wert, mischung) {
  switch (frage.typ) {
    case 'umfrage':
      return null;
    case 'mc':
      return ganzzahlIn(wert, frage.antworten.length) && frage.antworten[wert].richtig ? 1 : 0;
    case 'wf':
      return wert === frage.richtig ? 1 : 0;
    case 'mehrfach': {
      if (!Array.isArray(wert)) return 0;
      const gewaehlt = new Set(wert.filter(w => ganzzahlIn(w, frage.antworten.length)));
      const anzahlRichtige = frage.antworten.filter(a => a.richtig).length;
      let saldo = 0;
      for (const i of gewaehlt) saldo += frage.antworten[i].richtig ? 1 : -1;
      return anzahlRichtige ? Math.max(0, saldo) / anzahlRichtige : 0;
    }
    case 'schaetz': {
      if (typeof wert !== 'number' || !Number.isFinite(wert)) return 0;
      const abstand = Math.abs(wert - frage.wert);
      if (abstand === 0) return 1;
      if (!(frage.toleranz > 0) || abstand > frage.toleranz) return 0;
      return 1 - 0.5 * abstand / frage.toleranz;
    }
    case 'reihe': {
      const n = frage.elemente.length;
      if (!Array.isArray(wert) || !Array.isArray(mischung) || wert.length !== n) return 0;
      if (new Set(wert.filter(w => ganzzahlIn(w, n))).size !== n) return 0;
      return wert.filter((gemischt, platz) => mischung[gemischt] === platz).length / n;
    }
    case 'kurz': {
      const eingabe = normalisiere(wert);
      return eingabe && frage.loesungen.some(l => normalisiere(l) === eingabe) ? 1 : 0;
    }
    default:
      return 0;
  }
}
