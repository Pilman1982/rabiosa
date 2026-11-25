// QR-Code-Encoder ohne Abhängigkeiten (ISO/IEC 18004).
// Bewusst klein gehalten: Byte-Modus (UTF-8), Fehlerkorrekturstufe M, Versionen 1–6.
// Das reicht für Adressen bis 106 Bytes und bleibt auf dem Beamer grob genug zum Scannen.

// Stufe M je Version: [Datencodewörter je Block, Anzahl Blöcke, EC-Codewörter je Block].
const STUFE_M = [null, [16, 1, 10], [28, 1, 16], [44, 1, 26], [32, 2, 18], [43, 2, 24], [27, 4, 16]];
const MAX_VERSION = 6;

// ---------- Rechnen in GF(256), primitives Polynom 0x11D ----------

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = EXP[i + 255] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
const mal = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// Generatorpolynom (x - α^0)(x - α^1)…(x - α^(grad-1)), höchster Koeffizient zuerst.
function generator(grad) {
  let g = [1];
  for (let i = 0; i < grad; i++) {
    const neu = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      neu[j] ^= g[j];
      neu[j + 1] ^= mal(g[j], EXP[i]);
    }
    g = neu;
  }
  return g;
}

// Rest der Polynomdivision = Fehlerkorrektur-Codewörter eines Blocks.
function fehlerkorrektur(daten, grad) {
  const g = generator(grad);
  const rest = new Array(grad).fill(0);
  for (const d of daten) {
    const faktor = d ^ rest.shift();
    rest.push(0);
    for (let i = 0; i < grad; i++) rest[i] ^= mal(g[i + 1], faktor);
  }
  return rest;
}

// ---------- Datenstrom ----------

// Kleinste Version, in die `anzahl` Bytes passen (Kopf: 4 Bit Modus + 8 Bit Länge + 4 Bit Abschluss = 2 Codewörter).
function versionFuer(anzahl) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (anzahl <= STUFE_M[v][0] * STUFE_M[v][1] - 2) return v;
  }
  const max = STUFE_M[MAX_VERSION][0] * STUFE_M[MAX_VERSION][1] - 2;
  throw new RangeError(`Text ist zu lang für einen QR-Code der Version ${MAX_VERSION}-M: ${anzahl} Bytes, höchstens ${max}.`);
}

// Fertige Codewortfolge: Daten aufteilen, je Block Fehlerkorrektur anhängen, verschränken.
function codewoerter(bytes, version) {
  const [jeBlock, bloecke, ec] = STUFE_M[version];

  // Modus 0100 und die Länge belegen 12 Bit, darum sind alle Datenbytes um ein Halbbyte verschoben.
  const daten = [0x40 | (bytes.length >> 4)];
  let davor = bytes.length;
  for (const b of bytes) {
    daten.push(((davor & 15) << 4) | (b >> 4));
    davor = b;
  }
  daten.push((davor & 15) << 4);                       // letztes Halbbyte + Abschluss 0000
  for (let i = 0; daten.length < jeBlock * bloecke; i++) daten.push(i % 2 === 0 ? 0xec : 0x11);

  const datenBloecke = [];
  const ecBloecke = [];
  for (let b = 0; b < bloecke; b++) {
    const block = daten.slice(b * jeBlock, (b + 1) * jeBlock);
    datenBloecke.push(block);
    ecBloecke.push(fehlerkorrektur(block, ec));
  }
  // In den Versionen 1–6 sind bei Stufe M alle Blöcke gleich lang.
  const folge = [];
  for (let i = 0; i < jeBlock; i++) for (const block of datenBloecke) folge.push(block[i]);
  for (let i = 0; i < ec; i++) for (const block of ecBloecke) folge.push(block[i]);
  return folge;
}

// ---------- Matrix ----------

const MASKEN = [
  (z, s) => (z + s) % 2 === 0,
  (z) => z % 2 === 0,
  (z, s) => s % 3 === 0,
  (z, s) => (z + s) % 3 === 0,
  (z, s) => (((z / 2) | 0) + ((s / 3) | 0)) % 2 === 0,
  (z, s) => ((z * s) % 2) + ((z * s) % 3) === 0,
  (z, s) => (((z * s) % 2) + ((z * s) % 3)) % 2 === 0,
  (z, s) => (((z + s) % 2) + ((z * s) % 3)) % 2 === 0,
];

// Leere Matrix mit allen festen Mustern. `fest` markiert, was keine Daten trägt.
function grundmuster(version) {
  const n = 17 + 4 * version;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fest = Array.from({ length: n }, () => new Array(n).fill(false));
  const setze = (z, s, dunkel) => {
    m[z][s] = dunkel;
    fest[z][s] = true;
  };

  // Taktmuster in Zeile 6 und Spalte 6 (die Sucher überschreiben danach ihre Ecken).
  for (let i = 0; i < n; i++) {
    setze(6, i, i % 2 === 0);
    setze(i, 6, i % 2 === 0);
  }

  // Suchmuster 7×7 samt hellem Trenner: konzentrische Ringe um die Mitte.
  for (const [mz, ms] of [[3, 3], [3, n - 4], [n - 4, 3]]) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let ds = -4; ds <= 4; ds++) {
        const z = mz + dz, s = ms + ds;
        if (z < 0 || z >= n || s < 0 || s >= n) continue;
        const ring = Math.max(Math.abs(dz), Math.abs(ds));
        setze(z, s, ring !== 2 && ring !== 4);
      }
    }
  }

  // Ausrichtungsmuster 5×5: ab Version 2 genau eines, Mitte 6 Module vor dem rechten/unteren Rand.
  if (version >= 2) {
    const mitte = n - 7;
    for (let dz = -2; dz <= 2; dz++) {
      for (let ds = -2; ds <= 2; ds++) {
        setze(mitte + dz, mitte + ds, Math.max(Math.abs(dz), Math.abs(ds)) !== 1);
      }
    }
  }

  // Platz für die Formatinformation freihalten, dazu das immer dunkle Modul.
  for (let i = 0; i < 9; i++) {
    if (!fest[8][i]) setze(8, i, false);
    if (!fest[i][8]) setze(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setze(8, n - 1 - i, false);
    setze(n - 1 - i, 8, false);
  }
  setze(n - 8, 8, true);
  // Eine Versionsinformation gibt es erst ab Version 7.

  return { n, m, fest };
}

// Legt die Codewörter im Zickzack von unten rechts nach oben links in die freien Module.
function datenEintragen({ n, m, fest }, folge) {
  let nr = 0;                                           // laufende Bitnummer
  let z = n - 1;
  let schritt = -1;                                     // -1 = aufwärts
  for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;                       // Spalte 6 gehört dem Taktmuster
    for (; z >= 0 && z < n; z += schritt) {
      for (let k = 0; k < 2; k++) {
        const s = rechts - k;
        if (fest[z][s]) continue;
        // Bits jenseits der Codewörter sind die Restbits und bleiben 0.
        m[z][s] = nr < folge.length * 8 && ((folge[nr >> 3] >> (7 - (nr & 7))) & 1) === 1;
        nr++;
      }
    }
    schritt = -schritt;
    z += schritt;                                       // zurück in die Matrix, Richtung gewechselt
  }
}

function maskeAnwenden({ n, m, fest }, maske) {
  const dreht = MASKEN[maske];
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (!fest[z][s] && dreht(z, s)) m[z][s] = !m[z][s];
    }
  }
}

// Formatinformation: 2 Bit Stufe (M = 00), 3 Bit Maske, 10 Bit BCH(15,5), danach XOR 0x5412.
function formatBits(maske) {
  const daten = (0b00 << 3) | maske;
  let rest = daten << 10;
  for (let i = 14; i >= 10; i--) {
    if (rest & (1 << i)) rest ^= 0x537 << (i - 10);
  }
  return ((daten << 10) | rest) ^ 0x5412;
}

// Schreibt beide Kopien; Bit 0 ist das niedrigstwertige.
function formatEintragen({ n, m }, maske) {
  const bits = formatBits(maske);
  const bit = (i) => ((bits >> i) & 1) === 1;
  // Kopie 1 um den Sucher oben links (Zeile 6 und Spalte 6 sind Takt und werden ausgelassen).
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);
  // Kopie 2: rechts oben waagrecht, links unten senkrecht.
  for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = bit(i);
}

// Strafpunkte nach den vier Regeln der Norm (N1 = 3, N2 = 3, N3 = 40, N4 = 10).
function strafpunkte({ n, m }) {
  let punkte = 0;
  let dunkel = 0;

  for (let i = 0; i < n; i++) {
    for (let richtung = 0; richtung < 2; richtung++) {
      let lauf = 0;
      let farbe = false;
      let fenster = 0;                                  // die letzten 11 Module als Bitmuster
      for (let j = 0; j < n; j++) {
        const modul = richtung === 0 ? m[i][j] : m[j][i];
        // Regel 1: fünf oder mehr gleiche Module in Folge.
        if (j > 0 && modul === farbe) {
          lauf++;
          if (lauf === 5) punkte += 3;
          else if (lauf > 5) punkte += 1;
        } else {
          farbe = modul;
          lauf = 1;
        }
        // Regel 3: Muster 1:1:3:1:1 mit vier hellen Modulen davor oder danach.
        fenster = ((fenster << 1) | (modul ? 1 : 0)) & 0x7ff;
        if (j >= 10 && (fenster === 0b10111010000 || fenster === 0b00001011101)) punkte += 40;
      }
    }
  }

  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (m[z][s]) dunkel++;
      // Regel 2: Blöcke 2×2 in einer Farbe.
      if (z > 0 && s > 0 && m[z][s] === m[z - 1][s] && m[z][s] === m[z][s - 1] && m[z][s] === m[z - 1][s - 1]) {
        punkte += 3;
      }
    }
  }

  // Regel 4: Abweichung des Dunkelanteils von 50 % in ganzen 5-%-Schritten.
  punkte += 10 * Math.floor(Math.abs(20 * dunkel - 10 * n * n) / (n * n));
  return punkte;
}

// true = dunkles Modul. Byte-Modus (UTF-8), Stufe M, Versionen 1–6, kleinste passende Version,
// Maske nach den Strafpunktregeln der Norm. Wirft RangeError, wenn der Text nicht in Version 6-M passt.
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = versionFuer(bytes.length);
  const qr = grundmuster(version);
  datenEintragen(qr, codewoerter(bytes, version));

  let beste = 0;
  let wenigste = Infinity;
  for (let maske = 0; maske < 8; maske++) {
    maskeAnwenden(qr, maske);
    formatEintragen(qr, maske);
    const punkte = strafpunkte(qr);
    if (punkte < wenigste) {
      wenigste = punkte;
      beste = maske;
    }
    maskeAnwenden(qr, maske);                           // zweimal anwenden hebt sich auf
  }
  maskeAnwenden(qr, beste);
  formatEintragen(qr, beste);
  return qr.m;
}

const attribut = (wert) =>
  String(wert).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// SVG als Zeichenkette: viewBox mit `rand` hellen Modulen ringsum (die Norm verlangt 4),
// ein Rechteck als Hintergrund und ein einziger Pfad für alle dunklen Module.
export function qrSvg(text, { rand = 4, farbe = '#001436', hintergrund = '#ffffff' } = {}) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const seite = n + 2 * rand;
  let d = '';
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (!matrix[z][s]) continue;
      let ende = s;
      while (ende + 1 < n && matrix[z][ende + 1]) ende++;
      const breite = ende - s + 1;
      d += `M${s + rand} ${z + rand}h${breite}v1h-${breite}z`;   // waagrechter Streifen
      s = ende;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${seite} ${seite}" shape-rendering="crispEdges">`
    + `<rect width="${seite}" height="${seite}" fill="${attribut(hintergrund)}"/>`
    + `<path fill="${attribut(farbe)}" d="${d}"/>`
    + '</svg>';
}
