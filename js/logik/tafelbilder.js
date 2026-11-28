// Whiteboard: reine Regeln für Bilder und Sticker (ohne Oberfläche, ohne Speicher).

export const BILD_START = 600;       // lange Seite eines neu gelegten Bildes in Board-Einheiten
export const BILD_MIN = 160;         // kleinere Bilder werden beim Legen auf diese lange Seite angehoben
export const STICKER_GROESSE = 140;  // Kantenlänge eines neu gelegten Stickers
export const TRANSPARENZ_AB = 250;   // Alpha darunter gilt als durchscheinend

/** Eigene Sticker: Dateien in bilder/sticker/<name>.svg. Im Element steht «ehl:<name>». */
export const EHL_STICKER = ['kochmuetze', 'stern', 'herz', 'daumen', 'gluehbirne', 'signature', 'fragezeichen', 'ausrufezeichen', 'haekchen', 'feuer', 'blatt', 'teller'];

export const EMOJIS = [
  { gruppe: 'gesichter', zeichen: ['😀', '😄', '😅', '😂', '🙂', '😉', '😍', '🤩', '😎', '🤔', '😮', '😴', '😬', '😢', '😡', '🥳', '🤗', '🙌', '👍', '👎', '👏', '🙏', '💪', '👀'] },
  { gruppe: 'kueche', zeichen: ['🍳', '🥘', '🍲', '🥗', '🍕', '🍝', '🍣', '🥩', '🍗', '🐟', '🥕', '🥦', '🍅', '🧅', '🧄', '🍋', '🍎', '🍓', '🥖', '🧀', '🍰', '🍷', '☕', '🔪'] },
  { gruppe: 'symbole', zeichen: ['⭐', '❤️', '🔥', '💡', '✅', '❌', '❓', '❗', '⚠️', '🎯', '🚀', '⏰', '📌', '💬', '🏆', '🌱'] },
];

/** Neue Grösse eines gelegten Bildes: lange Seite höchstens «max», sehr kleine auf «min» angehoben, Verhältnis bleibt. */
export function einpassGroesse(b, h, max = BILD_START, min = BILD_MIN) {
  if (!(b > 0) || !(h > 0)) return { b: min, h: min };
  const lang = Math.max(b, h);
  const f = lang > max ? max / lang : lang < min ? min / lang : 1;
  return { b: Math.max(1, Math.round(b * f)), h: Math.max(1, Math.round(h * f)) };
}

/** Hat das Bild (RGBA-Bytes, wie getImageData sie liefert) einen durchscheinenden Punkt? */
export function hatTransparenz(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < TRANSPARENZ_AB) return true;
  return false;
}

/** Aus dem Feld «zeichen» eines Stickers: { art: 'emoji', zeichen } | { art: 'ehl', name } | null. */
export function stickerQuelle(zeichen) {
  if (typeof zeichen !== 'string' || !zeichen) return null;
  if (zeichen.startsWith('ehl:')) { const name = zeichen.slice(4); return EHL_STICKER.includes(name) ? { art: 'ehl', name } : null; }
  return { art: 'emoji', zeichen };
}

/** Text-Schlüssel (js/i18n.js) zu einem Fehler beim Einfügen: art, gross, anzahl, menge, kaputt. */
export function bildFehlerSchluessel(code) {
  if (code === 'anzahl' || code === 'menge' || code === 'grenze') return 'bild.grenze';
  return 'bild.' + code;
}

/** Zähler der Gruppe plus das, was gerade noch hochgeladen wird. */
export const plusUnterwegs = (zaehler, unterwegs) => ({
  bilder: ((zaehler && zaehler.bilder) || 0) + unterwegs.n,
  bytes: ((zaehler && zaehler.bytes) || 0) + unterwegs.bytes,
});

/**
 * Strg+V: Text statt Bild? Excel, Word und PowerPoint legen beim Kopieren oft zusätzlich ein Bild (image/png) in die
 * Zwischenablage. Gibt es Text und dazu HTML oder RTF, ist der Text gemeint, ausser das HTML ist nur ein einzelnes Bild
 * (ein Bild aus dem Browser kopiert).
 */
export function textVorBild({ text = '', html = '', rtf = '' } = {}) {
  if (!String(text).trim() || !(html || rtf)) return false;
  if (!html) return true;
  const ohne = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head|title|xml)\b[\s\S]*?<\/\1\s*>/gi, '');
  const bilder = (ohne.match(/<img\b/gi) || []).length;
  const sichtbar = ohne.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();
  return !(bilder === 1 && !sichtbar);
}
