// store.js — Zustand & Persistenz.
// Local-first: nutzt localStorage. Die Schnittstelle (listGames/getGame/
// saveGame/deleteGame/subscribe) ist bewusst so geschnitten, dass in M3
// ein Firebase-Adapter mit identischer API eingehängt werden kann.

import { roundCardCounts } from './engine.js';

const KEY = 'raufrunter:games';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function writeAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/**
 * Neues Spiel-Objekt erzeugen (noch nicht gespeichert).
 * @param {boolean} [restrictLastBid=true] Wenn true gilt die Standardregel:
 *   die Summe aller Ansagen darf nicht der Kartenzahl entsprechen (letzter
 *   Spieler eingeschränkt). Wenn false darf die Ansage-Summe aufgehen.
 */
export function createGame({ name, maxCards, playerNames, restrictLastBid = true }) {
  const players = playerNames.map((n, i) => ({
    id: uid(),
    name: n.trim(),
    seatOrder: i,
  }));
  const counts = roundCardCounts(maxCards);
  const rounds = counts.map((cardCount, index) => ({
    index,
    cardCount,
    bids: {},
    tricks: {},
    done: false,
  }));
  return {
    id: uid(),
    name: name.trim() || 'Spiel',
    maxCards,
    restrictLastBid,
    players,
    rounds,
    currentRound: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const store = {
  /** Liste aller Spiele, neueste zuerst. */
  listGames() {
    const map = readAll();
    return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  getGame(id) {
    return readAll()[id] || null;
  },

  saveGame(game) {
    const map = readAll();
    game.updatedAt = Date.now();
    map[game.id] = game;
    writeAll(map);
    return game;
  },

  deleteGame(id) {
    const map = readAll();
    delete map[id];
    writeAll(map);
  },

  /**
   * Live-Updates. localStorage feuert 'storage' nur in ANDEREN Tabs;
   * für denselben Tab rendern wir nach jeder Mutation selbst neu.
   * Firebase-Adapter (M3) liefert hier echte Cross-Device-Updates.
   */
  subscribe(id, cb) {
    const handler = (e) => {
      if (e.key === KEY) {
        const g = this.getGame(id);
        if (g) cb(g);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
};
