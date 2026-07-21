import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundCardCounts,
  totalRounds,
  roundScore,
  forbiddenBid,
  allowedBids,
  dealerIndex,
  biddingOrder,
  rotateSeatOrder,
  standings,
  rankProgression,
  bidTrickTotals,
  accuracyStats,
  longestCorrectStreak,
  extremeRounds,
  trumpCounts,
  tricksCheck,
  randomTrump,
  TRUMP_COLORS,
} from '../src/engine.js';

test('roundCardCounts: 1 → max → 1, Höhepunkt einmal', () => {
  assert.deepEqual(roundCardCounts(1), [1]);
  assert.deepEqual(roundCardCounts(3), [1, 2, 3, 2, 1]);
  assert.deepEqual(roundCardCounts(10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test('roundCardCounts: upOnly ⇒ nur 1 → max', () => {
  assert.deepEqual(roundCardCounts(3, true), [1, 2, 3]);
  assert.deepEqual(roundCardCounts(1, true), [1]);
  assert.deepEqual(roundCardCounts(5, true), [1, 2, 3, 4, 5]);
});

test('totalRounds: upOnly = max', () => {
  assert.equal(totalRounds(7, true), 7);
  assert.equal(totalRounds(7, false), 13);
});

test('roundCardCounts: ungültige Eingaben ⇒ leer', () => {
  assert.deepEqual(roundCardCounts(0), []);
  assert.deepEqual(roundCardCounts(-2), []);
  assert.deepEqual(roundCardCounts(NaN), []);
});

test('totalRounds: 2N-1', () => {
  assert.equal(totalRounds(10), 19);
  assert.equal(totalRounds(1), 1);
});

test('roundScore: richtig = 10 + Stiche', () => {
  assert.equal(roundScore(2, 2), 12);
  assert.equal(roundScore(0, 0), 10);
});

test('roundScore: falsch = -10 + Stiche', () => {
  assert.equal(roundScore(3, 1), -9);
  assert.equal(roundScore(0, 2), -8);
  assert.equal(roundScore(5, 0), -10);
});

test('forbiddenBid: Wert der Summe = Kartenzahl macht', () => {
  // 5 Karten, andere haben zusammen 3 angesagt ⇒ verboten ist 2
  assert.equal(forbiddenBid(5, 3), 2);
  // andere haben schon 5 ⇒ verboten wäre 0
  assert.equal(forbiddenBid(5, 5), 0);
});

test('forbiddenBid: nicht erreichbar ⇒ null', () => {
  // andere haben 6 von 5 -> negativer Wert
  assert.equal(forbiddenBid(5, 6), null);
  // 1 Karte, andere 0 -> verboten 1 (erreichbar)
  assert.equal(forbiddenBid(1, 0), 1);
});

test('allowedBids: letzter Spieler kann verbotenen Wert nicht wählen', () => {
  const r = allowedBids({ cardCount: 3, isLastBidder: true, sumOtherBids: 1 });
  assert.deepEqual(r, [0, 1, 3]); // 2 ist verboten (1+2=3)
});

test('allowedBids: nicht-letzter Spieler hat alle Werte', () => {
  const r = allowedBids({ cardCount: 3, isLastBidder: false, sumOtherBids: 1 });
  assert.deepEqual(r, [0, 1, 2, 3]);
});

test('allowedBids: Regel aus (isLastBidder=false) ⇒ letzter darf aufgehen lassen', () => {
  // Spiel mit restrictLastBid=false: die App übergibt isLastBidder=false,
  // also darf auch der letzte Spieler den "aufgehenden" Wert (hier 2) wählen.
  const r = allowedBids({ cardCount: 3, isLastBidder: false, sumOtherBids: 1 });
  assert.ok(r.includes(2));
});

test('dealerIndex: rotiert pro Runde um einen Sitz', () => {
  assert.equal(dealerIndex(0, 3), 0);
  assert.equal(dealerIndex(1, 3), 1);
  assert.equal(dealerIndex(2, 3), 2);
  assert.equal(dealerIndex(3, 3), 0); // wieder von vorne
  assert.equal(dealerIndex(4, 3), 1);
});

test('dealerIndex: robust bei ungültiger Spielerzahl', () => {
  assert.equal(dealerIndex(5, 0), 0);
  assert.equal(dealerIndex(5, -2), 0);
});

test('biddingOrder: Geber sagt zuletzt an, davor im Uhrzeigersinn', () => {
  const seated = ['A', 'B', 'C', 'D'];
  // Runde 0: Geber A (Sitz 0) → Reihenfolge B, C, D, A
  assert.deepEqual(biddingOrder(seated, 0), ['B', 'C', 'D', 'A']);
  // Runde 1: Geber B (Sitz 1) → Reihenfolge C, D, A, B
  assert.deepEqual(biddingOrder(seated, 1), ['C', 'D', 'A', 'B']);
  // Runde 4: wieder Geber A → wie Runde 0
  assert.deepEqual(biddingOrder(seated, 4), ['B', 'C', 'D', 'A']);
  // Geber ist immer der letzte Eintrag
  assert.equal(biddingOrder(seated, 2).at(-1), 'C');
});

test('biddingOrder: leere Sitzreihenfolge ⇒ leer', () => {
  assert.deepEqual(biddingOrder([], 3), []);
});

test('rotateSeatOrder: Gewinner wird Sitz 0, Nachbarschaft bleibt erhalten', () => {
  const seated = [
    { id: 'a', seatOrder: 0 },
    { id: 'b', seatOrder: 1 },
    { id: 'c', seatOrder: 2 },
    { id: 'd', seatOrder: 3 },
  ];
  const rotated = rotateSeatOrder(seated, 2); // c gewinnt die Auslosung
  assert.deepEqual(rotated.map((p) => p.id), ['c', 'd', 'a', 'b']);
  assert.deepEqual(rotated.map((p) => p.seatOrder), [0, 1, 2, 3]);
});

test('rotateSeatOrder: negativer/außerhalb liegender Index wrap-around', () => {
  const seated = [
    { id: 'a', seatOrder: 0 },
    { id: 'b', seatOrder: 1 },
    { id: 'c', seatOrder: 2 },
  ];
  assert.deepEqual(rotateSeatOrder(seated, -1).map((p) => p.id), ['c', 'a', 'b']);
  assert.deepEqual(rotateSeatOrder(seated, 3).map((p) => p.id), ['a', 'b', 'c']);
});

test('rotateSeatOrder: leere Liste ⇒ leer', () => {
  assert.deepEqual(rotateSeatOrder([], 0), []);
});

test('standings: Summen, Verlauf und geteilte Ränge', () => {
  const game = {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
    ],
    rounds: [
      { cardCount: 1, done: true, bids: { a: 1, b: 0, c: 0 }, tricks: { a: 1, b: 0, c: 0 } },
      // Runde 2 unvollständig/nicht done -> ignoriert
      { cardCount: 2, done: false, bids: { a: 1 }, tricks: {} },
    ],
  };
  const { byPlayer, ranking } = standings(game);
  assert.equal(byPlayer.a.total, 11); // 10+1 richtig
  assert.equal(byPlayer.b.total, 10); // 10+0 richtig
  assert.equal(byPlayer.c.total, 10); // 10+0 richtig
  assert.deepEqual(byPlayer.a.perRound, [11]);
  // Anna Rang 1, Ben & Cara teilen Rang 2
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[1].rank, 2);
  assert.equal(ranking[2].rank, 2);
});

// Gemeinsames Fixture für die Statistik-Funktionen (M6).
const statsGame = {
  players: [
    { id: 'a', name: 'Anna' },
    { id: 'b', name: 'Ben' },
    { id: 'c', name: 'Cara' },
  ],
  rounds: [
    {
      index: 0,
      cardCount: 1,
      done: true,
      trump: 'Rot',
      bids: { a: 1, b: 0, c: 0 },
      tricks: { a: 1, b: 0, c: 1 },
    },
    {
      index: 1,
      cardCount: 2,
      done: true,
      trump: 'Blau',
      bids: { a: 1, b: 1, c: 0 },
      tricks: { a: 0, b: 1, c: 0 },
    },
    // Runde 3 offen (nicht done), aber Trumpf schon gelost -> zählt bei trumpCounts,
    // nirgendwo sonst.
    { index: 2, cardCount: 2, done: false, trump: 'Rot', bids: { a: 1 }, tricks: {} },
  ],
};

test('bidTrickTotals: Summe Ansagen & Stiche je Spieler über fertige Runden', () => {
  const t = bidTrickTotals(statsGame);
  assert.deepEqual(t.a, { bidSum: 2, trickSum: 1, roundsPlayed: 2 });
  assert.deepEqual(t.b, { bidSum: 1, trickSum: 1, roundsPlayed: 2 });
  assert.deepEqual(t.c, { bidSum: 0, trickSum: 1, roundsPlayed: 2 });
});

test('accuracyStats: Trefferquote = richtige Ansagen / gespielte Runden', () => {
  const s = accuracyStats(statsGame);
  assert.deepEqual(s.a, { attempts: 2, correct: 1, accuracy: 0.5 });
  assert.deepEqual(s.b, { attempts: 2, correct: 2, accuracy: 1 });
  assert.deepEqual(s.c, { attempts: 2, correct: 1, accuracy: 0.5 });
});

test('accuracyStats: ohne gespielte Runde ⇒ accuracy null', () => {
  const empty = { players: [{ id: 'x', name: 'X' }], rounds: [] };
  assert.equal(accuracyStats(empty).x.accuracy, null);
});

test('longestCorrectStreak: Serie bricht bei falscher Ansage ab', () => {
  const streaks = longestCorrectStreak(statsGame);
  assert.equal(streaks.a, 1); // Runde 1 richtig, Runde 2 falsch
  assert.equal(streaks.b, 2); // beide Runden richtig
  assert.equal(streaks.c, 1); // Runde 1 falsch, Runde 2 richtig
});

test('extremeRounds: beste & schlechteste Einzelrundenpunktzahl', () => {
  const { best, worst } = extremeRounds(statsGame);
  assert.equal(best.playerId, 'a');
  assert.equal(best.roundIndex, 0);
  assert.equal(best.score, 11);
  assert.equal(worst.playerId, 'a');
  assert.equal(worst.roundIndex, 1);
  assert.equal(worst.score, -10);
});

test('trumpCounts: zählt auch Trumpf offener Runden', () => {
  assert.deepEqual(trumpCounts(statsGame), { Rot: 2, Blau: 1, Grün: 0, Gelb: 0 });
});

test('rankProgression: kumulierte Punkte & geteilte Ränge je Runde', () => {
  const points = rankProgression(statsGame);
  assert.equal(points.length, 2); // nur fertige Runden
  assert.deepEqual(points[0], {
    roundIndex: 0,
    cardCount: 1,
    totals: { a: 11, b: 10, c: -9 },
    ranks: { a: 1, b: 2, c: 3 },
  });
  assert.deepEqual(points[1], {
    roundIndex: 1,
    cardCount: 2,
    totals: { a: 1, b: 21, c: 1 },
    ranks: { a: 2, b: 1, c: 2 },
  });
});

test('tricksCheck: Summe muss Kartenzahl entsprechen', () => {
  assert.deepEqual(tricksCheck({ cardCount: 3, tricks: { a: 1, b: 2 } }), {
    sum: 3,
    expected: 3,
    ok: true,
  });
  assert.equal(tricksCheck({ cardCount: 3, tricks: { a: 1, b: 1 } }).ok, false);
});

test('randomTrump: gültige Farbe', () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(TRUMP_COLORS.includes(randomTrump()));
  }
});
