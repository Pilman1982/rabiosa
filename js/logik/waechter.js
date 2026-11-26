// Wächter fürs Handy: Steht die Live-Verbindung still (Bildschirm war gesperrt, Netz hat gewechselt),
// sieht das Handy selbst nach, wie weit das Spiel ist. Hier steht nur die Logik; das Nachsehen selbst
// macht der Speicher (store.spiel.nachsehen), das Takten die Handy-Ansicht.

/** So lange wartet das Handy ohne neuen Stand, bis es selbst nachsieht. Jedes Nachsehen kostet einen Lesezugriff. */
export const NACHSEHEN_MS = 10_000;
/** Kürzere Pause, solange nicht bewiesen ist, dass die Live-Verbindung liefert (siehe vertrauen). */
export const NACHSEHEN_SCHNELL_MS = 2_500;
/** Beim Laden, solange noch gar kein Stand da ist: nicht auf die Live-Verbindung warten. */
export const ERSTER_STAND_MS = 2_000;
/** Nach dem Aufwachen (Bildschirm an, wieder online) wird sofort nachgesehen, aber höchstens so oft. */
export const WECK_PAUSE_MS = 1500;
/** Kommt eine Frage später als so nach ihrem Start an, gilt die Live-Verbindung als zu langsam. */
export const LIVE_SPAET_MS = 3_000;

/**
 * Vertrauen in die Live-Verbindung, gezählt als Schuld: Bei 0 liefert sie, das Handy sieht nur selten selbst nach.
 * Am Anfang ist nichts bewiesen (eine pünktliche Lieferung genügt). Nach einem Aussetzer braucht es drei.
 */
export const SCHULD_START = 1;
const SCHULD_VERPASST = 3;
export function vertrauen(schuld, ereignis) {
  if (ereignis === 'verpasst') return SCHULD_VERPASST;
  if (ereignis === 'geliefert') return Math.max(0, schuld - 1);
  return schuld;
}

/** Pause zwischen zwei Blicken. Liegt ein Handy lange offen, ohne dass sich etwas tut, fragt es immer seltener. */
export function nachsehTakt(schuld, seitKontakt = 0) {
  if (seitKontakt > 30 * 60_000) return 60_000;
  if (seitKontakt > 5 * 60_000) return NACHSEHEN_MS;
  return schuld > 0 ? NACHSEHEN_SCHNELL_MS : NACHSEHEN_MS;
}

/** Kam eine Frage über die Live-Verbindung deutlich nach ihrem Start an? «jetzt» nach der Uhr des Servers. */
export function liveSpaet(spiel, jetzt) {
  return !!spiel && spiel.status === 'frage' && typeof spiel.frageStart === 'number' && jetzt - spiel.frageStart > LIVE_SPAET_MS;
}

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
 * Jetzt nachsehen? Nur bei sichtbarer Seite. Nach dem Aufwachen und beim Laden (noch kein Stand) sofort; sonst nur,
 * wenn das Handy auf die Lehrperson wartet und seit «takt» weder ein Stand gekommen ist noch nachgesehen wurde.
 */
export function sollNachsehen({ sichtbar, wartet, geweckt, ohneStand, seitKontakt, seitNachsehen, takt = NACHSEHEN_MS }) {
  if (!sichtbar) return false;
  if (geweckt) return seitNachsehen >= WECK_PAUSE_MS;
  if (ohneStand) return seitNachsehen >= ERSTER_STAND_MS;
  return !!wartet && seitKontakt >= takt && seitNachsehen >= takt;
}
