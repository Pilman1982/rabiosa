// Whiteboard: reine Hilfen der Ergebnisliste im Studio (Speicher, Zeilenstand), ohne Oberfläche.
import { codeText } from './tafeluebersicht.js';

/** Megabyte mit einer Dezimalstelle (1 MB = 1024 × 1024 Bytes), Komma auf Deutsch. */
export function megabyte(bytes, sprache) {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const text = (n / 1048576).toFixed(1);
  return sprache === 'en' ? text : text.replace('.', ',');
}

/** Summe der Zähler aller Gruppen: { bilder, bytes }. */
export function speicherSumme(zaehler) {
  const zahl = v => (Number.isFinite(v) && v > 0 ? v : 0);
  let bilder = 0, bytes = 0;
  for (const z of Array.isArray(zaehler) ? zaehler : []) { if (z) { bilder += zahl(z.bilder); bytes += zahl(z.bytes); } }
  return { bilder, bytes };
}

/** Was eine Zeile der Liste von der Sitzung zeigt. */
export const zeilenStand = s => ({
  code: s.code, codeText: codeText(s.code), offen: s.status === 'offen',
  gruppen: Array.isArray(s.gruppen) ? s.gruppen.length : 0, erstellt: s.erstellt,
});

/** Überschrift der Ergebnisse: Titel der Vorlage; ist sie weg (gelöscht, nicht mehr freigegeben), der aus einer Sitzung. */
export function ergebnisTitel(vorlage, sitzungen, ersatz) {
  return (vorlage && vorlage.titel) || (Array.isArray(sitzungen) ? sitzungen.find(x => x && x.titel)?.titel : '') || ersatz;
}
