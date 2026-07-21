// commentary.js — regelbasierter „Kommentator"-Text zur zuletzt gespielten
// Runde. Reine Textgenerierung aus engine.roundEvents(), keine KI, kein
// Netzwerk. Deterministisch pro Runde (gleiche Runde -> immer derselbe Text,
// auch bei den vielen Re-Renders durchs Live-Abo), damit der Kommentar beim
// Nachladen nicht ständig "flackert".

function pick(seed, variants) {
  return variants[((Math.floor(seed) % variants.length) + variants.length) % variants.length];
}

function fmtSigned(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function joinNames(entries) {
  return entries.map((e) => e.name).join(' und ');
}

/**
 * Baut den Kommentar-Text zu einer Runde aus ihren Fakten (siehe
 * engine.roundEvents). Gibt '' zurück, wenn keine Ereignisse vorliegen.
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
  const lines = [];

  // Eröffnung: Gesamtbild der Runde — nennt immer die Rundennummer, damit
  // klar ist, worauf sich der Kommentar bezieht.
  if (allCorrect && perPlayer.length > 1) {
    lines.push(pick(seed, [
      `Reihenschuss in Runde ${roundIndex + 1}! Alle ${perPlayer.length} Spieler lagen goldrichtig.`,
      `Kollektive Bestform: In Runde ${roundIndex + 1} hat wirklich jeder seine Ansage getroffen.`,
      `Chirurgische Präzision am ganzen Tisch — Runde ${roundIndex + 1} geht ohne einen einzigen Fehlgriff über die Bühne.`,
    ]));
  } else if (allWrong) {
    lines.push(pick(seed, [
      `Totales Chaos in Runde ${roundIndex + 1} — kein einziger Treffer am Tisch!`,
      `Runde ${roundIndex + 1} zum Vergessen: Niemand hat seine Ansage gehalten.`,
      `Da hat sich der ganze Tisch verschätzt — in Runde ${roundIndex + 1} lag niemand richtig.`,
    ]));
  } else {
    lines.push(pick(seed, [
      `Runde ${roundIndex + 1} ist durch — gemischtes Bild am Tisch.`,
      `Das war Runde ${roundIndex + 1}: nicht jeder hat's getroffen.`,
      `Zwischenstand nach Runde ${roundIndex + 1}:`,
    ]));
  }

  // Held der Runde (nur erwähnen, wenn es nicht eh schon "alle richtig" war).
  const hero = heroes[0];
  if (hero && !allCorrect) {
    const heroNames = joinNames(heroes);
    lines.push(pick(seed + 1, [
      `${heroNames} liest das Spiel wie ein Buch: ${hero.bid} angesagt, ${hero.tricks} geholt — ${fmtSigned(hero.score)} Punkte!`,
      `Chapeau, ${heroNames}! Ansage ${hero.bid}, genau ${hero.tricks} geholt — sauber eingetütet.`,
      `${heroNames} bleibt eiskalt und trifft die Ansage von ${hero.bid} exakt — ${fmtSigned(hero.score)} Punkte wandern aufs Konto.`,
    ]));
  }

  // Bösewicht der Runde (nur wenn nicht eh schon "allWrong" behandelt).
  const villain = villains[0];
  if (villain && !allWrong && villain.score < 0) {
    const villainNames = joinNames(villains);
    lines.push(pick(seed + 2, [
      `${villainNames} erwischt's dagegen kalt: ${villain.bid} angesagt, nur ${villain.tricks} geholt — bitter, ${fmtSigned(villain.score)} Punkte.`,
      `Das ging in die Hose: ${villainNames} verschätzt sich (${villain.bid} zu ${villain.tricks}) und rutscht ${Math.abs(villain.score)} Punkte in den Keller.`,
      `Für ${villainNames} lief's gar nicht: Ansage ${villain.bid}, am Ende nur ${villain.tricks} Stiche.`,
    ]));
  }

  // Nullansagen — die Königsdisziplin.
  for (const z of zeroBids) {
    const stichWort = z.tricks === 1 ? 'Stich' : 'Stiche';
    lines.push(
      z.tricks === 0
        ? pick(seed + 3, [
            `${z.name} traut sich die Null zu — und behält recht!`,
            `Mutig: ${z.name} sagt Null an und geht als Sieger vom Feld.`,
          ])
        : pick(seed + 4, [
            `${z.name} wagt die Null … und kassiert trotzdem ${z.tricks} ${stichWort}. Daneben.`,
            `Die Null von ${z.name} geht nicht auf — ${z.tricks} ${stichWort} zu viel.`,
          ]),
    );
  }

  // Tabellenführung.
  if (leaders.length && leadChanged) {
    const leaderNames = leaders.map((l) => l.name).join(' und ');
    lines.push(pick(seed + 5, [
      `Und das bedeutet: ${leaderNames} übernimmt die Tabellenführung!`,
      `Die Führung wechselt den Besitzer — ${leaderNames} liegt jetzt vorn!`,
    ]));
  }

  // Größter Aufstieg in der Platzierung.
  const bestClimb = climbers
    .filter((c) => c.rank < c.prevRank)
    .sort((a, b) => (a.prevRank - a.rank) - (b.prevRank - b.rank))
    .pop();
  if (bestClimb && bestClimb.prevRank - bestClimb.rank >= 2) {
    lines.push(pick(seed + 6, [
      `${bestClimb.name} klettert von Platz ${bestClimb.prevRank} auf Platz ${bestClimb.rank}!`,
      `Ordentlicher Sprung nach vorn für ${bestClimb.name}: Platz ${bestClimb.prevRank} → Platz ${bestClimb.rank}.`,
    ]));
  }

  if (!lines.length) {
    lines.push(`Runde ${roundIndex + 1} ist eingetütet — gemischtes Bild am Tisch, weiter geht's.`);
  }

  return lines.join(' ');
}
