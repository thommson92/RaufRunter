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

  const ranking = game.players
    .map((p) => ({ playerId: p.id, name: p.name, total: byPlayer[p.id].total }))
    .sort((a, b) => b.total - a.total);
  // Gleichstand = geteilter Rang (1,1,3,…)
  let lastTotal = null;
  let lastRank = 0;
  ranking.forEach((entry, i) => {
    if (entry.total === lastTotal) {
      entry.rank = lastRank;
    } else {
      entry.rank = i + 1;
      lastRank = entry.rank;
      lastTotal = entry.total;
    }
  });

  return { byPlayer, ranking };
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
