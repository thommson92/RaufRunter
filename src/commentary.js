// commentary.js — regelbasierter „Kommentator"-Text zur zuletzt gespielten
// Runde. Reine Textgenerierung aus engine.roundEvents(), keine KI, kein
// Netzwerk. Deterministisch pro Runde (gleiche Runde -> immer derselbe Text,
// auch bei den vielen Re-Renders durchs Live-Abo), damit der Kommentar beim
// Nachladen nicht ständig "flackert". Bewusst knapp: eine Eröffnung + höchstens
// zwei weitere Highlights, statt jedes Ereignis für jeden Spieler auszubuchstabieren.
//
// Welche Themen es in die zwei Highlight-Plätze schaffen, ist NICHT mehr fest
// priorisiert (früher: immer Held vor Bösewicht vor Nullansage vor …), sondern
// wird pro Runde deterministisch durchgemischt (siehe shuffleKey) — sonst
// dominieren bei vielen gleichzeitig zutreffenden Themen immer dieselben zwei,
// und der Kommentar wiederholt sich über ein langes Spiel hinweg strukturell.

const MAX_HIGHLIGHTS = 2;
const STREAK_MIN = 3; // ab wie vielen Treffern/Fehlgriffen in Folge eine "Serie" erwähnenswert ist
const BIAS_MIN_ATTEMPTS = 3; // so viele Runden braucht's, bevor eine Ansage-Tendenz was aussagt
const BIAS_MIN_AVG = 1; // Ø-Abweichung (Stiche), ab der die Tendenz erwähnenswert ist
const RANK_MOVE_MIN = 2; // Mindest-Sprung in der Platzierung für Kletterer/Faller-Kommentar

function pick(seed, variants) {
  return variants[((Math.floor(seed) % variants.length) + variants.length) % variants.length];
}

// Feste Themen-IDs für den Streu-Schlüssel unten — unabhängig davon, in
// welcher Reihenfolge die Kandidaten pro Runde tatsächlich zutreffen (sonst
// würde ein früh im Code geprüftes Thema strukturell bevorzugt).
const TOPIC_IDS = {
  hero: 0, villain: 1, zeroBids: 2, hotStreak: 3, coldStreak: 4,
  dealerMalus: 5, bias: 6, wildMiss: 7, lead: 8, climb: 9, fall: 10,
};

/**
 * Deterministische Streuung aus (Rundennummer, Thema) — kein Anspruch an
 * kryptografische Zufallsqualität, nur daran, pro Runde eine andere
 * "Rangfolge" der Themen zu ergeben, damit übers Spiel hinweg alle zutreffenden
 * Themen mal an die Reihe kommen statt immer dieselben zwei zu gewinnen.
 */
function shuffleKey(roundIndex, topicId) {
  let h = (roundIndex * 2654435761 + topicId * 40503 + 1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function fmtSigned(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

// "A" | "A und B" | "A, B und C" — kein Oxford-Komma, letzte Verbindung immer "und".
function joinNames(entries) {
  const names = entries.map((e) => e.name);
  if (names.length <= 2) return names.join(' und ');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

function allSame(entries, key) {
  return entries.every((e) => e[key] === entries[0][key]);
}

// Ansage vs. gemachte Stiche ist nicht symmetrisch: "nur X gemacht" ergibt nur
// Sinn, wenn X kleiner als die Ansage ist. Bei zu vielen Stichen (X > Ansage)
// braucht es die Gegenrichtung, sonst liest sich "2 angesagt, nur 3 gemacht"
// wie ein Fehler im Text.
function trickPhrase(bid, tricks) {
  return tricks < bid ? `nur ${tricks} geholt` : `gleich ${tricks} abgeräumt`;
}

function tricksNoun(bid, tricks) {
  return tricks < bid ? `nur ${tricks} Stiche` : `gleich ${tricks} Stiche`;
}

function heroLine(seed, heroes) {
  const names = joinNames(heroes);
  const hero = heroes[0];
  if (heroes.length === 1) {
    return pick(seed, [
      `${names} liest das Spiel wie ein Buch: ${hero.bid} angesagt, ${hero.tricks} geholt — ${fmtSigned(hero.score)} Punkte!`,
      `Chapeau, ${names}! Ansage ${hero.bid}, genau ${hero.tricks} geholt — sauber eingetütet.`,
      `${names} bleibt eiskalt und trifft die Ansage von ${hero.bid} exakt — ${fmtSigned(hero.score)} Punkte wandern aufs Konto.`,
    ]);
  }
  // Gleicher Score heißt nicht zwingend gleiche Ansage/Stiche — Zahlen im
  // Plural nur nennen, wenn wirklich alle dieselbe Ansage und Stichzahl haben.
  if (allSame(heroes, 'bid') && allSame(heroes, 'tricks')) {
    return pick(seed, [
      `${names} lesen das Spiel wie ein Buch: ${hero.bid} angesagt, ${hero.tricks} geholt — je ${fmtSigned(hero.score)} Punkte!`,
      `Chapeau, ${names}! Ansage ${hero.bid}, genau ${hero.tricks} geholt — sauber eingetütet.`,
      `${names} bleiben eiskalt und treffen die Ansage von ${hero.bid} exakt.`,
    ]);
  }
  return pick(seed, [
    `${names} lesen das Spiel wie ein Buch und treffen ihre Ansage exakt — je ${fmtSigned(hero.score)} Punkte!`,
    `Chapeau, ${names}! Alle treffen ihre Ansage exakt — sauber eingetütet.`,
    `${names} bleiben eiskalt und treffen ihre Ansage exakt.`,
  ]);
}

function villainLine(seed, villains) {
  const names = joinNames(villains);
  const villain = villains[0];
  if (villains.length === 1) {
    return pick(seed, [
      `${names} erwischt's dagegen kalt: ${villain.bid} angesagt, ${trickPhrase(villain.bid, villain.tricks)} — bitter, ${fmtSigned(villain.score)} Punkte.`,
      `Das ging in die Hose: ${names} verschätzt sich (${villain.bid} zu ${villain.tricks}) und rutscht ${Math.abs(villain.score)} Punkte in den Keller.`,
      `Für ${names} lief's gar nicht: Ansage ${villain.bid}, am Ende ${tricksNoun(villain.bid, villain.tricks)}.`,
    ]);
  }
  if (allSame(villains, 'bid') && allSame(villains, 'tricks')) {
    return pick(seed, [
      `${names} erwischt's dagegen kalt: ${villain.bid} angesagt, ${trickPhrase(villain.bid, villain.tricks)} — bitter, je ${fmtSigned(villain.score)} Punkte.`,
      `Das ging in die Hose: ${names} verschätzen sich (${villain.bid} zu ${villain.tricks}) und rutschen ${Math.abs(villain.score)} Punkte in den Keller.`,
      `Für ${names} lief's gar nicht: Ansage ${villain.bid}, am Ende ${tricksNoun(villain.bid, villain.tricks)}.`,
    ]);
  }
  return pick(seed, [
    `${names} erwischt's dagegen kalt: alle verschätzen sich — bitter, je ${fmtSigned(villain.score)} Punkte.`,
    `Das ging in die Hose: ${names} verschätzen sich und rutschen ${Math.abs(villain.score)} Punkte in den Keller.`,
    `Für ${names} lief's gar nicht: Die Ansage geht bei allen daneben.`,
  ]);
}

// Nullansagen — die Königsdisziplin. Ein Satz für ALLE Treffer, ein Satz für
// ALLE Fehlschläge (nicht pro Spieler), damit der Kommentar bei mehreren
// Nullansagen in derselben Runde nicht zur Aufzählung wird.
function zeroBidLine(seed, zeroBids) {
  const hits = zeroBids.filter((z) => z.tricks === 0);
  const misses = zeroBids.filter((z) => z.tricks !== 0);
  if (hits.length && !misses.length) {
    const names = joinNames(hits);
    return hits.length > 1
      ? pick(seed, [
          `${names} trauen sich die Null zu — und behalten recht!`,
          `Doppelt mutig: ${names} sagen die Null an und treffen sie auch.`,
        ])
      : pick(seed, [
          `${names} traut sich die Null zu — und behält recht!`,
          `Mutig: ${names} sagt Null an und geht als Sieger vom Feld.`,
        ]);
  }
  if (misses.length && !hits.length) {
    const names = joinNames(misses);
    return misses.length > 1
      ? pick(seed, [
          `Die Nullansagen von ${names} gehen nicht auf.`,
          `${names} wagen die Null … und kassieren trotzdem Stiche. Daneben.`,
        ])
      : pick(seed, [
          `${names} wagt die Null … und kassiert trotzdem ${misses[0].tricks} Stich${misses[0].tricks === 1 ? '' : 'e'}. Daneben.`,
          `Die Null von ${names} geht nicht auf.`,
        ]);
  }
  // Gemischt: manche treffen die Null, andere nicht.
  return pick(seed, [
    `${joinNames(hits)} trifft die Null, bei ${joinNames(misses)} geht sie daneben.`,
  ]);
}

function leadLine(seed, leaders) {
  const names = joinNames(leaders);
  if (leaders.length > 1) {
    return pick(seed, [
      `Und das bedeutet: ${names} übernehmen die Tabellenführung!`,
      `Die Führung wechselt den Besitzer — ${names} liegen jetzt vorn!`,
    ]);
  }
  return pick(seed, [
    `Und das bedeutet: ${names} übernimmt die Tabellenführung!`,
    `Die Führung wechselt den Besitzer — ${names} liegt jetzt vorn!`,
  ]);
}

function climbLine(seed, climb) {
  return pick(seed, [
    `${climb.name} klettert von Platz ${climb.prevRank} auf Platz ${climb.rank}!`,
    `Ordentlicher Sprung nach vorn für ${climb.name}: Platz ${climb.prevRank} → Platz ${climb.rank}.`,
  ]);
}

function fallLine(seed, fall) {
  return pick(seed, [
    `${fall.name} rutscht von Platz ${fall.prevRank} auf Platz ${fall.rank} ab.`,
    `Bergab für ${fall.name}: Platz ${fall.prevRank} → Platz ${fall.rank}.`,
  ]);
}

// Wer hat gerade eine laufende Serie richtiger bzw. falscher Ansagen (mind.
// STREAK_MIN, endend genau in dieser Runde)? Gibt die Namen aller Spieler an
// der jeweils längsten Serie zurück — analog zu hero/villain kann das mehr
// als einer sein (z. B. zwei Spieler, die beide seit 3 Runden treffen).
function streakGroup(streaks, perPlayer, type) {
  const withStreak = perPlayer
    .map((e) => ({ ...e, streak: streaks[e.playerId] }))
    .filter((e) => e.streak && e.streak.type === type && e.streak.length >= STREAK_MIN);
  if (!withStreak.length) return null;
  const maxLen = Math.max(...withStreak.map((e) => e.streak.length));
  return { entries: withStreak.filter((e) => e.streak.length === maxLen), length: maxLen };
}

function hotStreakLine(seed, entries, length) {
  const names = joinNames(entries);
  if (entries.length > 1) {
    return pick(seed, [
      `${names} sind seit ${length} Runden am Stück richtig — richtig on fire!`,
      `${names} laufen heiß: schon ${length} Runden in Folge die Ansage getroffen.`,
    ]);
  }
  return pick(seed, [
    `${names} ist seit ${length} Runden am Stück richtig — richtig on fire!`,
    `${names} läuft heiß: schon ${length} Runden in Folge die Ansage getroffen.`,
    `${length} Treffer in Folge für ${names} — kaum zu stoppen gerade.`,
  ]);
}

function coldStreakLine(seed, entries, length) {
  const names = joinNames(entries);
  if (entries.length > 1) {
    return pick(seed, [
      `${names} stecken in einer Krise: schon ${length} Runden in Folge daneben.`,
      `Bei ${names} will's einfach nicht klappen — ${length} Fehlschätzungen am Stück.`,
    ]);
  }
  return pick(seed, [
    `${names} steckt in einer Krise: schon ${length} Runden in Folge daneben.`,
    `Bei ${names} will's einfach nicht klappen — ${length} Fehlschätzungen am Stück.`,
    `${length} Fehlgriffe in Folge für ${names} — Zeit für eine Pause?`,
  ]);
}

// Hat der Geber die verbotene Ansage (die "Falle") diese Runde überhaupt zu
// spüren bekommen — und wenn ja, trotzdem richtig gelegen oder nicht?
// Nur erwähnenswert, wenn die Falle wirklich griff (`bound`); ein Geber, bei
// dem sie diese Runde gar keine Rolle spielte, ist kein Kommentar wert.
function dealerMalusLine(seed, outcome) {
  const name = outcome.dealerName;
  if (outcome.correct) {
    return pick(seed, [
      `Und ${name} meistert als Geber die Ansage-Falle trotzdem!`,
      `Trotz Ansage-Zwang bleibt ${name} als Geber cool und trifft genau.`,
    ]);
  }
  return pick(seed, [
    `Die Ansage-Falle schnappt zu: Geber ${name} muss dran glauben.`,
    `${name} leidet als Geber unter der verbotenen Ansage — daneben.`,
  ]);
}

// Wer hat über mehrere Runden eine erkennbare Tendenz, sich zu unter- oder
// überschätzen? Nur den auffälligsten Fall nennen (nicht jede leichte
// Abweichung), sonst wirkt's wie eine Anklage statt wie ein Seitenhieb.
function pickBiasedPlayer(perPlayer, bias) {
  let best = null;
  for (const e of perPlayer) {
    const b = bias[e.playerId];
    if (!b || b.attempts < BIAS_MIN_ATTEMPTS || Math.abs(b.avgDiff) < BIAS_MIN_AVG) continue;
    if (!best || Math.abs(b.avgDiff) > Math.abs(bias[best.playerId].avgDiff)) best = e;
  }
  return best;
}

function biasLine(seed, name, avgDiff) {
  const rounded = Math.round(Math.abs(avgDiff) * 10) / 10;
  if (avgDiff > 0) {
    return pick(seed, [
      `Nebenbei: ${name} holt im Schnitt ${rounded} Stiche mehr als angesagt — trau dich ruhig mal an eine höhere Zahl!`,
      `${name} spielt auf Nummer sicher: im Schnitt ${rounded} Stiche mehr geholt als angesagt. Geht auch mutiger.`,
    ]);
  }
  return pick(seed, [
    `Nebenbei: ${name} sagt im Schnitt ${rounded} Stiche mehr an, als am Ende drin sind — vielleicht mal kleiner planen.`,
    `${name} greift gerne hoch: im Schnitt ${rounded} Stiche weniger geholt als angesagt.`,
  ]);
}

// Nicht jede falsche Ansage ist einen frechen Spruch wert — erst ab zwei
// Stichen Abweichung (siehe engine.roundEvents: wildMisses), sonst wirkt der
// Kommentar wie Spott über einen ganz normalen Fehlgriff.
function wildMissLine(seed, miss) {
  const { name, bid, tricks } = miss;
  return pick(seed, [
    `${name}, hast du blind angesagt? ${bid} zu ${tricks} — das war nicht knapp.`,
    `Brauchst du nochmal eine Regelauffrischung, ${name}? ${bid} angesagt, ${tricks} gemacht.`,
    `${name} verschätzt sich gewaltig: ${bid} angesagt, ${tricks} gemacht.`,
  ]);
}

/**
 * Baut den Kommentar-Text zu einer Runde aus ihren Fakten (siehe
 * engine.roundEvents). Gibt '' zurück, wenn keine Ereignisse vorliegen.
 * Eine Eröffnung + höchstens zwei weitere Highlights — WELCHE zwei, wird pro
 * Runde deterministisch durchgemischt (siehe shuffleKey), nicht mehr nach
 * fester Priorität ausgewählt.
 * @param {ReturnType<import('./engine.js').roundEvents>} events
 * @returns {string}
 */
export function generateRoundCommentary(events) {
  if (!events) return '';
  const {
    roundIndex, perPlayer, heroes, villains, zeroBids,
    leaders, leadChanged, climbers, allCorrect, allWrong,
    streaks = {}, dealerOutcome = null, bias = {}, wildMisses = [],
  } = events;
  const seed = roundIndex;

  // Eröffnung: Gesamtbild der Runde — nennt immer die Rundennummer, damit
  // klar ist, worauf sich der Kommentar bezieht.
  let opener;
  if (allCorrect && perPlayer.length > 1) {
    opener = pick(seed, [
      `Reihenschuss in Runde ${roundIndex + 1}! Alle ${perPlayer.length} Spieler lagen goldrichtig.`,
      `Kollektive Bestform: In Runde ${roundIndex + 1} hat wirklich jeder seine Ansage getroffen.`,
      `Chirurgische Präzision am ganzen Tisch — Runde ${roundIndex + 1} geht ohne einen einzigen Fehlgriff über die Bühne.`,
    ]);
  } else if (allWrong) {
    opener = pick(seed, [
      `Totales Chaos in Runde ${roundIndex + 1} — kein einziger Treffer am Tisch!`,
      `Runde ${roundIndex + 1} zum Vergessen: Niemand hat seine Ansage gehalten.`,
      `Da hat sich der ganze Tisch verschätzt — in Runde ${roundIndex + 1} lag niemand richtig.`,
    ]);
  } else {
    opener = pick(seed, [
      `Runde ${roundIndex + 1} ist durch — gemischtes Bild am Tisch.`,
      `Das war Runde ${roundIndex + 1}: nicht jeder hat's getroffen.`,
      `Zwischenstand nach Runde ${roundIndex + 1}:`,
    ]);
  }

  // Kandidaten für die weiteren Highlights — alle Themen, die diese Runde
  // zutreffen, mit fester Themen-ID. Welche zwei es in den Text schaffen,
  // entscheidet die Streuung unten, nicht die Reihenfolge hier.
  const candidates = [];

  // heroes[0].correct reicht als Prüfung für die ganze Gruppe: bei mind. einer
  // richtigen Ansage im Tisch liegt der Bestscore (max ±) immer bei den
  // Richtigen (Punkteformel: −10+Stiche < +10+Stiche, Lücke größer als jede
  // mögliche Stichdifferenz). Ohne die Prüfung würde bei "allWrong" der am
  // wenigsten falsch Liegende fälschlich als Ansage-Treffer gefeiert.
  if (heroes[0] && !allCorrect && heroes[0].correct) {
    candidates.push({ topic: 'hero', text: heroLine(seed + 1, heroes) });
  }
  if (villains[0] && !allWrong && villains[0].score < 0) {
    candidates.push({ topic: 'villain', text: villainLine(seed + 2, villains) });
  }
  if (zeroBids.length) {
    candidates.push({ topic: 'zeroBids', text: zeroBidLine(seed + 3, zeroBids) });
  }
  const hotGroup = streakGroup(streaks, perPlayer, 'correct');
  if (hotGroup) {
    candidates.push({ topic: 'hotStreak', text: hotStreakLine(seed + 4, hotGroup.entries, hotGroup.length) });
  }
  const coldGroup = streakGroup(streaks, perPlayer, 'wrong');
  if (coldGroup) {
    candidates.push({ topic: 'coldStreak', text: coldStreakLine(seed + 7, coldGroup.entries, coldGroup.length) });
  }
  if (dealerOutcome && dealerOutcome.bound) {
    candidates.push({ topic: 'dealerMalus', text: dealerMalusLine(seed + 8, dealerOutcome) });
  }
  const biasedPlayer = pickBiasedPlayer(perPlayer, bias);
  if (biasedPlayer) {
    candidates.push({ topic: 'bias', text: biasLine(seed + 9, biasedPlayer.name, bias[biasedPlayer.playerId].avgDiff) });
  }
  if (wildMisses.length) {
    const worstMiss = [...wildMisses].sort(
      (a, b) => Math.abs(b.bid - b.tricks) - Math.abs(a.bid - a.tricks),
    )[0];
    candidates.push({ topic: 'wildMiss', text: wildMissLine(seed + 10, worstMiss) });
  }
  if (leaders.length && leadChanged) {
    candidates.push({ topic: 'lead', text: leadLine(seed + 5, leaders) });
  }
  const bestClimb = climbers
    .filter((c) => c.rank < c.prevRank)
    .sort((a, b) => (a.prevRank - a.rank) - (b.prevRank - b.rank))
    .pop();
  if (bestClimb && bestClimb.prevRank - bestClimb.rank >= RANK_MOVE_MIN) {
    candidates.push({ topic: 'climb', text: climbLine(seed + 6, bestClimb) });
  }
  const bestFall = climbers
    .filter((c) => c.rank > c.prevRank)
    .sort((a, b) => (a.rank - a.prevRank) - (b.rank - b.prevRank))
    .pop();
  if (bestFall && bestFall.rank - bestFall.prevRank >= RANK_MOVE_MIN) {
    candidates.push({ topic: 'fall', text: fallLine(seed + 11, bestFall) });
  }

  const chosen = [...candidates]
    .sort((a, b) => shuffleKey(seed, TOPIC_IDS[a.topic]) - shuffleKey(seed, TOPIC_IDS[b.topic]))
    .slice(0, MAX_HIGHLIGHTS)
    .map((c) => c.text);

  const lines = [opener, ...chosen];
  return lines.join(' ');
}
