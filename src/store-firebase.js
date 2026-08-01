// store-firebase.js — Firestore-Adapter für Spiele (M3).
// Implementiert dieselbe fachliche Schnittstelle wie store.js, aber
// geräteübergreifend & live. Firestore-eigener IndexedDB-Cache übernimmt
// die "local-first"-Rolle: Daten überleben Browser-Schließen und kurze
// Offline-Phasen (Schreibvorgänge werden gepuffert und nachsynchronisiert).
// Die Firestore-Instanz selbst kommt aus firebase-db.js (auch von den
// Spielerprofilen genutzt).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-db.js';

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

  /**
   * Mehrere Spiele in einem Rutsch schreiben (Zusammenführen/Zuordnen von
   * Profilen). Als Batch, damit nicht die Hälfte der Spiele umgeschrieben
   * zurückbleibt, wenn unterwegs die Verbindung abreißt.
   *
   * Achtung: `saveGames` überschreibt ganze Dokumente. Die übergebenen Spiele
   * müssen deshalb frisch geladen sein, sonst gehen zwischenzeitlich
   * eingetragene Runden verloren.
   */
  async saveGames(games) {
    // Ein Firestore-Batch fasst höchstens 500 Operationen.
    for (let i = 0; i < games.length; i += 500) {
      const batch = writeBatch(db);
      for (const game of games.slice(i, i + 500)) {
        game.updatedAt = Date.now();
        batch.set(gameRef(game.id), game);
      }
      await batch.commit();
    }
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
