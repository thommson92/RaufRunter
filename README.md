# 🃏 Rauf Runter

Punktezähler-Web-App für das Kartenspiel **„10 rauf, 10 runter"** (Stiche-Raten-Variante).
Mobile-first, läuft als statische Seite auf **GitHub Pages**.

## Was kann es?
- Spiel mit Spielern & Sitzreihenfolge anlegen, max. Kartenzahl konfigurierbar (Kurve 1 → max → 1).
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
- **Malus-Bilanz:** eigene Statistik, wie Spieler abschneiden, wenn sie als Geber die Ansage
  nicht frei wählen durften.
- Installierbar als **PWA** („Zum Startbildschirm"), Oberfläche offline-fähig.
- Spiel löschen ist durch eine Passwortabfrage geschützt.

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
M0–M8 fertig: Engine, Schreiber-UI, Firestore-Live-Sync, Zuschauer-View, PWA, Deploy,
Statistiken/Auswertung, Feinschliff (Geber-Auslosung, Live-Rundenstatus, Lösch-Passwort) und
Rundenkommentar/Malus-Bilanz. App ist live. Mögliche Nächstes: echter Zwei-Geräte-Test.
