// firebase-db.js — eine gemeinsame Firestore-Instanz für alle Adapter.
// `initializeFirestore` darf pro App nur einmal laufen; deshalb liegt die
// Initialisierung hier und nicht in store-firebase.js / store-profiles.js.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);

// Persistenter lokaler Cache (IndexedDB) + Mehr-Tab-Sync.
// Fällt automatisch auf Memory-Cache zurück, falls IndexedDB nicht verfügbar.
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('Firestore-Persistenz nicht verfügbar, nutze Standard-Cache.', e);
  firestore = initializeFirestore(app, {});
}

export const db = firestore;
