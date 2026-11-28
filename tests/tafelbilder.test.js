import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  EHL_STICKER, EMOJIS, STICKER_GROESSE, BILD_START, einpassGroesse, hatTransparenz, stickerQuelle, bildFehlerSchluessel, plusUnterwegs,
} from '../js/logik/tafelbilder.js';
import { saeubereElement } from '../js/logik/tafel.js';
import { TEXTE } from '../js/i18n.js';

test('einpassGroesse: lange Seite höchstens BILD_START, sehr kleine werden angehoben, Verhältnis bleibt', () => {
  assert.deepEqual(einpassGroesse(2000, 1000), { b: 600, h: 300 });
  assert.deepEqual(einpassGroesse(1000, 2000), { b: 300, h: 600 });
  assert.deepEqual(einpassGroesse(400, 300), { b: 400, h: 300 }, 'passt schon');
  assert.deepEqual(einpassGroesse(40, 20), { b: 160, h: 80 }, 'winzig: auf die Mindestgrösse');
  assert.equal(BILD_START, 600);
  const r = einpassGroesse(1234, 777);
  assert.ok(Math.abs(r.b / r.h - 1234 / 777) < 0.01);
  assert.deepEqual(einpassGroesse(0, 0), { b: 160, h: 160 }, 'ohne Mass kein Absturz');
});

test('hatTransparenz: ein durchscheinender Bildpunkt genügt, volle Deckung nicht', () => {
  const deckend = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  assert.equal(hatTransparenz(deckend), false);
  const luecke = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]);
  assert.equal(hatTransparenz(luecke), true);
  assert.equal(hatTransparenz(new Uint8ClampedArray([1, 2, 3, 250])), false, 'Rundungsrauschen zählt nicht');
  assert.equal(hatTransparenz(new Uint8ClampedArray([1, 2, 3, 249])), true);
  assert.equal(hatTransparenz(new Uint8ClampedArray(0)), false);
});

test('stickerQuelle: Emoji, EHL-Sticker aus der Liste, sonst nichts', () => {
  assert.deepEqual(stickerQuelle('🍳'), { art: 'emoji', zeichen: '🍳' });
  assert.deepEqual(stickerQuelle('ehl:herz'), { art: 'ehl', name: 'herz' });
  assert.equal(stickerQuelle('ehl:../../x'), null, 'kein Pfad aus fremden Daten');
  assert.equal(stickerQuelle('ehl:unbekannt'), null);
  assert.equal(stickerQuelle(''), null);
  assert.equal(stickerQuelle(undefined), null);
});

test('EHL-Sticker: zwölf Dateien, genau die der Liste, Navy und Kupfer, ohne Fremdes', () => {
  assert.equal(EHL_STICKER.length, 12);
  const ordner = new URL('../bilder/sticker/', import.meta.url);
  const dateien = readdirSync(ordner).filter(d => d.endsWith('.svg')).map(d => d.slice(0, -4)).sort();
  assert.deepEqual(dateien, [...EHL_STICKER].sort());
  for (const name of EHL_STICKER) {
    const s = readFileSync(new URL(name + '.svg', ordner), 'utf8');
    assert.match(s, /viewBox="0 0 100 100"/, name);
    assert.match(s, /#001436/, name + ' Navy');
    assert.match(s, /#B6633F/, name + ' Kupfer');
    assert.doesNotMatch(s, /<script|<image|href=|@import|https?:\/\/(?!www\.w3\.org)/, name + ' keine Fremdverweise');
    assert.doesNotMatch(s, /<rect[^>]*fill="#fff|<rect[^>]*width="100"[^>]*height="100"/i, name + ' transparenter Grund');
  }
});

test('Emojis: rund 60 in drei Gruppen, ohne Doppelte, als Sticker speicherbar', () => {
  assert.deepEqual(EMOJIS.map(g => g.gruppe), ['gesichter', 'kueche', 'symbole']);
  const alle = EMOJIS.flatMap(g => g.zeichen);
  assert.ok(alle.length >= 55 && alle.length <= 70, 'Anzahl ' + alle.length);
  assert.equal(new Set(alle).size, alle.length);
  for (const z of alle) {
    const e = saeubereElement({ id: 'e1', gruppe: 0, art: 'sticker', zeichen: z, x: 0, y: 0, b: STICKER_GROESSE, h: STICKER_GROESSE });
    assert.equal(e.zeichen, z, z + ' bleibt beim Säubern ganz');
  }
});

test('bildFehlerSchluessel: jeder Fehler der Logik hat einen Text in Deutsch und Englisch', () => {
  for (const code of ['art', 'gross', 'anzahl', 'menge', 'kaputt']) {
    const k = bildFehlerSchluessel(code);
    assert.ok(k.startsWith('bild.'), code);
    for (const sprache of ['de', 'en']) assert.ok(TEXTE[sprache][k], `${sprache} ${k}`);
  }
  assert.equal(bildFehlerSchluessel('anzahl'), bildFehlerSchluessel('menge'));
});

test('plusUnterwegs: laufende Hochladen zählen schon mit', () => {
  assert.deepEqual(plusUnterwegs({ bilder: 3, bytes: 100 }, { n: 2, bytes: 50 }), { bilder: 5, bytes: 150 });
  assert.deepEqual(plusUnterwegs(null, { n: 1, bytes: 5 }), { bilder: 1, bytes: 5 });
});
