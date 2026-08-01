// store-profiles.js — Firestore-Adapter für Spielerprofile (Collection `players`).
//
// Anders als Spiele werden Profile *komplett* im Speicher gehalten: es sind
// wenige, kleine Dokumente, aber fast jede Ansicht braucht sie (Namensauswahl,
// Avatare). Ein einziges Collection-Abo hält den Cache aktuell und liefert
// nebenbei Live-Updates, wenn jemand auf einem anderen Gerät ein Profil anlegt.

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-db.js';

const PLAYERS = 'players';
const profileRef = (id) => doc(db, PLAYERS, id);

/** id -> Profil. Einzige Quelle für alle Render-Pfade. */
const cache = new Map();
let loaded = false;

export const profiles = {
  /** Sind die Profile schon einmal geladen worden? */
  get isLoaded() {
    return loaded;
  },

  /** Alle Profile aus dem Cache (ungeordnet — Sortierung macht matchProfiles). */
  all() {
    return [...cache.values()];
  },

  byId(id) {
    return (id && cache.get(id)) || null;
  },

  /** Map für applyProfileNames(). */
  byIdMap() {
    return cache;
  },

  /** Einmalig laden (z. B. beim Start), bevor das Live-Abo greift. */
  async load() {
    const snap = await getDocs(collection(db, PLAYERS));
    cache.clear();
    snap.docs.forEach((d) => cache.set(d.id, d.data()));
    loaded = true;
    return this.all();
  },

  /**
   * Live-Abo auf die gesamte Collection. cb() feuert nach jeder Änderung,
   * nachdem der Cache aktualisiert wurde.
   * @returns {() => void} unsubscribe
   */
  subscribe(cb) {
    return onSnapshot(
      collection(db, PLAYERS),
      (snap) => {
        cache.clear();
        snap.docs.forEach((d) => cache.set(d.id, d.data()));
        loaded = true;
        cb();
      },
      (err) => console.error('Profil-Abo fehlgeschlagen:', err),
    );
  },

  /** Profil anlegen oder aktualisieren. Cache wird sofort mitgezogen. */
  async save(profile) {
    profile.updatedAt = Date.now();
    cache.set(profile.id, profile);
    await setDoc(profileRef(profile.id), profile);
    return profile;
  },

  async remove(id) {
    cache.delete(id);
    await deleteDoc(profileRef(id));
  },
};
