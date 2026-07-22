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

function joinNames(entries) {
  return entries.map((e) => e.name).join(' und ');
}

function heroLine(seed, heroes) {
  const hero = heroes[0];
  const names = joinNames(heroes);
  return pick(seed, [
    `${names} liest das Spiel wie ein Buch: ${hero.bid} angesagt, ${hero.tricks} geholt — ${fmtSigned(hero.score)} Punkte!`,
    `Chapeau, ${names}! Ansage ${hero.bid}, genau ${hero.tricks} geholt — sauber eingetütet.`,
    `${names} bleibt eiskalt und trifft die Ansage von ${hero.bid} exakt — ${fmtSigned(hero.score)} Punkte wandern aufs Konto.`,
  ]);
}

function villainLine(seed, villains) {
  const villain = villains[0];
  const names = joinNames(villains);
  return pick(seed, [
    `${names} erwischt's dagegen kalt: ${villain.bid} angesagt, nur ${villain.tricks} geholt — bitter, ${fmtSigned(villain.score)} Punkte.`,
    `Das ging in die Hose: ${names} verschätzt sich (${villain.bid} zu ${villain.tricks}) und rutscht ${Math.abs(villain.score)} Punkte in den Keller.`,
    `Für ${names} lief's gar nicht: Ansage ${villain.bid}, am Ende nur ${villain.tricks} Stiche.`,
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
  const names = leaders.map((l) => l.name).join(' und ');
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

  if (heroes[0] && !allCorrect) {
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
