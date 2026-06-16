# Firebase-Setup (für Live-Sync, M3)

Diese App ist **local-first** und läuft komplett ohne Firebase. Firebase liefert nur die
**geräteübergreifende Live-Tabelle** (Zuschauer-Link) und die Cloud-Speicherung, sodass
Spiele auf anderen Smartphones in Echtzeit mitgelesen werden können.

- **Dienst:** Cloud **Firestore** (NoSQL, Echtzeit via `onSnapshot`)
- **Tarif:** Spark (kostenlos, keine Kreditkarte) — Free-Tier von 50.000 Lesevorgängen/Tag
  reicht für einen Freundeskreis weit aus.
- **Auth:** keine — bewusst (Zuschauer read-only, kein Schutz gefordert).

---

## Einrichtungsschritte (einmalig, in der Firebase Console)

1. **Projekt anlegen** auf <https://console.firebase.google.com> → „Projekt hinzufügen".
   Google Analytics ist optional und nicht nötig.
2. **Web-App registrieren** (`</>`-Symbol). Firebase Hosting **nicht** ankreuzen (Hosting
   läuft über GitHub Pages). Die angezeigte `firebaseConfig` ist bereits in
   [`src/firebase-config.js`](../src/firebase-config.js) hinterlegt.
3. **Firestore Database** aktivieren (Menü → „Firestore Database" → „Datenbank erstellen"),
   **Produktionsmodus**, Region nahe an euch (z. B. `eur3` / `europe-west`).
4. **Security-Rules** setzen (Tab „Regeln"):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /games/{gameId} {
         allow read, write: if true;
       }
     }
   }
   ```

   > Bewusst offen, da kein Schutz gefordert ist und nur die `games`-Sammlung betroffen
   > ist. Wer Schreibzugriff einschränken will, müsste später Firebase Auth ergänzen.

---

## Aktuelles Projekt

| Feld | Wert |
|---|---|
| Project ID | `raufrunter-edef7` |
| Auth Domain | `raufrunter-edef7.firebaseapp.com` |
| Config-Datei | [`src/firebase-config.js`](../src/firebase-config.js) |

Die Config-Werte sind **öffentlich** (clientseitig, im Bundle sichtbar) — kein Geheimnis.
Der Schutz läuft über die Security-Rules oben.

---

## Geplante Code-Anbindung (M3 — noch offen)

Datenmodell und `store`-Schnittstelle stehen bereits (siehe
[SPEZIFIKATION.md](SPEZIFIKATION.md)). Umzusetzen:

- **`src/store-firebase.js`** — implementiert dieselbe API wie `src/store.js`
  (`listGames / getGame / saveGame / deleteGame / subscribe`), nutzt Firestore.
- Firebase per **CDN-ES-Module** laden (kein Build-Step), z. B.:
  ```js
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
  import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
           getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';
  import { firebaseConfig } from './firebase-config.js';
  ```
- Jedes Spiel = ein Dokument unter `games/<gameId>` (entspricht dem bestehenden
  Datenmodell).
- `subscribe(id, cb)` über `onSnapshot(doc(db,'games',id), …)` → Schreiber **und**
  Zuschauer rendern bei jeder Remote-Änderung neu.
- Empfehlung: local-first beibehalten, Firestore als Sync-Schicht darüberlegen (z. B.
  optimistisch lokal speichern und parallel nach Firestore schreiben), damit kurze
  Offline-Phasen die Eingabe nicht blockieren.
