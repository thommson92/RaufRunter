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
 * Rotiert ein Array so, dass das Element an `startIndex` künftig an Position 0
 * steht — die relative Reihenfolge/Nachbarschaft der übrigen Elemente bleibt
 * erhalten, es verschiebt sich nur der Startpunkt. Fürs Auslosen des ersten
 * Gebers (Runde 0 → `dealerIndex(0,n) = 0`): sowohl auf eine Namensliste beim
 * Anlegen als auch auf eine Sitzreihenfolge anwendbar — mutiert nichts, die
 * aufrufende Seite entscheidet, was mit der neuen Reihenfolge passiert
 * (z. B. `seatOrder` neu zuweisen).
 * @template T
 * @param {T[]} list        Elemente in aktueller Reihenfolge
 * @param {number} startIndex  Index in `list`, der neu Position 0 wird
 * @returns {T[]} neu geordnetes Array (gleiche Elemente, keine Kopien)
 */
export function rotateToStart(list, startIndex) {
  const n = list.length;
  if (n === 0) return [];
  const start = ((Math.floor(startIndex) % n) + n) % n;
  return [...list.slice(start), ...list.slice(0, start)];
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
 * Gibt ALLE Einträge zurück, die den Extremwert erreichen (Gleichstand
 * möglich — z. B. zwei Spieler mit derselben Höchstpunktzahl in
 * unterschiedlichen Runden), nicht nur den ersten gefundenen.
 * @param {object} game
 * @returns {{ best: Array<{playerId, name, roundIndex, score}>, worst: Array<{playerId, name, roundIndex, score}> }}
 */
export function extremeRounds(game) {
  const entries = [];
  for (const round of game.rounds || []) {
    if (!round.done) continue;
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      entries.push({ playerId: p.id, name: p.name, roundIndex: round.index, score: roundScore(bid, tricks) });
    }
  }
  if (!entries.length) return { best: [], worst: [] };
  const maxScore = Math.max(...entries.map((e) => e.score));
  const minScore = Math.min(...entries.map((e) => e.score));
  return {
    best: entries.filter((e) => e.score === maxScore),
    worst: entries.filter((e) => e.score === minScore),
  };
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
 * Auswertung einer einzelnen Runde für ihren Geber (letzter Ansagender):
 * war die verbotene Ansage überhaupt bindend, und falls ja, lag er richtig
 * oder falsch? `null`, wenn die Runde (noch) nicht vollständig auswertbar ist.
 * Gemeinsamer Kern für `dealerMalusStats` (Bilanz übers ganze Spiel) und
 * `roundEvents` (Einzelrunden-Fakt fürs Rundenkommentar).
 * @param {object[]} seated Spieler in Sitzreihenfolge
 * @param {object} round
 * @param {boolean} restrictActive
 * @returns {null | {dealerId:string, dealerName:string, bound:boolean, correct:boolean}}
 */
function dealerRoundOutcome(seated, round, restrictActive) {
  const order = biddingOrder(seated, round.index);
  if (!order.length) return null;
  const dealer = order[order.length - 1];

  let sumOthers = 0;
  let allOthersBid = true;
  for (const p of seated) {
    if (p.id === dealer.id) continue;
    const b = round.bids?.[p.id];
    if (b == null) { allOthersBid = false; break; }
    sumOthers += b;
  }
  const bid = round.bids?.[dealer.id];
  const tricks = round.tricks?.[dealer.id];
  if (!allOthersBid || bid == null || tricks == null) return null; // Runde nicht auswertbar

  const bound = restrictActive && forbiddenBid(round.cardCount, sumOthers) != null;
  return { dealerId: dealer.id, dealerName: dealer.name, bound, correct: bid === tricks };
}

/**
 * Bilanz je Spieler, wie oft er als letzter Ansagender (Geber) dran war —
 * und was das für ihn bedeutet hat. Jede Geber-Runde fällt in genau eine
 * von drei Kategorien:
 * - `neutral`: Geber war zwar dran, aber die verbotene Ansage griff diese
 *   Runde gar nicht wirklich (kein Wert 0..Kartenzahl wäre "aufgegangen",
 *   oder `restrictLastBid` ist für das Spiel aus) — reiner theoretischer Malus.
 * - `malusCorrect`: Einschränkung griff wirklich, Geber lag trotzdem richtig.
 * - `malusWrong`: Einschränkung griff wirklich, Geber lag falsch.
 * `dealerRounds = neutral + malusCorrect + malusWrong`.
 * @param {object} game
 * @returns {Object<string, {dealerRounds:number, neutral:number, malusCorrect:number, malusWrong:number}>}
 */
export function dealerMalusStats(game) {
  const stats = {};
  for (const p of game.players) stats[p.id] = { dealerRounds: 0, neutral: 0, malusCorrect: 0, malusWrong: 0 };

  const seated = [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
  const restrictActive = game.restrictLastBid !== false;

  for (const round of game.rounds || []) {
    if (!round.done) continue;
    const outcome = dealerRoundOutcome(seated, round, restrictActive);
    if (!outcome) continue;

    const s = stats[outcome.dealerId];
    s.dealerRounds += 1;
    if (!outcome.bound) s.neutral += 1;
    else if (outcome.correct) s.malusCorrect += 1;
    else s.malusWrong += 1;
  }
  return stats;
}

/**
 * `dealerRoundOutcome` für eine einzelne, bereits fertige Runde (Grundlage
 * für den Rundenkommentar: hat der Geber die Ansage-Falle gemeistert oder
 * ist er daran gescheitert?). `null`, wenn die Runde nicht existiert, nicht
 * fertig oder nicht auswertbar ist.
 * @param {object} game
 * @param {number} roundIndex
 * @returns {null | {dealerId:string, dealerName:string, bound:boolean, correct:boolean}}
 */
export function dealerOutcomeForRound(game, roundIndex) {
  const round = game.rounds?.[roundIndex];
  if (!round || !round.done) return null;
  const seated = [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
  const restrictActive = game.restrictLastBid !== false;
  return dealerRoundOutcome(seated, round, restrictActive);
}

/**
 * Aktuelle Serie richtiger bzw. falscher Ansagen je Spieler, gemessen bis
 * einschließlich `roundIndex` (nicht die längste je erreichte Serie — siehe
 * dafür `longestCorrectStreak` — sondern die, die genau jetzt noch läuft).
 * Grundlage für "X ist seit N Runden am Stück richtig"-Kommentare.
 * @param {object} game
 * @param {number} roundIndex
 * @returns {Object<string, {type: 'correct'|'wrong'|null, length: number}>}
 */
export function currentStreaks(game, roundIndex) {
  const state = {};
  for (const p of game.players) state[p.id] = { type: null, length: 0 };

  const rounds = (game.rounds || [])
    .filter((r) => r.done && r.index <= roundIndex)
    .sort((a, b) => a.index - b.index);

  for (const round of rounds) {
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      const type = bid === tricks ? 'correct' : 'wrong';
      const s = state[p.id];
      s.length = s.type === type ? s.length + 1 : 1;
      s.type = type;
    }
  }
  return state;
}

/**
 * Tendenz je Spieler, über- oder unterzuansagen — Durchschnitt aus
 * (gemachte Stiche − Ansage) über alle gespielten Runden bis einschließlich
 * `roundIndex`. Positiv ⇒ holt im Schnitt mehr Stiche als angesagt (sagt zu
 * vorsichtig an), negativ ⇒ holt im Schnitt weniger (sagt zu forsch an).
 * @param {object} game
 * @param {number} roundIndex
 * @returns {Object<string, {avgDiff:number, attempts:number}>}
 */
export function biddingBias(game, roundIndex) {
  const sums = {};
  for (const p of game.players) sums[p.id] = { diffSum: 0, attempts: 0 };

  const rounds = (game.rounds || []).filter((r) => r.done && r.index <= roundIndex);
  for (const round of rounds) {
    for (const p of game.players) {
      const bid = round.bids?.[p.id];
      const tricks = round.tricks?.[p.id];
      if (bid == null || tricks == null) continue;
      const s = sums[p.id];
      s.diffSum += tricks - bid;
      s.attempts += 1;
    }
  }

  const result = {};
  for (const p of game.players) {
    const s = sums[p.id];
    result[p.id] = { avgDiff: s.attempts ? s.diffSum / s.attempts : 0, attempts: s.attempts };
  }
  return result;
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

/**
 * Strukturierte Fakten einer einzelnen fertigen Runde — Grundlage für den
 * regelbasierten Rundenkommentar (siehe commentary.js). Erzeugt nur Daten,
 * keinen Text: wer hat wie angesagt/gemacht, wer war Held/Flop der Runde,
 * wie hat sich dadurch die Platzierung verschoben.
 * @param {object} game
 * @param {number} roundIndex
 * @returns {null | object} null, wenn die Runde nicht existiert/nicht fertig ist
 */
export function roundEvents(game, roundIndex) {
  const round = game.rounds?.[roundIndex];
  if (!round || !round.done) return null;

  const seated = [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
  const order = biddingOrder(seated, roundIndex);
  const dealer = order[order.length - 1];

  const perPlayer = [];
  for (const p of game.players) {
    const bid = round.bids?.[p.id];
    const tricks = round.tricks?.[p.id];
    if (bid == null || tricks == null) continue;
    perPlayer.push({
      playerId: p.id,
      name: p.name,
      bid,
      tricks,
      score: roundScore(bid, tricks),
      correct: bid === tricks,
    });
  }
  if (!perPlayer.length) return null;

  const maxScore = Math.max(...perPlayer.map((e) => e.score));
  const minScore = Math.min(...perPlayer.map((e) => e.score));
  const heroes = perPlayer.filter((e) => e.score === maxScore);
  const villains = perPlayer.filter((e) => e.score === minScore);
  const correctPlayers = perPlayer.filter((e) => e.correct);
  const wrongPlayers = perPlayer.filter((e) => !e.correct);
  const zeroBids = perPlayer.filter((e) => e.bid === 0);

  // Rang davor/danach (geteilte Ränge über kumulierte Punkte).
  const progression = rankProgression(game);
  const point = progression.find((pt) => pt.roundIndex === roundIndex);
  const prevPoint = [...progression].reverse().find((pt) => pt.roundIndex < roundIndex);
  const ranks = point ? point.ranks : {};
  const prevRanks = prevPoint ? prevPoint.ranks : {};

  const leaderIds = Object.keys(ranks).filter((id) => ranks[id] === 1).sort();
  const leaders = game.players.filter((p) => leaderIds.includes(p.id));
  const prevLeaderIds = Object.keys(prevRanks).filter((id) => prevRanks[id] === 1).sort();
  const leadChanged = prevPoint != null && JSON.stringify(leaderIds) !== JSON.stringify(prevLeaderIds);

  const climbers = perPlayer
    .map((e) => ({
      playerId: e.playerId,
      name: e.name,
      prevRank: prevRanks[e.playerId] ?? null,
      rank: ranks[e.playerId] ?? null,
    }))
    .filter((e) => e.prevRank != null && e.rank != null && e.prevRank !== e.rank);

  // Weitere Themen fürs Rundenkommentar (Serien, Geber-Falle, Ansage-Tendenz,
  // krasse Fehlschätzungen) — reine Zusatzfakten, ändern nichts an den Feldern
  // oben, die schon andere Ansichten (Statistiken) mitbenutzen.
  const streaks = currentStreaks(game, roundIndex);
  const dealerOutcome = dealerOutcomeForRound(game, roundIndex);
  const bias = biddingBias(game, roundIndex);
  // Nullansagen haben mit zeroBidLine schon eine eigene, treffendere Formulierung.
  const wildMisses = perPlayer.filter((e) => e.bid !== 0 && Math.abs(e.bid - e.tricks) >= 2);

  return {
    roundIndex,
    cardCount: round.cardCount,
    dealerName: dealer?.name,
    perPlayer,
    heroes,
    villains,
    correctPlayers,
    wrongPlayers,
    zeroBids,
    leaders,
    leadChanged,
    climbers,
    streaks,
    dealerOutcome,
    bias,
    wildMisses,
    allCorrect: wrongPlayers.length === 0,
    allWrong: correctPlayers.length === 0,
  };
}
