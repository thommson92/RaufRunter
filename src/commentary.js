// commentary.js — regelbasierter „Kommentator"-Text zur zuletzt gespielten
// Runde. Reine Textgenerierung aus engine.roundEvents(), keine KI, kein
// Netzwerk. Deterministisch pro Runde (gleiche Runde -> immer derselbe Text,
// auch bei den vielen Re-Renders durchs Live-Abo), damit der Kommentar beim
// Nachladen nicht ständig "flackert". Bewusst knapp: eine Eröffnung + höchstens
// zwei weitere Highlights, statt jedes Ereignis für jeden Spieler auszubuchstabieren.

const MAX_HIGHLIGHTS = 2;

function pick(seed, variants) {
  return variants[((Math.floor(seed) % variants.length) + variants.length) % variants.length];
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

/**
 * Baut den Kommentar-Text zu einer Runde aus ihren Fakten (siehe
 * engine.roundEvents). Gibt '' zurück, wenn keine Ereignisse vorliegen.
 * Eine Eröffnung + höchstens zwei weitere Highlights (Priorität: Held >
 * Bösewicht > Nullansagen > Führungswechsel > größter Aufstieg).
 * @param {ReturnType<import('./engine.js').roundEvents>} events
 * @returns {string}
 */
export function generateRoundCommentary(events) {
  if (!events) return '';
  const {
    roundIndex, perPlayer, heroes, villains, zeroBids,
    leaders, leadChanged, climbers, allCorrect, allWrong,
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

  // Kandidaten für die weiteren Highlights, in Prioritätsreihenfolge — davon
  // schaffen es höchstens MAX_HIGHLIGHTS in den fertigen Kommentar.
  const candidates = [];

  // heroes[0].correct reicht als Prüfung für die ganze Gruppe: bei mind. einer
  // richtigen Ansage im Tisch liegt der Bestscore (max ±) immer bei den
  // Richtigen (Punkteformel: −10+Stiche < +10+Stiche, Lücke größer als jede
  // mögliche Stichdifferenz). Ohne die Prüfung würde bei "allWrong" der am
  // wenigsten falsch Liegende fälschlich als Ansage-Treffer gefeiert.
  if (heroes[0] && !allCorrect && heroes[0].correct) {
    candidates.push(heroLine(seed + 1, heroes));
  }
  if (villains[0] && !allWrong && villains[0].score < 0) {
    candidates.push(villainLine(seed + 2, villains));
  }
  if (zeroBids.length) {
    candidates.push(zeroBidLine(seed + 3, zeroBids));
  }
  if (leaders.length && leadChanged) {
    candidates.push(leadLine(seed + 5, leaders));
  }
  const bestClimb = climbers
    .filter((c) => c.rank < c.prevRank)
    .sort((a, b) => (a.prevRank - a.rank) - (b.prevRank - b.rank))
    .pop();
  if (bestClimb && bestClimb.prevRank - bestClimb.rank >= 2) {
    candidates.push(climbLine(seed + 6, bestClimb));
  }

  const lines = [opener, ...candidates.slice(0, MAX_HIGHLIGHTS)];
  return lines.join(' ');
}
