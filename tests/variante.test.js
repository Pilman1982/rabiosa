import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { varianteVon, VARIANTE, zeigeWhiteboard } from '../js/variante.js';
import { route } from '../js/route.js';
import { konfigFuer } from '../js/store/index.js';
import { FIREBASE, FIREBASE_STUDENT } from '../js/config.js';
import { t, TEXTE, TEXTE_STUDENT } from '../js/i18n.js';

const lies = pfad => readFileSync(new URL(pfad, import.meta.url), 'utf8');

test('varianteVon: die Seite sagt selbst, welche Fassung läuft; alles andere ist die Fassung für Dozierende', () => {
  assert.equal(varianteVon({ documentElement: { dataset: { variante: 'student' } } }), 'student');
  assert.equal(varianteVon({ documentElement: { dataset: {} } }), 'lehre');
  assert.equal(varianteVon({ documentElement: { dataset: { variante: 'irgendwas' } } }), 'lehre');
  assert.equal(varianteVon(undefined), 'lehre');
  assert.equal(VARIANTE, 'lehre', 'ohne Seite (hier im Test) gilt die Fassung für Dozierende');
});

test('konfigFuer: jede Fassung hat ihr eigenes Firebase-Projekt', () => {
  assert.equal(konfigFuer('lehre'), FIREBASE);
  assert.equal(konfigFuer('student'), FIREBASE_STUDENT);
  if (FIREBASE && FIREBASE_STUDENT) assert.notEqual(FIREBASE.projectId, FIREBASE_STUDENT.projectId, 'nie dieselbe Datenbank');
});

test('Texte der Student-Fassung: nur bekannte Schlüssel, in beiden Sprachen, mit denselben Platzhaltern, ohne ß', () => {
  const platzhalter = s => (s.match(/\{\w+\}/g) || []).sort();
  assert.deepEqual(Object.keys(TEXTE_STUDENT.de).sort(), Object.keys(TEXTE_STUDENT.en).sort());
  assert.ok(Object.keys(TEXTE_STUDENT.de).length > 0);
  for (const sprache of ['de', 'en']) for (const [k, v] of Object.entries(TEXTE_STUDENT[sprache])) {
    assert.ok(k in TEXTE[sprache], sprache + ':' + k + ' gibt es in der Hauptfassung nicht');
    assert.ok(typeof v === 'string' && v.trim() && !v.includes('ß'), sprache + ':' + k);
    assert.deepEqual(platzhalter(v), platzhalter(TEXTE[sprache][k]), sprache + ':' + k);
  }
});

test('t: die Student-Fassung ersetzt nur ihre eigenen Texte, der Rest bleibt gleich', () => {
  assert.equal(t('de', 'studio.kollegium'), 'Kollegium');
  assert.equal(t('de', 'studio.kollegium', {}, true), TEXTE_STUDENT.de['studio.kollegium']);
  assert.notEqual(t('de', 'studio.kollegium', {}, true), 'Kollegium');
  assert.equal(t('en', 'studio.kollegium', {}, true), TEXTE_STUDENT.en['studio.kollegium']);
  assert.equal(t('de', 'studio.fragen', { n: 3 }, true), '3 Fragen');
  assert.equal(t('xx', 'studio.kollegium', {}, true), TEXTE_STUDENT.de['studio.kollegium'], 'unbekannte Sprache = Deutsch');
});

test('student/index.html ist dieselbe Seite wie index.html, nur als Student-Fassung und eine Ebene tiefer', () => {
  const haupt = lies('../index.html'), student = lies('../student/index.html');
  assert.match(student, /<html lang="de-CH" data-variante="student">/);
  assert.doesNotMatch(haupt, /data-variante/);
  assert.match(student, /<title>Rabiosa Student<\/title>/);
  // Gleich bis auf: Kennzeichen, Titel und «../» vor den eigenen Dateien.
  const erwartet = haupt
    .replace('<html lang="de-CH">', '<html lang="de-CH" data-variante="student">')
    .replace('<title>Rabiosa</title>', '<title>Rabiosa Student</title>')
    .replace(/(href|src)="(bilder|css|js)\//g, '$1="../$2/');
  assert.equal(student, erwartet);
});

test('Bilder aus dem Programm hängen am Ort des Programms, nicht an der Adresse der Seite', () => {
  assert.match(lies('../js/ui.js'), /new URL\(`\.\.\/bilder\/ehl-\$\{s\}-\$\{farbe\}\.svg`, import\.meta\.url\)/);
});

test('zeigeWhiteboard: nur die Fassung der Dozierenden hat Whiteboards', () => {
  assert.equal(zeigeWhiteboard('lehre'), true);
  assert.equal(zeigeWhiteboard('student'), false);
});

test('route: bestehende Adressen bleiben, in beiden Fassungen', () => {
  for (const v of ['lehre', 'student']) {
    assert.deepEqual(route('', v), ['start']);
    assert.deepEqual(route('#/', v), ['start']);
    assert.deepEqual(route('#/123456', v), ['spieler', '123456']);
    assert.deepEqual(route('#/beamer/123456', v), ['beamer', '123456']);
    assert.deepEqual(route('#/p/123456', v), ['teilnahme', '123456']);
    assert.deepEqual(route('#/praesentation/123456', v), ['praesentation', '123456']);
    assert.deepEqual(route('#/cloche/q1', v), ['cloche', 'q1']);
    assert.deepEqual(route('#/studio', v), ['studio']);
    assert.deepEqual(route('#/studio/quiz/q1', v), ['editor', 'q1']);
    assert.deepEqual(route('#/studio/folien/q1', v), ['folieneditor', 'q1']);
    assert.deepEqual(route('#/studio/rueckblick/q1', v), ['rueckblick', 'q1']);
    assert.deepEqual(route('#/irgendwas', v), ['start']);
  }
});

test('route: Whiteboard-Adressen in der Fassung der Dozierenden', () => {
  assert.deepEqual(route('#/studio/whiteboard/q1', 'lehre'), ['tafeleditor', 'q1']);
  assert.deepEqual(route('#/studio/tafeln/q1', 'lehre'), ['tafelergebnisse', 'q1']);
  assert.deepEqual(route('#/tafel/123456', 'lehre'), ['tafeluebersicht', '123456']);
  assert.deepEqual(route('#/tafel/123456/2', 'lehre'), ['tafelbrett', '123456', '2']);
  assert.deepEqual(route('#/tafel/123456/2/zeigen', 'lehre'), ['tafelzeigen', '123456', '2']);
  assert.deepEqual(route('#/tafel/123456/druck', 'lehre'), ['tafeldruck', '123456']);
  assert.deepEqual(route('#/tafel/123456/2/druck', 'lehre'), ['tafeldruck', '123456', '2']);
  assert.deepEqual(route('#/t/123456', 'lehre'), ['tafelbeitritt', '123456']);
  assert.deepEqual(route('#/t/123456/zeigen', 'lehre'), ['tafelzeigen', '123456', 'gast']);
  assert.deepEqual(route('#/t/123456/druck', 'lehre'), ['tafeldruck', '123456', 'gast']);
  assert.deepEqual(route('#/t/abc', 'lehre'), ['start']);
  assert.deepEqual(route('#/tafel/12', 'lehre'), ['start']);
});

test('route: in der Student-Fassung führen alle Whiteboard-Adressen auf die Startseite', () => {
  for (const h of ['#/studio/whiteboard/q1', '#/studio/tafeln/q1', '#/tafel/123456', '#/tafel/123456/2', '#/tafel/123456/2/zeigen',
    '#/tafel/123456/druck', '#/tafel/123456/2/druck', '#/t/123456', '#/t/123456/zeigen', '#/t/123456/druck']) {
    assert.deepEqual(route(h, 'student'), ['start'], h);
  }
});

test('studio.js zeigt die Whiteboard-Einträge im Neu-Menü nur hinter zeigeWhiteboard(VARIANTE)', () => {
  const quelle = lies('../js/ansicht/studio.js');
  assert.match(quelle, /zeigeWhiteboard\(VARIANTE\)/);
  assert.match(quelle, /zeigeWhiteboard\(VARIANTE\)[\s\S]{0,200}studio\.neuWhiteboard/);
  assert.match(quelle, /zeigeWhiteboard\(VARIANTE\)[\s\S]{0,400}studio\.beispielWhiteboard/);
});

test('main.js benutzt route.js und fällt bei fehlenden Ansichten auf die Startseite zurück', () => {
  const quelle = lies('../js/main.js');
  assert.match(quelle, /from '\.\/route\.js'/);
  assert.match(quelle, /ANSICHTEN\[name\] \?\? ANSICHTEN\.start/);
});
