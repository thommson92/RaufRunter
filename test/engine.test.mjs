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
  rotateToStart,
  standings,
  moneyPayouts,
  profileMoneyStats,
  rankProgression,
  bidTrickTotals,
  accuracyStats,
  longestCorrectStreak,
  extremeRounds,
  trumpCounts,
  dealerMalusStats,
  dealerOutcomeForRound,
  currentStreaks,
  biddingBias,
  roundEvents,
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

test('rotateToStart: Gewinner rückt an Position 0, Nachbarschaft bleibt erhalten', () => {
  const names = ['a', 'b', 'c', 'd'];
  assert.deepEqual(rotateToStart(names, 2), ['c', 'd', 'a', 'b']); // c gewinnt die Auslosung
});

test('rotateToStart: negativer/außerhalb liegender Index wrap-around', () => {
  const names = ['a', 'b', 'c'];
  assert.deepEqual(rotateToStart(names, -1), ['c', 'a', 'b']);
  assert.deepEqual(rotateToStart(names, 3), ['a', 'b', 'c']);
});

test('rotateToStart: leere Liste ⇒ leer', () => {
  assert.deepEqual(rotateToStart([], 0), []);
});

test('rotateToStart: mutiert die Eingabe nicht, Elemente bleiben dieselben Referenzen', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const seated = [a, b];
  const rotated = rotateToStart(seated, 1);
  assert.deepEqual(seated, [a, b]); // Original unverändert
  assert.equal(rotated[0], b); // gleiche Objektreferenz, keine Kopie
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
  // fairShareSum: Runde 1 (1 Karte) + Runde 2 (2 Karten) = 3 Stiche auf 3 Spieler ⇒ je 1.
  assert.deepEqual(t.a, { bidSum: 2, trickSum: 1, roundsPlayed: 2, fairShareSum: 1 });
  assert.deepEqual(t.b, { bidSum: 1, trickSum: 1, roundsPlayed: 2, fairShareSum: 1 });
  assert.deepEqual(t.c, { bidSum: 0, trickSum: 1, roundsPlayed: 2, fairShareSum: 1 });
});

test('bidTrickTotals: fairShareSum gewichtet Runden nach Kartenzahl UND Spielerzahl', () => {
  const game = {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
      { id: 'd', name: 'Deniz' },
    ],
    rounds: [
      // 4 Karten auf 4 Spieler ⇒ fairer Anteil 1 pro Spieler.
      { cardCount: 4, done: true, bids: { a: 4, b: 0, c: 0, d: 0 }, tricks: { a: 4, b: 0, c: 0, d: 0 } },
    ],
  };
  const t = bidTrickTotals(game);
  assert.equal(t.a.fairShareSum, 1);
  assert.equal(t.b.fairShareSum, 1);
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

test('extremeRounds: beste & schlechteste Einzelrundenpunktzahl (Arrays)', () => {
  const { best, worst } = extremeRounds(statsGame);
  // Anna (Runde 0) und Ben (Runde 1) liegen mit je 11 Punkten gleichauf.
  assert.equal(best.length, 2);
  assert.deepEqual(best.map((e) => e.playerId).sort(), ['a', 'b']);
  assert.ok(best.every((e) => e.score === 11));
  assert.equal(worst.length, 1);
  assert.equal(worst[0].playerId, 'a');
  assert.equal(worst[0].roundIndex, 1);
  assert.equal(worst[0].score, -10);
});

test('extremeRounds: Gleichstand liefert alle Einträge am Extremwert', () => {
  const game = {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
    ],
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1, b: 0 }, tricks: { a: 1, b: 0 } }, // beide +11/+10... eigentlich a=11,b=10
      { index: 1, cardCount: 1, done: true, bids: { a: 0, b: 1 }, tricks: { a: 0, b: 1 } }, // a=10, b=11
    ],
  };
  const { best } = extremeRounds(game);
  assert.equal(best.length, 2); // a in Runde 0 und b in Runde 1, beide 11
  assert.deepEqual(best.map((e) => e.playerId).sort(), ['a', 'b']);
});

test('extremeRounds: keine fertige Runde ⇒ leere Arrays', () => {
  const empty = { players: [{ id: 'a', name: 'A' }], rounds: [] };
  assert.deepEqual(extremeRounds(empty), { best: [], worst: [] });
});

test('dealerMalusStats: unterscheidet neutral / Malus-richtig / Malus-falsch', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
    { id: 'c', name: 'Cara', seatOrder: 2 },
  ];
  const game = {
    restrictLastBid: true,
    players,
    rounds: [
      // Runde 0 (3 Karten): Geber ist a (dealerIndex(0,3)=0). b=1,c=1 -> Rest 1,
      // verboten=1 (im Bereich 0..3) -> Malus greift. a sagt 2 an, trifft (Stiche 2).
      { index: 0, cardCount: 3, done: true, bids: { a: 2, b: 1, c: 1 }, tricks: { a: 2, b: 1, c: 0 } },
      // Runde 1 (2 Karten): Geber ist b (dealerIndex(1,3)=1). c=1,a=0 -> Rest 1,
      // verboten=1 (im Bereich 0..2) -> Malus greift. b sagt 0 an, verschätzt sich (Stiche 1).
      { index: 1, cardCount: 2, done: true, bids: { a: 0, b: 0, c: 1 }, tricks: { a: 0, b: 1, c: 1 } },
      // Runde 2 (1 Karte): Geber ist c (dealerIndex(2,3)=2). a=1,b=1 -> Rest -1,
      // außerhalb 0..1 -> KEIN echter Malus für c, zählt als "neutral" (dennoch Geber gewesen).
      { index: 2, cardCount: 1, done: true, bids: { a: 1, b: 1, c: 0 }, tricks: { a: 1, b: 0, c: 0 } },
    ],
  };
  const stats = dealerMalusStats(game);
  assert.deepEqual(stats.a, { dealerRounds: 1, neutral: 0, malusCorrect: 1, malusWrong: 0 });
  assert.deepEqual(stats.b, { dealerRounds: 1, neutral: 0, malusCorrect: 0, malusWrong: 1 });
  assert.deepEqual(stats.c, { dealerRounds: 1, neutral: 1, malusCorrect: 0, malusWrong: 0 });
});

test('dealerMalusStats: restrictLastBid aus ⇒ Geber-Runden zählen, aber immer neutral', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
  ];
  const game = {
    restrictLastBid: false,
    players,
    rounds: [
      // dealerIndex(0,2)=0 -> a ist Geber. Ohne die Regel zählt das trotzdem als
      // Geber-Runde, aber niemals als echter Malus.
      { index: 0, cardCount: 2, done: true, bids: { a: 1, b: 1 }, tricks: { a: 1, b: 1 } },
    ],
  };
  const stats = dealerMalusStats(game);
  assert.deepEqual(stats.a, { dealerRounds: 1, neutral: 1, malusCorrect: 0, malusWrong: 0 });
  assert.deepEqual(stats.b, { dealerRounds: 0, neutral: 0, malusCorrect: 0, malusWrong: 0 });
});

test('dealerMalusStats: dealerRounds = neutral + malusCorrect + malusWrong', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
    { id: 'c', name: 'Cara', seatOrder: 2 },
  ];
  const game = {
    restrictLastBid: true,
    players,
    rounds: [
      { index: 0, cardCount: 3, done: true, bids: { a: 2, b: 1, c: 1 }, tricks: { a: 2, b: 1, c: 0 } },
      { index: 1, cardCount: 2, done: true, bids: { a: 0, b: 0, c: 1 }, tricks: { a: 0, b: 1, c: 1 } },
      { index: 2, cardCount: 1, done: true, bids: { a: 1, b: 1, c: 0 }, tricks: { a: 1, b: 0, c: 0 } },
    ],
  };
  const stats = dealerMalusStats(game);
  for (const id of ['a', 'b', 'c']) {
    const s = stats[id];
    assert.equal(s.dealerRounds, s.neutral + s.malusCorrect + s.malusWrong);
  }
});

test('dealerOutcomeForRound: liefert dieselbe Bewertung wie dealerMalusStats für die einzelne Runde', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
    { id: 'c', name: 'Cara', seatOrder: 2 },
  ];
  const game = {
    restrictLastBid: true,
    players,
    rounds: [
      { index: 0, cardCount: 3, done: true, bids: { a: 2, b: 1, c: 1 }, tricks: { a: 2, b: 1, c: 0 } },
      { index: 1, cardCount: 2, done: true, bids: { a: 0, b: 0, c: 1 }, tricks: { a: 0, b: 1, c: 1 } },
      { index: 2, cardCount: 1, done: true, bids: { a: 1, b: 1, c: 0 }, tricks: { a: 1, b: 0, c: 0 } },
    ],
  };
  assert.deepEqual(dealerOutcomeForRound(game, 0), { dealerId: 'a', dealerName: 'Anna', bound: true, correct: true });
  // Runde 2: kein echter Malus für Geber c (verbotener Wert außerhalb 0..1).
  assert.deepEqual(dealerOutcomeForRound(game, 2), { dealerId: 'c', dealerName: 'Cara', bound: false, correct: true });
});

test('dealerOutcomeForRound: nicht existierende/offene Runde ⇒ null', () => {
  const game = {
    players: [{ id: 'a', name: 'Anna', seatOrder: 0 }],
    rounds: [{ index: 0, cardCount: 1, done: false, bids: {}, tricks: {} }],
  };
  assert.equal(dealerOutcomeForRound(game, 0), null);
  assert.equal(dealerOutcomeForRound(game, 5), null);
});

test('currentStreaks: läuft weiter bei gleichem Ausgang, bricht bei Wechsel', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
  ];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1, b: 0 }, tricks: { a: 1, b: 1 } }, // a richtig, b falsch
      { index: 1, cardCount: 2, done: true, bids: { a: 1, b: 0 }, tricks: { a: 1, b: 0 } }, // a richtig, b richtig
      { index: 2, cardCount: 1, done: true, bids: { a: 0, b: 0 }, tricks: { a: 1, b: 0 } }, // a falsch, b richtig
    ],
  };
  assert.deepEqual(currentStreaks(game, 1), {
    a: { type: 'correct', length: 2 },
    b: { type: 'correct', length: 1 }, // Serie von Runde 0 (falsch) gebrochen, neu gestartet
  });
  assert.deepEqual(currentStreaks(game, 2), {
    a: { type: 'wrong', length: 1 },
    b: { type: 'correct', length: 2 },
  });
});

test('currentStreaks: unbeteiligte/offene Runden werden übersprungen, nicht als Bruch gewertet', () => {
  const players = [{ id: 'a', name: 'Anna', seatOrder: 0 }];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1 }, tricks: { a: 1 } },
      { index: 1, cardCount: 2, done: false, bids: {}, tricks: {} }, // noch offen
      { index: 2, cardCount: 1, done: true, bids: { a: 0 }, tricks: { a: 0 } },
    ],
  };
  assert.deepEqual(currentStreaks(game, 2), { a: { type: 'correct', length: 2 } });
});

test('biddingBias: positiver Schnitt bei konsequent mehr Stichen als angesagt', () => {
  const players = [{ id: 'a', name: 'Anna', seatOrder: 0 }];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 3, done: true, bids: { a: 0 }, tricks: { a: 2 } },
      { index: 1, cardCount: 3, done: true, bids: { a: 1 }, tricks: { a: 2 } },
      { index: 2, cardCount: 3, done: true, bids: { a: 0 }, tricks: { a: 1 } },
    ],
  };
  const bias = biddingBias(game, 2);
  assert.equal(bias.a.attempts, 3);
  assert.equal(bias.a.avgDiff, (2 + 1 + 1) / 3);
});

test('biddingBias: ohne gespielte Runde ⇒ avgDiff 0, attempts 0', () => {
  const game = { players: [{ id: 'a', name: 'Anna', seatOrder: 0 }], rounds: [] };
  assert.deepEqual(biddingBias(game, 0).a, { avgDiff: 0, attempts: 0 });
});

test('roundEvents: Fakten der ersten Runde (kein Vorher-Rang, keine Kletterer)', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
    { id: 'c', name: 'Cara', seatOrder: 2 },
  ];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1, b: 0, c: 0 }, tricks: { a: 1, b: 0, c: 1 } },
      { index: 1, cardCount: 2, done: true, bids: { a: 1, b: 1, c: 0 }, tricks: { a: 0, b: 1, c: 0 } },
    ],
  };

  const e0 = roundEvents(game, 0);
  assert.equal(e0.dealerName, 'Anna'); // dealerIndex(0,3)=0 -> a gibt
  assert.deepEqual(e0.heroes.map((h) => h.playerId), ['a']); // +11, Bestwert
  assert.deepEqual(e0.villains.map((v) => v.playerId), ['c']); // -9, Schlechtestwert
  assert.deepEqual(e0.zeroBids.map((z) => z.playerId).sort(), ['b', 'c']);
  assert.equal(e0.leadChanged, false); // keine Vorrunde zum Vergleichen
  assert.deepEqual(e0.climbers, []);
  assert.deepEqual(e0.leaders.map((l) => l.id), ['a']);
  assert.equal(e0.allCorrect, false);
  assert.equal(e0.allWrong, false);

  // Zusatzfelder fürs Rundenkommentar sind mitverdrahtet (Details dort/oben getestet).
  assert.deepEqual(e0.streaks.a, { type: 'correct', length: 1 });
  assert.deepEqual(e0.streaks.c, { type: 'wrong', length: 1 });
  assert.deepEqual(e0.dealerOutcome, { dealerId: 'a', dealerName: 'Anna', bound: true, correct: true });
  assert.equal(e0.bias.c.avgDiff, 1); // c: 1 Stich gemacht, 0 angesagt
  assert.deepEqual(e0.wildMisses, []); // größte Abweichung ist 1, unter der wildMiss-Schwelle
});

test('roundEvents: wildMisses ab Abweichung 2, Nullansagen ausgenommen', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
  ];
  const game = {
    players,
    rounds: [
      // b: 0 angesagt, 3 gemacht -> Abweichung 3, aber Nullansage -> keine wildMiss.
      // a: 4 angesagt, 1 gemacht -> Abweichung 3 -> wildMiss.
      { index: 0, cardCount: 4, done: true, bids: { a: 4, b: 0 }, tricks: { a: 1, b: 3 } },
    ],
  };
  const e0 = roundEvents(game, 0);
  assert.deepEqual(e0.wildMisses.map((m) => m.playerId), ['a']);
});

test('roundEvents: Führungswechsel & Kletterer werden erkannt', () => {
  const players = [
    { id: 'a', name: 'Anna', seatOrder: 0 },
    { id: 'b', name: 'Ben', seatOrder: 1 },
    { id: 'c', name: 'Cara', seatOrder: 2 },
  ];
  const game = {
    players,
    rounds: [
      { index: 0, cardCount: 1, done: true, bids: { a: 1, b: 0, c: 0 }, tricks: { a: 1, b: 0, c: 1 } },
      // a fällt zurück (-10), b übernimmt die Führung (+11), c zieht vorbei (+10).
      { index: 1, cardCount: 2, done: true, bids: { a: 1, b: 1, c: 0 }, tricks: { a: 0, b: 1, c: 0 } },
    ],
  };

  const e1 = roundEvents(game, 1);
  assert.equal(e1.dealerName, 'Ben'); // dealerIndex(1,3)=1 -> b gibt
  assert.deepEqual(e1.heroes.map((h) => h.playerId), ['b']);
  assert.deepEqual(e1.villains.map((v) => v.playerId), ['a']);
  assert.equal(e1.leadChanged, true); // Anna (Runde 0) -> Ben (Runde 1)
  assert.deepEqual(e1.leaders.map((l) => l.id), ['b']);
  assert.equal(e1.climbers.length, 3); // alle drei wechseln den Rang
});

test('roundEvents: nicht existierende/offene Runde ⇒ null', () => {
  const game = {
    players: [{ id: 'a', name: 'Anna', seatOrder: 0 }],
    rounds: [{ index: 0, cardCount: 1, done: false, bids: {}, tricks: {} }],
  };
  assert.equal(roundEvents(game, 0), null);
  assert.equal(roundEvents(game, 5), null);
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

// ---------- moneyPayouts (Geldeinsatz & Ausschüttung) ----------

/**
 * Punktzahl S über die Punkteformel korrekt (10+tricks) oder falsch
 * (-10+tricks) erzeugen — egal ob realistisch, standings() prüft cardCount
 * nicht gegen die Summe der Stiche.
 */
function bidForScore(score) {
  if (score >= 10) return { bid: score - 10, tricks: score - 10 };
  return { bid: score + 9, tricks: score + 10 }; // bewusst falsch (bid ≠ tricks)
}

/** Spiel mit vier klar getrennten Rängen: a=30 (1.), b=20 (2.), c=10 (3.), d=-10 (4.). */
function fourRankGame(moneyFields) {
  const scores = { a: 30, b: 20, c: 10, d: -10 };
  const bids = {};
  const tricks = {};
  for (const [id, s] of Object.entries(scores)) {
    const r = bidForScore(s);
    bids[id] = r.bid;
    tricks[id] = r.tricks;
  }
  return {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
      { id: 'd', name: 'Dirk' },
    ],
    rounds: [{ cardCount: 30, done: true, bids, tricks }],
    ...moneyFields,
  };
}

/** Spiel mit Gleichstand auf Platz 1: a & b teilen sich Rang 1, c ist Rang 3. */
function tiedTopGame(moneyFields) {
  return {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
    ],
    rounds: [
      {
        cardCount: 20,
        done: true,
        bids: { a: 10, b: 10, c: 0 },
        tricks: { a: 10, b: 10, c: 10 }, // c falsch angesagt ⇒ -10+10=0
      },
    ],
    ...moneyFields,
  };
}

test('moneyPayouts: kein Geldspiel ⇒ null', () => {
  assert.equal(moneyPayouts(fourRankGame({ moneyEnabled: false, stake: 5 })), null);
  assert.equal(moneyPayouts(fourRankGame({})), null); // moneyEnabled fehlt ⇒ aus
});

test('moneyPayouts: winner-takes-all', () => {
  const game = fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'winner-takes-all' });
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.a.rank, 1);
  assert.equal(byId.a.net, 15); // Pot 20 − eigener Einsatz 5
  assert.equal(byId.b.net, -5);
  assert.equal(byId.c.net, -5);
  assert.equal(byId.d.net, -5);
  const sum = Object.values(byId).reduce((s, p) => s + p.net, 0);
  assert.equal(sum, 0);
});

test('moneyPayouts: runner-up-refund', () => {
  const game = fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'runner-up-refund' });
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.a.net, 10); // Rest des Topfs nach Rückzahlung an Rang 2
  assert.equal(byId.b.net, 0); // Einsatz zurück
  assert.equal(byId.c.net, -5);
  assert.equal(byId.d.net, -5);
});

test('moneyPayouts: podium-cascade', () => {
  const game = fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'podium-cascade' });
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.a.net, 0); // Rest, nachdem 2. und 3. schon viel bekommen haben
  assert.equal(byId.b.net, 5); // doppelter Einsatz zurück ⇒ +1 Einsatz Gewinn
  assert.equal(byId.c.net, 0); // Einsatz zurück
  assert.equal(byId.d.net, -5);
  const sum = Object.values(byId).reduce((s, p) => s + p.net, 0);
  assert.equal(sum, 0);
});

test('moneyPayouts: Gleichstand auf Platz 1 ⇒ Pot gesplittet, „Rang 2"-Regel bleibt inert', () => {
  const wta = tiedTopGame({ moneyEnabled: true, stake: 6, payoutMode: 'winner-takes-all' });
  const byIdWta = Object.fromEntries(moneyPayouts(wta).map((p) => [p.playerId, p]));
  assert.equal(byIdWta.a.rank, 1);
  assert.equal(byIdWta.b.rank, 1);
  assert.equal(byIdWta.a.net, 3); // (Pot 18 / 2 Sieger) − Einsatz 6
  assert.equal(byIdWta.b.net, 3);
  assert.equal(byIdWta.c.net, -6);

  // Kein Spieler hat Rang 2 (a & b teilen Rang 1, c ist Rang 3) ⇒ die
  // "2. bekommt Einsatz zurück"-Regel greift bei niemandem, der Rest bleibt
  // komplett bei Rang 1 — exakt wie bei winner-takes-all.
  const refund = tiedTopGame({ moneyEnabled: true, stake: 6, payoutMode: 'runner-up-refund' });
  const byIdRefund = Object.fromEntries(moneyPayouts(refund).map((p) => [p.playerId, p]));
  assert.equal(byIdRefund.a.net, 3);
  assert.equal(byIdRefund.b.net, 3);
  assert.equal(byIdRefund.c.net, -6);
});

test('moneyPayouts: podium-cascade, Gleichstand auf Platz 2 ⇒ Platz-2- UND Platz-3-Auszahlung zusammengelegt und geteilt', () => {
  // a gewinnt klar, b & c teilen sich Platz 2 (⇒ es gibt keinen Platz 3), d ist Letzter.
  const game = {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
      { id: 'd', name: 'Dirk' },
    ],
    rounds: [
      {
        cardCount: 30,
        done: true,
        bids: { a: 20, b: 10, c: 10, d: 9 },
        tricks: { a: 20, b: 10, c: 10, d: 10 }, // d falsch angesagt ⇒ -10+10=0
      },
    ],
    moneyEnabled: true,
    stake: 10,
    payoutMode: 'podium-cascade',
  };
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.b.rank, 2);
  assert.equal(byId.c.rank, 2);
  // Platz 2 (2×Einsatz=20€) + Platz 3 (1×Einsatz=10€) zusammen 30€, auf beide
  // geteilt ⇒ 15€ Auszahlung / 5€ Netto-Gewinn pro Person (Einsatz 10€).
  assert.equal(byId.b.net, 5);
  assert.equal(byId.c.net, 5);
  assert.equal(byId.d.net, -10); // Letzter, kein Platz belegt eine Auszahlung für ihn
  assert.equal(byId.a.net, 0); // Rest: Pot 40€ − 30€ (an b+c) − 0€ (d) − Einsatz
  const sum = Object.values(byId).reduce((s, p) => s + p.net, 0);
  assert.equal(sum, 0);
});

test('moneyPayouts: runner-up-refund, drei teilen sich Platz 2 ⇒ nur EIN Rückerstattungsbetrag wird gedrittelt', () => {
  // a gewinnt klar, b/c/d teilen sich Platz 2 zu dritt.
  const game = {
    players: [
      { id: 'a', name: 'Anna' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cara' },
      { id: 'd', name: 'Dirk' },
    ],
    rounds: [
      {
        cardCount: 30,
        done: true,
        bids: { a: 20, b: 0, c: 0, d: 0 },
        tricks: { a: 20, b: 10, c: 10, d: 10 }, // b/c/d falsch angesagt ⇒ -10+10=0, alle gleich
      },
    ],
    moneyEnabled: true,
    stake: 10,
    payoutMode: 'runner-up-refund',
  };
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.b.rank, 2);
  assert.equal(byId.c.rank, 2);
  assert.equal(byId.d.rank, 2);
  // Nur EIN Einsatz (10€) ist als Rückerstattung für Platz 2 vorgesehen, nicht
  // dreimal — gedrittelt macht das 3,33€ Auszahlung / −6,67€ Netto pro Person.
  assert.equal(byId.b.net, -6.67);
  assert.equal(byId.c.net, -6.67);
  assert.equal(byId.d.net, -6.67);
  assert.equal(byId.a.net, 20); // Rest: Pot 40€ − 10€ (Platz-2-Topf) − Einsatz
});

test('moneyPayouts: manual reicht eingetragene Werte durch, fehlende ⇒ null', () => {
  const game = fourRankGame({
    moneyEnabled: true,
    payoutMode: 'manual',
    manualPayouts: { a: 12.5, b: -4 },
  });
  const byId = Object.fromEntries(moneyPayouts(game).map((p) => [p.playerId, p]));
  assert.equal(byId.a.net, 12.5);
  assert.equal(byId.b.net, -4);
  assert.equal(byId.c.net, null);
  assert.equal(byId.d.net, null);
});

// ---------- profileMoneyStats (Geld-Bilanz je Profil über mehrere Spiele) ----------

/** fourRankGame-Spieler mit profileId versehen, damit gamesUsingProfile/profileMoneyStats greifen. */
function withProfileIds(game, mapping) {
  return {
    ...game,
    players: game.players.map((p) => ({ ...p, profileId: mapping[p.id] ?? null })),
  };
}

test('profileMoneyStats: summiert Einsatz & Netto über mehrere Spiele desselben Profils', () => {
  const profileMap = { a: 'profile-anna', b: 'profile-ben', c: 'profile-cara', d: 'profile-dirk' };
  const game1 = withProfileIds(
    fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'winner-takes-all' }),
    profileMap,
  );
  const game2 = withProfileIds(
    fourRankGame({ moneyEnabled: true, stake: 10, payoutMode: 'winner-takes-all' }),
    profileMap,
  );
  const stats = profileMoneyStats([game1, game2], 'profile-anna');
  assert.equal(stats.gamesPlayed, 2);
  assert.equal(stats.totalStake, 15); // 5 + 10
  assert.equal(stats.totalNet, 45); // 15 (Sieg bei 5€ Einsatz) + 30 (Sieg bei 10€ Einsatz)
});

test('profileMoneyStats: Spiele ohne Geld oder ohne das Profil zählen nicht mit', () => {
  const profileMap = { a: 'profile-anna', b: 'profile-ben', c: 'profile-cara', d: 'profile-dirk' };
  const noMoneyGame = withProfileIds(fourRankGame({ moneyEnabled: false }), profileMap);
  const otherProfilesGame = withProfileIds(
    fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'winner-takes-all' }),
    { a: 'someone-else', b: 'profile-ben', c: 'profile-cara', d: 'profile-dirk' },
  );
  const stats = profileMoneyStats([noMoneyGame, otherProfilesGame], 'profile-anna');
  assert.equal(stats.gamesPlayed, 0);
  assert.equal(stats.totalStake, 0);
  assert.equal(stats.totalNet, 0);
});

test('profileMoneyStats: unfertiges Spiel zählt nicht mit', () => {
  const profileMap = { a: 'profile-anna', b: 'profile-ben', c: 'profile-cara', d: 'profile-dirk' };
  const game = withProfileIds(
    fourRankGame({ moneyEnabled: true, stake: 5, payoutMode: 'winner-takes-all' }),
    profileMap,
  );
  game.rounds[0].done = false;
  const stats = profileMoneyStats([game], 'profile-anna');
  assert.equal(stats.gamesPlayed, 0);
});

test('profileMoneyStats: manual-Modus ohne eingetragenen Betrag zählt nicht mit', () => {
  const profileMap = { a: 'profile-anna', b: 'profile-ben', c: 'profile-cara', d: 'profile-dirk' };
  const game = withProfileIds(
    fourRankGame({ moneyEnabled: true, payoutMode: 'manual', manualPayouts: { b: -4 } }),
    profileMap,
  );
  const statsAnna = profileMoneyStats([game], 'profile-anna');
  assert.equal(statsAnna.gamesPlayed, 0); // kein Betrag für a eingetragen
  const statsBen = profileMoneyStats([game], 'profile-ben');
  assert.equal(statsBen.gamesPlayed, 1);
  assert.equal(statsBen.totalNet, -4);
});
