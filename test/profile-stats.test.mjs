import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateProfileStats } from '../src/profile-stats.js';

/**
 * Minimales Spiel-Fixture. `players` bekommen automatisch `p0`, `p1`, … als
 * spielinterne id; `profileId: null` lässt einen Sitz absichtlich ohne Profil
 * (Gast-Fall / Altdaten vor der Zuordnung).
 */
function game(id, players, rounds, extra = {}) {
  return {
    id,
    name: id,
    players: players.map((p, i) => ({ id: 'p' + i, seatOrder: i, name: p.profileId || 'Gast', ...p })),
    rounds,
    ...extra,
  };
}

const round = (cardCount, bids, tricks, done = true) => ({ cardCount, bids, tricks, done });

test('aggregateProfileStats: Sieg, Platzierung und Rundenstats über zwei fertige Spiele', () => {
  const g1 = game(
    'g1',
    [{ profileId: 'alice' }, { profileId: 'bob' }],
    // p0 sagt 1 richtig (+11), p1 sagt 0 richtig (+10) -> Alice gewinnt.
    [round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 })],
  );
  const g2 = game(
    'g2',
    [{ profileId: 'alice' }, { profileId: 'bob' }],
    // Beide sagen 0 richtig -> gleicher Punktestand -> geteilter Sieg.
    [round(1, { p0: 0, p1: 0 }, { p0: 0, p1: 0 })],
  );
  const stats = aggregateProfileStats([g1, g2]);
  const alice = stats.get('alice');
  const bob = stats.get('bob');

  assert.equal(alice.gamesTotal, 2);
  assert.equal(alice.gamesFinished, 2);
  assert.equal(alice.wins, 2); // Sieg in g1 (solo) + geteilter Sieg in g2
  assert.equal(alice.sharedWins, 1);
  assert.equal(alice.podiums, 2); // 2 Spieler -> Rang 1 und 2 sind beide Podest
  assert.equal(bob.wins, 1); // nur der geteilte Sieg in g2
  assert.equal(bob.sharedWins, 1);
  assert.equal(bob.lasts, 1); // in g1 klar Letzter; in g2 teilt er sich Rang 1 -> nicht Letzter
});

test('aggregateProfileStats: rankScore bewertet Platz 1 mit 1.0 und den letzten Platz mit 0', () => {
  const g = game(
    'g',
    [{ profileId: 'a' }, { profileId: 'b' }, { profileId: 'c' }],
    [round(2, { p0: 2, p1: 0, p2: 0 }, { p0: 2, p1: 0, p2: 0 })],
  );
  const stats = aggregateProfileStats([g]);
  assert.equal(stats.get('a').rankScore, 1);
  // b und c teilen sich Rang 2 (beide +10) -> rankScore = 1 - (2-1)/(3-1) = 0.5
  assert.equal(stats.get('b').rankScore, 0.5);
  assert.equal(stats.get('c').rankScore, 0.5);
});

test('aggregateProfileStats: laufendes Spiel liefert Rundenstats, aber keine Platzierung', () => {
  const running = game(
    'running',
    [{ profileId: 'alice' }, { profileId: 'bob' }],
    [
      round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 }, true), // fertig -> zählt für Rundenstats
      round(2, { p0: 1 }, {}, false), // offen -> Spiel insgesamt nicht "finished"
    ],
  );
  const stats = aggregateProfileStats([running]);
  const alice = stats.get('alice');

  assert.equal(alice.gamesTotal, 1);
  assert.equal(alice.gamesFinished, 0); // Spiel ist nicht komplett fertig
  assert.equal(alice.wins, 0);
  assert.equal(alice.winRate, null); // keine fertigen Spiele -> keine Quote, nicht 0
  assert.equal(alice.rounds, 1); // die eine fertige Runde zählt trotzdem
  assert.equal(alice.correct, 1);
  assert.equal(alice.points, 11);
  assert.equal(alice.bestGameTotal, null); // "Endergebnis" gibt's erst bei einem fertigen Spiel
});

test('aggregateProfileStats: Stich-Index mittelt über ein Spiel auf 1', () => {
  const g = game(
    'g',
    [{ profileId: 'a' }, { profileId: 'b' }, { profileId: 'c' }, { profileId: 'd' }],
    // 4 Karten auf 4 Spieler verteilt -> fairer Anteil je 1. a nimmt alle 4.
    [round(4, { p0: 4, p1: 0, p2: 0, p3: 0 }, { p0: 4, p1: 0, p2: 0, p3: 0 })],
  );
  const stats = aggregateProfileStats([g]);
  assert.equal(stats.get('a').trickIndex, 4); // 4x mehr Stiche als der faire Anteil
  assert.equal(stats.get('b').trickIndex, 0);
  // Summe aller trickIndex-Anteile (gewichtet mit je 1 fairShare) ergibt die
  // Spieleranzahl -> im Mittel exakt 1, die Grundeigenschaft der Kennzahl.
  const avg =
    (stats.get('a').trickIndex + stats.get('b').trickIndex + stats.get('c').trickIndex + stats.get('d').trickIndex) /
    4;
  assert.equal(avg, 1);
});

test('aggregateProfileStats: overbid ist positiv, wenn mehr angesagt als gemacht wird', () => {
  const g = game(
    'g',
    [{ profileId: 'a' }, { profileId: 'b' }],
    [round(2, { p0: 2, p1: 0 }, { p0: 0, p1: 2 })],
  );
  const stats = aggregateProfileStats([g]);
  assert.ok(stats.get('a').overbid > 0); // sagt viel an, holt aber nichts
  assert.ok(stats.get('b').overbid < 0); // sagt nichts an, holt aber viel
});

test('aggregateProfileStats: Spieler ohne profileId werden ignoriert', () => {
  const g = game(
    'g',
    [{ profileId: 'alice' }, { profileId: null }],
    [round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 })],
  );
  const stats = aggregateProfileStats([g]);
  assert.equal(stats.size, 1);
  assert.ok(stats.has('alice'));
  assert.equal(stats.get('alice').gamesFinished, 1);
});

test('aggregateProfileStats: explizit angefragtes Profil ohne jedes Spiel liefert Nullen/null statt Fehler', () => {
  const stats = aggregateProfileStats([], ['ghost']);
  const ghost = stats.get('ghost');
  assert.ok(ghost);
  assert.equal(ghost.gamesTotal, 0);
  assert.equal(ghost.winRate, null);
  assert.equal(ghost.accuracy, null);
  assert.equal(ghost.bidIndex, null);
  assert.equal(ghost.bestRound, null);
  assert.equal(ghost.money.gamesPlayed, 0);
});

test('aggregateProfileStats: profileIds-Filter lässt andere Profile im Ergebnis weg', () => {
  const g = game(
    'g',
    [{ profileId: 'alice' }, { profileId: 'bob' }],
    [round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 })],
  );
  const stats = aggregateProfileStats([g], ['alice']);
  assert.equal(stats.size, 1);
  assert.ok(!stats.has('bob'));
});

test('aggregateProfileStats: bestRound/bestStreak nehmen das Maximum über alle Spiele, nicht die Summe', () => {
  const g1 = game('g1', [{ profileId: 'a' }, { profileId: 'b' }], [
    round(3, { p0: 3, p1: 0 }, { p0: 3, p1: 0 }), // a: +13, richtig (Serie 1)
    round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 }), // a: richtig (Serie 2 -> längste Serie dieses Spiels)
  ]);
  const g2 = game('g2', [{ profileId: 'a' }, { profileId: 'b' }], [
    round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 }), // a: richtig (Serie 1 in einem NEUEN Spiel)
  ]);
  const stats = aggregateProfileStats([g1, g2]);
  const a = stats.get('a');
  assert.equal(a.bestRound.score, 13);
  assert.equal(a.bestRound.gameId, 'g1');
  // g1 hat die längste Serie (2 Treffer am Stück); g2 startet unabhängig bei 1 —
  // Serien addieren sich nicht spielübergreifend, es zählt das Maximum.
  assert.equal(a.bestStreak, 2);
});

test('aggregateProfileStats: money wird über profileMoneyStats durchgereicht', () => {
  const g = game(
    'g',
    [{ profileId: 'a' }, { profileId: 'b' }],
    [round(1, { p0: 1, p1: 0 }, { p0: 1, p1: 0 })],
    { moneyEnabled: true, stake: 10, payoutMode: 'winner-takes-all' },
  );
  const stats = aggregateProfileStats([g]);
  const a = stats.get('a');
  assert.equal(a.money.gamesPlayed, 1);
  assert.equal(a.money.totalStake, 10);
  assert.equal(a.money.totalNet, 10); // gewinnt den ganzen Topf (20€) abzüglich eigenem Einsatz (10€)
});
