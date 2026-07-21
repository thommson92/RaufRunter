import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRoundCommentary } from '../src/commentary.js';
import { roundEvents } from '../src/engine.js';

test('generateRoundCommentary: keine Ereignisse ⇒ leerer Text', () => {
  assert.equal(generateRoundCommentary(null), '');
});

test('generateRoundCommentary: deterministisch bei gleichen Ereignissen', () => {
  const events = {
    roundIndex: 2,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 1, tricks: 0, score: -9, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12 }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 1, tricks: 0, score: -9 }],
    zeroBids: [],
    leaders: [{ id: 'a', name: 'Anna' }],
    leadChanged: true,
    climbers: [],
    allCorrect: false,
    allWrong: false,
  };
  const first = generateRoundCommentary(events);
  const second = generateRoundCommentary(events);
  assert.equal(first, second);
  assert.match(first, /Anna/);
  assert.match(first, /Ben/);
  assert.match(first, /Runde 3/); // roundIndex 2 -> Runde 3
});

test('generateRoundCommentary: Reihenschuss, wenn alle richtig lagen', () => {
  const events = {
    roundIndex: 0,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 10, correct: true },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11 }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 10 }],
    zeroBids: [{ playerId: 'b', name: 'Ben', bid: 0, tricks: 0 }],
    leaders: [{ id: 'a', name: 'Anna' }],
    leadChanged: false,
    climbers: [],
    allCorrect: true,
    allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Runde 1/);
  // Villain darf nicht erwähnt werden, weil dessen Score (+10) nicht negativ ist / alle richtig lagen.
  assert.doesNotMatch(text, /kalt|Hose|lief's gar nicht/);
});

test('generateRoundCommentary: Nullansage wird gewürdigt (Treffer & Fehlschlag)', () => {
  const base = {
    roundIndex: 4,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10, correct: true }],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10 }],
    villains: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10 }],
    leaders: [], leadChanged: false, climbers: [], allCorrect: true, allWrong: false,
  };
  const hit = generateRoundCommentary({ ...base, zeroBids: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0 }] });
  assert.match(hit, /Anna/);

  const miss = generateRoundCommentary({
    ...base,
    allCorrect: false,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 2, score: -8, correct: false }],
    zeroBids: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 2 }],
  });
  assert.match(miss, /2 Stiche/);
});

test('generateRoundCommentary + engine.roundEvents: funktionieren zusammen (Integrationstest)', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
  ];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1, b: 0 }, tricks: { a: 1, b: 0 } },
    ],
  };
  const events = roundEvents(game, 0);
  const text = generateRoundCommentary(events);
  assert.ok(text.length > 0);
  assert.match(text, /Runde 1/);
});
