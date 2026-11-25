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

## Firebase einrichten (einmalig)

Eingerichtet am 25.11.2026: Projekt «Rabiosa» (`rabiosa-fb63b`), Gratis-Stufe, Datenbank in Zürich, ohne Analytics und ohne Gemini. Die Regeln aus `firestore.rules` sind veröffentlicht; geprüft ist bisher, was ein nicht angemeldetes Gerät darf. Ein ganzes Spiel mit echten Handys steht noch aus.

Ändert sich `firestore.rules`, muss der neue Stand in der Konsole unter **Firestore > Regeln** veröffentlicht werden. Die Schritte unten gelten für ein neues Projekt.

1. In der Firebase-Konsole ein Projekt anlegen (Gratis-Stufe «Spark»), darin eine Web-App registrieren.
2. **Authentication > Anmeldemethode:** «E-Mail/Passwort» einschalten. Unter **Einstellungen > Autorisierte Domains** `pilman1982.github.io` hinzufügen.
3. **Firestore-Datenbank** anlegen: Standard, Kennung `(default)`, Produktionsmodus, Standort `europe-west6` (Zürich). Der Standort lässt sich später nicht mehr ändern.
4. **Firestore > Regeln:** den Inhalt von `firestore.rules` einfügen und veröffentlichen.
5. **Firestore > Daten:** Sammlung `einstellungen`, Dokument `einladung`, Feld `code` (Text) mit dem Einladungscode. Gross- und Kleinschreibung spielen keine Rolle. Kein Gerät kann dieses Dokument lesen.
6. Die Angaben der Web-App in `js/config.js` eintragen (sie sind nicht geheim).

Einladungscode ändern: Feld `code` in Schritt 5 überschreiben. Bestehende Konten bleiben freigeschaltet.
Konto sperren: in **Authentication** das Konto deaktivieren und in **Firestore > Daten > dozierende** das Dokument mit seiner Kennung löschen.

Grenzen der Gratis-Stufe: 50 000 Lese- und 20 000 Schreibvorgänge pro Tag (der Tag beginnt um etwa 9 Uhr Schweizer Zeit). Das reicht für ungefähr 15 bis 20 Spiele pro Tag. Ist die Grenze erreicht, bleibt ein laufendes Spiel stehen; für den Betrieb an der ganzen Schule ist die Bezahlstufe «Blaze» die sichere Wahl.
