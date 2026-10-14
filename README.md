# Anwesenheitsapp / Kursblick

Mobile Anwesenheitsverwaltung für wöchentliche Kurse. React-Oberfläche auf GitHub Pages, Supabase Auth, PostgreSQL und eine autorisierte Edge Function.

## Funktionen

- Schüler direkt in der Anwesenheitsliste hinzufügen, bearbeiten, zuteilen, archivieren oder löschen
- Farblich getrennte Gruppen; zentrale Reihenfolge innerhalb jeder Gruppe mit ↑ / ↓
- Gruppenführer immer fett; Gruppenansicht übernimmt die Reihenfolge ohne eigene Sortierfunktion
- Schüler archivieren oder mit Bestätigung einschließlich aller Anwesenheitseinträge dauerhaft löschen
- Gruppenführer automatisch als Schüler ihrer eigenen Gruppe führen; vorhandene Schüler werden über ihre ID verknüpft
- Admin-Korrekturen auf „nicht gemeldet“ zurücksetzen
- Große Schüler- und Gruppenführernamen in der mobilen Gruppenansicht
- Eigene widerrufbare Gruppenlinks; Gruppenführer sehen ausschließlich ihre Gruppe
- Anwesenheit pro Unterrichtsdatum: anwesend, abwesend, entschuldigt
- Fortlaufende zentrale Tabelle; heutige und zukünftige Termine übernehmen Änderungen der Schülerliste, vergangene Termine behalten ihre Besetzung
- Als Standarddatum wird der erste Termin ab heute (Europe/Berlin) gewählt; ohne kommende Termine der letzte vergangene
- Unterrichtsausfall direkt durch Klick auf das Datum in der Anwesenheitsliste, mit Grund und Wiederfreigabe
- Formatierte Exceldateien: farbige Gruppen, fette Gruppenführer, Abwesenheiten rot, Entschuldigungen grau, Anwesenheiten leer und offene Meldungen beschriftet
- Fiktive Beispieldaten mit eigener Rücksetzfunktion

## Bereitstellung

Die Anwendung läuft unter https://lehrer44.github.io/anwesenheitsapp/. Der Quellcode liegt im öffentlichen Repository Lehrer44/anwesenheitsapp. GitHub Actions veröffentlicht die Oberfläche; Supabase speichert die geschützten Kursdaten und führt die autorisierten Änderungen aus.

## Einrichtung

1. Supabase-Projekt in der ausgewählten Organisation und Region erstellen.
2. `supabase/schema.sql` einmal als Schema-Migration anwenden. Alle Tabellen haben RLS; Schreibrechte sind ausschließlich serverseitig verfügbar.
3. `supabase/functions/course` mit `verify_jwt = false` deployen. Die Funktion überprüft jeden Aufruf selbst: Kursleitung per Supabase-User-JWT, Gruppenführer per zufälligem Gruppenlink. Der Service-Schlüssel bleibt ausschließlich in der Supabase-Laufzeit.
4. In GitHub Actions die Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` setzen. Beide sind für den Browser bestimmt; niemals Service-Schlüssel eintragen.
5. GitHub Pages auf GitHub Actions einstellen. Standardbasis ist `/anwesenheitsapp/`; bei eigener Domain `vite.config.ts` anpassen.
6. Supabase Auth Site URL und zulässige Redirect-URL auf die neue Pages-Adresse einstellen. Kursleitung registriert ihr eigenes Konto und bestätigt die E-Mail-Adresse.
7. Vorhandenen Kurs über einen einmaligen Übernahmelink übertragen und vollständig prüfen. Daten und geheime Gruppenlinks niemals in GitHub-Dateien oder Actions-Ausgaben speichern.

Die Pages-Website kann öffentlich ausgeliefert werden; Schülerdaten werden nur nach serverseitiger Berechtigungsprüfung ausgegeben. Ein öffentliches Repository enthält ausschließlich Quellcode und dokumentierte öffentliche Konfiguration.

## Lokal

```sh
npm ci
cp .env.example .env
# Öffentliche Supabase-Konfiguration in .env ergänzen
npm run dev
npm test
npm run build
```

## Datenübernahme

Vollständiges JSON aus dem bisherigen Kurs exportieren. Einen Importdatensatz mit bestehender Kurs-ID, `owner_id = null`, zufälligem Claim-Schlüssel (mindestens 256 Bit), dessen SHA-256 als `claim_hash`, und vollständigem `state` anlegen. Der Claim-Schlüssel wird nur der Kursleitung übermittelt. Nach Anmeldung übernimmt `#course=KURS_ID&migration=CLAIM` den Kurs einmalig und entfernt den Schlüssel aus der URL. Noch nicht übernommene Kurse sind über Gruppenlinks nicht erreichbar. Alte Gruppenlinks müssen wegen der neuen Website-Adresse erneut verteilt werden.

## Betrieb

Die Anwendung funktioniert nach dem Umzug ohne ChatGPT-Abo. Die Verfügbarkeit hängt von GitHub und Supabase ab. Free-Projekte können bei Inaktivität pausieren. Regelmäßige vollständige Datenbanksicherungen ergänzen den Excel-Export. Der Excel-Export allein enthält nicht alle Verwaltungsdaten. Für echte Schülerdaten sind Datenschutzfreigabe, Aufbewahrungsregeln und passende Infrastruktur erforderlich.
