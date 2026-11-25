// Wächter fürs Handy: Steht die Live-Verbindung still (Bildschirm war gesperrt, Netz hat gewechselt),
// sieht das Handy selbst nach, wie weit das Spiel ist. Hier steht nur die Logik; das Nachsehen selbst
// macht der Speicher (store.spiel.nachsehen), das Takten die Handy-Ansicht.

/** So lange wartet das Handy ohne neuen Stand, bis es selbst nachsieht. Jedes Nachsehen kostet einen Lesezugriff. */
export const NACHSEHEN_MS = 10_000;
/** Nach dem Aufwachen (Bildschirm an, wieder online) wird sofort nachgesehen, aber höchstens so oft. */
export const WECK_PAUSE_MS = 1500;

/** Wie weit ein Spiel ist. Ein Spiel läuft nur vorwärts: Warteraum, Frage 0, Auflösung 0, Frage 1, … Podest, Ende. */
export function fortschritt(spiel) {
  if (!spiel) return -1;
  const nr = Number.isInteger(spiel.frageNr) && spiel.frageNr >= 0 ? spiel.frageNr : 0;
  switch (spiel.status) {
    case 'warteraum': return 0;
    case 'frage': return 1 + 2 * nr;
    case 'aufloesung': return 2 + 2 * nr;
    case 'podest': return 1_000_000;
    default: return 1_000_001;
  }
}

/** Unter demselben Code läuft ein anderes Spiel (deutlich anderer Startzeitpunkt). Eine Millisekunde ist Rundung. */
export function anderesSpiel(a, b) {
  return !!a && !!b && typeof a.erstellt === 'number' && typeof b.erstellt === 'number' && Math.abs(a.erstellt - b.erstellt) > 1000;
}

/** Soll ein nachgesehener Stand den bisherigen ersetzen? undefined = noch kein Stand, null = Spiel gibt es nicht. */
export function istNeuer(neu, alt) {
  if (neu === undefined) return false;
  if (alt === undefined) return true;
  if (neu === null || alt === null) return neu !== alt;
  return anderesSpiel(neu, alt) || fortschritt(neu) > fortschritt(alt);
}

/** Ein Stand der Live-Verbindung, der hinter dem bisherigen liegt (sie hinkt nach dem Nachsehen noch hinterher). */
export function istAelter(neu, alt) {
  if (!neu || !alt || anderesSpiel(neu, alt)) return false;
  return fortschritt(neu) < fortschritt(alt);
}

/**
 * Jetzt nachsehen? Nur bei sichtbarer Seite. Nach dem Aufwachen sofort; sonst nur, wenn das Handy auf die
 * Lehrperson wartet und seit NACHSEHEN_MS weder ein Stand gekommen ist noch nachgesehen wurde.
 */
export function sollNachsehen({ sichtbar, wartet, geweckt, seitKontakt, seitNachsehen }) {
  if (!sichtbar) return false;
  if (geweckt) return seitNachsehen >= WECK_PAUSE_MS;
  return !!wartet && seitKontakt >= NACHSEHEN_MS && seitNachsehen >= NACHSEHEN_MS;
}
