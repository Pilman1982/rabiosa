// Whiteboard: Gruppen-Boards mit Zonen. Reine Regeln ohne Datenbank und ohne Oberfläche.
// Eine Vorlage ist ein Quiz-Dokument mit art: 'whiteboard'; die Zonen stehen im Feld «fragen»
// (so gelten dieselben Datenbank-Regeln, dieselbe Ablage, Suche, Freigabe und Kopie wie bei Quiz).
export const ART = 'whiteboard';
export const ZONEN_MAX = 6;
export const GRUPPEN_MIN = 2, GRUPPEN_MAX = 8, GRUPPEN_VORGABE = 5;
export const NAME_MAX = 16;                  // Zeichen des Vornamens
export const GIF_MAX = 8 * 1024 * 1024;      // Bytes pro GIF
export const BILD_KANTE = 2000;              // lange Seite statischer Bilder nach dem Verkleinern
export const BILDER_MAX = 40;                // Bilder pro Board
export const BYTES_MAX = 100 * 1024 * 1024;  // Bytes aller Bilder pro Board
export const ZONE_B = 1600, ZONE_H = 900;    // eine Zone in Board-Einheiten (16:9)
export const TEXT_MAX = 2000;
export const PUNKTE_MAX = 2000;              // Zahlen, also 1000 Punkte
export const ONLINE_MS = 70_000;
export const AUFTRAG_MAX = 600, ZONE_TITEL_MAX = 40, ZONE_HINWEIS_MAX = 160;
export const SCHRITTE_MAX = 100;
export const BILDARTEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ELEMENTARTEN = ['zettel', 'text', 'strich', 'pfeil', 'form', 'bild', 'sticker'];
export const FARBEN = {
  stift: ['#001436', '#B6633F', '#005779', '#5EC7F0', '#919388'],   // Navy, Kupfer, Petrol, Hellblau, Grau
  zettel: ['#FFF6C9', '#FDE2D6', '#DFF3FB', '#E3EFE4', '#EEE8F5'],
};

/**
 * Wartezeiten, bevor eine verweigerte Beobachtung eines Mitglieds neu angemeldet wird (Beitritt noch nicht beim
 * Server angekommen). Nur wenige Versuche, nie sofort.
 */
export const NEUSTART_WARTEN_MS = [1000, 3000, 8000, 20000];
/** Wartezeit vor dem Versuch Nummer «versuch» (ab 0), null = kein Versuch mehr. */
export const neustartWarten = versuch =>
  (Number.isInteger(versuch) && versuch >= 0 && versuch < NEUSTART_WARTEN_MS.length ? NEUSTART_WARTEN_MS[versuch] : null);

export const istWhiteboard = q => !!q && q.art === ART;

const leer = s => typeof s !== 'string' || !s.trim();

export function neueTafelVorlage(sprache = 'de') {
  return { id: null, art: ART, titel: '', fach: '', sprache, freigegeben: false, auftrag: '', gruppenVorgabe: GRUPPEN_VORGABE, fragen: [] };
}

/** Eine kleine Vorlage zum Ausprobieren (Sie-Form für Studierende). */
export function beispielTafel(sprache = 'de') {
  const de = sprache !== 'en';
  const zone = (text, inhalt) => ({ typ: 'zone', text, inhalt });
  return {
    ...neueTafelVorlage(de ? 'de' : 'en'),
    titel: de ? 'Beispiel: Signature Dish' : 'Sample: Signature dish',
    fach: de ? 'Beispiel' : 'Sample',
    auftrag: de
      ? 'Entwickeln Sie in Ihrer Gruppe ein Signature Dish für unser Schulhotel. Sammeln Sie Ideen, wählen Sie saisonale Zutaten und halten Sie das Ergebnis im Feld «Unser Gericht» fest.'
      : 'Develop a signature dish for our school hotel in your group. Collect ideas, choose seasonal ingredients and record the result in the field "Our dish".',
    gruppenVorgabe: GRUPPEN_VORGABE,
    fragen: de ? [
      zone('Inspiration', 'Sammeln Sie Bilder, Gerichte und Stimmungen, die Sie ansprechen.'),
      zone('Saison', 'Welche Produkte haben jetzt Saison? Halten Sie Ihre Auswahl fest.'),
      zone('Ideen', 'Schreiben Sie Ideen auf Zettel und ordnen Sie diese gemeinsam.'),
      zone('Unser Gericht', 'Beschreiben Sie Ihr Gericht in wenigen Sätzen und mit einer Skizze.'),
    ] : [
      zone('Inspiration', 'Collect pictures, dishes and moods that appeal to you.'),
      zone('Season', 'Which products are in season now? Note down your choice.'),
      zone('Ideas', 'Write ideas on notes and sort them together.'),
      zone('Our dish', 'Describe your dish in a few sentences and with a sketch.'),
    ],
  };
}

/** Mängel einer Vorlage: [{ frage: Nummer | null, code }]. Leer = bereit. */
export function tafelFehler(v) {
  const fehler = [];
  if (leer(v.titel)) fehler.push({ frage: null, code: 'titel' });
  const zonen = Array.isArray(v.fragen) ? v.fragen : [];
  if (zonen.length > ZONEN_MAX) fehler.push({ frage: null, code: 'zonenZuViele' });
  if (!Number.isInteger(v.gruppenVorgabe) || v.gruppenVorgabe < GRUPPEN_MIN || v.gruppenVorgabe > GRUPPEN_MAX) fehler.push({ frage: null, code: 'gruppen' });
  zonen.forEach((z, nr) => { if (!z || leer(z.text)) fehler.push({ frage: nr, code: 'zoneTitel' }); });
  return fehler;
}

// ---------- Zonen ----------
const SPALTEN = [1, 1, 2, 2, 2, 3, 3];   // nach Anzahl 0..6

/** Raster der Zonen: gelesen von links nach rechts, oben nach unten. n = 0 ergibt eine Fläche. */
export function zonenRaster(n) {
  const anzahl = Math.max(0, Math.min(ZONEN_MAX, Math.floor(n) || 0));
  const spalten = SPALTEN[anzahl];
  const sichtbar = Math.max(1, anzahl);
  const zeilen = Math.ceil(sichtbar / spalten);
  const zonen = Array.from({ length: sichtbar }, (_, i) => ({ x: (i % spalten) * ZONE_B, y: Math.floor(i / spalten) * ZONE_H, b: ZONE_B, h: ZONE_H }));
  return { spalten, zeilen, b: spalten * ZONE_B, h: zeilen * ZONE_H, zonen };
}

/** Index der Zone, in der die Mitte des Elements liegt; -1 ausserhalb. */
export function zoneVon(element, raster) {
  const mx = element.x + (element.b || 0) / 2, my = element.y + (element.h || 0) / 2;
  return raster.zonen.findIndex(z => mx >= z.x && mx < z.x + z.b && my >= z.y && my < z.y + z.h);
}

// ---------- Elemente ----------
const zahl = w => (typeof w === 'number' && Number.isFinite(w) ? Math.round(w * 10) / 10 : null);
const kurz = (w, max) => (typeof w === 'string' ? w.slice(0, max) : null);

/** Nur bekannte Felder und Arten; null, wenn das Element nicht brauchbar ist. */
export function saeubereElement(roh) {
  if (!roh || typeof roh !== 'object' || !ELEMENTARTEN.includes(roh.art)) return null;
  if (typeof roh.id !== 'string' || !roh.id || !Number.isInteger(roh.gruppe)) return null;
  const e = { id: roh.id, gruppe: roh.gruppe, art: roh.art };
  for (const f of ['x', 'y', 'b', 'h', 'z', 'bildBytes']) { const w = zahl(roh[f]); if (w !== null) e[f] = w; }
  if (roh.dicke === 1 || roh.dicke === 2 || roh.dicke === 3) e.dicke = roh.dicke;
  if (['S', 'M', 'L'].includes(roh.groesse)) e.groesse = roh.groesse;
  if (roh.form === 'rechteck' || roh.form === 'kreis') e.form = roh.form;
  for (const [f, max] of [['text', TEXT_MAX], ['farbe', 20], ['zeichen', 16], ['bildPfad', 300], ['von', 128], ['vonName', NAME_MAX]]) {
    const w = kurz(roh[f], max);
    if (w !== null) e[f] = w;
  }
  if (Array.isArray(roh.punkte)) {
    e.punkte = roh.punkte.slice(0, PUNKTE_MAX).map(zahl).filter(w => w !== null);
    if (e.punkte.length % 2) e.punkte.pop();
  }
  if (roh.bearbeitet === null) e.bearbeitet = null;
  else if (roh.bearbeitet && typeof roh.bearbeitet === 'object') e.bearbeitet = { uid: kurz(roh.bearbeitet.uid, 128) || '', name: kurz(roh.bearbeitet.name, NAME_MAX) || '' };
  return e;
}

/** Ramer-Douglas-Peucker auf der flachen Liste [x0, y0, x1, y1, …]; erster und letzter Punkt bleiben. */
export function vereinfache(punkte, toleranz = 2) {
  const n = punkte.length / 2;
  if (n < 3) return [...punkte];
  const behalte = new Array(n).fill(false);
  behalte[0] = behalte[n - 1] = true;
  const abstand = (i, a, b) => {
    const px = punkte[2 * i], py = punkte[2 * i + 1], ax = punkte[2 * a], ay = punkte[2 * a + 1], bx = punkte[2 * b], by = punkte[2 * b + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    return Math.abs(dy * (px - ax) - dx * (py - ay)) / Math.sqrt(l2);
  };
  const stapel = [[0, n - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop();
    let max = -1, wo = -1;
    for (let i = a + 1; i < b; i++) {
      const d = abstand(i, a, b);
      if (d > max) { max = d; wo = i; }
    }
    if (max > toleranz) { behalte[wo] = true; stapel.push([a, wo], [wo, b]); }
  }
  const raus = [];
  behalte.forEach((k, i) => { if (k) raus.push(punkte[2 * i], punkte[2 * i + 1]); });
  return raus;
}

// ---------- Bilder ----------
/** Grösse nach dem Verkleinern: lange Seite höchstens «kante», kleine Bilder bleiben. */
export function zielGroesse(b, h, kante = BILD_KANTE) {
  const lang = Math.max(b, h);
  if (lang <= kante) return { b, h };
  const f = kante / lang;
  return { b: Math.round(b * f), h: Math.round(h * f) };
}

/** null = in Ordnung, 'art' = keine erlaubte Bildart, 'gross' = GIF über dem Limit (statische Bilder werden verkleinert). */
export function bildPruefen({ type, size }) {
  if (!BILDARTEN.includes(type)) return 'art';
  return type === 'image/gif' && size > GIF_MAX ? 'gross' : null;
}

/** Darf ein weiteres Bild mit «bytes» auf das Board? zaehler = { bilder, bytes } der Gruppe. */
export function bildErlaubt(zaehler, bytes) {
  if ((zaehler.bilder || 0) >= BILDER_MAX) return 'anzahl';
  if ((zaehler.bytes || 0) + bytes > BYTES_MAX) return 'menge';
  return null;
}

// ---------- Mitglieder, Präsentation ----------
export const istOnline = (mitglied, jetzt) => !!mitglied && typeof mitglied.zuletzt === 'number' && jetzt - mitglied.zuletzt < ONLINE_MS;

/** Reihenfolge am Beamer: Gesamtbild, jede Zone, Gesamtbild. Ohne Zonen nur das Gesamtbild. */
export function praesentationsSchritte(zonenAnzahl) {
  return zonenAnzahl > 0 ? ['gesamt', ...Array.from({ length: zonenAnzahl }, (_, i) => i), 'gesamt'] : ['gesamt'];
}

// ---------- Rückgängig und Wiederholen ----------
// Ein Schritt ist { vorher: Element | null, nachher: Element | null }.
export const neuerStapel = () => ({ zurueck: [], vor: [] });
export const merke = (stapel, schritt) => ({ zurueck: [...stapel.zurueck, schritt].slice(-SCHRITTE_MAX), vor: [] });

export function rueckgaengig(stapel) {
  if (!stapel.zurueck.length) return null;
  const s = stapel.zurueck[stapel.zurueck.length - 1];
  return { stapel: { zurueck: stapel.zurueck.slice(0, -1), vor: [...stapel.vor, s] }, schritt: { vorher: s.nachher, nachher: s.vorher } };
}

export function wiederholen(stapel) {
  if (!stapel.vor.length) return null;
  const s = stapel.vor[stapel.vor.length - 1];
  return { stapel: { zurueck: [...stapel.zurueck, s].slice(-SCHRITTE_MAX), vor: stapel.vor.slice(0, -1) }, schritt: s };
}

// ---------- Sitzung ----------
/** Sitzung aus einer Vorlage; code und erstellt (Serverzeit) ergänzt die Ablage. */
export function sitzungAusVorlage(vorlage, gruppenNamen, hostUid) {
  return {
    hostUid, vorlageId: vorlage.id, titel: vorlage.titel, auftrag: vorlage.auftrag || '', sprache: vorlage.sprache || 'de',
    zonen: (vorlage.fragen || []).map(z => ({ text: z.text, inhalt: z.inhalt || '' })),
    gruppen: [...gruppenNamen], gesperrt: [], status: 'offen',
  };
}
