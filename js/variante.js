// Rabiosa gibt es zweimal mit demselben Programm: für Dozierende (Hauptseite) und für Studierende (Ordner student/).
// Welche Fassung läuft, sagt die Seite selbst: <html data-variante="student">. Jede Fassung hat ihr eigenes
// Firebase-Projekt (js/config.js), also eigene Konten, eigene Quiz und einen eigenen Raum für Freigaben.

export function varianteVon(dokument) {
  return dokument?.documentElement?.dataset?.variante === 'student' ? 'student' : 'lehre';
}

export const VARIANTE = varianteVon(globalThis.document);
export const IST_STUDENT = VARIANTE === 'student';
/** Steht neben dem Namen «RABIOSA». */
export const ZUSATZ = IST_STUDENT ? 'Student' : '';
/** Whiteboards gibt es nur in der Fassung der Dozierenden. */
export const zeigeWhiteboard = variante => variante !== 'student';
