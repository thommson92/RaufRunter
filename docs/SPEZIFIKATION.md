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
  **Pro Spiel umschaltbar** über das Feld `upOnly` (beim Anlegen wählbar, Standard
  **rauf & runter**). Ist `upOnly` aktiv, wird **nur 1 → max** gespielt (`N` Runden,
  Folge `1,2,…,N`). Fehlendes Feld ⇒ rauf & runter (abwärtskompatibel).
- **Ablauf je Runde:** Erst sagen alle Spieler ihre Stiche an, dann wird gespielt,
  danach werden die **tatsächlich gemachten Stiche** eingetragen.
- **Geber rotiert (Ansage-Reihenfolge):** Wie im echten Spiel wandert der **Geber**
  pro Runde einen Sitz weiter (im Uhrzeigersinn bzw. von oben nach unten): Runde 1 gibt
  der erste Spieler der Sitzreihenfolge, Runde 2 der zweite usw. (`dealerIndex =
  Rundenindex mod Spielerzahl`). Der **Geber sagt zuletzt an** und trägt damit den
  **Nachteil der verbotenen Ansage** (siehe unten). Die Ansage-Reihenfolge beginnt beim
  Spieler direkt nach dem Geber und rotiert im Uhrzeigersinn (`engine.biddingOrder`).
- **Verbotene Ansage (letzter Spieler):** Die **Summe aller Ansagen darf nicht der
  Kartenzahl der Runde entsprechen.** Nur der **letzte** Ansagende (= der **Geber** dieser
  Runde, siehe Geber-Rotation) ist eingeschränkt; die
  App sperrt genau den Wert `Kartenzahl − Summe der übrigen Ansagen` (sofern im Bereich
  `0..Kartenzahl`). **Pro Spiel umschaltbar** über das Feld `restrictLastBid` (beim
  Anlegen wählbar, Standard **an**). Ist es aus, darf auch der letzte Spieler beliebig
  ansagen (die Summe darf aufgehen). Fehlendes Feld ⇒ Regel an (abwärtskompatibel).
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
- **Lustige Namensvorschläge**: alliterierende Namen (Vor-/Nachname gleicher
  Anfangsbuchstabe, z. B. „Daniel Düsentrieb") als Platzhalter beim Anlegen eines
  Profils. Quelle: `src/names.js`. Reine UI-Hilfe, kein DB-Einfluss.
- **Spielerprofile** (M11): Namen einmal anlegen und in jeder Runde wiederverwenden,
  mit eindeutigem Profilbild. Grundlage für spielübergreifende Langzeit-Statistiken.

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
| 12 | Spielernamen wiederverwendbar? | **Ja, als Profile** (`players`-Collection) — Vorstufe für spielübergreifende Statistiken. |
| 13 | Gäste ohne Profil erlaubt? | **Nein.** Jeder Mitspieler braucht ein Profil; Anlegen geht im gleichen Zug beim Anlegen der Runde. |
| 14 | Alter Name nach Umbenennen/Merge? | **Profilname gewinnt**, auch rückwirkend in alten Runden. |
| 15 | Profilbilder? | **Selbst generiertes Identicon oder eigenes Foto** — keine externe API, damit die PWA offline funktioniert. Jedes Bild ist eindeutig. |
| 16 | Wer darf Profile anlegen/löschen? | Anlegen: **jeder**. Löschen & Zusammenführen: **Passwort** (dasselbe wie beim Spiel-Löschen). |
| 17 | Sortierung der Spieleliste (Startseite)? | Nach **`createdAt`** absteigend, nicht `updatedAt` — ein Batch-Write (z.B. beim nachträglichen Zuordnen von Spielerprofilen) setzt `updatedAt` sonst bei vielen Spielen gleichzeitig und macht die Reihenfolge zufällig. |
| 18 | Reihenfolge der Chart-Farbpalette? | Von der `dataviz`-Skill-Standardpalette übernommen, aber umsortiert: die alte Reihenfolge hatte Aqua (Slot 2) und Grün (Slot 4) beide sichtbar ab 5 Spielern und schlägt beim Normalsicht-Floor fehl. Neue Reihenfolge (`styles.css` `:root`) besteht `validate_palette.js` vollständig; Grün rutscht auf Slot 6. |
| 19 | Maskable Icon für Android? | Eigenes `assets/icon-maskable.svg`/`-512.png`: randlose Variante mit Motiv auf ~62 % verkleinert, damit es innerhalb der Safe-Zone (mittlerer 80 %-Kreis) bleibt, auch bei aggressiverem Launcher-Zuschnitt als von der Spezifikation gefordert. |
| 20 | KI-generierte Rundenkommentare statt regelbasiert? | **Vorerst nicht** — stattdessen mehr Themenvielfalt im bestehenden regelbasierten Generator (M15). Für später festgehaltene Architektur, falls doch gewünscht: Das Projekt hat aktuell **keinen eigenen Server** (Client spricht direkt mit Firestore); ein LLM-API-Key darf aber nie im Client-Bundle landen (anders als der öffentliche Firebase-Web-Key, dessen Schutz über Firestore-Rules läuft). Sicherer Weg: eine **Firebase Cloud Function** als Proxy, getriggert bei Rundenabschluss, bekommt nur die strukturierten Fakten aus `roundEvents()` (keine Freitext-Spielernamen direkt im Prompt, wegen Prompt-Injection), ruft die LLM-API mit serverseitigem Key auf und schreibt das Ergebnis einmal pro Runde ins Rundendokument (kein Call pro Render). Empfehlung, falls umgesetzt: **Hybrid** — der bestehende regelbasierte Text bleibt die Quelle der Fakten und der Offline-/Kostenlos-Fallback; die KI würde ihn höchstens sprachlich variieren, nicht neue Fakten erfinden. Ausgabe weiterhin über `esc()` einbetten (kein `innerHTML` von KI-Text), sonst XSS-Risiko über eine manipulierte Antwort. |
| 21 | Wie soll der Geldtopf ausgeschüttet werden? | **Konfigurierbar je Spiel**, kein einzelnes festes Schema — variiert in der Praxis je nach Runde/Spieleranzahl. Vier Modi: „Sieger bekommt alles", „Zweiter bekommt Einsatz zurück" (Rest an Sieger), „Dritter Einsatz zurück, Zweiter doppelten Einsatz" (Rest an Sieger, ab 3 Spielern wählbar), sowie „Manuelle Eingabe" für alles, was nicht ins Schema passt. Die drei Preset-Modi zahlen festen Plätzen ein Vielfaches des Einsatzes, der Rest geht **immer gesammelt an Rang 1**. Bei einem geteilten Rang mit k Spielern belegt die Gruppe fiktiv die Plätze `rank..rank+k-1`; alle für diese Plätze vorgesehenen Auszahlungen werden zusammengelegt und **gleichmäßig auf die Gruppe verteilt** statt jedem einzeln in voller Höhe gutgeschrieben (sonst könnte bei `podium-cascade` z. B. ein Zweier-Gleichstand auf Platz 2 mehr auszahlen, als der Topf hergibt). Das behandelt auch Rang 1 ohne Sonderfall: teilen sich zwei Spieler Rang 1, existiert kein Rang 2, die dafür vorgesehene Auszahlung fließt dann einfach nicht ab und bleibt Teil des Rests für Rang 1 (siehe `engine.moneyPayouts`). |

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
- `#/` — Startseite: Liste der Spiele + „Neues Spiel" + 👥 zu den Profilen.
- `#/new` — Spiel anlegen (Name, max Karten, Spieler aus Profilen wählen).
- `#/game/<id>` — **Schreiber-Ansicht** (Eingabe + Tabelle).
- `#/players/<id>` — Sitzreihenfolge im Spiel ändern (Namen kommen aus dem Profil).
- `#/view/<id>` — **Zuschauer-Ansicht** (read-only, live).
- `#/profiles` — **Spielerprofile**: Übersicht & Anlegen (ohne Passwort).
- `#/profiles/<id>` — Profil bearbeiten: Name, Profilbild, Löschen (Passwort).
- `#/admin` — **Verwaltung** (Passwort): Profile zusammenführen, alte Runden zuordnen.

### Datenmodell
```jsonc
games/<gameId> = {
  id, name, maxCards, currentRound,
  upOnly,                             // bool, default false (nur 1→max statt 1→max→1?)
  restrictLastBid,                    // bool, default true (verbotene Ansage aktiv?)
  moneyEnabled,                       // bool, default false (wird um Geld gespielt?)
  stake,                              // number, € je Spieler fürs ganze Spiel (Pot = stake × Spieleranzahl)
  payoutMode,                         // 'winner-takes-all' | 'runner-up-refund' | 'podium-cascade' | 'manual'
  manualPayouts,                      // { [playerId]: number } Netto-Gewinn/Verlust, nur bei payoutMode 'manual'
  createdAt, updatedAt,
  players: [ { id, profileId, name, seatOrder } ],
  rounds:  [ {
    index, cardCount,
    bids:   { [playerId]: number },   // Ansagen
    tricks: { [playerId]: number },   // gemachte Stiche
    trump?: "Rot"|"Blau"|"Grün"|"Gelb", // optional gelost
    done:   boolean
  } ]
}

players/<profileId> = {
  id, name,                           // Name eindeutig (case-/umlaut-unabhängig)
  avatar: { type: "identicon", seed, key }   // generiertes Muster
        | { type: "photo", dataUrl },        // eigenes Foto, 256px JPEG
  createdAt, updatedAt
}
```
**Wichtig:** Punkte werden **abgeleitet** berechnet (`engine.standings`), **nicht**
gespeichert → Korrekturen bleiben immer konsistent.

**Spielinterne ID vs. Profil-ID:** `players[].id` bleibt die spielinterne ID und ist
Schlüssel in `rounds[].bids`/`tricks`; `profileId` verweist zusätzlich auf das dauerhafte
Profil. Die beiden bewusst **nicht** zu verschmelzen macht Umbenennen und Zusammenführen
risikolos — dabei werden nie Punktedaten angefasst.

**Das Profil ist die einzige Wahrheit für Namen.** Beim Umbenennen oder Zusammenführen
werden alle betroffenen Spiel-Dokumente einmal umgeschrieben (Write-Through statt Auflösen
zur Render-Zeit) — dadurch bleibt der komplette Render- und Engine-Pfad unverändert, und
alte Runden zeigen rückwirkend den aktuellen Namen.

**Eine Person nie zweimal am selben Tisch.** Zwei Sitzplätze desselben Spiels dürfen nicht
auf dasselbe Profil zeigen: sie haben eigene Ansagen und Stiche und ließen sich nicht zu
einer Person verrechnen. Sowohl das Zusammenführen (`findMergeConflicts`) als auch das
Zuordnen alter Runden (`planNameAssignment`) verweigern solche Fälle — Letzteres nach dem
Alles-oder-nichts-Prinzip, damit kein halb zugeordneter Zustand entsteht.

**Schreiben aus der Verwaltung setzt frisch geladene Spiele voraus.** `fb.saveGames`
überschreibt ganze Dokumente; mit einem beim Öffnen der Verwaltung eingefrorenen Stand
gingen zwischenzeitlich auf anderen Geräten eingetragene Runden verloren. Zusammenführen
und Zuordnen laden deshalb unmittelbar vor dem Schreiben neu und brechen ab, wenn das
nicht gelingt.

### Dateien
```
index.html               App-Shell
styles.css               Mobile-first Styling (dark)
src/engine.js            Reine Spiellogik (keine DOM-Abhängigkeit) — testbar
src/store.js             createGame-Factory (localStorage-Store nur noch als Referenz)
src/firebase-db.js       Firestore-Instanz (von beiden Adaptern genutzt)
src/store-firebase.js    Firestore-Adapter für Spiele
src/store-profiles.js    Firestore-Adapter für Spielerprofile + Modul-Cache
src/identicon.js         Generierte Profilbilder (rein, testbar)
src/profile-model.js     Profil-Fachlogik: Suche, Dubletten, Merge (rein, testbar)
src/profile-ui.js        Avatare, Foto-Aufbereitung, Combobox-Markup
src/html.js              esc() für die Template-Strings
src/app.js               UI, Hash-Router, Event-Handling
test/*.test.mjs          Unit-Tests (node --test)
docs/SPEZIFIKATION.md    dieses Dokument
```

### Engine-API (`src/engine.js`)
- `roundCardCounts(maxCards)` → `[1..max..1]`
- `totalRounds(maxCards)` → Rundenanzahl
- `roundScore(bid, tricks)` → Punkte einer Runde
- `forbiddenBid(cardCount, sumOtherBids)` / `allowedBids({...})` → verbotene-Ansage-Regel
- `dealerIndex(roundIndex, playerCount)` / `biddingOrder(seated, roundIndex)` → rotierender Geber (letzter Ansagender) & Ansage-Reihenfolge
- `standings(game)` → `{ byPlayer, ranking }` (Summen, Verlauf, geteilte Ränge)
- `tricksCheck(round)` → Plausibilität (Summe Stiche == Kartenzahl)
- `randomTrump()` / `TRUMP_COLORS`
- **Statistiken (M6):** `rankProgression(game)` (kumulierter Punktestand & geteilter Rang je fertiger Runde),
  `bidTrickTotals(game)` (Summe Ansagen/Stiche je Spieler), `accuracyStats(game)` (Trefferquote),
  `longestCorrectStreak(game)`, `extremeRounds(game)` (beste/schlechteste Einzelrunde — gibt
  **alle** Einträge am Extremwert zurück, nicht nur den ersten), `trumpCounts(game)` (Häufigkeit
  geloster Trumpffarben)
- **Geber-Auslosung (M7):** `rotateToStart(list, startIndex)` — rotiert ein Array (Namen oder
  Spieler) so, dass das Element an `startIndex` künftig an Position 0 steht; Nachbarschaft/
  relative Reihenfolge bleibt erhalten, mutiert nichts.
- **Malus & Rundenkommentar (M8, Bilanz überarbeitet in M10, Themenvielfalt in M15):**
  `dealerMalusStats(game)` — Bilanz je Spieler, wie oft er Geber (letzter Ansagender) war,
  aufgeteilt in `neutral` (Malus griff diese Runde gar nicht wirklich, `forbiddenBid` = null oder
  `restrictLastBid` aus), `malusCorrect` (Malus griff, trotzdem richtig) und `malusWrong` (Malus
  griff, falsch gelegen); `dealerRounds = neutral + malusCorrect + malusWrong`.
  `dealerOutcomeForRound(game, roundIndex)` — dieselbe Bewertung für eine einzelne Runde (Kern
  von `dealerMalusStats`, ausgelagert, damit beide sich nicht widersprechen können).
  `currentStreaks(game, roundIndex)` — je Spieler die **laufende** Serie richtiger/falscher
  Ansagen bis einschließlich `roundIndex` (nicht die längste je erreichte — dafür weiter
  `longestCorrectStreak`). `biddingBias(game, roundIndex)` — Ø-Differenz (Stiche − Ansage) je
  Spieler über die gespielten Runden; positiv = sagt tendenziell zu wenig an, negativ = zu viel.
  `roundEvents(game, roundIndex)` (strukturierte Fakten einer fertigen Runde: Held/Bösewicht,
  Nullansagen, Führungswechsel, Kletterer/Faller in der Platzierung, laufende Serien,
  Geber-Falle-Ausgang, Ansage-Tendenz, krasse Fehlschätzungen ≥2 Stiche — Grundlage für den
  Rundenkommentar, siehe `src/commentary.js`)
- **Geldeinsatz & Ausschüttung (M17):** `moneyPayouts(game)` — `null`, wenn `moneyEnabled`
  falsy, sonst je Spieler `{playerId, name, rank, net}` (Netto-Gewinn/Verlust in €). Nutzt
  `standings()` für die Rangliste. Die drei Preset-Modi (`winner-takes-all`/
  `runner-up-refund`/`podium-cascade`) zahlen festgelegten Plätzen ein Vielfaches des Einsatzes
  zurück; bei einem geteilten Rang mit k Spielern werden alle Auszahlungen der davon belegten
  Plätze (`rank..rank+k-1`) zusammengelegt und gleichmäßig auf die Gruppe verteilt (siehe
  Entscheidung #21), der nicht vergebene Rest geht gesammelt an Rang 1. `manual` reicht
  `game.manualPayouts` durch.

### Charts (`src/charts.js`)
DOM-Bausteine (kein Chart-Framework) für die Zuschaueransicht: `assignSeriesColors(players)`
(stabile Spieler→Farbe-Zuordnung nach Sitzreihenfolge), `buildScoreChart`/`buildRankChart`
(interaktiver SVG-Mehrlinien-Chart mit Crosshair/Tooltip/Legende) und `buildBidVsTricksChart`
(HTML/CSS-Balken Angesagt vs. gemacht). Farbpalette (`--series-1..8` in `styles.css`) ist die
dataviz-Skill-Referenzpalette, gegen die dunkle Oberfläche validiert.

### Glücksrad (`src/wheel.js`)
`buildDealerWheel(names, onSettled)` — reines SVG/CSS-Glücksrad (kein Framework) zur Auslosung
des ersten Gebers beim Anlegen eines neuen Spiels (`#/new`, Option „Ersten Geber auslosen").
Sektoren = Spielernamen in Sitzreihenfolge, Farbe aus derselben `--series-1..8`-Palette wie die
Charts. Dreht per CSS-Transition auf eine zufällig gewählte Zielrotation (`Math.random()` —
empirisch über 200k Ziehungen als unverzerrt verifiziert) und ruft `onSettled(winnerIndex)` auf,
sobald sie steht; die Sitzreihenfolge wird erst danach per `rotateToStart` gesetzt und das Spiel
angelegt (kein Zwischenspeichern eines unvollständigen Spiels).

### Kommentar-Generator (`src/commentary.js`)
`generateRoundCommentary(events)` — regelbasierter „Kommentator"-Text zur zuletzt fertig
gespielten Runde, aus `engine.roundEvents()` gespeist. **Kein LLM/KI-Aufruf** (bewusste
Entscheidung, siehe Entscheidung #20: ein echter API-Aufruf bräuchte einen Server-Proxy, um den
Schlüssel geheim zu halten, und würde Firebase auf den kostenpflichtigen „Blaze"-Tarif zwingen —
reine Textbausteine sind kostenlos, ohne Backend, sofort nutzbar, auch offline). Immer eine
Eröffnung + **höchstens zwei** weitere Highlights, bewusst knapp statt jedes Ereignis für jeden
Spieler auszubuchstabieren.

**Themen (M15):** Held/Bösewicht der Runde, Nullansagen (Treffer & Fehlschlag), laufende Serien
(≥3 Runden am Stück richtig „on fire" bzw. falsch „Krise"), Geber-Falle gemeistert/gescheitert
(nur wenn die verbotene Ansage diese Runde wirklich band), auffällige Ansage-Tendenz („sagt im
Schnitt zu vorsichtig/forsch an" — erst ab 3 gespielten Runden und ≥1 Stich Ø-Abweichung),
frecher Spruch bei krassem Fehlgriff (≥2 Stiche daneben, „Hast du blind angesagt?"),
Führungswechsel, größter Kletterer **und** größter Faller in der Platzierung (≥2 Plätze). Welche
zwei Themen es in den Text schaffen, ist **nicht** mehr fest priorisiert, sondern wird pro Runde
deterministisch durchgemischt (`shuffleKey(roundIndex, topicId)`) — sonst gewinnen bei vielen
gleichzeitig zutreffenden Themen strukturell immer dieselben zwei (früher: Held vor Bösewicht vor
Nullansage vor …) und der Kommentar wiederholt sich übers Spiel hinweg. Mehrere Nullansagen in
derselben Runde werden weiterhin zu einem Satz zusammengefasst (nicht einer pro Spieler).
Formulierung wählt pro Ereignistyp aus mehreren Varianten, deterministisch über einen Seed aus
der Rundennummer (± fester Themen-Offset), damit der Text bei den vielen Re-Renders durchs
Live-Abo nicht flackert.

### Navigation (Seiten-Hierarchie)
Der Zurück-Pfeil (‹) oben links führt immer **eine Ebene nach oben** in der Hierarchie
`Startseite ← Spielleiter-Ansicht ← {Spieler-Ansicht, Zuschauer-Ansicht}` — nie direkt von
Zuschauer- zu Startseite. Seitliche Sprünge zwischen Geschwister-Ansichten (Spielleiter ↔
Zuschauer) laufen über explizite, beschriftete Buttons (z. B. „👁 Zuschauer-Ansicht" unten auf
der Spielleiterseite), nicht über den Zurück-Pfeil — und nur in der Richtung, in der es keinen
Zurück-Pfeil dafür gibt (die Zuschaueransicht braucht deshalb keinen eigenen „Spielleiter-
Ansicht"-Button mehr, das leistet ihr Zurück-Pfeil bereits).

---

## 7. Implementierungsplan & Status

| Meilenstein | Inhalt | Status |
|---|---|---|
| **M0** | Projektstruktur, `package.json`, GitHub-Pages-Setup | ✅ fertig |
| **M1** | Spiel-Engine + Unit-Tests (12 Tests grün) | ✅ fertig |
| **M2** | Schreiber-UI: Spiel anlegen, Runden-Eingabe (Ansagen/Stiche), Tabelle, Sitzreihenfolge, „Farbe losen", Runden editieren, Spiel löschen | ✅ fertig |
| **M3** | **Firestore-Adapter** (`src/store-firebase.js`): gleiche Schnittstelle wie `store.js`, Live-Listener via `onSnapshot`, Spiel-IDs cloudweit, Liste & Löschen; `app.js` auf async/live umgestellt; persistenter IndexedDB-Cache (offline-tauglich) | ✅ fertig |
| **M4** | Zuschauer-View `#/view/<id>` jetzt geräteübergreifend live (gleiches `onSnapshot`-Abo, read-only) + Share-Button | ✅ fertig |
| **M5** | PWA (Manifest, Service-Worker, Icons) + Deploy auf `main` → live unter https://thommson92.github.io/RaufRunter/. SW nutzt **network-first** (online immer frischer Code, Cache nur als Offline-Fallback) + **Auto-Reload bei Update** (wiederkehrende Nutzer laden einmal automatisch neu) — so erreichen Deploys die Geräte zuverlässig. | ✅ fertig |
| **M6** | Statistiken & Auswertung in der Zuschaueransicht: Fakten-Kacheln (Trefferquote, meiste/wenigste Ansagen, Treffer-Serie, beste Einzelrunde, häufigste Trumpffarbe) + drei Charts (Punkteverlauf, Platzierungsverlauf, Angesagt vs. gemacht). Reine Engine-Funktionen (`src/engine.js`) + DOM-Chart-Bausteine (`src/charts.js`), keine neuen Datenfelder. | ✅ fertig |
| **M7** | Feinschliff Zuschaueransicht: Punktestand-Tabelle zeigt Kartenzahl statt Rundennummer, Gesamt-Spalte sticky + Auto-Scroll zur aktuellsten Runde + dauerhaft sichtbare Scrollbar; Live-Panel zur aktuellen Runde (Geber, Ansage-Fortschritt, Rest/Überzahl, wer ist dran); Punkteverlauf-Y-Achse in 10/20/50er-Schritten (nie 100). Neues-Spiel-Anlegen: Option „Ersten Geber auslosen" öffnet vor dem Start ein echtes SVG-Glücksrad (`src/wheel.js`), das die Sitzreihenfolge per `rotateToStart` setzt. Startseite: Datum je Spiel, neuer Footer mit Copyright. Spiel löschen jetzt mit Passwortabfrage. | ✅ fertig |
| **M8** | Zuschaueransicht: „Spielleiter-Ansicht"-Button (analog zum „Zuschauer-Ansicht"-Button auf der anderen Seite); Punktestand-Sortierung & Zeilen/Spalten-Achse als klar beschriftete Segmented Controls statt zweideutiger Toggle-Buttons; Fakten-Kacheln nennen bei Gleichstand alle betroffenen Namen (`extremeGroup`/`extremeRounds` als Arrays); neue „Malus-Bilanz"-Karte (`malusStats`); regelbasierter Rundenkommentar (`src/commentary.js` + `engine.roundEvents`). | ✅ fertig |
| **M9** | Konsistente Navigation: Zurück-Pfeil führt jetzt immer eine Ebene nach oben (Zuschauer- → Spielleiter-Ansicht statt direkt Startseite), der dadurch redundante „Spielleiter-Ansicht"-Button in der Zuschaueransicht entfällt. Rundenkommentar knapper: Eröffnung + max. 2 Highlights statt aller Ereignisse, mehrere Nullansagen in einem Satz statt pro Spieler. Kartenreihenfolge Zuschaueransicht neu sortiert: Rundenkommentar, Punktestand, Punkteverlauf, Platzierungsverlauf, Statistiken, Malus-Bilanz, Angesagt vs. gemacht. | ✅ fertig |
| **M10** | Malus-Bilanz überarbeitet: unterscheidet jetzt Geber-Runden ohne echten Einfluss (neutral) von Malus+richtig/Malus+falsch (`dealerMalusStats` statt `malusStats`) und ist **immer sichtbar** (vorher versteckt, wenn noch kein bindender Malus aufgetreten war — schwer von einem Bug zu unterscheiden). Darstellung als Kreisdiagramm je Spieler (CSS `conic-gradient`, grau/grün/rot, gemeinsame Legende). | ✅ fertig |
| **M11** | **Spielerprofile** (`players`-Collection): Namen werden nicht mehr getippt, sondern aus wiederverwendbaren Profilen gewählt — Combobox mit Vorschlägen ab dem ersten Buchstaben, unbekannte Namen direkt im Formular anlegbar. Profilbilder: generiertes Identicon (`src/identicon.js`, GitHub-Stil, garantiert eindeutig) oder eigenes Foto (Canvas-Resize auf 256 px, als Data-URL im Profil-Dokument). Neue Ansichten `#/profiles`, `#/profiles/<id>` und passwortgeschützte `#/admin` (Profile zusammenführen, Spieler aus Bestandsrunden zuordnen). Grundlage für spielübergreifende Statistiken. | ✅ fertig |
| **M12** | **UX-Feinschliff** aus echtem Gebrauch: Standard-Kartenzahl 10 (Obergrenze 15 statt 20); Rundenkommentar-Grammatik korrigiert (Plural-Verben bei mehreren Helden/Bösewichten/Führenden, „A, B und C" statt Kettung mit „und", richtungsabhängiges „nur"/„gleich" je nachdem ob weniger oder mehr Stiche als angesagt gemacht wurden); Chart-Palette umsortiert gegen zwei Grüntöne bei 5 Spielern (Entscheidung #18); Startseite wieder nach `createdAt` sortiert (Entscheidung #17); PayPal-Spendenlink auf der Startseite; App-Icons `icon-192`/`apple-touch-icon` waren fehlerhaft zugeschnitten und wurden aus `icon-512` neu erzeugt, dazu neues maskable Icon für Android (Entscheidung #19); Tabellensteuerung auf schmalen Smartphones gestapelt statt gequetscht. | ✅ fertig |
| **M13** | **Profilbilder in der Zuschaueransicht**: Profilbilder waren bisher nur in Verwaltungs-Ansichten (Spielerstellung, Sitzreihenfolge, Profile, Spielleiter-Eingabe) sichtbar — genau dort, wo sich Mitspieler während des Spiels *nicht* aufhalten. Neue Spielerleiste ganz oben in `#/view/<id>`: alle Avatare, nach Punktestand sortiert mit Platzierung (🥇/2./3./…), bleibt auch nach der letzten Runde sichtbar (anders als die Karte „Aktuelle Runde"). Die Geber-Zeile in „Aktuelle Runde" zeigt jetzt ebenfalls Avatar + Name auf Höhe der Ansage-Zeilen („◉ Tommi gibt 10 Karten 🃏"), die redundante Karten-Pill in der Kopfzeile entfällt. | ✅ fertig |
| **M14** | **Kleine Verbesserungen aus echtem Gebrauch**: Statusleiste im installierten iOS-PWA-Modus rutschte beim Scrollen unter Uhrzeit/Akku (`.topbar` klebte an `top: 0` statt an `env(safe-area-inset-top)` — nur im Standalone-Modus sichtbar, da Safari selbst kein „black-translucent"-Overlay hat); Kartenzahl-Eingabe im „Neues Spiel"-Formular durch großen +/− Stepper ersetzt (das native Zahlenfeld war auf dem Smartphone kaum treffbar); Feedback-Link (`mailto:`) neben dem Spendenlink auf der Startseite. | ✅ fertig |
| **M15** | **Rundenkommentar: mehr Themenvielfalt** (siehe Entscheidung #20 für die zurückgestellte KI-Variante). Neue Themen neben Held/Bösewicht/Nullansage/Führungswechsel/Kletterer: laufende Serien (`currentStreaks`), Geber-Falle gemeistert/gescheitert je Einzelrunde (`dealerOutcomeForRound`), auffällige Ansage-Tendenz (`biddingBias`), frecher Spruch bei krassem Fehlgriff, größter Faller als Kehrseite des Kletterers. Auswahl der zwei Highlights pro Runde nicht mehr fest priorisiert, sondern deterministisch gemischt (`shuffleKey`), damit sich der Kommentar übers Spiel hinweg nicht strukturell wiederholt. | ✅ fertig |
| **M16** | **Feinschliff aus M13/M14-Feedback**: Favicon war nur eine 192px-PNG ohne `sizes` — jetzt zusätzlich `assets/icon.svg` als primärer (skalierbar scharfer) Favicon-Link. Startseite zeigt anfangs nur die letzten 5 Spiele + „weitere anzeigen"-Button, damit Spenden-/Feedback-Buttons unten bei vielen Spielen nicht erst nach langem Scrollen erreichbar sind. Spielerleiste (M13): lange Namen wurden bei fester Breite mit `…` abgeschnitten statt umzubrechen — jetzt bis zu zwei Zeilen; Silber/Bronze-Medaillen (🥈/🥉) für Platz 2/3, vorher nur Gold für Platz 1. Geber-Zeile (M13): Name und Folgetext standen auf unterschiedlicher Höhe, weil `.avatar-name` (inline-flex) im normalen Textfluss eines `<p>` keine echte Baseline hat — Zeile ist jetzt selbst ein Flex-Container. | ✅ fertig |
| **M17** | **Geldeinsatz & Ausschüttung**: neue „💰 Geld"-Karte beim Anlegen eines Spiels UND jederzeit nachträglich in der Schreiber-Ansicht editierbar (auch für längst abgeschlossene Spiele) — ob um Geld gespielt wird, Einsatz je Spieler (Stepper wie bei der Kartenzahl, Standard 10 €), Ausschüttungsmodus (Entscheidung #21, `podium-cascade` erst ab 3 Spielern wählbar). Neue Engine-Funktion `moneyPayouts(game)` berechnet nach der letzten Runde den Netto-Gewinn/Verlust je Spieler; neue „💰 Auszahlung"-Karte zeigt das Ergebnis in Schreiber- **und** Zuschauer-Ansicht (grün/rot wie die Punktestand-Zellen). Im manuellen Modus trägt der Schreiber die Beträge direkt in der Karte ein, die Zuschauer-Ansicht zeigt sie read-only bzw. „noch nicht eingetragen". | ✅ fertig |

### Status-Notiz (M3/M4 verifiziert)
- Smoke-Test via Chrome-headless + DevTools-Protokoll: Startseite/`listGames` lädt,
  Spiel anlegen schreibt nach Firestore, Schreiber-Ansicht rendert live, Ansage-Pille
  speichert — **keine** Konsolen-/Firestore-Fehler. Test-Spiel danach wieder gelöscht.
- Architektur umgesetzt wie geplant: `store-firebase.js` als Sync-Schicht; Firestores
  eigener `persistentLocalCache` übernimmt local-first/offline (Browser-Schließen &
  kurze Offline-Phasen unkritisch, Writes werden nachgeholt).
- `src/store.js` (localStorage) bleibt als Referenz/Fallback erhalten, wird von der App
  aber nicht mehr genutzt (außer `createGame`, reine Factory).

### Offen für M5
- PWA-Manifest + Service-Worker („Zum Startbildschirm", App-Icon).
- Deploy auf `main` für GitHub Pages; danach echter Cross-Device-Test (Schreiber-Handy +
  Zuschauer-Handy über den geteilten `#/view/<id>`-Link).
- Optional: Schreibvorgänge beim Pillen-Tippen leicht bündeln (jeder Tap = 1 Firestore-Write;
  im Free-Tier unkritisch, aber bündelbar).
