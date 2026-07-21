// engine.js — reine Spiellogik für "Rauf Runter".
// Keine DOM-/Framework-Abhängigkeiten, damit sie isoliert testbar ist.

export const TRUMP_COLORS = ['Rot', 'Blau', 'Grün', 'Gelb'];

/**
 * Kartenzahlen pro Runde.
 * Standard (rauf & runter): 1 → max → 1, Höhepunkt einmal — max=3 ⇒ [1,2,3,2,1].
 * Nur rauf (upOnly):        1 → max          — max=3 ⇒ [1,2,3].
 * max=1 ⇒ [1] in beiden Fällen.
 * @param {number} maxCards
 * @param {boolean} [upOnly=false] nur aufsteigend spielen
 * @returns {number[]}
 */
export function roundCardCounts(maxCards, upOnly = false) {
  const max = Math.floor(maxCards);
  if (!Number.isFinite(max) || max < 1) return [];
  const up = [];
  for (let i = 1; i <= max; i++) up.push(i);
  if (upOnly) return up;
  const down = [];
  for (let i = max - 1; i >= 1; i--) down.push(i);
  return up.concat(down);
}

/** Gesamtzahl der Runden für ein konfiguriertes Maximum. */
export function totalRounds(maxCards, upOnly = false) {
  return roundCardCounts(maxCards, upOnly).length;
}

/**
 * Punkte für einen Spieler in einer Runde.
 * Richtig angesagt:  +10 + gemachte Stiche
 * Falsch angesagt:   -10 + gemachte Stiche
 * @param {number} bid    angesagte Stiche
 * @param {number} tricks tatsächlich gemachte Stiche
 * @returns {number}
 */
export function roundScore(bid, tricks) {
  const correct = bid === tricks;
  return (correct ? 10 : -10) + tricks;
}

/**
 * Verbotener Ansage-Wert für den LETZTEN Spieler.
 * Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen.
 * @param {number} cardCount      Karten dieser Runde
 * @param {number} sumOtherBids   Summe der bereits gemachten Ansagen
 * @returns {number|null}         verbotener Wert, oder null wenn nicht erreichbar (0..cardCount)
 */
export function forbiddenBid(cardCount, sumOtherBids) {
  const value = cardCount - sumOtherBids;
  if (value < 0 || value > cardCount) return null;
  return value;
}

/**
 * Sitzposition (Index in der Sitzreihenfolge) des Gebers einer Runde.
 * Wie im echten Spiel rotiert der Geber pro Runde um einen Platz weiter
 * (im Uhrzeigersinn bzw. von oben nach unten). Runde 0 gibt Sitz 0.
 * Der Geber sagt zuletzt an und hat damit den Nachteil der verbotenen Ansage.
 * @param {number} roundIndex   0-basierter Rundenindex
 * @param {number} playerCount  Anzahl Spieler
 * @returns {number}            Index in der Sitzreihenfolge (0..playerCount-1)
 */
export function dealerIndex(roundIndex, playerCount) {
  if (!Number.isFinite(playerCount) || playerCount <= 0) return 0;
  const i = Math.floor(roundIndex);
  return ((i % playerCount) + playerCount) % playerCount;
}

/**
 * Ansage-Reihenfolge einer Runde. Der Geber (siehe dealerIndex) sagt zuletzt an;
 * die Reihenfolge davor rotiert im Uhrzeigersinn, beginnend beim Spieler direkt
 * nach dem Geber.
 * @template T
 * @param {T[]} seated       Spieler in Sitzreihenfolge
 * @param {number} roundIndex 0-basierter Rundenindex
 * @returns {T[]}            Spieler in Ansage-Reihenfolge (Geber zuletzt)
 */
export function biddingOrder(seated, roundIndex) {
  const n = seated.length;
  if (n === 0) return [];
  const d = dealerIndex(roundIndex, n);
  const order = [];
  for (let k = 1; k <= n; k++) order.push(seated[(d + k) % n]);
  return order;
}

/**
 * Rotiert die Sitzreihenfolge so, dass der Spieler an `startIndex` künftig
 * als Erster gibt (Runde 0 → `dealerIndex(0,n) = 0`). Die Nachbarschaft am
 * Tisch bleibt erhalten — es verschiebt sich nur, wer als Sitz 0 zählt.
 * Für's Auslosen des ersten Gebers.
 * @template {{seatOrder:number}} T
 * @param {T[]} seated     Spieler in aktueller Sitzreihenfolge (aufsteigend)
 * @param {number} startIndex  Index in `seated`, der neu Sitz 0 wird
 * @returns {T[]} neue Reihenfolge; `seatOrder` der übergebenen Objekte wird aktualisiert (0..n-1)
 */
export function rotateSeatOrder(seated, startIndex) {
  const n = seated.length;
  if (n === 0) return [];
  const start = ((Math.floor(startIndex) % n) + n) % n;
  const rotated = [...seated.slice(start), ...seated.slice(0, start)];
  rotated.forEach((p, i) => {
    p.seatOrder = i;
  });
  return rotated;
}

/**
 * Welche Ansage-Werte (0..cardCount) darf ein Spieler wählen?
 * Nur der letzte Spieler ist eingeschränkt.
 * @param {object} p
 * @param {number} p.cardCount
 * @param {boolean} p.isLastBidder
 * @param {number} p.sumOtherBids
 * @returns {number[]}
 */
export function allowedBids({ cardCount, isLastBidder, sumOtherBids }) {
  const all = [];
  for (let i = 0; i <= cardCount; i++) all.push(i);
  if (!isLastBidder) return all;
  const forbidden = forbiddenBid(cardCount, sumOtherBids);
  return all.filter((v) => v !== forbidden);
}

/**
 * Weist einer Liste von {..., total} geteilte Ränge zu (1,1,3,…), absteigend
 * nach total sortiert. Gemeinsame Sortier-/Rang-Logik für standings() und
 * rankProgression().
 * @template {{total:number}} T
 * @param {T[]} entries
 * @returns {(T & {rank:number})[]}
 */
function withSharedRanks(entries) {
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  let lastTotal = null;
  let lastRank = 0;
  sorted.forEach((entry, i) => {
    if (entry.total === lastTotal) {
      entry.rank = lastRank;
    } else {
      entry.rank = i + 1;
      lastRank = entry.rank;
      lastTotal = entry.total;
    }
  });
  return sorted;
}

/**
 * Punktestand & Rangliste über alle abgeschlossenen Runden.
 * Spieler werden über ihre id geführt; Reihenfolge per seatOrder ist
 * für die Anzeige, NICHT für die Punkte relevant.
 * @param {object} game  { players:[{id,name}], rounds:[{cardCount,bids,tricks,done}] }
 * @returns {{ byPlayer: Object<string,{total:number, perRound:number[]}>, ranking: Array<{playerId, name, total, rank}> }}
 */
export function standings(game) {
  const byPlayer = {};
  for (const p of game.players) {
    byPlayer[p.id] = { total: 0, perRound: [] };
  }
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) {
        byPlayer[p.id].perRound.push(null);
        continue;
      }
      const pts = roundScore(bid, tricks);
      byPlayer[p.id].total += pts;
      byPlayer[p.id].perRound.push(pts);
    }
  }

  const ranking = withSharedRanks(
    game.players.map((p) => ({ playerId: p.id, name: p.name, total: byPlayer[p.id].total })),
  );

  return { byPlayer, ranking };
}

/**
 * Rangverlauf über die Runden: für jede abgeschlossene Runde der kumulierte
 * Punktestand und geteilte Rang jedes Spielers zu diesem Zeitpunkt.
 * Basis für den grafischen Platzierungs-/Punkteverlauf in der Zuschaueransicht.
 * @param {object} game
 * @returns {Array<{ roundIndex:number, cardCount:number, totals:Object<string,number>, ranks:Object<string,number> }>}
 */
export function rankProgression(game) {
  const totals = {};
  for (const p of game.players) totals[p.id] = 0;

  const points = [];
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      totals[p.id] += roundScore(bid, tricks);
    }
    const ranked = withSharedRanks(
      game.players.map((p) => ({ playerId: p.id, total: totals[p.id] })),
    );
    const ranks = {};
    ranked.forEach((entry) => (ranks[entry.playerId] = entry.rank));
    points.push({
      roundIndex: round.index,
      cardCount: round.cardCount,
      totals: { ...totals },
      ranks,
    });
  }
  return points;
}

/**
 * Summe der Ansagen & tatsächlichen Stiche je Spieler über alle
 * abgeschlossenen Runden — Basis für „meiste/wenigste Stiche angesagt".
 * @param {object} game
 * @returns {Object<string,{bidSum:number, trickSum:number, roundsPlayed:number}>}
 */
export function bidTrickTotals(game) {
  const totals = {};
  for (const p of game.players) totals[p.id] = { bidSum: 0, trickSum: 0, roundsPlayed: 0 };
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      const t = totals[p.id];
      t.bidSum += bid;
      t.trickSum += tricks;
      t.roundsPlayed += 1;
    }
  }
  return totals;
}

/**
 * Trefferquote je Spieler: wie oft stimmte Ansage mit gemachten Stichen
 * überein, gemessen an den gespielten Runden.
 * @param {object} game
 * @returns {Object<string,{attempts:number, correct:number, accuracy:number|null}>}
 */
export function accuracyStats(game) {
  const stats = {};
  for (const p of game.players) stats[p.id] = { attempts: 0, correct: 0, accuracy: null };
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      const s = stats[p.id];
      s.attempts += 1;
      if (bid === tricks) s.correct += 1;
    }
  }
  for (const s of Object.values(stats)) {
    s.accuracy = s.attempts > 0 ? s.correct / s.attempts : null;
  }
  return stats;
}

/**
 * Längste Serie aufeinanderfolgender richtiger Ansagen je Spieler
 * (in Rundenreihenfolge; eine fehlende/offene Runde unterbricht die Serie).
 * @param {object} game
 * @returns {Object<string, number>}
 */
export function longestCorrectStreak(game) {
  const best = {};
  const current = {};
  for (const p of game.players) {
    best[p.id] = 0;
    current[p.id] = 0;
  }
  for (const round of game.rounds || []) {
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      const hit = round.done && bid != null && tricks != null && bid === tricks;
      if (hit) {
        current[p.id] += 1;
        if (current[p.id] > best[p.id]) best[p.id] = current[p.id];
      } else {
        current[p.id] = 0;
      }
    }
  }
  return best;
}

/**
 * Beste & schlechteste Einzelrunden-Punktzahl über alle Spieler/Runden.
 * @param {object} game
 * @returns {{ best: {playerId, name, roundIndex, score}|null, worst: {playerId, name, roundIndex, score}|null }}
 */
export function extremeRounds(game) {
  let best = null;
  let worst = null;
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      const score = roundScore(bid, tricks);
      const entry = { playerId: p.id, name: p.name, roundIndex: round.index, score };
      if (!best || score > best.score) best = entry;
      if (!worst || score < worst.score) worst = entry;
    }
  }
  return { best, worst };
}

/**
 * Häufigkeit der gelosten Trumpffarben über alle Runden (unabhängig von `done`,
 * das Losen ist an keine abgeschlossene Runde gebunden).
 * @param {object} game
 * @returns {Object<string, number>}
 */
export function trumpCounts(game) {
  const counts = {};
  for (const c of TRUMP_COLORS) counts[c] = 0;
  for (const round of game.rounds || []) {
    if (round.trump) counts[round.trump] = (counts[round.trump] || 0) + 1;
  }
  return counts;
}

/**
 * Summe der eingetragenen Stiche einer Runde — zur Plausibilitätswarnung.
 * Erwartung: Summe == cardCount.
 * @returns {{ sum:number, expected:number, ok:boolean }}
 */
export function tricksCheck(round) {
  let sum = 0;
  for (const v of Object.values(round.tricks || {})) sum += v || 0;
  return { sum, expected: round.cardCount, ok: sum === round.cardCount };
}

/** Zufällige Trumpffarbe (optionaler "Farbe losen"-Knopf). */
export function randomTrump() {
  return TRUMP_COLORS[Math.floor(Math.random() * TRUMP_COLORS.length)];
}
