// profile-model.js — Spielerprofile als Fachlogik (rein, kein DOM, kein Firestore).
//
// Ein Profil ist die dauerhafte Identität eines Mitspielers über alle Spiele hinweg
// und die Grundlage für spielübergreifende Statistiken. Innerhalb eines Spiels bleibt
// `players[].id` die spielinterne ID (sie ist Schlüssel in rounds[].bids/tricks) —
// `players[].profileId` verweist zusätzlich auf das Profil.

import { identiconKey, randomSeed } from './identicon.js';

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/**
 * Name für Suche & Dublettenprüfung vereinheitlichen: Groß/Klein, Umlaute und
 * mehrfache Leerzeichen sollen keinen Unterschied machen ("Dülk" == "duelk").
 */
export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Neues Profil erzeugen (noch nicht gespeichert). Der Identicon-Seed ist
 * standardmäßig die Profil-ID — dadurch ist das Startbild automatisch eindeutig.
 * @param {{ name: string, seed?: string }} args
 */
export function createProfile({ name, seed }) {
  const id = uid();
  const usedSeed = seed || id;
  const now = Date.now();
  return {
    id,
    name: String(name).trim(),
    avatar: { type: 'identicon', seed: usedSeed, key: identiconKey(usedSeed) },
    createdAt: now,
    updatedAt: now,
  };
}

/** Identicon-Avatar mit garantiert noch nicht vergebenem Muster würfeln. */
export function rollUniqueIdenticon(profiles, exceptId = null) {
  const taken = new Set(
    profiles
      .filter((p) => p.id !== exceptId && p.avatar?.type === 'identicon')
      .map((p) => p.avatar.key),
  );
  // Bei 8 Farben × tausenden Mustern greift das praktisch immer im ersten Versuch;
  // die Schleife ist nur die Garantie, dass kein doppeltes Bild entstehen kann.
  for (let i = 0; i < 100; i++) {
    const seed = randomSeed();
    const key = identiconKey(seed);
    if (!taken.has(key)) return { type: 'identicon', seed, key };
  }
  throw new Error('Kein freies Identicon-Muster gefunden.');
}

/** Ist der Name schon vergeben? (case-/umlaut-unabhängig, optional ohne ein Profil) */
export function isNameTaken(profiles, name, exceptId = null) {
  const n = normalizeName(name);
  return profiles.some((p) => p.id !== exceptId && normalizeName(p.name) === n);
}

/**
 * Profile zu einer Sucheingabe finden — Treffer ab dem ersten Buchstaben.
 * Reihenfolge: erst Namen, die mit der Eingabe *beginnen*, dann solche, die sie
 * irgendwo enthalten; innerhalb beider Gruppen alphabetisch.
 * @param {object[]} profiles
 * @param {string} query leer ⇒ alle Profile
 * @param {{ excludeIds?: string[] }} [opts] z.B. bereits gewählte Mitspieler
 */
export function matchProfiles(profiles, query, { excludeIds = [] } = {}) {
  const skip = new Set(excludeIds);
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  const pool = profiles.filter((p) => !skip.has(p.id));
  const q = normalizeName(query || '');
  if (!q) return pool.sort(byName);

  const prefix = [];
  const contains = [];
  for (const p of pool) {
    const n = normalizeName(p.name);
    if (n.startsWith(q)) prefix.push(p);
    else if (n.includes(q)) contains.push(p);
  }
  return [...prefix.sort(byName), ...contains.sort(byName)];
}

/** Alle Spiele, in denen ein Profil mitspielt. */
export function gamesUsingProfile(games, profileId) {
  return games.filter((g) => g.players.some((p) => p.profileId === profileId));
}

/**
 * Spiele, in denen *beide* Profile sitzen. Solche Spiele lassen sich nicht
 * zusammenführen: zwei Sitzplätze mit eigenen Ansagen/Stichen können nicht zu
 * einer Person werden, ohne Punkte zu erfinden.
 */
export function findMergeConflicts(games, fromId, toId) {
  return games.filter(
    (g) =>
      g.players.some((p) => p.profileId === fromId) &&
      g.players.some((p) => p.profileId === toId),
  );
}

/**
 * Spieler eines Spiels von einem Profil auf ein anderes umhängen (Zusammenführen).
 * Mutiert `game` und lässt rounds[].bids/tricks unangetastet.
 * @returns {boolean} true, wenn etwas geändert wurde
 */
export function remapGameProfile(game, fromId, toId, toName) {
  let changed = false;
  for (const p of game.players) {
    if (p.profileId !== fromId) continue;
    p.profileId = toId;
    p.name = toName;
    changed = true;
  }
  return changed;
}

/**
 * Namen im Spiel an die Profile angleichen — das Profil ist die einzige Wahrheit,
 * auch rückwirkend in längst gespielten Runden.
 * @param {object} game mutiert
 * @param {Map<string, object>|Record<string, object>} byProfileId
 * @returns {boolean} true, wenn etwas geändert wurde
 */
export function applyProfileNames(game, byProfileId) {
  const lookup = byProfileId instanceof Map ? byProfileId : new Map(Object.entries(byProfileId));
  let changed = false;
  for (const p of game.players) {
    const profile = p.profileId ? lookup.get(p.profileId) : null;
    if (!profile || profile.name === p.name) continue;
    p.name = profile.name;
    changed = true;
  }
  return changed;
}

/**
 * Alle Spieler-Einträge aus Bestandsspielen, die noch kein Profil haben —
 * nach Name gruppiert, häufigste zuerst. Grundlage für „Alte Runden zuordnen".
 * @returns {{ name: string, count: number, entries: {gameId: string, playerId: string, gameName: string}[] }[]}
 */
export function unassignedPlayers(games) {
  const groups = new Map();
  for (const game of games) {
    for (const p of game.players) {
      if (p.profileId) continue;
      const key = normalizeName(p.name);
      if (!groups.has(key)) groups.set(key, { name: p.name, count: 0, entries: [] });
      const group = groups.get(key);
      group.count++;
      group.entries.push({ gameId: game.id, playerId: p.id, gameName: game.name });
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'),
  );
}

/**
 * Einem Spieler-Eintrag ein Profil zuweisen (Zuordnung von Bestandsdaten).
 * Mutiert `game`.
 * @returns {boolean} true, wenn etwas geändert wurde
 */
export function assignProfile(game, playerId, profile) {
  const p = game.players.find((x) => x.id === playerId);
  if (!p || (p.profileId === profile.id && p.name === profile.name)) return false;
  p.profileId = profile.id;
  p.name = profile.name;
  return true;
}
