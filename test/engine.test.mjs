import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundCardCounts,
  totalRounds,
  roundScore,
  forbiddenBid,
  allowedBids,
  standings,
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
