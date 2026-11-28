// Whiteboard: Präsentieren. Reine Helfer (Schritte, Ausschnitt, Zugang). Ohne Datenbank und ohne Oberfläche.
import { zonenRaster } from './tafel.js';

/** Das Rechteck in Board-Einheiten, das ein Schritt zeigt: das ganze Board oder eine Zone. */
export function schrittRechteck(schritt, zonenAnzahl) {
  const raster = zonenRaster(zonenAnzahl);
  const z = typeof schritt === 'number' ? raster.zonen[schritt] : null;
  return z ? { x: z.x, y: z.y, b: z.b, h: z.h } : { x: 0, y: 0, b: raster.b, h: raster.h };
}

/** Massstab und Versatz, damit das Rechteck die Fläche füllt (Seitenverhältnis bleibt, mittig, Rand ringsum). */
export function passeRechteck(r, flaecheB, flaecheH, rand = 0) {
  const s = Math.max(0.01, Math.min((flaecheB - 2 * rand) / r.b, (flaecheH - 2 * rand) / r.h)) || 0.01;
  return { s, x: (flaecheB - r.b * s) / 2 - r.x * s, y: (flaecheH - r.h * s) / 2 - r.y * s };
}

/** Beschriftung je Schritt: «Gesamt», «1 Inspiration», … Ohne Zonentitel steht «Zone 1» (zoneText(n)). */
export function schrittTexte(schritte, zonen, gesamtText, zoneText) {
  const liste = Array.isArray(zonen) ? zonen : [];
  return schritte.map(s => {
    if (s === 'gesamt') return gesamtText;
    const titel = String((liste[s] && liste[s].text) || '').trim();
    return (s + 1) + ' ' + (titel || zoneText(s + 1));
  });
}

/** Nächster Schritt in Richtung ±1, begrenzt auf 0 … anzahl-1. */
export const blaettere = (i, richtung, anzahl) => Math.max(0, Math.min(Math.max(0, anzahl - 1), i + richtung));

/** Ziffer 1 bis 8 → Gruppen-Nummer (ab 0), sonst -1; nur im Rahmen der vorhandenen Gruppen. */
export function gruppeVonZiffer(taste, gruppenAnzahl) {
  if (!/^[1-8]$/.test(String(taste))) return -1;
  const g = Number(taste) - 1;
  return g < gruppenAnzahl ? g : -1;
}

/**
 * Darf gezeigt werden? Ergebnis: 'laedt' | 'weg' | 'fremd' | 'wartet' | 'beendet' | 'ok'.
 * Leitung: nur die eigene Sitzung, jede Gruppe. Gast (leitung = false): nur die eigene Gruppe, erst ab Abgeben, nur bei offener Sitzung.
 * konto = { uid } der Leitung, ich = Mitglied (Gast).
 */
export function zeigenZugang({ leitung, sitzung, konto, ich, gruppe }) {
  if (sitzung === undefined) return 'laedt';
  if (sitzung === null) return 'weg';
  if (leitung) {
    if (konto === undefined) return 'laedt';
    if (!konto || sitzung.hostUid !== konto.uid) return 'fremd';
    return gruppe >= 0 && gruppe < (sitzung.gruppen || []).length ? 'ok' : 'weg';
  }
  if (ich === undefined) return 'laedt';
  if (!ich || !Number.isInteger(ich.gruppe) || ich.gruppe >= (sitzung.gruppen || []).length) return 'weg';
  if (sitzung.status !== 'offen') return 'beendet';
  return (sitzung.gesperrt || []).includes(ich.gruppe) ? 'ok' : 'wartet';
}
