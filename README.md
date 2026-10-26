# Kursblick / Anwesenheitsapp – Firebase Spark

Einfache Anwesenheitsverwaltung: Klassenleitung öffnet einen geheimen Klassenlink, prüft alle Namen und sendet die Anwesenheit. Die Kursleitung sieht die Meldungen unmittelbar und kann eine Excel-Datei auf den eigenen Rechner herunterladen.

React, TypeScript und Vite laufen auf GitHub Pages. Firebase Authentication und Cloud Firestore **Standard** bilden das Backend. Beim Anlegen wählt die Kursleitung die Klassenanzahl selbst (0 bis 30); es gibt keine voreingestellte Anzahl. Weitere Klassen lassen sich später über „Neue Klasse“ hinzufügen und über das Papierkorbsymbol nach Bestätigung entfernen. Jede Kursleitung sieht ausschließlich ihre eigenen Kurse; eine Person kann mehrere Kurse führen. Andere Verantwortliche registrieren eigene Konten und legen eigene Kurse an. Gezielt freigeschaltete Administratoren können sämtliche Kurse gemeinsam verwalten. Eine normale Registrierung vergibt keine Administratorrechte.

Im Browser-Tab heißt die App **Listen**. Auf der Übersicht öffnet das Zahnrad neben der Listenauswahl den Dialog **Bearbeiten**. Dort lassen sich Listennamen direkt ändern, weitere Listen mit selbst gewählter Klassenanzahl hinzufügen und bestehende Listen nach „Wirklich löschen? Alles geht verloren.“ zum Löschen vormerken. Erst **Speichern** übernimmt alle Änderungen gemeinsam. Umbenennen erhält Schüler, Termine, Anwesenheiten und Klassenlinks; Löschen entfernt die gesamte Liste einschließlich Termine und Klassenlinks. Die Namen dürfen nach dem Entfernen äußerer Leerzeichen 1 bis 100 Zeichen lang sein. Bei zwischenzeitlich geänderten Listennamen wird der Entwurf abgelehnt. Wenn die aktive Liste gelöscht wurde, wird eine verbleibende ausgewählt; ohne Listen erscheint die Ersteinrichtung.

## Navigation und Anwesenheitsliste

Auf großen Bildschirmen (ab 761 Pixeln) bleibt die Seitennavigation als schmale Iconleiste sichtbar. Mauszeiger oder Tastaturfokus auf der Leiste zeigen die Beschriftungen; das Menü oben links klappt die Leiste dauerhaft auf und wieder zu. Auf kleinen Bildschirmen bleibt sie zunächst ausgeblendet. Ein Klick außerhalb, Escape oder die Wahl einer Ansicht schließt das geöffnete Menü. Abmelden steht neben dem Online-Status in der Kopfzeile.

Die Anwesenheitstabelle wird von rechts nach links gelesen: Nummer (je Klasse ab 1), rechtsbündiger Schülername, anschließend Termine vom frühesten rechts bis zum spätesten links. Nummern und Namen bleiben beim horizontalen Scrollen am rechten Rand sichtbar; die Beschriftung der durchgehenden Klassenkopfzeile bleibt links sichtbar. Neue spätere Termine erscheinen links. Auch ohne Termin zeigt die Tabelle die vorhandenen Schüler mit einer leeren Terminspalte und der Aktion „Termin anlegen“. Die Tabelle scrollt vertikal mit der Seite und ist nicht mehr auf eine eigene Kachelhöhe begrenzt; horizontal bleibt sie scrollbar.

Über das Zahnrad am rechten Rand jeder Klassenzeile öffnet sich „Bearbeiten“. Daneben steht **Anzahl x**, während der Klassenname links bleibt. Namen lassen sich direkt ändern; links daneben stehen Löschen, Klassenauswahl und die Pfeile für die Reihenfolge. „Speichern“ übernimmt alle Änderungen gemeinsam. Zwischenzeitlich geänderte Schülerlisten werden nicht überschrieben. Verantwortliche und Helfer erscheinen in der Tabelle fett und dunkelblau. Ihre Klassenzuordnung wird weiterhin unter „Links“ verwaltet. Die separate Verwaltungsspalte entfällt. Neue Schüler werden über den Button in der Werkzeugzeile im Dialog **Hinzufügen** mit den Feldern **Namen** und **Zuordnung** erfasst; **Ohne** bedeutet ohne Klasse.

Über einen Klick auf das Datum lässt sich der Termin verwalten. **Termin löschen** entfernt nach Bestätigung den Termin und sämtliche zugehörigen Anwesenheits- und Klassenmeldungen atomar; die übrigen Termine, Klassen und Schüler bleiben erhalten. **Tag zurücksetzen** behält weiterhin den Termin bei.

**Termin anlegen** öffnet einen Kalender mit Mehrfachauswahl. Tage lassen sich einzeln an- und abwählen; die Auswahl bleibt beim Wechsel von Monat oder Jahr erhalten. Bereits angelegte Tage sind markiert und können nicht erneut angelegt werden. **Speichern** legt alle ausgewählten Termine gemeinsam mit jeweils einer eigenen Kopie der aktuellen aktiven Schülerliste an. So lassen sich beispielsweise 30 wöchentliche Termine über mehrere Monate vorbereiten.

Über **Termine löschen** in der Werkzeugzeile oder **Mehrere Termine löschen** im einzelnen Unterrichtstermin öffnet sich die gemeinsame Lösch-Auswahl. Dort sind nur bestehende Termine auswählbar. **Vergangene auswählen** markiert alle Termine vor dem heutigen Berliner Datum; **Alle auswählen** markiert auch heutige und zukünftige Termine. Einzelne ausgewählte Tage lassen sich wieder abwählen. Nach einer Bestätigung werden die ausgewählten Termine einschließlich aller Anwesenheiten und Klassenmeldungen in einem Schritt entfernt; die übrigen Termine bleiben erhalten. Die Excel-Datei sollte bei Bedarf vorher exportiert werden. Ungültige, doppelte oder zwischenzeitlich veränderte Auswahlen werden ohne Teiländerungen abgelehnt. Die vorhandene Grenze von 400 geänderten Firestore-Dokumenten pro Speichervorgang bleibt erhalten; bei sehr großen Auswahlen müssen weniger Termine gewählt werden.

In der kompakten Klassenansicht sind Namen rechtsbündig. Für noch nicht erfasste Schüler ist im Formular „abwesend“ vorausgewählt; vorhandene gespeicherte Status bleiben erhalten. Erst **Anwesenheit senden** speichert die Meldung. Der Sammelbutton „Alle anwesend“ entfällt. Namen in der Tabelle, Klassenkachel und Meldungsansicht verwenden bevorzugt Calibri (mit System-Ersatzschrift, falls die Schrift auf dem Gerät fehlt).

## Kompakte Verwaltung

Die Kursauswahl und die Aktionen der jeweiligen Ansicht stehen in einer gemeinsamen Werkzeugzeile. Die Anwesenheitsliste zeigt Meldungen ohne bearbeitbare Auswahlfelder: grün für anwesend, rot für abwesend und blau für entschuldigt. Klassenname, Anzahl und Zahnrad bleiben beim horizontalen Scrollen sichtbar. Unter **Links** zeigen die Kacheln keine Schülerzahl mehr; **Anzeigen** öffnet die jeweilige Klassenansicht.

Unter **Links** wird eine Klasse über **Neue Klasse** angelegt und über das Papierkorbsymbol neben **Bearbeiten** entfernt. Der Dialog erklärt die Folgen: Schüler bleiben unter „Ohne Klasse“ im Kurs, historische Termine und Anwesenheiten bleiben erhalten. Heutige und zukünftige Zuteilungen werden aufgehoben; der alte Klassenlink und seine Meldemöglichkeit werden entfernt. Die Löschung erfolgt atomar über die bestehende Firebase-Transaktion. Interne Datenfelder und URL-Parameter behalten ihre bisherigen Namen, damit bestehende Klassenlinks funktionieren.

## Stand und Freischaltung

Das vorhandene Firebase-Projekt **Anwesenheitsliste** (`anwesenheitsliste-5b437`) ist eingerichtet: Spark ohne aktive Abrechnung, Firestore Standard in Frankfurt (`europe-west3`, `freeTier: true`), E-Mail/Passwort, anonyme Anmeldung, Domains, Regeln und Indexausnahmen. Die öffentliche Webkonfiguration steht in `src/firebase-config.json`. Der bestehende Kurs wurde am 24. Oktober 2026 aus Supabase übernommen: 134 Schüler, 7 Klassen und 14 Termine. Alle 121 Zieldokumente wurden vollständig nachgelesen und verglichen. Die Quelle blieb unverändert. Die alten Klassenlinks bleiben beim bisherigen Backend; Firebase verwendet neue Links. Die Firebase-Version ist in `main` integriert und auf https://lehrer44.github.io/anwesenheitsapp/ veröffentlicht.

Am echten Firebase-Projekt wurden die anonyme Anmeldung und die Sperren für Kurslisten, fremde Kurse und ungültige Klassenlinks geprüft. Das temporäre anonyme Prüfkonto wurde entfernt. Die veröffentlichten Regeln wurden mit dem lokalen getesteten Stand verglichen. Die Anwendung verwendet ausschließlich Firebase. Der alte Backend-Code, die Edge-Tests und das abgeschlossene Importwerkzeug wurden aus dem aktuellen Repository-Stand entfernt.

Für dieses Projekt ist die Einrichtung abgeschlossen. Für ein anderes Zielprojekt:

1. Ein Firebase-Projekt im kostenlosen **Spark**-Tarif erstellen. Kein Abrechnungskonto verknüpfen; weder Blaze noch ein befristetes Guthaben wird benötigt.
2. Eine Web-App registrieren. Die vier öffentlichen Konfigurationswerte in `src/firebase-config.json` übernehmen; keine Admin-Zugangsdaten verwenden.
3. Cloud Firestore **Standard edition** in einer passenden europäischen Region erstellen. Die Region vor der Erstellung bewusst wählen. Mit gesperrten Regeln beginnen.
4. Unter Authentication E-Mail/Passwort und anonyme Anmeldung aktivieren. `lehrer44.github.io` als autorisierte Domain hinzufügen; für lokale Entwicklung zusätzlich `localhost`.
5. Die geprüften Regeln und Indexausnahmen bereitstellen:
   ```sh
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project DEINE_PROJEKT_ID
   ```
6. Die eingecheckte öffentliche Webkonfiguration wird automatisch verwendet. Optional kann ein vollständiger Satz GitHub-Actions-Variablen ein anderes Projekt auswählen:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   Teilweise gesetzte Variablen werden abgelehnt, damit keine Konfiguration verschiedener Projekte vermischt wird.
7. Kursleitungs-Konto erstellen und E-Mail bestätigen oder das konkrete Administratorkonto ausdrücklich manuell freigeben (siehe unten). Beim ersten Login wird kein Kurs automatisch angelegt. Name und Klassenanzahl werden im Anlegedialog gewählt.
8. Anwendung und Klassenmeldungen prüfen, auf GitHub Pages veröffentlichen und die zu diesem Projekt gehörenden Klassenlinks verteilen.

Die Firebase-Webkonfiguration darf im Browser sichtbar sein. **Service-Account-Schlüssel, Admin-SDK-Zugangsdaten und Supabase-Service-Role-Keys gehören niemals in VITE-Variablen, Repository-Dateien oder Actions-Logs.** Es gibt keinen automatischen Rückgriff auf das bisherige Supabase-Projekt.

## Kostenloser Betrieb

Die Anwendung verwendet keine Cloud Functions, kein Cloud Storage, keinen Dateiupload, keinen kostenpflichtigen Auth-Anbieter und kein Firebase App Hosting. Excel wird im Browser erzeugt und nur lokal heruntergeladen.

Spark hat feste Nutzungskontingente. Für Firestore Standard sind dies derzeit 1 GiB Daten, 50.000 Lesevorgänge und 20.000 Schreibvorgänge pro Tag. Die Kontingente gelten für alle Kurse des Projekts zusammen. Wenige Klassen und Kursleitungen sind ein kleiner Anwendungsfall; die tatsächliche Nutzung muss nach der Einrichtung geprüft werden. Firebase garantiert mit Spark keine unbegrenzte Verfügbarkeit. Eine mit Supabase vergleichbare Sieben-Tage-Inaktivitätspause ist für Firestore nicht dokumentiert.

Die Ansichten verwenden Echtzeit-Abonnements statt 20-Sekunden-Polling. Beim Öffnen wird die Kurshistorie geladen; Bearbeitungen der Kursleitung lesen den betroffenen Kurs im Rahmen einer Transaktion erneut. Sehr große Historien benötigen später eine Archivierung/gezieltere Abfragen. Einzelne Aktionen sind auf 400 geänderte Dokumente und Dokumente vorsorglich auf etwa 850 kB begrenzt; vor Überschreitung wird ohne Teiländerungen abgebrochen.

Aktuelle Bedingungen: https://firebase.google.com/pricing und https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Gemeinsame Administratoren

### Registrierung und E-Mail-Bestätigung

Die Registrierung verwendet weiterhin ausschließlich E-Mail und Passwort. Nach dem Anlegen bleibt ein noch unbestätigtes Konto in der Ansicht **E-Mail bestätigen**. Es besitzt weiterhin keinen Datenzugriff. **Bestätigungsmail erneut senden** fordert eine weitere Mail an; zwischen Versandversuchen gilt in der Maske eine Pause von 60 Sekunden, zusätzlich zu den Firebase-Limits. **Bestätigung prüfen** lädt das Benutzerprofil und ein frisches Token nach. Erst die tatsächlich bestätigte E-Mail oder die bereits bestehende ausdrückliche Administratorfreigabe schaltet den Zugang frei. Die Prüfung öffnet die Listen ohne erneute Registrierung.

Wenn der Mailversand fehlschlägt, erklärt die Maske, dass das Konto trotzdem angelegt wurde. Eine erneute Registrierung mit derselben Adresse und dem bisherigen korrekten Passwort setzt die Anmeldung fort. Normales Anmelden verschickt nicht bei jedem Versuch automatisch eine weitere Bestätigungsmail. Auch nach einem Neuladen lässt sich der Bestätigungsablauf fortsetzen. Die Maske verlinkt Hinweise für Junk-E-Mail und sichere Absender in Outlook. Für das Projekt ist der Standardabsender `noreply@anwesenheitsliste-5b437.firebaseapp.com`.

Deutschsprachige Bestätigungs- und Passwortmails verwenden eine Rückkehr-Adresse zur App ohne Klassenlink-Token. `scripts/configure-auth-email.cjs --project PROJEKT-ID` zeigt die vorgesehenen Mail-Metadaten an; mit `--apply` setzt der angemeldete Firebase-Projektzugang ausschließlich Sprache, Anzeigename **Listen** und eine vollständige Reply-To-Adresse für den Firebase-Standardversand. Provider, SMTP-Zugangsdaten, Benutzer und Rollen werden dabei nicht geändert. Die SMTP-Zustellung in fremde Postfächer lässt sich dadurch nicht garantieren. Bei fortgesetzten Zustellproblemen sind der empfangende Maildienst oder ein eigener SMTP-Versand zu prüfen; eine unbestätigte Adresse wird nicht als verifiziert ausgegeben.

`npm run test:auth` prüft Registrierung, erneuten Versand, das Einlösen eines echten Emulator-Bestätigungscodes, Versandfehler und die bestehende Administrator-Ausnahme im Firebase-Auth-Emulator mit einem isolierten Demo-Projekt. Die Firestore-Regeln und ihre Tests sichern unverändert den Datenzugriff.

Jede Person registriert auf der App-Seite ihr eigenes Konto und bestätigt ihre E-Mail-Adresse. Die drei vorgesehenen Administratoren erhalten einmalig über einen vertrauenswürdigen Projektzugang das Firebase-Auth-Custom-Claim `administrator: true`. Dafür dient das Admin SDK oder die Firebase CLI-Funktion zur Claims-Verwaltung; niemals der Browsercode. Vorhandene andere Claims müssen erhalten bleiben. Keine E-Mail-Adressen oder Rollenlisten im Frontend hinterlegen. Nach der Freischaltung neu anmelden oder die App neu laden; die Kursauswahl fordert ein frisches ID-Token an.

Bei ausbleibenden Bestätigungs-E-Mails darf eine vertrauenswürdige Projektadministration ein konkret zugeordnetes bestehendes Konto zusätzlich mit `manualAccessApproved: true` freigeben. Nur die Kombination aus `administrator: true` und `manualAccessApproved: true` erlaubt einem nicht anonymen Konto den Zugang ohne E-Mail-Bestätigung. Eine normale Registrierung, eine bloße Administratorrolle bei unbestätigter Adresse oder ein einzelnes Freigabe-Claim genügen nicht. Der Firebase-Status `emailVerified` wird dabei ausdrücklich nicht verändert: Die manuelle Kontofreigabe bestätigt nicht den Besitz des Postfachs. Vor Freigabe muss die zuständige Person das Konto außerhalb des fehlgeschlagenen E-Mail-Verfahrens eindeutig zuordnen. Diese Ausnahme darf niemals pauschal an neue Registrierungen vergeben werden.

Die Freigabe behebt nicht die Mailzustellung. Insbesondere kann auch ein späteres Zurücksetzen des Passworts per E-Mail scheitern. Ein vergessenes Passwort muss dann über die vertrauenswürdige Projektadministration wiederhergestellt werden. Zugangsdaten dürfen niemals in Chat, Frontend oder Repository abgelegt werden.

Diese Rolle erlaubt Lesen, Anlegen und Bearbeiten aller Kurse einschließlich Klassen, Terminen und Exporten. Reguläre Kursleitungen behalten ausschließlich ihre eigenen Kurse. Klassenlinks bleiben auf ihre Klasse begrenzt. Auch Administratoren können im Browser keine Rollen verteilen, ändern oder auflisten. Zum Widerruf das Claim über denselben vertrauenswürdigen Zugang auf `false` setzen. Bereits ausgestellte ID-Tokens bleiben bis zu ihrem Ablauf (bis zu einer Stunde) gültig; eine erneute Anmeldung/Token-Erneuerung übernimmt den Widerruf. Bereits gelesene Daten können nicht rückwirkend zurückgerufen werden.

Die ursprüngliche `ownerUid` eines Kurses bleibt bei gemeinsamer Bearbeitung unverändert. Bestehende Daten benötigen dafür keine Umschreibung. Gleichzeitige Änderungen mehrerer Administratoren und Klassen verwenden dieselben Transaktionen wie bisher. Die Administratorrolle benötigt weder Cloud Functions noch einen kostenpflichtigen Tarif.

## Berechtigungen und Datenmodell

- Firebase Auth: ausschließlich serverseitig vergebene gemeinsame Rolle `administrator: true`, zusätzlich bestätigte E-Mail oder ausdrückliche manuelle Kontofreigabe erforderlich.
- `courses/{id}`: unveränderliche Kursleitung, Titel, Version, Terminliste.
- `courses/{id}/private/config`: Schüler, Klassen, geheime Tokens; nur die Kursleitung und freigeschaltete Administratoren.
- `courses/{id}/sessions/{date}`: vollständige historische Teilnehmerliste pro Termin; nur die Kursleitung und freigeschaltete Administratoren.
- `channels/{SHA256(token)}`: begrenzte Klassenansicht ohne andere Klassen oder geheime Tokens.
- `channels/{hash}/lessons/{date}`: Teilnehmer und Meldung genau dieser Klasse an diesem Termin.

Ein Klassenlink ist ein **geheimer Zugangsschlüssel**, keine persönliche Identitätsprüfung. Wer ihn besitzt, darf die betreffende Klasse lesen und melden. Im Hintergrund erfolgt eine anonyme Firebase-Anmeldung; es gibt kein zusätzliches Passwortformular. Die unvorhersehbaren Kanaladressen dürfen nicht aufgelistet werden. Tokens stehen weiterhin ausschließlich im URL-Fragment und werden nicht als Seitenadresse an GitHub Pages übertragen.

Klassen dürfen nur vollständige Meldungen für die eigenen Teilnehmer mit gültigen Statuswerten und Serverzeitstempel ersetzen. Sie dürfen keine Namen, Zuteilungen, Berechtigungen oder Ausfälle verändern. Ausgefallene Termine und veraltete Teilnehmerlisten werden geprüft. Beim Erneuern eines Links werden der alte Kanal und seine Termindokumente atomar entfernt. Ein bereits geöffnetes Klassenfenster erhält dann einen Zugriffsfehler.

Die Kursleitung führt Meldungen und historische Teilnehmerlisten für Anzeige/Export zusammen. Transaktionen schützen gleichzeitige Meldungen vor Überschreiben. Das Firebase SDK verwendet hier nur den Speichercache, keine dauerhafte Firestore-Datenablage im Browser.

Die Security Rules sind ein getesteter Prototyp. Vor breiter Verteilung der Links sind insbesondere die Regeln und die reale Firebase-Konfiguration noch einmal zu prüfen. Die Prüfung ersetzt keine Zusage vollständiger Fehlerfreiheit.

## Lokal und Tests

Node 24 und Java 21 für den Firestore-Emulator verwenden:

```sh
npm ci
# Die öffentliche Projektkonfiguration ist bereits eingerichtet.
# .env ist nur für ein anderes Zielprojekt erforderlich (alle vier Werte setzen).
npm run dev
npm test
npm run test:rules
npm run build
npx tsc --noEmit -p tsconfig.firebase.json
```

Die Regeltests verwenden ausschließlich das lokale Demo-Projekt `demo-kursblick`. Sie prüfen Kursgrenzen, verbotene Listenabfragen, Rollenerhöhung, Pflichtfelder, Statuswerte, vollständige Meldungen, gleichzeitige Änderungen, zukünftige Teilnehmer, Löschungen, Ausfälle und den sofortigen Widerruf alter Links.

GitHub Actions führt Modelltests, Regeltests und Build auch für Pull Requests aus. Pull Requests veröffentlichen keine Pages-Version. Ein produktiver Build wird bei fehlender oder unvollständiger Firebase-Webkonfiguration abgebrochen.

## Abgeschlossene Datenübernahme

Der vorhandene Kurs wurde vollständig nach Firebase übernommen und dort geprüft. Die Anwendung benötigt weder eine Supabase-Verbindung noch Zugangsdaten des früheren Backends. Das einmalige Importwerkzeug und die alten Supabase-Dateien wurden nach der erfolgreichen Umschaltung entfernt. Frühere Quellstände bleiben über die Git-Versionsgeschichte nachvollziehbar.

Die Firebase-Klassenlinks unterscheiden sich von den früheren Links. Nur Links aus der aktuellen App verwenden. Das Entfernen der Repository-Dateien löscht kein externes Supabase-Projekt und keine dort gespeicherten Daten.


## Listen, Links und Rollen

Die Navigation heißt **Übersicht**, **Tabelle** und **Links**. Listenname und neue Liste werden auf der Übersicht verwaltet. Der Datumwähler steht neben dem Meldungsstatus; Tabellenlegende und zusätzliche Fußtexte entfallen. Klassenkopfzeilen erstrecken sich über die komplette Tabellenbreite und halten ihre linksbündige Beschriftung am sichtbaren linken Rand. Nicht gemeldete Statuszellen enthalten keinen Text.

Unter **Links → Bearbeiten** werden Name, Verantwortlicher und Helfer festgelegt. Beide Rollen verwenden vorhandene Schüler; pro Klasse sind unterschiedliche Personen vorgesehen. Die gewählten Personen bleiben dieser Klasse zugeordnet. Namen werden anhand ihrer Schüler-ID angezeigt, sodass Umbenennen, doppelte Namen und Entfernen eines Schülers korrekt verarbeitet werden. Die Helfer-ID liegt ausschließlich in der privaten Konfiguration. Das Datenformat der bestehenden Klassenlinks und die veröffentlichten Firestore-Regeln bleiben kompatibel.

Die Klassenansicht enthält weder Seitenleiste noch globale Kopfzeile oder die Überschrift „Anwesenheit melden“. Auch während des Ladens wird bei einem Klassenlink keine Administration eingeblendet. Die serverseitige Begrenzung auf die eigene Klassenmeldung bleibt bestehen.


## Terminwahl in der Klassenansicht

Die Auswahl zeigt höchstens die letzten zwei bereits begonnenen Termine (einschließlich heute) und den nächsten zukünftigen Termin. Standardmäßig bleibt der zuletzt begonnene Termin gewählt, auch am Folgetag. Erst mit Beginn des Termintags in **Europe/Berlin** wird dieser Termin zur automatischen Vorauswahl. Ohne vergangenen/heutigen Termin bleibt die Auswahl zunächst leer; ein zukünftiger Termin kann ausdrücklich gewählt werden. Die Verwaltung behält ihre bisherige Terminwahl.

Eine bewusst gewählte Auswahl und ungesendete Angaben werden bei Aktualisierungen nicht überschrieben, solange der Termin im verfügbaren Zeitfenster bleibt. Wird ein Termin gelöscht oder fällt er aus diesem Fenster, wird ein alter Entwurf verworfen und ein Hinweis angezeigt. Das Kalenderdatum wird bei Fokuswechsel und regelmäßig aktualisiert, damit auch eine geöffnete Ansicht einen Tageswechsel berücksichtigt.

Datum und „Zuletzt gesendet“ stehen in einer gemeinsamen Zeile; Klassenname, Leitungsname und zusätzliche Fußhinweise entfallen. Auf dem Handy stehen Name und drei kompakte Statusbuttons in einer Zeile: Haken = anwesend, Kreuz = abwesend, Dokument mit Häkchen und „Entsch.“ = entschuldigt. Zugängliche Beschriftungen nennen weiterhin den vollständigen Status und den Schülernamen.


## Seitenwahl und bestätigte Änderungen

Die Verwaltung merkt sich die Seite im URL-Parameter `view` (Übersicht, Tabelle oder Links). Neuladen erhält die aktuelle Seite. Persönliche Klassenlinks bleiben unverändert und enthalten weiterhin keine Verwaltungsnavigation.

Nach einer Verwaltungsänderung zeigt die Oberfläche unmittelbar den von Firestore bestätigten Transaktionsstand. Das bisherige vollständige Nachladen aller Klassen nach jedem Speichern entfällt. Unabhängige Lesezugriffe beim Laden laufen parallel. Live-Änderungen werden erst gemeinsam veröffentlicht, sobald die betroffenen Listener synchron sind; ältere Kursversionen überschreiben keinen neueren Stand. Fehlgeschlagene Transaktionen werden weiterhin als Fehler angezeigt.
