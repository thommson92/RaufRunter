# Rauf Runter — Spezifikation & Projektkontext

> Punktezähler-Web-App für das Kartenspiel **„10 rauf, 10 runter"** (Variante von
> „Stiche-Raten"). Dieses Dokument hält die komplette Planung fest, damit jede
> Person — oder KI — die Implementierung mit vollem Kontext übernehmen kann.
>
> **Stand:** Planung abgeschlossen, Umsetzung M0–M2 fertig. Siehe [Status & Plan](#7-implementierungsplan--status).

---

## 1. Ziel & Kontext

Eine Web-App, mit der beim Spielen pro Runde notiert wird, wer **wie viele Stiche ansagt**
und wer am Ende **richtig** lag. Punkte werden automatisch vergeben, der Punktestand ist
jederzeit als Tabelle einsehbar.

**Geschäftsziel:** Veröffentlichung über **GitHub Pages**, um Freunden einen Link schicken
zu können.

**Zielgruppe:** Mitspieler, die keinen Stift/Zettel dabei haben und stattdessen das
Smartphone nutzen. → **Mobile-first.**

---

## 2. Spielregeln (fachlich)

- **Rundenkurve:** Die Kartenanzahl pro Runde geht **1 → max → 1**, der Höhepunkt wird
  **einmal** gespielt. Das Maximum ist konfigurierbar. Bei `max = N` ergibt das `2N − 1`
  Runden (z. B. max 10 ⇒ 19 Runden, Folge `1,2,…,10,…,2,1`).
- **Ablauf je Runde:** Erst sagen alle Spieler in **Sitzreihenfolge** ihre Stiche an,
  dann wird gespielt, danach werden die **tatsächlich gemachten Stiche** eingetragen.
- **Verbotene Ansage (letzter Spieler):** Die **Summe aller Ansagen darf nicht der
  Kartenzahl der Runde entsprechen.** Nur der **letzte** Ansagende ist eingeschränkt; die
  App sperrt genau den Wert `Kartenzahl − Summe der übrigen Ansagen` (sofern im Bereich
  `0..Kartenzahl`).
- **Punkte je Spieler & Runde:**
  - Richtig angesagt: **`+10 + gemachte Stiche`**
  - Falsch angesagt: **`−10 + gemachte Stiche`**
  - Beispiele: angesagt 2 / gemacht 2 → **+12**; angesagt 3 / gemacht 1 → **−9**;
    angesagt 0 / gemacht 0 → **+10**; angesagt 5 / gemacht 0 → **−10**.
- **Sieger:** höchste Gesamtpunktzahl. **Gleichstand = geteilter Rang** (1, 1, 3, …).
- **Trumpf:** Im echten Spiel kommt der Trumpf durch eine aufgedeckte Karte zustande — das
  weiß die App nicht und es interessiert sie nicht. Es gibt lediglich einen **optionalen
  „Farbe losen"-Knopf**, der zufällig **Rot / Blau / Grün / Gelb** auslost (nutzbar in
  jeder Runde, z. B. wenn alle Karten ausgeteilt sind und keine Trumpfkarte aufgedeckt
  werden kann — oder einfach zum Spaß). Die gelost Farbe wird an der Runde gespeichert und
  in der Tabelle/Zuschaueransicht angezeigt.

---

## 3. Rollen

- **Schreiber** (1 Person): legt das Spiel an, trägt Ansagen & Stiche ein, verwaltet
  Sitzreihenfolge/Einstellungen, kann Spiele löschen.
- **Zuschauer** (beliebig viele): öffnen den geteilten Link und sehen die Tabelle **live,
  nur lesend** — kein Login, kein Schreibschutz nötig (Read-only reicht als Schutz).

---

## 4. Anforderungen

### Muss
- Neue Spielrunde anlegen inkl. Spielernamen **und** Sitzreihenfolge.
- Automatische Punktevergabe nach jeder Runde.
- Punktestand-Tabelle jederzeit einsehbar.
- **Persistenz:** Browser schließen verliert die Session nicht; vergangene Spiele auch
  Tage später noch ansehbar.
- Letzter Spieler darf nicht die „aufgehende" Anzahl ansagen (siehe Regeln) — von der App
  erzwungen.
- **Live-Tabelle über Link** auf den Smartphones der Mitspieler.
- Anzahl der Runden (= max. Kartenzahl) **konfigurierbar**.
- **Sitzreihenfolge nachträglich änderbar** (Leute setzen sich um), ohne Punkte zu
  verfälschen.
- **„Farbe losen"-Zufallsgenerator** (Rot/Blau/Grün/Gelb).

### Optimierung / Nice-to-have
- Optimiert für **2–8 Spieler**; mehr erlaubt, Lesbarkeit darf dann leiden.
- Spiele **löschbar**.
- Sprache: **Deutsch**.
- PWA („Zum Startbildschirm"), lokale Eingabe kurz offline möglich.

---

## 5. Geklärte Fragen (Entscheidungs-Log)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Wie Live-Sync, da GitHub Pages statisch ist? | **Firebase** (Free-Tier) für Cloud-Speicherung + Echtzeit. |
| 2 | Punkteformel? | Richtig `+10 + Stiche`, falsch `−10 + Stiche`. |
| 3 | Rundenkurve? | **1 → max → 1**, Höhepunkt **einmal**. |
| 4 | Einträge nachträglich editierbar? | **Ja, jede Runde**, Punkte werden neu berechnet. |
| 5 | Wer darf eintragen / Zugang? | **Ein Schreiber**, Rest **read-only** per Link. |
| 6 | Spieleranzahl? | Keine harte Grenze, **UI für 2–8 optimiert**. |
| 7 | Trumpf-Verwaltung? | Nur **optionaler „Farbe losen"-Knopf**, sonst egal. |
| 8 | Höhepunkt einmal/doppelt? | **Einmal.** |
| 9 | Spiele löschbar? | **Ja.** |
| 10 | Sprache? | **Nur Deutsch.** |
| 11 | Schreibschutz nötig? | **Nein**, solange Zuschauer-Link read-only ist. |

---

## 6. Technischer Entwurf

### Gewählter Stack
- **Frontend:** Vanilla **JavaScript (ES-Module)** + HTML + CSS — **kein Build-Step**.
  Begründung: trivialer GitHub-Pages-Deploy (statische Dateien), keine Toolchain nötig,
  langlebig/abhängigkeitsarm. Hash-basiertes Routing (`#/…`), damit GitHub Pages ohne
  Server-Rewrites auskommt.
- **Persistenz/Sync:** **local-first** über `localStorage` (bereits umgesetzt), in M3
  ergänzt um einen **Firebase-Adapter** (Firestore o. Realtime DB, Free-Tier) für
  Cloud-Speicherung und echte Cross-Device-Live-Updates. Die `store`-Schnittstelle
  (`listGames/getGame/saveGame/deleteGame/subscribe`) ist bewusst so geschnitten, dass der
  Firebase-Adapter sie 1:1 implementieren kann.
- **Hosting:** GitHub Pages (Branch `main`, Root). `.nojekyll` verhindert Jekyll-Processing.
- **Tests:** Node-eigener Test-Runner (`node --test`) für die reine Engine — kein npm-Dep.

### Routen (Hash)
- `#/` — Startseite: Liste der Spiele + „Neues Spiel".
- `#/new` — Spiel anlegen (Name, max Karten, Spieler).
- `#/game/<id>` — **Schreiber-Ansicht** (Eingabe + Tabelle).
- `#/players/<id>` — Spieler umbenennen & Sitzreihenfolge ändern.
- `#/view/<id>` — **Zuschauer-Ansicht** (read-only, live).

### Datenmodell
```jsonc
games/<gameId> = {
  id, name, maxCards, currentRound,
  createdAt, updatedAt,
  players: [ { id, name, seatOrder } ],
  rounds:  [ {
    index, cardCount,
    bids:   { [playerId]: number },   // Ansagen
    tricks: { [playerId]: number },   // gemachte Stiche
    trump?: "Rot"|"Blau"|"Grün"|"Gelb", // optional gelost
    done:   boolean
  } ]
}
```
**Wichtig:** Punkte werden **abgeleitet** berechnet (`engine.standings`), **nicht**
gespeichert → Korrekturen bleiben immer konsistent.

### Dateien
```
index.html              App-Shell
styles.css              Mobile-first Styling (dark)
src/engine.js           Reine Spiellogik (keine DOM-Abhängigkeit) — testbar
src/store.js            Zustand + Persistenz (localStorage; Firebase-Adapter folgt in M3)
src/app.js              UI, Hash-Router, Event-Handling
test/engine.test.mjs    Unit-Tests der Rechenregeln (node --test)
docs/SPEZIFIKATION.md   dieses Dokument
```

### Engine-API (`src/engine.js`)
- `roundCardCounts(maxCards)` → `[1..max..1]`
- `totalRounds(maxCards)` → Rundenanzahl
- `roundScore(bid, tricks)` → Punkte einer Runde
- `forbiddenBid(cardCount, sumOtherBids)` / `allowedBids({...})` → verbotene-Ansage-Regel
- `standings(game)` → `{ byPlayer, ranking }` (Summen, Verlauf, geteilte Ränge)
- `tricksCheck(round)` → Plausibilität (Summe Stiche == Kartenzahl)
- `randomTrump()` / `TRUMP_COLORS`

---

## 7. Implementierungsplan & Status

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M0** | Projektstruktur, `package.json`, GitHub-Pages-Setup | ✅ fertig |
| **M1** | Spiel-Engine + Unit-Tests (12 Tests grün) | ✅ fertig |
| **M2** | Schreiber-UI: Spiel anlegen, Runden-Eingabe (Ansagen/Stiche), Tabelle, Sitzreihenfolge, „Farbe losen", Runden editieren, Spiel löschen | ✅ fertig |
| **M3** | **Firebase-Adapter**: `store`-Interface gegen Firestore/RTDB, echte Live-Listener, Spiel-IDs cloudweit, Liste & Löschen | ⏳ offen |
| **M4** | Zuschauer-View geräteübergreifend live (Grundgerüst `#/view/<id>` steht; braucht M3 für Cross-Device) + Share-Button (vorhanden) | 🟡 teilweise |
| **M5** | Politur, PWA-Manifest/Service-Worker, GitHub-Pages-Deploy, Test mit echtem Link auf 2. Gerät | ⏳ offen |

### Hinweise für die Weiterarbeit (M3)
- Firebase-Config kommt in eine separate Datei (z. B. `src/firebase-config.js`), die **nicht**
  geheim sein muss (Web-API-Keys sind öffentlich; Schutz über Firestore-Security-Rules).
- `store.subscribe(id, cb)` mit `onSnapshot` implementieren → Schreiber und Zuschauer
  rendern bei jeder Remote-Änderung neu.
- Security-Rules: Lesen offen (oder per Game-ID), Schreiben ggf. offen lassen (kein Schutz
  gefordert) — bewusst dokumentieren.
- Empfehlung: local-first beibehalten und Firebase als Sync-Schicht darüberlegen
  (offline-tauglich), nicht ersetzen.
