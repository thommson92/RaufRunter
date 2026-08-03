# 🃏 Rauf Runter

Punktezähler-Web-App für das Kartenspiel **„10 rauf, 10 runter"** (Stiche-Raten-Variante).
Mobile-first, läuft als statische Seite auf **GitHub Pages**.

## Was kann es?
- Spiel mit Spielern & Sitzreihenfolge anlegen, max. Kartenzahl konfigurierbar (Kurve 1 → max → 1,
  Standard 10, bis zu 15 Karten).
- Ansagen & gemachte Stiche pro Runde eintragen; **automatische Punktevergabe**
  (richtig `+10 + Stiche`, falsch `−10 + Stiche`).
- **Verbotene Ansage** des letzten Spielers wird erzwungen.
- Punktestand-Tabelle, Runden nachträglich editierbar, Sitzreihenfolge änderbar.
- Optionaler **„Farbe losen"-Knopf** (Rot/Blau/Grün/Gelb).
- Zuschauer-Link (read-only), **geräteübergreifend live** über Firestore.
- **Statistiken in der Zuschaueransicht:** Fakten-Kacheln (Trefferquote, meiste/wenigste
  Ansagen, Treffer-Serie, beste Einzelrunde, häufigste Trumpffarbe) + Charts
  (Punkteverlauf, Platzierungsverlauf, Angesagt vs. gemacht) sowie ein Live-Panel zur
  aktuellen Runde (Geber, Ansage-Fortschritt, wer ist dran).
- **Geber-Auslosung** beim Anlegen eines neuen Spiels: Option „Ersten Geber auslosen" öffnet
  vor dem Start ein echtes Glücksrad, das die Sitzreihenfolge automatisch passend setzt.
- **Regelbasierter Rundenkommentar** in der Zuschaueransicht: nach jeder fertigen Runde ein
  launiger Text (Held/Bösewicht der Runde, Nullansagen, Führungswechsel) — ohne KI/Server,
  reine Textbausteine aus den echten Rundendaten.
- **Malus-Bilanz:** Kreisdiagramm je Spieler, wie oft er Geber war und ob die verbotene Ansage
  dabei Einfluss hatte (grau = kein Einfluss, grün = Malus + richtig, rot = Malus + falsch) —
  immer sichtbar, auch ohne bisherigen Malus.
- Installierbar als **PWA** („Zum Startbildschirm"), Oberfläche offline-fähig, eigenes
  Icon auch als maskable Variante für Android.
- Spiel löschen ist durch eine Passwortabfrage geschützt.
- **Geldeinsatz & Auszahlung (optional):** pro Spiel festhalten, ob um Geld gespielt wird,
  wie hoch der Einsatz je Spieler ist und nach welchem Modus der Topf ausgeschüttet wird
  (Sieger bekommt alles / Zweiter bekommt Einsatz zurück / Dritter Einsatz zurück & Zweiter
  doppelten Einsatz / manuelle Eingabe). Nach der letzten Runde erscheint in Schreiber- und
  Zuschauer-Ansicht eine Auszahlungs-Übersicht, wer wie viel gewonnen/verloren hat. Auch
  nachträglich für bereits laufende oder abgeschlossene Spiele aktivierbar.
- Spendenlink zur Unterstützung des Entwicklers auf der Startseite.
- **Profilfoto-Zuschnitt:** beim Hochladen eines Fotos wird nicht mehr stumpf die Bildmitte
  genommen — ein eigener Zuschnitt-Bildschirm lässt Ausschnitt und Zoom per Ziehen, Kneifen
  (zwei Finger) oder Regler frei wählen, bevor gespeichert wird.
- **Spieler-Bilanz im Profil:** eigene „📊 Bilanz"-Karte je Profil mit Sieg-/Podestquote,
  Ø-Platzierung, roter Laterne, Trefferquote, Ansage-/Stich-Index (normiert auf Kartenzahl
  & Mitspielerzahl — vergleichbar über unterschiedlich große Runden/Spiele hinweg), Ø
  Punkte/Runde, bestem Spielergebnis und längster Treffer-Serie.
- **All-Time-Bestenliste (`#/stats`):** Hall of Fame mit den jeweiligen Spitzenreitern
  (meiste Siege, beste Quoten, meiste/wenigste Stiche, mutigste Ansage, größter
  Aufschneider, beste Geld-Bilanz, …) sowie eine vollständige, per Kennzahl umschaltbare
  Rangliste über alle Spielerprofile.

**Live:** <https://thommson92.github.io/RaufRunter/>

## Lokal starten
Kein Build nötig. Einen statischen Server im Projektordner starten:

```bash
npm run serve     # python3 -m http.server 5173
# dann http://localhost:5173 öffnen
```

(Direktes Öffnen der `index.html` per `file://` funktioniert wegen ES-Modulen nicht — Server nutzen.)

## Tests
```bash
npm test          # node --test test/*.test.mjs  (Engine-Logik)
```

## Projektkontext / Planung
Vollständige Spezifikation, Entscheidungs-Log, Tech-Stack und Implementierungsplan:
**[docs/SPEZIFIKATION.md](docs/SPEZIFIKATION.md)**.

## Stand
M0–M11 fertig: Engine, Schreiber-UI, Firestore-Live-Sync, Zuschauer-View, PWA, Deploy,
Statistiken/Auswertung, Feinschliff (Geber-Auslosung, Live-Rundenstatus, Lösch-Passwort),
Rundenkommentar/Malus-Bilanz, konsistente Navigation, Malus-Kreisdiagramme und dauerhafte
Spielerprofile. App ist live.
UX-Feinschliff aus echtem Gebrauch: Standard-Kartenzahl 10, Kommentar-Grammatik (Plural,
richtungsabhängiges „nur"), CVD-sichere Chart-Palette, Sortierung nach Erstelldatum,
Spendenlink, korrigierte App-Icons inkl. maskable Variante, mobile Tabellensteuerung.
Geldeinsatz & Ausschüttung (M17): optionaler Einsatz je Spiel mit vier Ausschüttungsmodi,
Auszahlungs-Übersicht am Spielende, nachträglich für jedes Spiel aktivier-/änderbar.
Profilfoto-Zuschnitt (M18): eigener Ausschnitt/Zoom-Bildschirm statt festem Mitte-Crop.
Spieler-Bilanz & All-Time-Statistiken (M19): spielübergreifende Kennzahlen je Profil
(profile-stats.js) speisen sowohl die neue Bilanz-Karte im Profil als auch die neue
Bestenliste (#/stats) mit Hall of Fame und umschaltbaren Ranglisten.
Mögliche Nächstes: echter Zwei-Geräte-Test.
