# Kursblick / Anwesenheitsapp – Firebase Spark

Einfache Anwesenheitsverwaltung: Gruppenleitung öffnet einen geheimen Gruppenlink, prüft alle Namen und sendet die Anwesenheit. Die Kursleitung sieht die Meldungen unmittelbar und kann eine Excel-Datei auf den eigenen Rechner herunterladen.

React, TypeScript und Vite laufen auf GitHub Pages. Firebase Authentication und Cloud Firestore **Standard** bilden das Backend. Beim Anlegen wählt die Kursleitung die Gruppenanzahl selbst (0 bis 30); es gibt keine voreingestellte Anzahl. Die Anzahl lässt sich später pro Kurs ändern. Beim Reduzieren werden nur vollständig unbenutzte Gruppen am Listenende entfernt. Jede Kursleitung sieht ausschließlich ihre eigenen Kurse; eine Person kann mehrere Kurse führen. Andere Verantwortliche registrieren eigene Konten und legen eigene Kurse an. Eine gemeinsame Bearbeitung desselben Kurses durch mehrere Kursleitungen ist derzeit nicht vorgesehen.

## Stand und Freischaltung

Das vorhandene Firebase-Projekt **Anwesenheitsliste** (`anwesenheitsliste-5b437`) ist eingerichtet: Spark ohne aktive Abrechnung, Firestore Standard in Frankfurt (`europe-west3`, `freeTier: true`), E-Mail/Passwort, anonyme Anmeldung, Domains, Regeln und Indexausnahmen. Die öffentliche Webkonfiguration steht in `src/firebase-config.json`. Kursdaten wurden noch nicht aus Supabase übernommen; der Branch ist noch nicht in die aktive Pages-Version gemergt.

Am echten Firebase-Projekt wurden die anonyme Anmeldung und die Sperren für Kurslisten, fremde Kurse und ungültige Gruppenlinks geprüft. Das temporäre anonyme Prüfkonto wurde entfernt. Die veröffentlichten Regeln wurden mit dem lokalen getesteten Stand verglichen. Die bisherige Supabase-Installation bleibt bis zur Umschaltung aktiv.

Für dieses Projekt sind die folgenden Einrichtungsschritte 1–6 bereits erledigt. Für ein anderes Zielprojekt:

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
7. Kursleitungs-Konto erstellen und E-Mail bestätigen. Die Seite muss bis zum Abschluss der Datenübernahme in einer getrennten Testumgebung geprüft werden. Beim ersten Login wird noch kein Kurs automatisch angelegt. Name und Gruppenanzahl werden im Anlegedialog gewählt; importierte Kurse erscheinen in der Kursauswahl.
8. Daten übernehmen, alle Gruppen und historischen Termine vergleichen, anschließend neue Gruppenlinks verteilen. Erst danach den Branch mergen und GitHub Pages umschalten.

Die Firebase-Webkonfiguration darf im Browser sichtbar sein. **Service-Account-Schlüssel, Admin-SDK-Zugangsdaten und Supabase-Service-Role-Keys gehören niemals in VITE-Variablen, Repository-Dateien oder Actions-Logs.** Es gibt keinen automatischen Rückgriff auf das bisherige Supabase-Projekt.

## Kostenloser Betrieb

Die Anwendung verwendet keine Cloud Functions, kein Cloud Storage, keinen Dateiupload, keinen kostenpflichtigen Auth-Anbieter und kein Firebase App Hosting. Excel wird im Browser erzeugt und nur lokal heruntergeladen.

Spark hat feste Nutzungskontingente. Für Firestore Standard sind dies derzeit 1 GiB Daten, 50.000 Lesevorgänge und 20.000 Schreibvorgänge pro Tag. Die Kontingente gelten für alle Kurse des Projekts zusammen. Wenige Gruppen und Kursleitungen sind ein kleiner Anwendungsfall; die tatsächliche Nutzung muss nach der Einrichtung geprüft werden. Firebase garantiert mit Spark keine unbegrenzte Verfügbarkeit. Eine mit Supabase vergleichbare Sieben-Tage-Inaktivitätspause ist für Firestore nicht dokumentiert.

Die Ansichten verwenden Echtzeit-Abonnements statt 20-Sekunden-Polling. Beim Öffnen wird die Kurshistorie geladen; Bearbeitungen der Kursleitung lesen den betroffenen Kurs im Rahmen einer Transaktion erneut. Sehr große Historien benötigen später eine Archivierung/gezieltere Abfragen. Einzelne Aktionen sind auf 400 geänderte Dokumente und Dokumente vorsorglich auf etwa 850 kB begrenzt; vor Überschreitung wird ohne Teiländerungen abgebrochen.

Aktuelle Bedingungen: https://firebase.google.com/pricing und https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Berechtigungen und Datenmodell

- `courses/{id}`: unveränderliche Kursleitung, Titel, Version, Terminliste.
- `courses/{id}/private/config`: Schüler, Gruppen, geheime Tokens; nur die Kursleitung.
- `courses/{id}/sessions/{date}`: vollständige historische Teilnehmerliste pro Termin; nur die Kursleitung.
- `channels/{SHA256(token)}`: begrenzte Gruppenansicht ohne andere Gruppen oder geheime Tokens.
- `channels/{hash}/lessons/{date}`: Teilnehmer und Meldung genau dieser Gruppe an diesem Termin.

Ein Gruppenlink ist ein **geheimer Zugangsschlüssel**, keine persönliche Identitätsprüfung. Wer ihn besitzt, darf die betreffende Gruppe lesen und melden. Im Hintergrund erfolgt eine anonyme Firebase-Anmeldung; es gibt kein zusätzliches Passwortformular. Die unvorhersehbaren Kanaladressen dürfen nicht aufgelistet werden. Tokens stehen weiterhin ausschließlich im URL-Fragment und werden nicht als Seitenadresse an GitHub Pages übertragen.

Gruppen dürfen nur vollständige Meldungen für die eigenen Teilnehmer mit gültigen Statuswerten und Serverzeitstempel ersetzen. Sie dürfen keine Namen, Zuteilungen, Berechtigungen oder Ausfälle verändern. Ausgefallene Termine und veraltete Teilnehmerlisten werden geprüft. Beim Erneuern eines Links werden der alte Kanal und seine Termindokumente atomar entfernt. Ein bereits geöffnetes Gruppenfenster erhält dann einen Zugriffsfehler.

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

Die Regeltests verwenden ausschließlich das lokale Demo-Projekt `demo-kursblick`. Sie prüfen Kursgrenzen, verbotene Listenabfragen, Rollenerhöhung, Pflichtfelder, Statuswerte, vollständige Meldungen, gleichzeitige Änderungen, zukünftige Teilnehmer, Löschungen, Ausfälle und den sofortigen Widerruf alter Links. Die alten Supabase-Edge-Tests bleiben als Regressionstests erhalten.

GitHub Actions führt Modelltests, Regeltests und Build auch für Pull Requests aus. Pull Requests veröffentlichen keine Pages-Version. Ein produktiver Build wird bei fehlender oder unvollständiger Firebase-Webkonfiguration abgebrochen.

## Einmalige Datenübernahme ohne manuelles Exportieren

`scripts/migrate-course.ts` liest den vollständigen bisherigen Kurs über die bestehende Supabase-Funktion. Es verwendet dafür die normale Anmeldung der bisherigen Kursleitung, keinen Supabase-Service-Role-Key. Im Firebase-Ziel werden einmalig lokale Admin-Berechtigungen über Application Default Credentials benötigt. Diese Zugangsdaten bleiben außerhalb des Repositories.

Umgebungsvariablen für den lokalen Prozess:

```text
MIGRATION_SOURCE_URL=https://DEIN_PROJEKT.supabase.co
MIGRATION_SOURCE_PUBLIC_KEY=DEIN_PUBLISHABLE_KEY
MIGRATION_SOURCE_EMAIL=KONTO_DES_BISHERIGEN_KURSES
MIGRATION_SOURCE_PASSWORD=PASSWORT_DES_BISHERIGEN_KONTOS
MIGRATION_TARGET_PROJECT=FIREBASE_PROJEKT_ID
MIGRATION_TARGET_OWNER_EMAIL=BESTAETIGTES_FIREBASE_KONTO
```

Zunächst ohne Schreibzugriff auf Kursdaten prüfen:

```sh
node --experimental-strip-types scripts/migrate-course.ts
```

Erst nach Freigabe übernehmen:

```sh
node --experimental-strip-types scripts/migrate-course.ts --commit
```

Das Werkzeug zeigt nur Anzahlen und die Zielprojekt-ID, keine Namen, Passwörter, Tokens oder Gruppenlinks. Es überschreibt keinen vorhandenen Zielkurs. Neue Links werden erzeugt; vollständige Daten werden zuerst verdeckt angelegt und erst am Ende freigeschaltet. Anschließend wird jedes Dokument nachgelesen und mit der Quelle verglichen. Supabase-Daten bleiben erhalten. Während des Umstiegs müssen Meldungen und Bearbeitungen kurz pausieren, damit nach der Übernahme keine neuen Änderungen im alten System zurückbleiben.

Bei einem abgebrochenen Import werden unvollständige Zielinformationen erkannt und ein erneuter Import sicher abgelehnt. Diese müssen vor einem neuen Versuch gezielt bereinigt werden. Supabase bleibt bis zur erfolgreichen Prüfung die maßgebliche Quelle.

## Bisheriges Backend

`supabase/` und die zugehörigen Tests bleiben zur Dokumentation und für den Rückfall auf den bisherigen Stand erhalten. Der neue Browsercode greift nicht mehr auf Supabase zu. Ein vollständiger Rückwechsel erfolgt über den vorherigen Git-Stand und dessen bestehende Konfiguration.

