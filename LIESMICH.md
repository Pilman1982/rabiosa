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
| `js/logik/` | Punkte, Antwortprüfung, Quiz-Prüfung, Auswertung, Import, Wächter (ohne Browser testbar) |
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

Die Seite verwendet die EHL-Hausschriften Domaine Display und Hurme Geometric Sans, wenn sie auf dem Gerät installiert sind. Diese Schriftdateien sind lizenziert und gehören **nicht** in dieses Repo. Auf allen anderen Geräten (zum Beispiel den Handys der Klasse) springen zwei freie Schriften aus dem Ordner `schriften/` ein: Playfair Display und Jost.

## Punkte

Eine richtige Antwort gibt sofort 1000 Punkte und fällt gleichmässig bis auf 500 am Ende der Zeit. Teilweise richtige Antworten (Mehrfachauswahl, Schätzfrage, Reihenfolge) bekommen den entsprechenden Anteil.

## Firebase einrichten (einmalig)

Eingerichtet am 25.11.2026: Projekt «Rabiosa» (`rabiosa-fb63b`), Gratis-Stufe, Datenbank in Zürich, ohne Analytics und ohne Gemini. Die Regeln aus `firestore.rules` sind veröffentlicht; geprüft sind die Zugriffe ohne Anmeldung, Konto anlegen mit Einladungscode und ein ganzes Spiel mit allen sieben Fragetypen (zwei Test-Handys als Browserfenster ohne Anmeldung). Noch offen: echte Handys über das Netz, ein zweites Konto fürs Kollegium, der gemessene Verbrauch.

Ändert sich `firestore.rules`, muss der neue Stand in der Konsole unter **Firestore > Regeln** veröffentlicht werden. Die Schritte unten gelten für ein neues Projekt.

1. In der Firebase-Konsole ein Projekt anlegen (Gratis-Stufe «Spark»), darin eine Web-App registrieren.
2. **Authentication > Anmeldemethode:** «E-Mail/Passwort» einschalten. Unter **Einstellungen > Autorisierte Domains** `pilman1982.github.io` hinzufügen.
3. **Firestore-Datenbank** anlegen: Standard, Kennung `(default)`, Produktionsmodus, Standort `europe-west6` (Zürich). Der Standort lässt sich später nicht mehr ändern.
4. **Firestore > Regeln:** den Inhalt von `firestore.rules` einfügen und veröffentlichen.
5. **Firestore > Daten:** Sammlung `einstellungen`, Dokument `einladung`, Feld `code` (Text) mit dem Einladungscode. Gross- und Kleinschreibung spielen keine Rolle. Kein Gerät kann dieses Dokument lesen.
6. Die Angaben der Web-App in `js/config.js` eintragen (sie sind nicht geheim).

Einladungscode ändern: Feld `code` in Schritt 5 überschreiben. Bestehende Konten bleiben freigeschaltet.
Konto sperren: in **Authentication** das Konto deaktivieren und in **Firestore > Daten > dozierende** das Dokument mit seiner Kennung löschen.

## Zwei Fassungen: Dozierende und Studierende

Rabiosa gibt es zweimal mit demselben Programm:

| | Adresse | Firebase-Projekt |
|---|---|---|
| Dozierende | `https://pilman1982.github.io/rabiosa/` | `FIREBASE` in `js/config.js` |
| Studierende («Rabiosa Student») | `https://pilman1982.github.io/rabiosa/student/` | `FIREBASE_STUDENT` in `js/config.js` |

- Welche Fassung läuft, sagt die Seite selbst: `student/index.html` trägt `<html data-variante="student">` und lädt dasselbe Programm aus `../js/`. `js/variante.js` liest das Kennzeichen. Ein Test hält die beiden `index.html` gleich.
- Getrennt sind die Fassungen durch das Firebase-Projekt: eigene Konten, eigener Einladungscode, eigene Quiz, eigener Raum für Freigaben, eigenes Tageslimit. Kein Konto der einen Fassung kann Daten der anderen lesen.
- Eingerichtet am 27.11.2026: Projekt «Rabiosa Student» (`rabiosa-student`), Gratis-Stufe, Datenbank in Zürich, ohne Analytics und ohne Gemini, Anmeldung mit E-Mail und Passwort, Domain `pilman1982.github.io` autorisiert, Regeln aus `firestore.rules` veröffentlicht. Stünde `FIREBASE_STUDENT` auf `null`, liefe die Student-Fassung im Demo-Modus.
- Ändert sich `firestore.rules`, muss der neue Stand in **beiden** Projekten veröffentlicht werden.
- Was in der Student-Fassung anders heisst (zum Beispiel «Mitstudierende» statt «Kollegium»), steht in `TEXTE_STUDENT` in `js/i18n.js`. Alles Übrige ist gleich.
- Administrator der Student-Fassung ist, wem das Firebase-Projekt gehört: Einladungscode festlegen, Konten sperren und Quiz löschen geschieht in der Firebase-Konsole (siehe unten). Im Programm selbst gibt es keine Administrator-Rolle.

Student-Fassung einrichten: die Schritte 1 bis 5 unter «Firebase einrichten» mit einem zweiten Projekt wiederholen (dieselbe Datei `firestore.rules`), die Angaben der Web-App bei `FIREBASE_STUDENT` eintragen. Die Sammlung der Profile heisst auch dort `dozierende`.

## Ablage: Ordner, Arten und Suche

Konzept: `09 Hilfsmittel/Rabiosa/Studio Ordnung Konzept.md` im EHL-Ordner.

- **Ein Ordner für beides:** Jeder Inhalt liegt unter seinem Fach und dem Feld **Ordner** (zum Beispiel `HS26/Final`, Unterordner mit `/`, höchstens vier Stufen). Dieselbe Lage gilt in «Meine Inhalte» und, nach dem Freigeben, im Reiter «Kollegium». Schreibweisen fallen zusammen (Gross/Klein, Akzente).
- **Meine Inhalte:** Ordner zum Durchklicken mit Brotkrumen, auf der obersten Stufe zuerst «Zuletzt bearbeitet» (fünf Inhalte nach `geaendert`). **+ Neuer Ordner** legt auch leere Ordner an (auf der obersten Stufe ein Fach). Karten lassen sich auf einen Ordner oder eine Brotkrume ziehen oder über **Verschieben …** ablegen. Ordner unter einem Fach lassen sich umbenennen (ändert `ordner` bei allen eigenen Inhalten darin); löschen geht nur bei leeren Ordnern. Wird der letzte Inhalt aus einem Ordner verschoben, bleibt der Ordner als leerer stehen.
- **+ Neu ▾** fasst Neues Quiz, Neue Präsentation und die Beispiele zusammen. Neues (auch Importiertes) landet im offenen Ordner.
- **Arten:** In beiden Reitern filtern Knöpfe nach Quiz, Präsentationen und (später) Whiteboards. Ein Knopf erscheint nur, wenn es von dieser Art etwas gibt. Ein Inhalt ohne gültiges Feld `art` ist ein Quiz. Jede Karte trägt ihre Art als Etikett (Quiz Navy, Präsentation Petrol, Whiteboard Kupfer).
- **Suche** in beiden Reitern über Titel, Fach, Ordner (im Kollegium auch die Person), Fragen und Antworten. Mehrere Wörter müssen alle vorkommen; die gewählte Art gilt auch für die Treffer.
- **Daten:** Leere Ordner stehen pro Person in `ordnerlisten/{uid}` `{ liste: [{ fach, ordner }] }`, höchstens 300 Einträge (`LEERE_MAX`). Sobald etwas in einem solchen Ordner liegt, räumt das Studio den Eintrag weg. Verschieben und Umbenennen ändern nur `fach` und `ordner` (`store.quiz.verschieben`), nicht `geaendert`.
- **Regeln:** Der Block `ordnerlisten` in `firestore.rules` muss in **beiden** Projekten veröffentlicht sein. Im Projekt der Dozierenden nur diesen Block in den Konsolenstand einfügen, nicht die ganze Datei (der Block `checkout_rangliste` gehört dort nicht hin). Ohne veröffentlichte Regel läuft das Studio weiter: Verschieben geht, aber «+ Neuer Ordner» meldet einen Fehler, und ein geleerter Ordner bleibt nicht stehen.
- **Aufbau:** Logik in `js/logik/ablage.js` (Tests in `tests/ablage.test.js`), Speicher in `js/store/demo.js` und `js/store/firebase.js` (`ordner.laden`, `ordner.speichern`, `quiz.verschieben`), Ansicht in `js/ansicht/studio.js` (`ablage()` für beide Reiter, `verwaltung()` für «Meine»), Rückfrage mit Eingabe `eingabeFrage` in `js/ui.js`.

## Quiz mit einer KI erstellen und importieren

Im Studio öffnet **Quiz importieren** ein Fenster mit drei Schritten: Prompt kopieren, in eine KI einfügen (mit einem Thema, Unterlagen, einer Prüfung oder einem bestehenden Quiz), die Antwort der KI einfügen oder als Datei wählen. Rabiosa liest das Quiz ein, speichert es und öffnet es im Editor zum Durchlesen.

- Der Prompt steht in `js/prompt.js` (deutsch und englisch). Er verlangt ein Quiz als JSON in der Form von Rabiosa und verbietet, Prüfungsfragen zu übernehmen.
- Das Einlesen steht in `js/logik/import.js`. Es ist grosszügig beim Lesen (Text um das JSON herum, englische Feldnamen, Antworten als blosse Texte) und streng beim Ergebnis: Was fehlt, zeigt danach der Editor.
- Ein Test prüft, dass das Beispiel im Prompt selbst ohne Mängel einlesbar ist. Wer das Format ändert, ändert Prompt und Einlesen zusammen.

Quiz, die aus Prüfungen entstanden sind, gehören nicht in dieses öffentliche Repo.

## Wenn ein Handy den Anschluss verliert

Die Handys bekommen jeden neuen Stand über eine Live-Verbindung. Auf Handys kann sie still stehen, ohne dass es jemand merkt: nach einer Bildschirmsperre, nach dem Wechsel in eine andere App oder bei einem Netzwechsel. Dafür gibt es den Wächter (`js/logik/waechter.js`, Takt in `js/ansicht/spieler.js`): Das Handy sieht selbst nach, wie weit das Spiel ist (`store.spiel.nachsehen`, eine gewöhnliche Web-Anfrage an Firestore, siehe `js/store/rest.js`), und zwar sofort, wenn der Bildschirm wieder angeht oder das Netz zurückkommt, und sonst alle 10 Sekunden, solange es auf die Lehrperson wartet und nichts Neues gekommen ist. Hat es etwas verpasst, baut es zudem die Live-Verbindung neu auf.

Jedes Nachsehen kostet einen Lesezugriff. Bei 25 Handys und einem Spiel von 20 Minuten sind das grob 2000 bis 3000 zusätzliche Lesezugriffe.

Grenzen der Gratis-Stufe: 50 000 Lese- und 20 000 Schreibvorgänge pro Tag (der Tag beginnt um etwa 9 Uhr Schweizer Zeit). Das reicht für ungefähr 10 bis 15 Spiele pro Tag (geschätzt, einschliesslich Wächter). Ist die Grenze erreicht, bleibt ein laufendes Spiel stehen; für den Betrieb an der ganzen Schule ist die Bezahlstufe «Blaze» die sichere Wahl.

## Cloche: Board mit Gruppen

Cloche ist der zweite Spielmodus. Die Klasse spielt in Gruppen vor einem einzigen Bildschirm, ohne Handys. Im Studio öffnet **Als Cloche spielen** ein Quiz als Board (`#/cloche/<Quiz-ID>`); **Live spielen** ist das bisherige Spiel mit Handys. Konzept: `09 Hilfsmittel/Rabiosa/Cloche Konzept.md` im EHL-Ordner.

- **Ablauf:** Vorbereitung (2 bis 8 Gruppen, Überraschungen ein/aus, Druckvorlagen) → Board → die Gruppe am Zug wählt ein Feld → alle Gruppen beantworten die Frage (Ecken im Zimmer oder Schilder) → Lösung zeigen → die Lehrperson hakt ab, wer recht hatte → allenfalls Überraschung für die Gruppe am Zug → nächste Gruppe. Am Ende Siegerehrung.
- **Punkte:** Jede richtige Gruppe bekommt den Wert des Feldes: Stufe 1 = 100, 2 = 200, 3 = 300, ohne Stufe 100. Kein Tempo-Bonus. Mit «±» lassen sich Punkte von Hand ändern, mit «↶» oder Strg+Z der letzte Schritt zurücknehmen.
- **Überraschungen** auf etwa jedem fünften Feld: Trinkgeld (+200), Doppelte Portion, Lebensmittelinspektor (−200), Mundraub, Tischwechsel, Spendierrunde. Kein Stand fällt unter 0. Werte und Karten stehen an einer Stelle in `js/logik/cloche.js`.
- **Thema und Stufe:** Zwei freiwillige Felder pro Frage (`thema`, `stufe`), im Editor unter «Für Cloche», im KI-Prompt beschrieben, vom Import gelesen. Gleiches Thema = eine Spalte im Board (höchstens 8 Spalten). Ohne Themen oder bei mehr als 8 zeigt das Board nummerierte Felder. Mehr als 36 Fragen: Das Board zieht 36 zufällig. Die Datenbank-Regeln brauchen dafür keine Änderung.
- **Spielstand:** nur im Browser (`localStorage`, Schlüssel `rabiosa-cloche-v1`). Nach dem Laden des Quiz braucht Cloche keine Datenbank mehr; Neuladen setzt das Spiel am gleichen Ort fort (eine offene Frage beginnt mit voller Zeit). Kein Rückblick, kein Export.
- **Druckvorlagen** (`js/ansicht/cloche-druck.js`): Ecken A bis D (bei Fragen mit 5 oder 6 Antworten bis F) und Richtig/Falsch als A4 quer, pro Gruppe Schilder im Format A5 (zwei pro Blatt A4, Schnittlinie in der Mitte). Alle Masse in mm mit 10 mm Rand; Buchstaben in Jost (freie Schrift im Repo), ohne Kontur. Keine absolut positionierten Elemente in den Blättern: Chrome zeichnet sie beim Seitenumbruch sonst auf die falsche Seite. Gedruckt wird über den Browser; «Hintergrundgrafiken» einschalten.
- **Aufbau:** Regeln ohne Browser testbar in `js/logik/cloche.js` (Tests in `tests/cloche.test.js`), Ansicht in `js/ansicht/cloche.js`, Aussehen im Abschnitt «Cloche» in `css/rabiosa.css`, Texte unter `cloche.*`, `karte.*` und `druck.*` in `js/i18n.js`.

## Präsentation: Abstimmungen wie bei Mentimeter

Der dritte Modus neben Live-Quiz und Cloche. Die Lehrperson zeigt Folien am Beamer, die Klasse antwortet am Handy, **ohne Namen, ohne Punkte, ohne Zeitlimite**; die Ergebnisse erscheinen live. Im Studio: **+ Neue Präsentation** oder **Beispiel-Präsentation anlegen**, auf der Karte **Präsentieren**.

- **Folien:** Abstimmung (eine oder mehrere Antworten, Säulen), Wortwolke (1 bis 3 Wörter pro Person, gleiche Wörter werden nach Schreibweise zusammengezählt), Skala (1 bis 6 Aussagen auf 1–5, 1–7, 1–10 oder 0–10, Durchschnitt und Verteilung), offene Frage (bis 250 Zeichen, Kartenwand), Rangfolge (gemeinsame Reihenfolge nach durchschnittlichem Platz), 100 Punkte verteilen, Inhaltsfolie (Titel, Text mit Aufzählung, Bild).
- **Am Beamer** (`#/praesentation/<Code>`): Pfeiltasten, Bild auf/ab (Presenter) oder Leertaste blättern, auch zurück. `H` verbirgt die Ergebnisse dieser Folie, `Q` zeigt den QR-Code gross. Werkzeug oben rechts: Abstimmung schliessen und wieder öffnen, Vollbild, Beenden. Offene Antworten blendet ein Klick aufs ✕ der Karte aus (für alle, auch im Rückblick). Neuladen setzt am gleichen Ort fort.
- **Am Handy** (`#/p/<Code>`): Der QR-Code führt direkt hin; wer den Code auf der Startseite eintippt, wird umgeleitet. Kein Name, kein Avatar. Pro Folie eine Antwort; wer schon geantwortet hat, sieht «Danke», auch nach dem Zurückblättern.
- **Ergebnisse:** Beim Beenden speichert der Beamer die Ergebnisse aller Folien mit Antworten als Rückblick (Knopf **Ergebnisse** im Studio), ohne Kennungen der Handys und ohne Ausgeblendetes.
- **Daten:** Eine Präsentation ist ein Quiz-Dokument mit `art: 'praesentation'`, die Folien stehen in `fragen`. Darum gelten Freigabe ans Kollegium, Ordner, Suche, Kopieren und Löschen unverändert. `quizFehler` gibt für Präsentationen die Mängel der Folien zurück; Cloche öffnet keine Präsentation. Eine Sitzung ist ein Spiel-Dokument mit `art`, `status` (`warteraum`, `folie`, `schluss`, `ende`), `folieNr`, `folie`, `stand` (zählt jede Änderung, damit die Handys auch das Zurückblättern als neu erkennen) und `geschlossen`.
- **Regeln:** Antworten als Text dürfen 300 Zeichen lang sein (vorher 60), für die offene Frage. Ein Test hält `firestore.rules` und `js/store/firebase.js` gleich. **Vor dem Veröffentlichen** die Regeln in beiden Firebase-Projekten veröffentlichen, sonst scheitern offene Antworten über 60 Zeichen.
- **Aufbau:** Regeln und Auswertung ohne Browser testbar in `js/logik/praesentation.js` (Tests in `tests/praesentation.test.js`); Zeichnen der Folien und Ergebnisse in `js/ansicht/folien.js` (Beamer, Vorschau im Editor, Rückblick); Beamer `js/ansicht/praesentation.js`, Handy `js/ansicht/teilnahme.js`, Editor `js/ansicht/folieneditor.js`; Aussehen im Abschnitt «Präsentation» in `css/rabiosa.css`; Texte unter `folie.*`, `fe.*`, `mangelF.*`, `pb.*`, `ph.*`, `rbP.*` in `js/i18n.js`.
- **Noch nicht dabei:** Fragen der Klasse mit Daumen hoch (Q&A, bräuchte mehrere Einträge pro Person), Quizfolien mitten in der Präsentation (dafür gibt es das Live-Quiz), Import per KI.

## Whiteboard: gemeinsames Board pro Gruppe

Der vierte Modus. Gruppen der Klasse arbeiten am eigenen Handy oder Laptop auf einem gemeinsamen Board (Zettel, Text, Zeichnen, Pfeile, Formen, Sticker, Bilder), die Lehrperson sieht alle Boards, moderiert und präsentiert. **Nur in der Fassung der Dozierenden**: In der Student-Fassung gibt es keinen Knopf und keine Ansicht, alle Adressen führen dort auf die Startseite. Konzept: `09 Hilfsmittel/Rabiosa/Whiteboard Konzept.md` im EHL-Ordner.

- **Ablauf:** Vorlage im Studio anlegen (Auftrag, 0 bis 6 Zonen, Gruppenzahl) → **Starten** (sechsstelliger Code, Gruppen werden angelegt) → Studierende treten über `#/t/CODE` bei (Gruppe und Vorname wählen) → Board → die Leitung sieht die Übersicht und moderiert (sperren, Mitglieder entfernen, Elemente löschen) → die Gruppe gibt ab (Board wird schreibgeschützt) → Präsentieren → Herunterladen als PDF oder HTML → **Ergebnisse** im Studio, Sitzung beenden und löschen.
- **Adressen** (`js/route.js`): `#/studio/whiteboard/ID` Editor der Vorlage, `#/studio/tafeln/ID` Ergebnisse, `#/tafel/CODE` Übersicht der Leitung, `#/tafel/CODE/G` Board der Gruppe G (ab 0), `#/tafel/CODE/G/zeigen` Gruppe zeigen, `#/tafel/CODE/druck` und `#/tafel/CODE/G/druck` Druck, `#/t/CODE` Beitritt der Studierenden, `#/t/CODE/zeigen` und `#/t/CODE/druck` als Gruppe.
- **Daten:** Die Vorlage ist ein Quiz-Dokument mit `art: 'whiteboard'` (Zonen in `fragen`, `auftrag`, `gruppenVorgabe`), darum gelten Ordner, Freigabe, Suche und Kopieren unverändert. Eine Sitzung ist `tafeln/{code}` (`hostUid`, `vorlageId`, `titel`, `auftrag`, `zonen`, `gruppen`, `gesperrt`, `status` `offen` oder `beendet`, `erstellt`) mit Untersammlungen `mitglieder/{uid}` (`gruppe`, `name`, `zuletzt`; «online» = Lebenszeichen jünger als 70 Sekunden), `elemente/{id}` und `zaehler/{gruppe}` (`bilder`, `bytes`, `letztes`). Bilder liegen in Storage unter `tafeln/{code}/{gruppe}/{elementId}` und werden nie über öffentliche Links ausgeliefert, sondern mit geprüftem Zugriff geladen (`getBlob`).
- **Grenzwerte** (alle an einer Stelle in `js/logik/tafel.js`): GIF höchstens 8 MB; statische Bilder werden auf 2000 px an der langen Seite verkleinert; erlaubt sind PNG, JPG, WebP und GIF; höchstens 40 Bilder und 100 MB pro Board; 0 bis 6 Zonen (jede 16:9, ein Element gehört zur Zone, in der seine Mitte liegt); 2 bis 8 Gruppen (Vorgabe 5); Vorname höchstens 16 Zeichen; Text höchstens 2000 Zeichen.
- **Regeln:** `firestore.rules` (Block «Whiteboard», `tafeln` mit allen Untersammlungen) verlangt für das Erstellen einer Sitzung das Dokument `einstellungen/whiteboard`, das nur im Projekt der Dozierenden existiert; ohne dieses Dokument ist der Modus im Studenten-Projekt gesperrt. Lesen und Schreiben im Board: die Leitung immer, Mitglieder nur in der eigenen Gruppe, solange die Sitzung offen ist (Schreiben zusätzlich nur, solange die Gruppe nicht abgegeben hat). `storage.rules` folgt denselben Regeln über die Sitzung in Firestore und prüft Grösse (8 MB) und Bildart.
- **Anmeldung der Studierenden:** anonym (Firebase-Anbieter «Anonym»), ohne Konto. Dieselbe Gast-Kennung kommt in dieselbe Gruppe mit demselben Namen zurück (Neuladen, Laptop zugeklappt, nächste Woche im gleichen Browser).
- **Haken `ctx.exportHtml(code, gruppe)`:** gesetzt in `js/main.js`, Umsetzung in `js/ansicht/tafelexport.js`. `gruppe === null` = alle Gruppen (nur die Leitung), eine Zahl = nur diese Gruppe. Gibt ein Promise zurück; ein Fehler erscheint als Meldung. Die Ansichten rufen ihn nur auf, wenn er existiert. Die Datei enthält Bilder eingebettet und keine EHL-Schriftdateien.
- **Aufbau:** Regeln und Rechnen ohne Browser in `js/logik/tafel.js`, `tafelbilder.js`, `tafelbrett.js`, `tafeluebersicht.js`, `tafelzeigen.js`, `tafelergebnisse.js`, `tafelexport.js` (Tests: `tests/tafel*.test.js`, dazu `tests/tafel-regeln.test.js` für die Regeldateien). Ansichten in `js/ansicht/tafeleditor.js`, `tafelbeitritt.js`, `tafelbrett.js`, `tafelwerkzeuge.js`, `tafelelemente.js`, `tafelbilder.js`, `tafeluebersicht.js`, `tafelzeigen.js`, `tafeldruck.js`, `tafelergebnisse.js`, `tafelexport.js`. Das Storage-Modul wird nur in Whiteboard-Ansichten geladen. Texte unter `tafel.*` und verwandten Schlüsseln in `js/i18n.js`.
- **Sitzungen werden nie automatisch aufgeräumt.** Nach «Sitzung beenden» haben Studierende keinen Zugang mehr; Herunterladen für eine Gruppe geht ab «Abgeben» bis zum Beenden. Löschen räumt Sitzung, Elemente und deren Bilder weg.
- **Bekannte Grenzen:**
  - `bildBytes` meldet das Gerät selbst; die Zähler (40 Bilder, 100 MB) stützen sich darauf und sind kein harter Schutz gegen ein manipuliertes Gerät. Die Grösse der Datei begrenzt `storage.rules` unabhängig davon auf 8 MB.
  - Verwaiste Dateien in Storage sind möglich (Datei hochgeladen, Element aber nie angelegt, etwa bei Verbindungsabbruch). Sie zählen nicht im Board; das Löschen der Sitzung entfernt nur Dateien, zu denen ein Element gehört. Gelegentlich in der Storage-Konsole unter `tafeln/` nachsehen.
  - Mitglieder können die Gruppe wechseln; die Leitung sieht das in der Übersicht und kann sie entfernen.
  - Gruppennamen lassen sich nach dem Start nicht mehr erweitern (Gruppenzahl ist fest).
  - Bilder lassen sich nicht rückgängig machen.
  - Die Regeln (`firestore.rules`, `storage.rules`) wurden durchgesehen, aber noch nicht gegen einen Emulator laufen gelassen; die Abnahme gegen die echte Datenbank steht noch aus.

### Whiteboard einrichten (einmalig, nur Projekt der Dozierenden `rabiosa-fb63b`)

In dieser Reihenfolge; Kreditkarte und Passwörter gibt Michael selbst ein.

1. **Blaze:** Projekt auf die Bezahlstufe «Blaze» stellen (Storage braucht sie) und in Google Cloud unter **Billing > Budgets** eine Budget-Warnung von 5 CHF pro Monat anlegen.
2. **Storage** anlegen, Standort `europe-west6` (Zürich, lässt sich später nicht ändern). Den Bucket-Namen mit `storageBucket` in `js/config.js` vergleichen (`rabiosa-fb63b.firebasestorage.app`).
3. **Storage > Regeln:** den Inhalt von `storage.rules` einfügen und veröffentlichen. Nur im Projekt der Dozierenden.
4. **CORS** setzen (damit der Browser Bilder per `getBlob` laden darf): in der Google Cloud Shell die Datei `cors.json` mit dem Inhalt von `werkzeug/cors.json` anlegen und `gcloud storage buckets update gs://<bucket> --cors-file=cors.json` ausführen (`<bucket>` = Name aus Schritt 2). Erlaubt sind die Ursprünge `https://pilman1982.github.io` und `http://localhost:8765` für GET.
5. **Authentication > Anmeldemethode:** den Anbieter «Anonym» einschalten. Nur im Projekt der Dozierenden.
6. **Firestore-Regeln:** in beiden Projekten (`rabiosa-fb63b` und `rabiosa-student`) nur den neuen Block «Whiteboard» aus `firestore.rules` in den Stand der Konsole einfügen, nicht die ganze Datei. Im Projekt der Dozierenden kommt `checkout_rangliste` nicht dazu. Veröffentlichen und danach in der Konsole prüfen, dass der Block im veröffentlichten Stand steht.
7. **Firestore > Daten:** Sammlung `einstellungen`, Dokument `whiteboard`, Feld `an` (Boolean) = `true`. Nur im Projekt der Dozierenden; im Studenten-Projekt bleibt das Dokument weg, damit der Modus dort gesperrt ist.
