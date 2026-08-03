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
 * @param {{id: string, name: string}[]} profiles Mitspieler-Profile in
 *   Sitzreihenfolge. `players[].id` bleibt spielintern (Schlüssel in
 *   rounds[].bids/tricks), `profileId` verweist auf das dauerhafte Profil.
 * @param {boolean} [restrictLastBid=true] Wenn true gilt die Standardregel:
 *   die Summe aller Ansagen darf nicht der Kartenzahl entsprechen (letzter
 *   Spieler eingeschränkt). Wenn false darf die Ansage-Summe aufgehen.
 * @param {boolean} [upOnly=false] Wenn true wird nur 1 → max gespielt,
 *   sonst 1 → max → 1 (rauf und runter).
 * @param {boolean} [moneyEnabled=false] Wird um Geld gespielt?
 * @param {number} [stake=0] Einsatz pro Spieler (€, fürs ganze Spiel, nicht pro Runde).
 * @param {string} [payoutMode='winner-takes-all'] Ausschüttungsmodus des Geldtopfs
 *   ('winner-takes-all' | 'runner-up-refund' | 'podium-cascade' | 'manual').
 */
export function createGame({
  name,
  maxCards,
  profiles,
  restrictLastBid = true,
  upOnly = false,
  moneyEnabled = false,
  stake = 0,
  payoutMode = 'winner-takes-all',
}) {
  const players = profiles.map((profile, i) => ({
    id: uid(),
    profileId: profile.id,
    name: profile.name,
    seatOrder: i,
  }));
  const counts = roundCardCounts(maxCards, upOnly);
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
    upOnly,
    restrictLastBid,
    moneyEnabled,
    stake,
    payoutMode,
    manualPayouts: {},
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
