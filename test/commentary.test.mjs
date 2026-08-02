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
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10, correct: true },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12, correct: true },
    ],
    heroes: [{ playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12 }],
    villains: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10 }],
    leaders: [], leadChanged: false, climbers: [], allCorrect: true, allWrong: false,
  };
  const hit = generateRoundCommentary({ ...base, zeroBids: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0 }] });
  assert.match(hit, /Anna/);
  assert.doesNotMatch(hit, /nicht auf/); // Treffer, kein Fehlschlag-Wortlaut

  // Kein Held/Bösewicht in diesem Fall (leere Arrays), damit die Nullansage
  // trotz der Highlight-Obergrenze zum Zug kommt und isoliert geprüft werden kann.
  const miss = generateRoundCommentary({
    ...base,
    allCorrect: false,
    heroes: [],
    villains: [],
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 0, tricks: 2, score: -8, correct: false },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12, correct: true },
    ],
    zeroBids: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 2 }],
  });
  assert.match(miss, /Anna/);
  assert.match(miss, /nicht auf/);
});

test('generateRoundCommentary: mehrere Nullansagen werden in EINEM Satz zusammengefasst', () => {
  const events = {
    roundIndex: 6,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10, correct: true },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 10, correct: true },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 1, score: 11, correct: true },
    ],
    heroes: [{ playerId: 'c', name: 'Cara', bid: 1, tricks: 1, score: 11 }],
    villains: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10 }],
    zeroBids: [
      { playerId: 'a', name: 'Anna', bid: 0, tricks: 0 },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0 },
    ],
    leaders: [], leadChanged: false, climbers: [], allCorrect: true, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  // Beide Namen tauchen auf, aber nicht als zwei getrennte "Mutig: ..."-Sätze für jeden Einzelnen.
  assert.match(text, /Anna/);
  assert.match(text, /Ben/);
  const mutigCount = (text.match(/Mutig:|traut sich|trauen sich/g) || []).length;
  assert.ok(mutigCount <= 1, `erwartet höchstens 1 Nullansage-Satz, gefunden: ${mutigCount} in "${text}"`);
});

test('generateRoundCommentary: höchstens Eröffnung + 2 weitere Highlights', () => {
  const events = {
    roundIndex: 1,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 0, tricks: 0, score: 10, correct: true },
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 3, score: 13, correct: true },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 4, score: -7, correct: false },
    ],
    heroes: [{ playerId: 'b', name: 'Ben', bid: 3, tricks: 3, score: 13 }],
    villains: [{ playerId: 'c', name: 'Cara', bid: 1, tricks: 4, score: -7 }],
    zeroBids: [{ playerId: 'a', name: 'Anna', bid: 0, tricks: 0 }],
    leaders: [{ id: 'b', name: 'Ben' }],
    leadChanged: true,
    climbers: [
      { playerId: 'a', name: 'Anna', prevRank: 3, rank: 1 },
    ],
    allCorrect: false,
    allWrong: false,
  };
  const text = generateRoundCommentary(events);
  // Eröffnung + max. 2 Highlights = max. 3 Sätze (grob an "! . …" Satzenden gezählt).
  const sentenceCount = text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  assert.ok(sentenceCount <= 3, `erwartet höchstens 3 Sätze, gefunden ${sentenceCount}: "${text}"`);
});

test('generateRoundCommentary: zwei Helden bei Gleichstand (gleiche Ansage/Stiche) ⇒ Plural-Verb', () => {
  const events = {
    roundIndex: 2, // heroLine-Seed = 3 ⇒ Variante mit "lesen … je +N Punkte!"
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 0, score: -9, correct: false },
    ],
    heroes: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12 },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12 },
    ],
    villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna und Ben/);
  assert.match(text, /\blesen\b/); // Plural, nicht "liest"
  assert.match(text, /je \+12 Punkte/); // gleiche Ansage/Stiche ⇒ Zahlen dürfen genannt werden
});

test('generateRoundCommentary: zwei Helden bei Gleichstand mit unterschiedlicher Ansage ⇒ keine Zahlen im Plural', () => {
  const events = {
    roundIndex: 1, // heroLine-Seed = 2 ⇒ Variante "bleiben eiskalt und treffen ihre Ansage exakt."
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 10, correct: true },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 3, score: -8, correct: false },
    ],
    heroes: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12 },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 12 },
    ],
    villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /\bbleiben\b/); // Plural, nicht "bleibt"
  assert.doesNotMatch(text, /\d angesagt/); // unterschiedliche Ansagen ⇒ keine Zahl im Heldensatz
});

test('generateRoundCommentary: Bösewicht mit mehr Stichen als angesagt ⇒ kein irreführendes "nur"', () => {
  const events = {
    roundIndex: 1, // villainLine-Seed = 3 ⇒ erste Variante ("erwischt's dagegen kalt …")
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 3, score: -7, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15 }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 2, tricks: 3, score: -7 }],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.doesNotMatch(text, /nur 3/); // 3 gemacht ist MEHR als die 2 angesagten ⇒ "nur" wäre irreführend
  assert.match(text, /gleich 3/);
});

test('generateRoundCommentary: Bösewicht mit weniger Stichen als angesagt ⇒ "nur" bleibt korrekt', () => {
  const events = {
    roundIndex: 1, // villainLine-Seed = 3 ⇒ erste Variante ("erwischt's dagegen kalt …")
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true },
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15 }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9 }],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /nur 1 geholt/);
});

test('generateRoundCommentary: drei Namen werden ohne Oxford-Komma verbunden', () => {
  const events = {
    roundIndex: 0,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true },
      { playerId: 'b', name: 'Ben', bid: 1, tricks: 1, score: 11, correct: true },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 1, score: 11, correct: true },
    ],
    heroes: [], villains: [], zeroBids: [],
    leaders: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
    ],
    leadChanged: true, climbers: [], allCorrect: true, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna, Ben und Cara/);
  assert.match(text, /übernehmen|liegen/); // Plural-Verb bei drei Spielern
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
