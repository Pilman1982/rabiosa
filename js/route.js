// Adresse (Hash) -> [Ansicht, ...Werte]. Eigene Datei, damit sie ohne Seite getestet werden kann.
//   #/                      Startseite (Code eingeben)
//   #/123456                Handy der Studierenden
//   #/beamer/123456         Beamer / Spielleitung
//   #/studio                Studio der Dozierenden
//   #/studio/quiz/ID        Quiz-Editor
//   #/studio/rueckblick/ID  Rückblicke zu einem Quiz
//   #/cloche/ID             Cloche: Board mit Gruppen auf diesem Laptop
//   #/p/123456              Handy in einer Präsentation
//   #/praesentation/123456  Präsentation am Beamer
//   #/studio/folien/ID      Editor einer Präsentation
// Whiteboard (nur Fassung der Dozierenden, in der Student-Fassung führen alle auf die Startseite):
//   #/studio/whiteboard/ID  Editor einer Whiteboard-Vorlage
//   #/studio/tafeln/ID      Ergebnisse einer Vorlage
//   #/tafel/CODE            Übersicht der Sitzung (Leitung)
//   #/tafel/CODE/G          Board der Gruppe G (ab 0)
//   #/tafel/CODE/G/zeigen   Gruppe zeigen
//   #/tafel/CODE/druck      Druck aller Gruppen;  #/tafel/CODE/G/druck  Druck einer Gruppe
//   #/t/CODE                Beitritt der Studierenden;  #/t/CODE/zeigen  Zeigen als Gruppe;  #/t/CODE/druck  Druck als Gruppe
import { zeigeWhiteboard } from './variante.js';

const CODE = /^\d{6}$/;
const GRUPPE = /^\d{1,2}$/;

function tafelRoute(teile) {
  const [kopf, a, b, c] = teile;
  if (kopf === 'studio') {
    if (a === 'whiteboard' && b) return ['tafeleditor', b];
    if (a === 'tafeln' && b) return ['tafelergebnisse', b];
    return null;
  }
  if (kopf === 'tafel' && CODE.test(a || '')) {
    if (!b) return ['tafeluebersicht', a];
    if (b === 'druck') return ['tafeldruck', a];               // «druck» gewinnt gegen eine Gruppe
    if (!GRUPPE.test(b)) return null;
    if (!c) return ['tafelbrett', a, b];
    if (c === 'zeigen') return ['tafelzeigen', a, b];
    if (c === 'druck') return ['tafeldruck', a, b];
    return null;
  }
  if (kopf === 't' && CODE.test(a || '')) {
    if (!b) return ['tafelbeitritt', a];
    if (b === 'zeigen') return ['tafelzeigen', a, 'gast'];
    if (b === 'druck') return ['tafeldruck', a, 'gast'];
  }
  return null;
}

export function route(hash, variante) {
  const teile = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!teile.length) return ['start'];
  const tafel = tafelRoute(teile);
  if (tafel) return zeigeWhiteboard(variante) ? tafel : ['start'];
  if (/^\d{6}$/.test(teile[0])) return ['spieler', teile[0]];
  if (teile[0] === 'cloche' && teile[1]) return ['cloche', teile[1]];
  if (teile[0] === 'p' && /^\d{6}$/.test(teile[1] || '')) return ['teilnahme', teile[1]];
  if (teile[0] === 'praesentation' && /^\d{6}$/.test(teile[1] || '')) return ['praesentation', teile[1]];
  if (teile[0] === 'beamer' && /^\d{6}$/.test(teile[1] || '')) return ['beamer', teile[1]];
  if (teile[0] === 'studio') {
    if (teile[1] === 'quiz' && teile[2]) return ['editor', teile[2]];
    if (teile[1] === 'folien' && teile[2]) return ['folieneditor', teile[2]];
    if (teile[1] === 'rueckblick' && teile[2]) return ['rueckblick', teile[2]];
    return ['studio'];
  }
  return ['start'];
}
