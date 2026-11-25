# Rabiosa

Das Live-Quiz der EHL Hotelfachschule Passugg. Die Lehrperson zeigt am Beamer Fragen, die Klasse antwortet am Handy, vorne läuft die Rangliste.

## Ausprobieren ohne Firebase (Demo-Modus)

```
node werkzeug/server.mjs
```

Dann im Browser `http://localhost:8765/?demo=1` öffnen. Im Demo-Modus bleibt alles in diesem Browser; mehrere Fenster desselben Browsers spielen miteinander (ein Fenster als Beamer, weitere als «Handys»). Der Einladungscode im Demo-Modus lautet `demo`.

Solange in `js/config.js` kein Firebase-Projekt eingetragen ist, läuft die Seite immer im Demo-Modus.

## Aufbau

| Ort | Inhalt |
|---|---|
| `index.html`, `css/rabiosa.css` | Gerüst und Aussehen |
| `js/main.js` | zeigt je nach Adresse die passende Ansicht |
| `js/ansicht/` | Startseite, Handy (`spieler.js`), Beamer, Studio, Editor, Rückblick |
| `js/logik/` | Punkte, Antwortprüfung, Quiz-Prüfung, Auswertung (ohne Browser testbar) |
| `js/store/` | Speicher: `demo.js` (Browser) und `firebase.js` (echter Betrieb), gleiche Schnittstelle |
| `js/avatar.js`, `js/qr.js`, `js/ton.js`, `js/i18n.js` | Avatare, QR-Code, Musik, Texte deutsch/englisch |
| `firestore.rules` | Regeln der Datenbank |
| `tests/` | automatische Tests |

Adressen: `#/` Startseite · `#/123456` Handy · `#/beamer/123456` Beamer · `#/studio` Studio.

## Tests

```
node --test
```

## Texte ändern

Alle sichtbaren Texte stehen in `js/i18n.js`, je einmal deutsch und englisch. Ein Test prüft, dass keine Übersetzung fehlt.

## Schriften

Die Seite verwendet die EHL-Hausschriften Domaine Display und Hurme Geometric Sans, wenn sie auf dem Gerät installiert sind. Die Schriftdateien selbst sind lizenziert und gehören **nicht** in dieses Repo.

## Punkte

Eine richtige Antwort gibt sofort 1000 Punkte und fällt gleichmässig bis auf 500 am Ende der Zeit. Teilweise richtige Antworten (Mehrfachauswahl, Schätzfrage, Reihenfolge) bekommen den entsprechenden Anteil.
