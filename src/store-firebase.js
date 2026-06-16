// store-firebase.js — Firestore-Adapter (M3).
// Implementiert dieselbe fachliche Schnittstelle wie store.js, aber
// geräteübergreifend & live. Firestore-eigener IndexedDB-Cache übernimmt
// die "local-first"-Rolle: Daten überleben Browser-Schließen und kurze
// Offline-Phasen (Schreibvorgänge werden gepuffert und nachsynchronisiert).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);

// Persistenter lokaler Cache (IndexedDB) + Mehr-Tab-Sync.
// Fällt automatisch auf Memory-Cache zurück, falls IndexedDB nicht verfügbar.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('Firestore-Persistenz nicht verfügbar, nutze Standard-Cache.', e);
  db = initializeFirestore(app, {});
}

const GAMES = 'games';
const gameRef = (id) => doc(db, GAMES, id);

export const fb = {
  /** Alle Spiele, neueste zuerst. (Einmalige Abfrage; Cache-fähig.) */
  async listGames() {
    const snap = await getDocs(collection(db, GAMES));
    return snap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async getGame(id) {
    const snap = await getDoc(gameRef(id));
    return snap.exists() ? snap.data() : null;
  },

  /** Ganzes Spiel-Dokument schreiben. */
  async saveGame(game) {
    game.updatedAt = Date.now();
    await setDoc(gameRef(game.id), game);
    return game;
  },

  async deleteGame(id) {
    await deleteDoc(gameRef(id));
  },

  /**
   * Live-Abo eines Spiels. cb(game|null) feuert bei jeder Änderung
   * (lokal optimistisch sofort, dann vom Server bestätigt).
   * @returns {() => void} unsubscribe
   */
  subscribeGame(id, cb) {
    return onSnapshot(
      gameRef(id),
      (snap) => cb(snap.exists() ? snap.data() : null),
      (err) => {
        console.error('onSnapshot-Fehler:', err);
        cb(null);
      },
    );
  },
};
