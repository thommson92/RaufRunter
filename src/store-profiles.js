// store-profiles.js — Firestore-Adapter für Spielerprofile (Collection `players`).
//
// Anders als Spiele werden Profile *komplett* im Speicher gehalten: es sind
// wenige, kleine Dokumente, aber fast jede Ansicht braucht sie (Namensauswahl,
// Avatare). Ein einziges Collection-Abo hält den Cache aktuell und liefert
// nebenbei Live-Updates, wenn jemand auf einem anderen Gerät ein Profil anlegt.
//
// Der Cache wird beim Abo-Start gefüllt; einen separaten Ladeweg gibt es
// bewusst nicht, sonst gäbe es zwei Pfade, die dasselbe tun.

import {
  collection,
  doc,
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
let loadError = null;

export const profiles = {
  /** Sind die Profile schon einmal geladen worden? */
  get isLoaded() {
    return loaded;
  },

  /** Fehlermeldung, falls das Abo scheitert (z.B. fehlende Firestore-Regel). */
  get error() {
    return loadError;
  },

  /** Alle Profile aus dem Cache (ungeordnet — Sortierung macht matchProfiles). */
  all() {
    return [...cache.values()];
  },

  byId(id) {
    return (id && cache.get(id)) || null;
  },

  /** Kopie als Map für applyProfileNames() — der interne Cache bleibt gekapselt. */
  byIdMap() {
    return new Map(cache);
  },

  /**
   * Kurzer Fingerabdruck des Cache-Inhalts. Damit erkennt die App, ob ein
   * Snapshot überhaupt etwas geändert hat, das eine Ansicht betrifft.
   */
  signature() {
    return [...cache.values()]
      .map((p) => `${p.id}:${p.name}:${p.avatar?.key || p.avatar?.dataUrl?.length || ''}`)
      .sort()
      .join('|');
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
        // Nur die Deltas anwenden: ein voller Neuaufbau würde bei jedem
        // Snapshot alle Profile inkl. Foto-Data-URLs neu deserialisieren.
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') cache.delete(change.doc.id);
          // Die Dokument-ID gewinnt über das Feld — sonst zeigte eine Kachel
          // mit abweichendem id-Feld ins Leere.
          else cache.set(change.doc.id, { ...change.doc.data(), id: change.doc.id });
        }
        loaded = true;
        loadError = null;
        cb();
      },
      (err) => {
        console.error('Profil-Abo fehlgeschlagen:', err);
        // Ohne diese Rückmeldung blieben #/new, #/profiles und #/admin
        // dauerhaft auf "Lade Spielerprofile …" stehen.
        loadError =
          err?.code === 'permission-denied'
            ? 'Kein Zugriff auf die Spielerprofile. Fehlt die Firestore-Regel für die Sammlung „players"? (siehe docs/FIREBASE-SETUP.md)'
            : 'Die Spielerprofile konnten nicht geladen werden. Besteht eine Verbindung?';
        loaded = true;
        cb();
      },
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
