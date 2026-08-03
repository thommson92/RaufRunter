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
    heroes: [{ playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true }],
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
    heroes: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
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
    heroes: [{ playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12, correct: true }],
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
    heroes: [{ playerId: 'c', name: 'Cara', bid: 1, tricks: 1, score: 11, correct: true }],
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
    heroes: [{ playerId: 'b', name: 'Ben', bid: 3, tricks: 3, score: 13, correct: true }],
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
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 2, score: 12, correct: true },
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
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 0, tricks: 0, score: 12, correct: true },
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
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true }],
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
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9 }],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /nur 1 geholt/);
});

test('generateRoundCommentary: bei allWrong wird niemand fälschlich als Ansage-Treffer gefeiert', () => {
  // Regression: heroes = perPlayer.filter(score === maxScore), unabhängig von
  // "correct". Bei allWrong können zwei gleich schlecht getroffene Spieler den
  // Bestscore teilen — heroLine darf sie dann nicht als "trifft die Ansage
  // exakt" feiern, nur weil sie untereinander dieselbe (falsche) Ansage haben.
  const events = {
    roundIndex: 2,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 1, score: -9, correct: false },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 1, score: -9, correct: false },
    ],
    heroes: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 1, score: -9, correct: false },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 1, score: -9, correct: false },
    ],
    villains: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 1, score: -9, correct: false },
      { playerId: 'b', name: 'Ben', bid: 2, tricks: 1, score: -9, correct: false },
    ],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: true,
  };
  const text = generateRoundCommentary(events);
  assert.doesNotMatch(text, /exakt|eingetütet|liest das Spiel|lesen das Spiel/);
});

test('generateRoundCommentary: mehrere Bösewichte bei Gleichstand (gleiche Ansage/Stiche) ⇒ Plural-Verb', () => {
  const events = {
    roundIndex: 2, // villainLine-Seed = 4 ⇒ zweite Variante ("Das ging in die Hose …")
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true },
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9, correct: false },
      { playerId: 'c', name: 'Cara', bid: 3, tricks: 1, score: -9, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true }],
    villains: [
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9 },
      { playerId: 'c', name: 'Cara', bid: 3, tricks: 1, score: -9 },
    ],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Ben und Cara/);
  assert.match(text, /verschätzen sich/); // Plural, nicht "verschätzt sich"
  assert.match(text, /rutschen/); // Plural, nicht "rutscht"
  assert.match(text, /3 zu 1/); // gleiche Ansage/Stiche ⇒ Zahlen dürfen genannt werden
});

test('generateRoundCommentary: mehrere Bösewichte mit unterschiedlicher Ansage ⇒ keine Zahlen im Plural', () => {
  const events = {
    roundIndex: 2, // villainLine-Seed = 4 ⇒ zweite Variante ("Das ging in die Hose …")
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true },
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9, correct: false },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 3, score: -9, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 5, tricks: 5, score: 15, correct: true }],
    villains: [
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 1, score: -9 },
      { playerId: 'c', name: 'Cara', bid: 1, tricks: 3, score: -9 },
    ],
    zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: false,
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Ben und Cara/);
  assert.match(text, /verschätzen sich/);
  assert.doesNotMatch(text, /\d zu \d/); // unterschiedliche Ansagen ⇒ kein Ansage-zu-Stiche-Vergleich im Bösewicht-Satz
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

test('generateRoundCommentary: heiße Serie (≥3 richtig in Folge) wird erwähnt', () => {
  const events = {
    roundIndex: 5, // isoliert testen: kein Held/Bösewicht/Nullansage/Führung/Kletterer
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: true, allWrong: false,
    streaks: { a: { type: 'correct', length: 4 } },
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna/);
  assert.match(text, /4 Runden/);
});

test('generateRoundCommentary: kalte Serie (≥3 falsch in Folge) wird erwähnt', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 3, score: -8, correct: false }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: true, // Held/Bösewicht bewusst über allWrong ausgeschlossen
    streaks: { a: { type: 'wrong', length: 3 } },
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna/);
  assert.match(text, /3 Runden|Fehlgriffe/);
});

test('generateRoundCommentary: Serie unter STREAK_MIN wird nicht erwähnt', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: true, allWrong: false,
    streaks: { a: { type: 'correct', length: 2 } }, // unter der Schwelle von 3
  };
  const text = generateRoundCommentary(events);
  assert.doesNotMatch(text, /on fire|heiß|Folge/);
});

test('generateRoundCommentary: Geber meistert die Ansage-Falle', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: true, allWrong: false,
    dealerOutcome: { dealerId: 'a', dealerName: 'Anna', bound: true, correct: true },
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna/);
  assert.match(text, /meistert|cool und trifft genau/);
  assert.doesNotMatch(text, /muss dran glauben|leidet/); // korrekt gemeistert, nicht gescheitert
});

test('generateRoundCommentary: Geber scheitert an der Ansage-Falle', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 2, score: -8, correct: false }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: true,
    dealerOutcome: { dealerId: 'a', dealerName: 'Anna', bound: true, correct: false },
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /muss dran glauben|leidet/);
});

test('generateRoundCommentary: Geber-Falle ohne echte Bindung (bound=false) wird nicht erwähnt', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: true, allWrong: false,
    dealerOutcome: { dealerId: 'a', dealerName: 'Anna', bound: false, correct: true },
  };
  const text = generateRoundCommentary(events);
  assert.doesNotMatch(text, /Falle/);
});

test('generateRoundCommentary: auffällige Ansage-Tendenz (Bias) wird genannt, unterhalb der Schwelle nicht', () => {
  const base = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: true, allWrong: false,
  };
  const over = generateRoundCommentary({ ...base, bias: { a: { avgDiff: 1.5, attempts: 4 } } });
  assert.match(over, /Anna/);
  assert.match(over, /mehr geholt|höhere Zahl/);

  const under = generateRoundCommentary({ ...base, bias: { a: { avgDiff: -1.5, attempts: 4 } } });
  assert.match(under, /kleiner planen|weniger geholt/);

  const tooFewAttempts = generateRoundCommentary({ ...base, bias: { a: { avgDiff: 2, attempts: 2 } } });
  assert.doesNotMatch(tooFewAttempts, /geholt als angesagt|angesagt, als am Ende/);
});

test('generateRoundCommentary: krasser Fehlgriff (≥2 Stiche daneben) bekommt frechen Kommentar, Nullansagen ausgenommen', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 4, tricks: 1, score: -7, correct: false }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false, climbers: [],
    allCorrect: false, allWrong: true,
    wildMisses: [{ playerId: 'a', name: 'Anna', bid: 4, tricks: 1 }],
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna/);
  assert.match(text, /blind angesagt|Regelauffrischung|verschätzt sich gewaltig/);
});

test('generateRoundCommentary: Faller in der Platzierung wird erwähnt (Kehrseite von Kletterer)', () => {
  const events = {
    roundIndex: 5,
    perPlayer: [{ playerId: 'a', name: 'Anna', bid: 1, tricks: 1, score: 11, correct: true }],
    heroes: [], villains: [], zeroBids: [], leaders: [], leadChanged: false,
    allCorrect: true, allWrong: false,
    climbers: [{ playerId: 'a', name: 'Anna', prevRank: 1, rank: 3 }],
  };
  const text = generateRoundCommentary(events);
  assert.match(text, /Anna/);
  assert.match(text, /Platz 1.*Platz 3|rutscht/);
});

test('generateRoundCommentary: Themenwahl variiert über verschiedene Runden hinweg (kein starres Fest-Ranking)', () => {
  // Fünf gleichzeitig zutreffende Themen über viele Rundennummern hinweg —
  // welche zwei es in den Text schaffen, darf nicht immer dieselbe Kombination sein.
  const buildEvents = (roundIndex) => ({
    roundIndex,
    perPlayer: [
      { playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true },
      { playerId: 'b', name: 'Ben', bid: 3, tricks: 0, score: -7, correct: false },
    ],
    heroes: [{ playerId: 'a', name: 'Anna', bid: 2, tricks: 2, score: 12, correct: true }],
    villains: [{ playerId: 'b', name: 'Ben', bid: 3, tricks: 0, score: -7 }],
    zeroBids: [],
    leaders: [{ id: 'a', name: 'Anna' }],
    leadChanged: true,
    climbers: [{ playerId: 'a', name: 'Anna', prevRank: 3, rank: 1 }],
    allCorrect: false,
    allWrong: false,
    streaks: { a: { type: 'correct', length: 3 } },
    dealerOutcome: { dealerId: 'b', dealerName: 'Ben', bound: true, correct: false },
    bias: {},
    wildMisses: [],
  });
  const outcomes = new Set();
  for (let r = 0; r < 30; r++) {
    outcomes.add(generateRoundCommentary(buildEvents(r)));
  }
  assert.ok(outcomes.size > 1, 'erwartet unterschiedliche Themen-Kombinationen über mehrere Runden');
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
