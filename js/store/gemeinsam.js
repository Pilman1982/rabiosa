// Was beide Speicher (Demo und Firebase) teilen.

/** Platzhalter für «jetzt, laut Server» in spiel.aktualisieren(). */
export const SERVERZEIT = '__serverzeit__';

export const TAG_MS = 24 * 3600 * 1000;

/**
 * Fehler mit einer Kennung, zu der es in i18n.js einen Text «fehler.<code>» gibt
 * (ausser den internen: schonGeantwortet, nichtGefunden, verboten).
 */
export function fehler(code, ursache) {
  const e = new Error('rabiosa:' + code);
  e.code = code;
  if (ursache) e.cause = ursache;
  return e;
}

export const spielCode = (zufall = Math.random) => String(Math.floor(zufall() * 900000) + 100000);

export function zufallsKennung(laenge = 24) {
  const zeichen = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(laenge);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => zeichen[b % zeichen.length]).join('');
}
