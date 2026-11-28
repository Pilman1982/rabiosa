import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlExport, dateiname } from '../js/logik/tafelexport.js';

const S = { code: '123456', titel: 'Signature Dish', sprache: 'de', auftrag: 'Entwickeln Sie ein Gericht.', zonen: [{ text: 'Inspiration', inhalt: 'Bilder sammeln' }, { text: 'Unser Gericht', inhalt: '' }], gruppen: ['Gruppe 1', 'Gruppe 2', 'Gruppe 3'] };
const G1 = {
  nr: 2, name: 'Gruppe 3', mitglieder: ['Lena', 'Marco'],
  elemente: [
    { id: 'e1', gruppe: 2, art: 'bild', x: 100, y: 100, b: 400, h: 300, z: 1, bildPfad: 'tafeln/1/0/e1' },
    { id: 'e2', gruppe: 2, art: 'zettel', x: 700, y: 200, b: 260, h: 260, z: 2, farbe: '#FFF6C9', text: 'Saisonal' },
    { id: 'e3', gruppe: 2, art: 'pfeil', x: 0, y: 0, b: 300, h: 100, z: 3, punkte: [0, 0, 300, 100], dicke: 2 },
    { id: 'e4', gruppe: 2, art: 'sticker', x: 1700, y: 100, b: 140, h: 140, z: 4, zeichen: 'ehl:stern' },
  ],
};
const G_LEER = { nr: 0, name: 'Gruppe 1', mitglieder: [], elemente: [] };

test('htmlExport: eine Datei ohne externe Verweise, Bilder eingebettet, Gruppen wählbar', () => {
  const html = htmlExport({ sitzung: S, gruppen: [G1, G_LEER], bilder: new Map([['tafeln/1/0/e1', 'data:image/gif;base64,R0lG']]), sprache: 'de' });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!/src="https?:|href="https?:|@import|url\(https?:/.test(html), 'nichts aus dem Netz');
  assert.ok(html.includes('data:image/gif;base64,R0lG'));
  assert.ok(html.includes('Gruppe 3') && html.includes('Lena'));
  assert.ok(!/Domaine|Hurme/.test(html), 'keine EHL-Schriften');
});
test('htmlExport: leere Gruppe ergibt ein leeres Board mit Kopf (Review Focus 5)', () => {
  const html = htmlExport({ sitzung: S, gruppen: [G_LEER], bilder: new Map(), sprache: 'de' });
  assert.ok(html.includes(G_LEER.name));
});
test('htmlExport: Text der Studierenden wird nicht als HTML ausgeführt', () => {
  const html = htmlExport({ sitzung: S, gruppen: [{ ...G1, elemente: [{ id: 'e9', gruppe: 0, art: 'text', x: 0, y: 0, b: 100, h: 50, text: '<script>alert(1)</script>' }] }], bilder: new Map(), sprache: 'de' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
});
test('dateiname: ohne Umlaute und Leerzeichen', () => {
  assert.equal(dateiname({ titel: 'Signature Dish: Küche' }, { name: 'Gruppe 3' }, 'html'), 'Signature_Dish_Kueche_Gruppe_3.html');
  assert.equal(dateiname({ titel: 'Signature Dish' }, null, 'pdf'), 'Signature_Dish_alle_Gruppen.pdf');
});

// ---------- Ergänzungen ----------
const daten = html => {
  const m = /<script type="application\/json" id="tx-daten">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'Daten eingebettet');
  return JSON.parse(m[1]);
};

test('htmlExport: Daten sicher eingebettet (kein «<», keine Zeilentrenner U+2028/U+2029) und vollständig lesbar', () => {
  const boese = '</script><img src=x onerror=alert(1)>\u2028\u2029';
  const sitzung = { ...S, titel: boese };
  const html = htmlExport({ sitzung, gruppen: [{ ...G1, name: boese, mitglieder: [boese] }], bilder: new Map(), sprache: 'de' });
  const json = /<script type="application\/json" id="tx-daten">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(!json.includes('<') && !json.includes('\u2028') && !json.includes('\u2029'));
  const d = JSON.parse(json);
  assert.equal(d.titel, boese);
  assert.equal(d.gruppen[0].name, boese);
  assert.ok(!html.includes('<img src=x'), 'auch der Seitentitel ist maskiert');
});

test('htmlExport: nur benutzte Bilder, nur data:image-Adressen, EHL-Sticker als eingebettete Datei, Emojis als Text', () => {
  const bilder = new Map([
    ['tafeln/1/0/e1', 'data:image/gif;base64,R0lG'],
    ['tafeln/1/0/unbenutzt', 'data:image/png;base64,AAAA'],
    ['ehl:stern', 'data:image/svg+xml;base64,PHN2Zz4='],
  ]);
  const emoji = { id: 'e5', gruppe: 2, art: 'sticker', x: 10, y: 10, b: 100, h: 100, zeichen: '🍳' };
  const html = htmlExport({ sitzung: S, gruppen: [{ ...G1, elemente: [...G1.elemente, emoji] }], bilder, sprache: 'de' });
  assert.ok(!html.includes('data:image/png;base64,AAAA'), 'unbenutztes Bild bleibt draussen');
  assert.ok(html.includes('data:image/svg+xml;base64,PHN2Zz4='));
  const d = daten(html);
  assert.ok(d.gruppen[0].elemente.some(e => e.zeichen === '🍳'));
  const fremd = htmlExport({ sitzung: S, gruppen: [G1], bilder: new Map([['tafeln/1/0/e1', 'javascript:alert(1)']]), sprache: 'de' });
  assert.ok(!fremd.includes('javascript:alert(1)'));
});

test('htmlExport: Schritte wie die Präsentation, Pfeilspitzen vorberechnet, Elemente nach z sortiert, Farben geprüft', () => {
  const pfeil = { id: 'e0', gruppe: 2, art: 'pfeil', x: 0, y: 0, b: 300, h: 100, z: 9, punkte: [0, 0, 300, 100], dicke: 2, farbe: 'red;background:url(x)' };
  const d = daten(htmlExport({ sitzung: S, gruppen: [{ ...G1, elemente: [pfeil, ...G1.elemente] }], bilder: new Map(), sprache: 'en' }));
  assert.deepEqual(d.schritte, ['gesamt', 0, 1, 'gesamt']);
  assert.deepEqual(d.texte, ['Overview', '1 Inspiration', '2 Unser Gericht', 'Overview']);
  assert.deepEqual([d.raster.b, d.raster.h], [3200, 900]);
  const ids = d.gruppen[0].elemente.map(e => e.id);
  assert.deepEqual(ids, ['e1', 'e2', 'e3', 'e4', 'e0']);
  const p = d.gruppen[0].elemente.find(e => e.id === 'e0');
  assert.equal(p.spitze.length, 6);
  assert.equal(p.farbe, undefined, 'ungültige Farbe fällt weg');
  assert.equal(d.sprache, 'en');
});

test('htmlExport: Gruppenwahl nur bei mehreren Gruppen; ohne Zonen nur «Gesamt»', () => {
  const eins = daten(htmlExport({ sitzung: { ...S, zonen: [] }, gruppen: [G_LEER], bilder: new Map(), sprache: 'de' }));
  assert.equal(eins.gruppen.length, 1);
  assert.deepEqual(eins.schritte, ['gesamt']);
  assert.deepEqual([eins.raster.b, eins.raster.h], [1600, 900]);
  const zwei = daten(htmlExport({ sitzung: S, gruppen: [G1, G_LEER], bilder: new Map(), sprache: 'de' }));
  assert.deepEqual(zwei.gruppen.map(g => g.name), ['Gruppe 3', 'Gruppe 1']);
});

test('htmlExport: der eingebaute Darsteller kommt ohne Importe aus und zeichnet Text nur als Text', () => {
  const html = htmlExport({ sitzung: S, gruppen: [G1], bilder: new Map(), sprache: 'de' });
  const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(skripte.length, 1);
  const code = skripte[0];
  assert.ok(!/\bimport\b|\brequire\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|fetch\(/.test(code));
  assert.ok(code.includes('textContent'));
  assert.ok(/Georgia/.test(html) && /system-ui/.test(html));
  assert.doesNotThrow(() => new Function(code), 'gültiges Skript');
});

test('dateiname: weitere Sonderzeichen, leerer Titel', () => {
  assert.equal(dateiname({ titel: '  Ödland / Übung   Nr. 2 ' }, { name: 'Équipe Ä' }, 'html'), 'Oedland_Uebung_Nr_2_Equipe_Ae.html');
  assert.equal(dateiname({ titel: '' }, null, 'html'), 'Whiteboard_alle_Gruppen.html');
  assert.equal(dateiname({ titel: 'Strasse' }, { name: 'Grüße' }, 'html'), 'Strasse_Gruesse.html');
});
