// profile-stats.js — spielübergreifende Kennzahlen je Spielerprofil (rein,
// kein DOM). Läuft einmal über alle Spiele und speist sich ausschließlich aus
// den vorhandenen Pro-Spiel-Auswertungen in engine.js — hier wird nichts neu
// berechnet, nur über Spiele hinweg aufsummiert und dabei von der
// spielinternen `players[].id` auf die dauerhafte `profileId` umgehängt.
//
// Grundlage für zwei Ansichten in app.js: die „Bilanz"-Karte eines einzelnen
// Profils und die All-Time-Bestenliste (#/stats) über alle Profile.

import {
  standings,
  bidTrickTotals,
  accuracyStats,
  longestCorrectStreak,
  extremeRounds,
  moneyPayouts,
} from './engine.js';

/**
 * Ist ein Spiel vollständig gespielt? Nur dann sind Platzierung/Sieg
 * aussagekräftig — ein laufendes Spiel hat noch keinen "Endstand".
 */
function isFinished(game) {
  return game.rounds.length > 0 && game.rounds.every((r) => r.done);
}

/** Leerer Akkumulator für ein neu angetroffenes Profil. */
function emptyAccumulator() {
  return {
    gamesTotal: 0,
    gamesFinished: 0,
    wins: 0,
    sharedWins: 0,
    podiums: 0,
    lasts: 0,
    rankSum: 0, // Basis für avgRank (nur fertige Spiele)
    rankScoreSum: 0, // Basis für rankScore (nur fertige Spiele)
    rounds: 0,
    correct: 0,
    bidSum: 0,
    trickSum: 0,
    fairShareSum: 0,
    points: 0,
    bestGameTotal: null, // {total, gameId, gameName} — bestes Endergebnis, nur fertige Spiele
    bestRound: null, // {score, gameId, gameName, roundIndex}
    bestStreak: 0,
    moneyGamesPlayed: 0,
    moneyStake: 0,
    moneyNet: 0,
  };
}

/**
 * Rundet die rohen Summen eines Akkumulators zu den eigentlichen
 * Kennzahlen (Quoten/Indizes) herunter — `null` statt `0`/`NaN`, wo die
 * Datengrundlage fehlt, damit die UI "noch keine Daten" von "0 %" unterscheiden
 * kann.
 */
function finalize(acc, profileId) {
  const { gamesFinished, rounds, fairShareSum } = acc;
  return {
    profileId,
    gamesTotal: acc.gamesTotal,
    gamesFinished,
    wins: acc.wins,
    sharedWins: acc.sharedWins,
    podiums: acc.podiums,
    lasts: acc.lasts,
    winRate: gamesFinished > 0 ? acc.wins / gamesFinished : null,
    podiumRate: gamesFinished > 0 ? acc.podiums / gamesFinished : null,
    avgRank: gamesFinished > 0 ? acc.rankSum / gamesFinished : null,
    rankScore: gamesFinished > 0 ? acc.rankScoreSum / gamesFinished : null,
    rounds,
    correct: acc.correct,
    accuracy: rounds > 0 ? acc.correct / rounds : null,
    bidSum: acc.bidSum,
    trickSum: acc.trickSum,
    bidIndex: fairShareSum > 0 ? acc.bidSum / fairShareSum : null,
    trickIndex: fairShareSum > 0 ? acc.trickSum / fairShareSum : null,
    overbid:
      fairShareSum > 0 ? acc.bidSum / fairShareSum - acc.trickSum / fairShareSum : null,
    points: acc.points,
    pointsPerRound: rounds > 0 ? acc.points / rounds : null,
    bestGameTotal: acc.bestGameTotal,
    bestRound: acc.bestRound,
    bestStreak: acc.bestStreak,
    money: {
      gamesPlayed: acc.moneyGamesPlayed,
      totalStake: acc.moneyStake,
      totalNet: acc.moneyNet,
    },
  };
}

/**
 * Spielübergreifende Kennzahlen je Profil.
 * @param {object[]} games alle Spiele (fertige und laufende)
 * @param {string[]|null} [profileIds] nur diese Profile aggregieren; `null`
 *   (Standard) ⇒ jedes Profil, das in irgendeinem Spiel sitzt.
 * @returns {Map<string, object>} profileId -> Kennzahlen (siehe `finalize`)
 */
export function aggregateProfileStats(games, profileIds = null) {
  const wanted = profileIds ? new Set(profileIds) : null;
  const acc = new Map();
  const ensure = (id) => {
    if (!acc.has(id)) acc.set(id, emptyAccumulator());
    return acc.get(id);
  };

  for (const game of games) {
    const finished = isFinished(game);
    // Eine Person sitzt je Spiel höchstens auf einem Platz (zwei Sitzplätze
    // mit derselben profileId ließen sich nicht widerspruchsfrei verrechnen
    // — siehe findMergeConflicts/planNameAssignment in profile-model.js,
    // die genau das beim Zusammenführen/Zuordnen verhindern).
    const seatProfileIds = game.players
      .map((p) => p.profileId)
      .filter((id) => id && (!wanted || wanted.has(id)));
    if (!seatProfileIds.length) continue;

    const idToProfile = new Map(game.players.map((p) => [p.id, p.profileId]));
    for (const profileId of seatProfileIds) ensure(profileId).gamesTotal += 1;

    // Einmal pro Spiel berechnen, unten von beiden Blöcken genutzt — sonst
    // liefe standings() für dasselbe Spiel mehrfach über alle Runden.
    const { byPlayer, ranking } = standings(game);

    // ---- Platzierung: nur aus vollständig gespielten Spielen ----
    if (finished) {
      const maxRank = Math.max(...ranking.map((r) => r.rank));
      const winnerCount = ranking.filter((r) => r.rank === 1).length;
      const n = ranking.length;
      // "Podest" = oberstes Drittel MINUS Schlusslicht — "Top 3" wäre bei
      // wenigen Spielern bedeutungslos: in einer Zweier-Partie zählte sonst
      // auch der klar Verlierende (Rang 2) als Podestplatz, in einer
      // Dreier-Partie IMMER ausnahmslos jeder (Rang 1..3 = alle). Ab 4
      // Spielern verhält sich das wie das klassische "Top 3".
      const podiumCutoff = Math.min(3, n - 1);
      for (const entry of ranking) {
        const profileId = idToProfile.get(entry.playerId);
        if (!profileId || (wanted && !wanted.has(profileId))) continue;
        const a = ensure(profileId);
        a.gamesFinished += 1;
        a.rankSum += entry.rank;
        a.rankScoreSum += n > 1 ? 1 - (entry.rank - 1) / (n - 1) : 1;
        if (entry.rank === 1) {
          a.wins += 1;
          if (winnerCount > 1) a.sharedWins += 1;
        }
        if (entry.rank <= podiumCutoff) a.podiums += 1;
        // maxRank > 1 heißt: es gibt überhaupt einen von Rang 1 verschiedenen
        // letzten Platz. Teilen sich ausnahmslos alle Spieler Rang 1 (totaler
        // Gleichstand, maxRank === 1), ist niemand "Letzter" — sonst wäre
        // jeder in so einem Spiel gleichzeitig Sieger UND Schlusslicht.
        if (maxRank > 1 && entry.rank === maxRank) a.lasts += 1;

        const total = byPlayer[entry.playerId].total;
        if (!a.bestGameTotal || total > a.bestGameTotal.total) {
          a.bestGameTotal = { total, gameId: game.id, gameName: game.name };
        }
      }
    }

    // ---- Geld-Bilanz: wie profileMoneyStats(), aber einmal pro Spiel statt
    // einmal pro Profil berechnet (moneyPayouts() läuft sonst wiederholt
    // über dieselben Runden — bei vielen Profilen unnötig teuer). ----
    if (game.moneyEnabled && finished) {
      const payouts = moneyPayouts(game);
      for (const p of game.players) {
        const profileId = p.profileId;
        if (!profileId || (wanted && !wanted.has(profileId))) continue;
        const entry = payouts?.find((x) => x.playerId === p.id);
        if (!entry || entry.net == null) continue;
        const a = ensure(profileId);
        a.moneyGamesPlayed += 1;
        a.moneyStake += game.stake || 0;
        a.moneyNet += entry.net;
      }
    }

    // ---- Rundenstatistiken: aus jeder fertigen Runde, auch laufende Spiele ----
    const totals = bidTrickTotals(game);
    const accStats = accuracyStats(game);
    const streaks = longestCorrectStreak(game);
    const { best: bestRounds } = extremeRounds(game);

    for (const p of game.players) {
      const profileId = p.profileId;
      if (!profileId || (wanted && !wanted.has(profileId))) continue;
      const a = ensure(profileId);
      const t = totals[p.id];
      a.rounds += t.roundsPlayed;
      a.correct += accStats[p.id].correct;
      a.bidSum += t.bidSum;
      a.trickSum += t.trickSum;
      a.fairShareSum += t.fairShareSum;
      a.points += byPlayer[p.id].total;
      if (streaks[p.id] > a.bestStreak) a.bestStreak = streaks[p.id];
    }
    for (const round of bestRounds) {
      const profileId = idToProfile.get(round.playerId);
      if (!profileId || (wanted && !wanted.has(profileId))) continue;
      const a = ensure(profileId);
      if (!a.bestRound || round.score > a.bestRound.score) {
        a.bestRound = {
          score: round.score,
          gameId: game.id,
          gameName: game.name,
          roundIndex: round.roundIndex,
        };
      }
    }
  }

  // Explizit angefragte Profile immer im Ergebnis, auch ganz ohne ein
  // einziges Spiel — sonst müsste jede aufrufende Stelle zusätzlich zum
  // Map-Zugriff noch auf "gar nicht enthalten" prüfen.
  if (wanted) for (const id of wanted) ensure(id);

  const result = new Map();
  for (const [profileId, a] of acc) result.set(profileId, finalize(a, profileId));
  return result;
}
