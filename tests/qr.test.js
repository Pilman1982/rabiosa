// Ausführen mit: node --test tests/qr.test.js
//
// Kern dieser Datei ist ein eigenständiger QR-Leser (lies), der nichts aus js/qr.js
// wiederverwendet: Formatinformation, Maske, Zickzack, Blöcke, Reed-Solomon-Syndrome,
// Byte-Modus. Seine Bausteine werden zuerst an bekannten Werten aus der Norm
// (ISO/IEC 18004) verankert, damit Leser und Encoder nicht denselben Irrtum teilen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../js/qr.js';

const ADRESSE = 'https://pilman1982.github.io/rabiosa/#/482913';

// Stufe M je Version: Anzahl Blöcke, Datencodewörter je Block, EC-Codewörter je Block, Restbits.
const STUFE_M = {
  1: { bloecke: 1, daten: 16, ec: 10, rest: 0 },
  2: { bloecke: 1, daten: 28, ec: 16, rest: 7 },
  3: { bloecke: 1, daten: 44, ec: 26, rest: 7 },
  4: { bloecke: 2, daten: 32, ec: 18, rest: 7 },
  5: { bloecke: 2, daten: 43, ec: 24, rest: 7 },
  6: { bloecke: 4, daten: 27, ec: 16, rest: 7 },
};
// Gesamtzahl Codewörter je Version laut Norm (unabhängig von der Stufe).
const CODEWOERTER = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172 };
// Mitte des einzigen Ausrichtungsmusters (Zeile = Spalte).
const AUSRICHTUNG = { 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 };
// Fertige Formatinformation (15 Bit, höchstwertiges zuerst) für Stufe M, Maske 0–7, aus der Normtabelle.
const FORMAT_M = [
  '101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000',
];

const MASKEN = [
  (z, s) => (z + s) % 2 === 0,
  (z) => z % 2 === 0,
  (z, s) => s % 3 === 0,
  (z, s) => (z + s) % 3 === 0,
  (z, s) => (Math.floor(z / 2) + Math.floor(s / 3)) % 2 === 0,
  (z, s) => ((z * s) % 2) + ((z * s) % 3) === 0,
  (z, s) => (((z * s) % 2) + ((z * s) % 3)) % 2 === 0,
  (z, s) => (((z + s) % 2) + ((z * s) % 3)) % 2 === 0,
];

// ---------- Bausteine des Lesers ----------

// Multiplikation in GF(256) ohne Tabellen (Schieben und Addieren, Polynom 0x11D).
function gfMal(a, b) {
  let p = 0;
  for (; b; b >>= 1) {
    if (b & 1) p ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return p;
}

// Syndrome S_i = c(α^i), i = 0 … ec-1; das erste Codewort ist der höchste Koeffizient.
function syndrome(block, ec) {
  const s = [];
  let alphaHochI = 1;
  for (let i = 0; i < ec; i++) {
    let wert = 0;
    for (const c of block) wert = gfMal(wert, alphaHochI) ^ c;
    s.push(wert);
    alphaHochI = gfMal(alphaHochI, 2);
  }
  return s;
}

// Rest der Division durch das BCH(15,5)-Generatorpolynom 0x537; 0 heisst gültiges Codewort.
function bchRest(wert) {
  for (let i = 14; i >= 10; i--) if (wert & (1 << i)) wert ^= 0x537 << (i - 10);
  return wert;
}

// Positionen [Zeile, Spalte] beider Formatkopien, jeweils vom höchstwertigen Bit (14) zum niedrigsten (0).
function formatPositionen(n) {
  const a = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const b = [];
  for (let z = n - 1; z >= n - 7; z--) b.push([z, 8]);
  for (let s = n - 8; s <= n - 1; s++) b.push([8, s]);
  return [a, b];
}

// true = Funktionsmodul (Sucher samt Trenner, Takt, Ausrichtung, Format, dunkles Modul).
function funktionsKarte(version) {
  const n = 17 + 4 * version;
  const k = Array.from({ length: n }, () => new Array(n).fill(false));
  const feld = (z0, s0, h, b) => {
    for (let z = z0; z < z0 + h; z++) for (let s = s0; s < s0 + b; s++) k[z][s] = true;
  };
  feld(0, 0, 9, 9);          // Sucher oben links, Trenner, Format
  feld(0, n - 8, 9, 8);      // Sucher oben rechts, Trenner, Format
  feld(n - 8, 0, 8, 9);      // Sucher unten links, Trenner, Format, dunkles Modul
  feld(6, 0, 1, n);          // Takt waagrecht
  feld(0, 6, n, 1);          // Takt senkrecht
  if (version >= 2) feld(AUSRICHTUNG[version] - 2, AUSRICHTUNG[version] - 2, 5, 5);
  return k;
}

function datenModule(version) {
  let anzahl = 0;
  for (const zeile of funktionsKarte(version)) for (const f of zeile) if (!f) anzahl++;
  return anzahl;
}

// Besucht die Datenmodule in der Reihenfolge der Norm: Spaltenpaare von rechts nach links,
// abwechselnd aufwärts und abwärts, im Paar zuerst rechts; Spalte 6 wird übersprungen.
function zickzack(n, funktion, besuch) {
  let aufwaerts = true;
  for (let rechts = n - 1; rechts > 0; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let i = 0; i < n; i++) {
      const z = aufwaerts ? n - 1 - i : i;
      for (const s of [rechts, rechts - 1]) if (!funktion[z][s]) besuch(z, s);
    }
    aufwaerts = !aufwaerts;
  }
}

// Liest eine Matrix vollständig zurück und prüft unterwegs alles, was ein Scanner voraussetzt.
function lies(matrix) {
  const n = matrix.length;
  const version = (n - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 6, `Grösse ${n} passt zu keiner Version 1–6`);
  for (const zeile of matrix) {
    assert.equal(zeile.length, n, 'Matrix ist nicht quadratisch');
    for (const modul of zeile) assert.equal(typeof modul, 'boolean');
  }
  const { bloecke, daten, ec, rest } = STUFE_M[version];

  // Formatinformation: beide Kopien gleich, BCH gültig, Stufe M.
  const [a, b] = formatPositionen(n).map((pos) => pos.map(([z, s]) => (matrix[z][s] ? '1' : '0')).join(''));
  assert.equal(a, b, 'die beiden Formatkopien unterscheiden sich');
  const roh = parseInt(a, 2) ^ 0x5412;
  assert.equal(bchRest(roh), 0, 'BCH-Prüfung der Formatinformation schlägt fehl');
  assert.equal(roh >> 13, 0b00, 'Fehlerkorrekturstufe ist nicht M');
  const maske = (roh >> 10) & 7;
  assert.equal(a, FORMAT_M[maske], 'Formatinformation weicht von der Normtabelle ab');

  // Datenmodule entmaskiert einsammeln.
  const funktion = funktionsKarte(version);
  const bits = [];
  zickzack(n, funktion, (z, s) => bits.push(matrix[z][s] !== MASKEN[maske](z, s) ? 1 : 0));
  const gesamt = bloecke * (daten + ec);
  assert.equal(gesamt, CODEWOERTER[version]);
  assert.equal(bits.length, gesamt * 8 + rest, 'Anzahl Datenmodule stimmt nicht');
  assert.deepEqual(bits.slice(gesamt * 8), new Array(rest).fill(0), 'Restbits sind nicht 0');

  const strom = [];
  for (let i = 0; i < gesamt; i++) strom.push(parseInt(bits.slice(i * 8, i * 8 + 8).join(''), 2));

  // Blöcke entflechten (für Stufe M sind in den Versionen 1–6 alle Blöcke gleich lang).
  const block = Array.from({ length: bloecke }, () => []);
  strom.forEach((codewort, i) => block[i % bloecke].push(codewort));
  for (const [i, bl] of block.entries()) {
    assert.equal(bl.length, daten + ec);
    assert.deepEqual(syndrome(bl, ec), new Array(ec).fill(0), `Block ${i}: Reed-Solomon-Syndrome sind nicht 0`);
  }

  // Byte-Modus: 0100, 8 Bit Länge, Daten, Abschluss 0000, Füllbytes EC/11.
  const nutz = block.flatMap((bl) => bl.slice(0, daten));
  const nutzBits = nutz.map((c) => c.toString(2).padStart(8, '0')).join('');
  assert.equal(nutzBits.slice(0, 4), '0100', 'Modus ist nicht Byte');
  const laenge = parseInt(nutzBits.slice(4, 12), 2);
  assert.ok(12 + 8 * laenge + 4 <= nutzBits.length, 'Längenangabe sprengt die Kapazität');
  const bytes = new Uint8Array(laenge);
  for (let i = 0; i < laenge; i++) bytes[i] = parseInt(nutzBits.slice(12 + 8 * i, 20 + 8 * i), 2);
  const ende = 12 + 8 * laenge;
  assert.equal(nutzBits.slice(ende, ende + 4), '0000', 'Abschluss 0000 fehlt');
  assert.equal((ende + 4) % 8, 0);
  const fuell = nutz.slice((ende + 4) / 8);
  assert.deepEqual(fuell, fuell.map((_, i) => (i % 2 === 0 ? 0xec : 0x11)), 'Füllbytes sind nicht EC, 11, EC, …');

  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { version, maske, text, laenge, funktion };
}

// Strafpunkte nach den vier Regeln der Norm, bewusst über Zeichenketten gerechnet.
function strafe(m) {
  const n = m.length;
  const linien = [];
  for (let i = 0; i < n; i++) {
    linien.push(m[i].map((d) => (d ? '1' : '0')).join(''));
    linien.push(m.map((zeile) => (zeile[i] ? '1' : '0')).join(''));
  }
  let p = 0;
  for (const linie of linien) {
    for (const lauf of linie.match(/0+|1+/g)) if (lauf.length >= 5) p += lauf.length - 2;
    for (let i = 0; i + 11 <= n; i++) {
      const fenster = linie.slice(i, i + 11);
      if (fenster === '10111010000' || fenster === '00001011101') p += 40;
    }
  }
  let dunkel = 0;
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (m[z][s]) dunkel++;
      if (z + 1 < n && s + 1 < n && m[z][s] === m[z][s + 1] && m[z][s] === m[z + 1][s] && m[z][s] === m[z + 1][s + 1]) p += 3;
    }
  }
  return p + 10 * Math.floor(Math.abs((dunkel * 100) / (n * n) - 50) / 5);
}

// Baut aus einer fertigen Matrix die Variante mit einer anderen Maske (Daten und Formatinformation).
function mitMaske(matrix, funktion, alt, neu) {
  const n = matrix.length;
  const kopie = matrix.map((zeile) => zeile.slice());
  for (let z = 0; z < n; z++) {
    for (let s = 0; s < n; s++) {
      if (!funktion[z][s]) kopie[z][s] = (matrix[z][s] !== MASKEN[alt](z, s)) !== MASKEN[neu](z, s);
    }
  }
  for (const positionen of formatPositionen(n)) {
    positionen.forEach(([z, s], i) => { kopie[z][s] = FORMAT_M[neu][i] === '1'; });
  }
  return kopie;
}

// Abwechslungsreicher ASCII-Text mit genau n Bytes.
function textMitLaenge(n) {
  const vorrat = 'Rabiosa Quiz 0123456789 - abcdefghijklmnopqrstuvwxyz / ABCDEFGHIJKLMNOPQRSTUVWXYZ #?=&%+.:;,!()[]{}<>@$*~^';
  let text = '';
  while (text.length < n) text += vorrat;
  return text.slice(0, n);
}

const utf8Laenge = (text) => new TextEncoder().encode(text).length;

// ---------- Verankerung des Lesers an bekannten Werten ----------

test('Leser: GF(256) und Syndrome stimmen mit bekanntem Beispiel überein', () => {
  assert.equal(gfMal(2, 0x80), 0x1d);          // α^8 = 0x1D bei Polynom 0x11D
  assert.equal(gfMal(0x1d, 2), 0x3a);
  let alpha = 1;
  for (let i = 0; i < 255; i++) alpha = gfMal(alpha, 2);
  assert.equal(alpha, 1);                      // α hat Ordnung 255
  // «HELLO WORLD», Version 1-M: 16 Daten- und 10 EC-Codewörter (verbreitetes Lehrbeispiel).
  const hello = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
  assert.deepEqual(syndrome(hello, 10), new Array(10).fill(0));
  const kaputt = hello.slice();
  kaputt[3] ^= 1;
  assert.notDeepEqual(syndrome(kaputt, 10), new Array(10).fill(0));
});

test('Leser: Formattabelle für Stufe M besteht die BCH-Prüfung', () => {
  FORMAT_M.forEach((bits, maske) => {
    const roh = parseInt(bits, 2) ^ 0x5412;
    assert.equal(bchRest(roh), 0);
    assert.equal(roh >> 10, maske);            // Stufe 00, dann die Maskennummer
  });
});

test('Leser: Anzahl Datenmodule passt zur Codewortzahl der Norm', () => {
  for (let v = 1; v <= 6; v++) {
    assert.equal(datenModule(v), CODEWOERTER[v] * 8 + STUFE_M[v].rest, `Version ${v}`);
  }
});

// ---------- qrMatrix ----------

const FAELLE = [
  ['10 Bytes', textMitLaenge(10), 1],
  ['44 Bytes', textMitLaenge(44), 4],
  ['60 Bytes', textMitLaenge(60), 4],
  ['100 Bytes', textMitLaenge(100), 6],
  ['Adresse der Seite', ADRESSE, 4],
  ['Umlaute', 'Küche Rösti', 1],
];

for (const [name, text, version] of FAELLE) {
  test(`qrMatrix: ${name} lässt sich unabhängig zurücklesen`, () => {
    const matrix = qrMatrix(text);
    assert.equal(matrix.length, 17 + 4 * version, 'Grösse ist nicht 17 + 4·Version');
    const gelesen = lies(matrix);
    assert.equal(gelesen.version, version);
    assert.equal(gelesen.laenge, utf8Laenge(text));
    assert.equal(gelesen.text, text);
  });
}

test('qrMatrix: Testtexte haben die erwartete Länge', () => {
  assert.equal(utf8Laenge(ADRESSE), 45);
  assert.equal(utf8Laenge('Küche Rösti'), 13);
  for (const n of [10, 44, 60, 100, 106, 107]) assert.equal(utf8Laenge(textMitLaenge(n)), n);
});

test('qrMatrix: kleinste passende Version an allen Kapazitätsgrenzen', () => {
  const grenzen = [[0, 1], [14, 1], [15, 2], [26, 2], [27, 3], [42, 3], [43, 4], [62, 4], [63, 5], [84, 5], [85, 6], [106, 6]];
  for (const [bytes, version] of grenzen) {
    assert.equal(qrMatrix(textMitLaenge(bytes)).length, 17 + 4 * version, `${bytes} Bytes`);
  }
});

test('qrMatrix: jede Länge von 0 bis 106 Bytes lässt sich zurücklesen', () => {
  for (let n = 0; n <= 106; n++) {
    const text = textMitLaenge(n);
    assert.equal(lies(qrMatrix(text)).text, text, `${n} Bytes`);
  }
  assert.equal(lies(qrMatrix('a'.repeat(106))).text, 'a'.repeat(106));
  assert.equal(lies(qrMatrix('ä'.repeat(53))).text, 'ä'.repeat(53));
});

test('qrMatrix: Sucher, Trenner, Takt, Ausrichtung und dunkles Modul sind vorhanden', () => {
  const sucher = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  const ausrichtung = ['11111', '10001', '10101', '10001', '11111'];
  for (const text of [...FAELLE.map((f) => f[1]), textMitLaenge(20), textMitLaenge(30), textMitLaenge(70)]) {
    const m = qrMatrix(text);
    const n = m.length;
    const version = (n - 17) / 4;
    const ausschnitt = (z0, s0, h, b) =>
      Array.from({ length: h }, (_, i) => m[z0 + i].slice(s0, s0 + b).map((d) => (d ? '1' : '0')).join(''));

    for (const [z0, s0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      assert.deepEqual(ausschnitt(z0, s0, 7, 7), sucher, `Sucher bei ${z0}/${s0}`);
    }
    // Trenner: ein heller Streifen um jeden Sucher.
    for (let i = 0; i < 8; i++) {
      for (const [z, s] of [[7, i], [i, 7], [7, n - 1 - i], [i, n - 8], [n - 8, i], [n - 1 - i, 7]]) {
        assert.equal(m[z][s], false, `Trenner bei ${z}/${s}`);
      }
    }
    // Taktmuster: Zeile 6 und Spalte 6, dunkel auf geraden Positionen.
    for (let i = 8; i <= n - 9; i++) {
      assert.equal(m[6][i], i % 2 === 0, `Takt Zeile 6, Spalte ${i}`);
      assert.equal(m[i][6], i % 2 === 0, `Takt Spalte 6, Zeile ${i}`);
    }
    assert.equal(m[n - 8][8], true, 'dunkles Modul fehlt');
    assert.equal(n - 8, 4 * version + 9);
    if (version >= 2) {
      const mitte = AUSRICHTUNG[version];
      assert.deepEqual(ausschnitt(mitte - 2, mitte - 2, 5, 5), ausrichtung, 'Ausrichtungsmuster');
    }
  }
});

test('qrMatrix: gewählte Maske hat die wenigsten Strafpunkte (bei Gleichstand die kleinste Nummer)', () => {
  const gesehen = new Set();
  const texte = [...FAELLE.map((f) => f[1]), 'a'];
  for (let n = 0; n <= 106; n++) texte.push(textMitLaenge(n));
  for (let i = 0; i < 30; i++) texte.push(ADRESSE.replace('482913', String(100003 + i * 29989)));
  for (const text of texte) {
    const matrix = qrMatrix(text);
    const { maske, funktion } = lies(matrix);
    gesehen.add(maske);
    const punkte = MASKEN.map((_, k) => strafe(mitMaske(matrix, funktion, maske, k)));
    assert.deepEqual(mitMaske(matrix, funktion, maske, maske), matrix);
    assert.equal(maske, punkte.indexOf(Math.min(...punkte)), `Strafpunkte ${punkte.join(', ')} bei «${text}»`);
  }
  assert.equal(gesehen.size, 8, 'die Stichprobe soll jede der acht Masken mindestens einmal treffen');
});

test('qrMatrix: gleiche Eingabe ergibt gleiche Matrix, andere Eingabe eine andere', () => {
  assert.deepEqual(qrMatrix(ADRESSE), qrMatrix(ADRESSE));
  assert.notDeepEqual(qrMatrix(ADRESSE), qrMatrix(ADRESSE.replace('482913', '482914')));
});

test('qrMatrix: zu langer Text wirft RangeError', () => {
  assert.throws(() => qrMatrix(textMitLaenge(107)), RangeError);
  assert.throws(() => qrMatrix('ä'.repeat(54)), RangeError);   // 54 Zeichen, aber 108 Bytes
  assert.throws(() => qrMatrix('x'.repeat(5000)), RangeError);
});

// ---------- qrSvg ----------

test('qrSvg: SVG mit viewBox, einem Hintergrund-Rechteck und genau einem Pfad', () => {
  const groesse = qrMatrix(ADRESSE).length;
  const svg = qrSvg(ADRESSE);
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.equal(svg.match(/<path/g).length, 1);
  assert.equal(svg.match(/<rect/g).length, 1);
  assert.ok(svg.includes(`viewBox="0 0 ${groesse + 8} ${groesse + 8}"`));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('#001436'));
  assert.ok(svg.includes('#ffffff'));
  assert.ok(svg.indexOf('<rect') < svg.indexOf('<path'), 'Hintergrund muss unter dem Pfad liegen');
});

test('qrSvg: Rand und Farben sind einstellbar', () => {
  const groesse = qrMatrix(ADRESSE).length;
  const svg = qrSvg(ADRESSE, { rand: 2, farbe: '#b6633f', hintergrund: '#fafafa' });
  assert.ok(svg.includes(`viewBox="0 0 ${groesse + 4} ${groesse + 4}"`));
  assert.ok(svg.includes('fill="#b6633f"'));
  assert.ok(svg.includes('fill="#fafafa"'));
  assert.ok(!svg.includes('#001436'));
  assert.ok(qrSvg(ADRESSE, {}).includes(`viewBox="0 0 ${groesse + 8} ${groesse + 8}"`));
});

test('qrSvg: der Pfad deckt genau die dunklen Module, um den Rand verschoben', () => {
  for (const [text, rand] of [[ADRESSE, 4], ['Küche Rösti', 4], [textMitLaenge(100), 1], [ADRESSE, 0]]) {
    const matrix = qrMatrix(text);
    const n = matrix.length;
    const d = /<path[^>]*\sd="([^"]*)"/.exec(qrSvg(text, { rand }))[1];
    const teile = d.match(/M[^M]*/g);
    const bild = Array.from({ length: n }, () => new Array(n).fill(false));
    for (const teil of teile) {
      // Jedes Teilstück ist ein waagrechter Streifen von einem Modul Höhe.
      const treffer = /^M(\d+) (\d+)h(\d+)v1h-(\d+)z$/.exec(teil);
      assert.ok(treffer, `unerwartetes Pfadstück «${teil}»`);
      const [x, y, breite, zurueck] = treffer.slice(1).map(Number);
      assert.equal(breite, zurueck);
      for (let i = 0; i < breite; i++) {
        const z = y - rand, s = x - rand + i;
        assert.equal(bild[z][s], false, 'Modul doppelt gezeichnet');
        bild[z][s] = true;
      }
    }
    assert.deepEqual(bild, matrix);
  }
});
