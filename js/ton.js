// Musik und Effekte, im Browser erzeugt (keine Tondateien). Läuft nur auf dem Laptop der Lehrperson.
// ton.spiele('warteraum' | 'frage' | 'endspurt' | 'gong' | 'richtig' | 'podest'), ton.stopp(), ton.stumm

const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const AKKORDE = { am: [57, 60, 64], f: [53, 57, 60], c: [55, 60, 64], g: [55, 59, 62], dm: [57, 62, 65], e: [56, 59, 64] };

// Schrittfolgen: (schritt, takt) -> Liste von Tönen { m: Midi, d: Dauer in Schritten, l: Lautstärke, art }
const SCHLEIFEN = {
  warteraum: { tempo: 84, schritte: 8, takte: ['am', 'f', 'c', 'g'],
    toene(s, akkord) {
      const a = AKKORDE[akkord], folge = [0, 1, 2, 1, 0, 2, 1, 2];
      const t = [{ m: a[folge[s]] + 12, d: 1.6, l: 0.10, art: 'triangle' }];
      if (s === 0 || s === 4) t.push({ m: a[0] - 12, d: 3.6, l: 0.16, art: 'sine' });
      return t;
    } },
  frage: { tempo: 116, schritte: 16, takte: ['am', 'am', 'f', 'g', 'am', 'am', 'dm', 'e'],
    toene(s, akkord) {
      const a = AKKORDE[akkord], t = [];
      if (s % 2 === 0) t.push({ m: a[0] - 12 - (s % 4 === 0 ? 12 : 0), d: 0.9, l: 0.17, art: 'sine' });
      const motiv = { 0: 2, 3: 1, 6: 2, 8: 0, 11: 1, 14: 2 };
      if (s in motiv) t.push({ m: a[motiv[s]] + 12, d: 1.4, l: 0.09, art: 'triangle' });
      if (s === 4 || s === 12) t.push({ m: 96, d: 0.25, l: 0.035, art: 'square' });
      return t;
    } },
};
SCHLEIFEN.endspurt = { ...SCHLEIFEN.frage, tempo: 152 };

let kontext = null, haupt = null, uhr = null, laeuft = null;
let stumm = false, laut = 1;
try {
  stumm = localStorage.getItem('rabiosa-stumm') === '1';
  const l = Number(localStorage.getItem('rabiosa-laut'));
  if (l > 0 && l <= 1) laut = l;
} catch { /* ohne Speicher */ }
const pegel = () => (stumm ? 0 : 0.9 * laut);

function bereit() {
  if (!kontext) {
    const K = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!K) return false;
    kontext = new K();
    haupt = kontext.createGain();
    haupt.gain.value = pegel();
    haupt.connect(kontext.destination);
  }
  if (kontext.state === 'suspended') kontext.resume().catch(() => {});
  return true;
}

function ton(midi, start, dauer, laut = 0.15, art = 'triangle') {
  const o = kontext.createOscillator(), g = kontext.createGain();
  o.type = art;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(laut, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
  o.connect(g).connect(haupt);
  o.start(start);
  o.stop(start + dauer + 0.05);
}

function starteSchleife(name) {
  if (laeuft === name) return;
  haltSchleife();
  laeuft = name;
  const s = SCHLEIFEN[name], schritt = 60 / s.tempo / (s.schritte / 4);
  let naechster = kontext.currentTime + 0.06, zaehler = 0;
  const plane = () => {
    while (naechster < kontext.currentTime + 0.25) {
      const akkord = s.takte[Math.floor(zaehler / s.schritte) % s.takte.length];
      for (const n of s.toene(zaehler % s.schritte, akkord)) ton(n.m, naechster, n.d * schritt, n.l, n.art);
      naechster += schritt;
      zaehler++;
    }
  };
  plane();
  uhr = setInterval(plane, 80);
}

function haltSchleife() {
  if (uhr) clearInterval(uhr);
  uhr = null;
  laeuft = null;
}

const EINMAL = {
  gong() {
    const jetzt = kontext.currentTime;
    [[45, 0.30, 2.6], [52, 0.12, 2.0], [57.3, 0.08, 1.6], [64.2, 0.04, 1.1]].forEach(([m, l, d]) => ton(m, jetzt, d, l, 'sine'));
  },
  richtig() {
    const jetzt = kontext.currentTime;
    [[72, 0], [76, 0.11], [79, 0.22]].forEach(([m, v]) => ton(m, jetzt + v, 0.5, 0.12, 'triangle'));
  },
  /** Cloche: die Glocke hebt sich. */
  aufdecken() {
    const jetzt = kontext.currentTime;
    [[79, 0], [83, 0.05], [86, 0.1], [91, 0.15]].forEach(([m, v]) => ton(m, jetzt + v, 0.6, 0.06, 'sine'));
  },
  /** Cloche: eine Überraschungskarte. */
  ueberraschung() {
    const jetzt = kontext.currentTime;
    [[62, 0], [66, 0.09], [69, 0.18], [74, 0.27], [78, 0.36]].forEach(([m, v]) => ton(m, jetzt + v, 0.35, 0.1, 'square'));
    ton(50, jetzt + 0.36, 1.2, 0.16, 'sine');
  },
  podest() {
    const jetzt = kontext.currentTime;
    [[60, 0], [64, 0.16], [67, 0.32], [72, 0.48]].forEach(([m, v]) => ton(m, jetzt + v, 0.5, 0.14, 'sawtooth'));
    [60, 64, 67, 72].forEach(m => ton(m, jetzt + 0.72, 1.8, 0.09, 'sawtooth'));
    ton(48, jetzt + 0.72, 2.0, 0.18, 'sine');
  },
};

export default {
  /** Muss einmal aus einem Klick oder Tastendruck heraus aufgerufen werden (Vorgabe der Browser). */
  wecke() { return bereit(); },
  spiele(name) {
    if (!bereit()) return;
    if (name in SCHLEIFEN) starteSchleife(name);
    else if (name in EINMAL) { haltSchleife(); EINMAL[name](); }
  },
  /** Effekt, ohne die laufende Musik anzuhalten. */
  effekt(name) { if (bereit() && name in EINMAL) EINMAL[name](); },
  stopp() { haltSchleife(); },
  get stumm() { return stumm; },
  set stumm(wert) {
    stumm = !!wert;
    try { localStorage.setItem('rabiosa-stumm', stumm ? '1' : '0'); } catch { /* ohne Speicher */ }
    if (haupt) haupt.gain.setTargetAtTime(pegel(), kontext.currentTime, 0.03);
  },
  /** Lautstärke 0.05 bis 1. */
  get laut() { return laut; },
  set laut(wert) {
    laut = Math.min(1, Math.max(0.05, Number(wert) || 1));
    try { localStorage.setItem('rabiosa-laut', String(laut)); } catch { /* ohne Speicher */ }
    if (haupt) haupt.gain.setTargetAtTime(pegel(), kontext.currentTime, 0.03);
  },
};
