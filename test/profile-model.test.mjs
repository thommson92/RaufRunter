import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName,
  createProfile,
  rollUniqueIdenticon,
  isNameTaken,
  matchProfiles,
  gamesUsingProfile,
  findMergeConflicts,
  remapGameProfile,
  applyProfileNames,
  unassignedPlayers,
  assignProfile,
  planNameAssignment,
} from '../src/profile-model.js';

const profile = (id, name) => ({ id, name, avatar: { type: 'identicon', seed: id, key: id } });

/** Minimales Spiel mit einer fertigen Runde, um Punktedaten mitzuprüfen. */
function game(id, name, players) {
  return {
    id,
    name,
    players: players.map((p, i) => ({ id: 'p' + i, seatOrder: i, ...p })),
    rounds: [
      {
        index: 0,
        cardCount: 1,
        bids: Object.fromEntries(players.map((_, i) => ['p' + i, i % 2])),
        tricks: Object.fromEntries(players.map((_, i) => ['p' + i, i % 2])),
        done: true,
      },
    ],
  };
}

test('normalizeName ignoriert Groß/Klein, Umlaute und Doppel-Leerzeichen', () => {
  assert.equal(normalizeName('Dülk'), 'duelk');
  assert.equal(normalizeName('  Michi   Milde '), 'michi milde');
  assert.equal(normalizeName('Straße'), 'strasse');
  assert.equal(normalizeName('TOMMI'), normalizeName('tommi'));
});

test('createProfile trimmt den Namen und vergibt ein Identicon aus der ID', () => {
  const p = createProfile({ name: '  Tommi ' });
  assert.equal(p.name, 'Tommi');
  assert.equal(p.avatar.type, 'identicon');
  assert.equal(p.avatar.seed, p.id);
  assert.ok(p.avatar.key);
  assert.ok(p.createdAt > 0);
});

test('createProfile vergibt eindeutige IDs', () => {
  const ids = new Set(Array.from({ length: 200 }, () => createProfile({ name: 'x' }).id));
  assert.equal(ids.size, 200);
});

test('rollUniqueIdenticon vermeidet bereits vergebene Muster', () => {
  const existing = Array.from({ length: 50 }, (_, i) => createProfile({ name: 'p' + i }));
  const avatar = rollUniqueIdenticon(existing);
  assert.equal(avatar.type, 'identicon');
  assert.ok(!existing.some((p) => p.avatar.key === avatar.key));
});

test('isNameTaken erkennt Dubletten unabhängig von Schreibweise', () => {
  const profiles = [profile('a', 'Tommi'), profile('b', 'Dülk')];
  assert.equal(isNameTaken(profiles, 'tommi'), true);
  assert.equal(isNameTaken(profiles, 'DUELK'), true);
  assert.equal(isNameTaken(profiles, 'Darchi'), false);
  // Beim Umbenennen darf das eigene Profil nicht als Dublette zählen.
  assert.equal(isNameTaken(profiles, 'Tommi', 'a'), false);
});

test('matchProfiles findet ab dem ersten Buchstaben, Präfixtreffer zuerst', () => {
  const profiles = [
    profile('1', 'Schuulsen'),
    profile('2', 'Schreier'),
    profile('3', 'Blacky'),
    profile('4', 'Maschine'),
  ];
  assert.deepEqual(
    matchProfiles(profiles, 'S').map((p) => p.name),
    ['Schreier', 'Schuulsen', 'Maschine'],
  );
  assert.deepEqual(
    matchProfiles(profiles, 'sch').map((p) => p.name),
    ['Schreier', 'Schuulsen', 'Maschine'],
  );
  assert.deepEqual(matchProfiles(profiles, 'xyz'), []);
});

test('matchProfiles ohne Eingabe liefert alle alphabetisch, ausgeschlossene fehlen', () => {
  const profiles = [profile('1', 'Tommi'), profile('2', 'Blacky'), profile('3', 'Darchi')];
  assert.deepEqual(
    matchProfiles(profiles, '').map((p) => p.name),
    ['Blacky', 'Darchi', 'Tommi'],
  );
  assert.deepEqual(
    matchProfiles(profiles, '', { excludeIds: ['2'] }).map((p) => p.name),
    ['Darchi', 'Tommi'],
  );
});

test('gamesUsingProfile listet nur Spiele mit diesem Profil', () => {
  const games = [
    game('g1', 'Abend 1', [{ profileId: 'a', name: 'Tommi' }, { profileId: 'b', name: 'Lisa' }]),
    game('g2', 'Abend 2', [{ profileId: 'b', name: 'Lisa' }, { profileId: 'c', name: 'Resi' }]),
  ];
  assert.deepEqual(
    gamesUsingProfile(games, 'b').map((g) => g.id),
    ['g1', 'g2'],
  );
  assert.deepEqual(gamesUsingProfile(games, 'zzz'), []);
});

test('findMergeConflicts meldet Spiele, in denen beide Profile sitzen', () => {
  const games = [
    game('g1', 'Konflikt', [{ profileId: 'a', name: 'Tommi' }, { profileId: 'b', name: 'Dimmes' }]),
    game('g2', 'Ok', [{ profileId: 'a', name: 'Tommi' }, { profileId: 'c', name: 'Lisa' }]),
  ];
  assert.deepEqual(
    findMergeConflicts(games, 'b', 'a').map((g) => g.id),
    ['g1'],
  );
  assert.deepEqual(findMergeConflicts(games, 'c', 'b'), []);
});

test('remapGameProfile hängt um und lässt Ansagen/Stiche unberührt', () => {
  const g = game('g1', 'Abend', [
    { profileId: 'dimmes', name: 'Dimmes' },
    { profileId: 'lisa', name: 'Lisa' },
  ]);
  const bidsBefore = JSON.stringify(g.rounds[0].bids);
  const tricksBefore = JSON.stringify(g.rounds[0].tricks);

  assert.equal(remapGameProfile(g, 'dimmes', 'tommi', 'Tommi'), true);
  assert.equal(g.players[0].profileId, 'tommi');
  assert.equal(g.players[0].name, 'Tommi');
  assert.equal(g.players[0].id, 'p0', 'spielinterne ID bleibt erhalten');
  assert.equal(g.players[1].name, 'Lisa');
  assert.equal(JSON.stringify(g.rounds[0].bids), bidsBefore);
  assert.equal(JSON.stringify(g.rounds[0].tricks), tricksBefore);

  assert.equal(remapGameProfile(g, 'dimmes', 'tommi', 'Tommi'), false, 'zweiter Lauf ändert nichts');
});

test('applyProfileNames zieht Namen aus den Profilen nach', () => {
  const g = game('g1', 'Abend', [
    { profileId: 'a', name: 'Jonny' },
    { profileId: 'b', name: 'Lisa' },
    { name: 'Gast ohne Profil' },
  ]);
  const byId = new Map([
    ['a', profile('a', 'Johnny')],
    ['b', profile('b', 'Lisa')],
  ]);

  assert.equal(applyProfileNames(g, byId), true);
  assert.equal(g.players[0].name, 'Johnny');
  assert.equal(g.players[1].name, 'Lisa');
  assert.equal(g.players[2].name, 'Gast ohne Profil', 'ohne Profil unverändert');
  assert.equal(applyProfileNames(g, byId), false, 'idempotent');
});

test('unassignedPlayers gruppiert nach Name, häufigste zuerst', () => {
  const games = [
    game('g1', 'Abend 1', [{ name: 'Tommi' }, { name: 'Lisa' }]),
    game('g2', 'Abend 2', [{ name: 'tommi' }, { profileId: 'x', name: 'Resi' }]),
    game('g3', 'Abend 3', [{ name: 'Tommi' }, { name: 'Dülk' }]),
  ];
  const groups = unassignedPlayers(games);
  assert.deepEqual(
    groups.map((g) => [g.name, g.count]),
    [
      ['Tommi', 3],
      ['Dülk', 1],
      ['Lisa', 1],
    ],
  );
  assert.deepEqual(
    groups[0].entries.map((e) => e.gameId),
    ['g1', 'g2', 'g3'],
  );
  assert.ok(!groups.some((g) => g.name === 'Resi'), 'zugeordnete Spieler fehlen');
});

test('assignProfile setzt Profil und Name am richtigen Sitzplatz', () => {
  const g = game('g1', 'Abend', [{ name: 'Dimmes' }, { name: 'Lisa' }]);
  assert.equal(assignProfile(g, 'p0', profile('tommi', 'Tommi')), true);
  assert.equal(g.players[0].profileId, 'tommi');
  assert.equal(g.players[0].name, 'Tommi');
  assert.equal(g.players[1].profileId, undefined);
  assert.equal(assignProfile(g, 'p0', profile('tommi', 'Tommi')), false, 'idempotent');
  assert.equal(assignProfile(g, 'gibtsnicht', profile('tommi', 'Tommi')), false);
});

test('normalizeName versteht auch zerlegte Umlaute (NFD von macOS/iOS)', () => {
  const nfd = 'Du\u0308lk'; // "u" + kombinierendes Trema
  assert.notEqual(nfd, 'Dülk', 'Testvoraussetzung: verschiedene Byte-Folgen');
  assert.equal(normalizeName(nfd), 'duelk');
  assert.equal(isNameTaken([profile('a', 'Dülk')], nfd), true);
});

test('matchProfiles findet Umlaute unabhängig von der Schreibweise der Eingabe', () => {
  const profiles = [profile('1', 'Dülk'), profile('2', 'Duo')];
  assert.deepEqual(matchProfiles(profiles, 'DÜ').map((p) => p.name), ['Dülk']);
  assert.deepEqual(matchProfiles(profiles, 'due').map((p) => p.name), ['Dülk']);
  assert.deepEqual(matchProfiles(profiles, 'du').map((p) => p.name), ['Dülk', 'Duo']);
});

test('matchProfiles mutiert die Eingabeliste nicht', () => {
  const profiles = [profile('1', 'Tommi'), profile('2', 'Blacky')];
  const before = profiles.map((p) => p.id);
  matchProfiles(profiles, '');
  assert.deepEqual(profiles.map((p) => p.id), before);
});

test('unassignedPlayers gruppiert verschiedene Schreibweisen und merkt sich den Sitzplatz', () => {
  const games = [game('g1', 'Abend', [{ name: 'Dülk' }, { name: 'duelk' }])];
  const [group] = unassignedPlayers(games);
  assert.equal(group.count, 2, 'Dülk und duelk sind dieselbe Gruppe');
  assert.deepEqual(group.entries.map((e) => e.playerId), ['p0', 'p1']);
});

test('planNameAssignment ordnet alle Runden einer Namensgruppe zu', () => {
  const games = [
    game('g1', 'Abend 1', [{ name: 'Dimmes' }, { name: 'Lisa' }]),
    game('g2', 'Abend 2', [{ name: 'dimmes' }, { name: 'Resi' }]),
  ];
  const tommi = profile('tommi', 'Tommi');
  const plan = planNameAssignment(games, 'Dimmes', tommi);

  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.touched.map((g) => g.id), ['g1', 'g2']);
  assert.equal(games[0].players[0].profileId, 'tommi');
  assert.equal(games[0].players[0].name, 'Tommi');
  assert.equal(games[1].players[0].name, 'Tommi');
  assert.equal(games[0].players[1].profileId, undefined, 'andere Sitze unberührt');
});

test('planNameAssignment verweigert, wenn das Profil im Spiel schon sitzt', () => {
  // „Tommi" hat ein Profil, „Dimmes" nicht — beide im selben Spiel. Beide auf
  // dasselbe Profil zu legen hieße: eine Person auf zwei Sitzplätzen, mit je
  // eigenen Ansagen und Stichen.
  const games = [
    game('g1', 'Abend', [{ profileId: 'tommi', name: 'Tommi' }, { name: 'Dimmes' }]),
  ];
  const plan = planNameAssignment(games, 'Dimmes', profile('tommi', 'Tommi'));

  assert.deepEqual(plan.conflicts.map((g) => g.id), ['g1']);
  assert.deepEqual(plan.touched, [], 'alles oder nichts');
  assert.equal(games[0].players[1].profileId, undefined, 'nichts verändert');
});

test('planNameAssignment verweigert zwei gleichnamige Spieler in einem Spiel', () => {
  const games = [game('g1', 'Abend', [{ name: 'Tommi' }, { name: 'tommi' }])];
  const plan = planNameAssignment(games, 'Tommi', profile('t', 'Tommi'));

  assert.deepEqual(plan.conflicts.map((g) => g.id), ['g1']);
  assert.deepEqual(plan.touched, []);
  assert.ok(games[0].players.every((p) => p.profileId === undefined));
});

test('planNameAssignment lässt saubere Spiele in Ruhe, wenn ein anderes kollidiert', () => {
  const games = [
    game('g1', 'Konflikt', [{ profileId: 't', name: 'Tommi' }, { name: 'Dimmes' }]),
    game('g2', 'Sauber', [{ name: 'Dimmes' }, { name: 'Lisa' }]),
  ];
  const plan = planNameAssignment(games, 'Dimmes', profile('t', 'Tommi'));

  assert.deepEqual(plan.conflicts.map((g) => g.id), ['g1']);
  assert.deepEqual(plan.touched, [], 'kein Teilerfolg');
  assert.equal(games[1].players[0].profileId, undefined);
});

test('planNameAssignment bei unbekanntem Namen tut nichts', () => {
  const games = [game('g1', 'Abend', [{ name: 'Lisa' }])];
  const plan = planNameAssignment(games, 'GibtEsNicht', profile('t', 'Tommi'));
  assert.deepEqual(plan, { touched: [], conflicts: [] });
});

test('applyProfileNames friert den Namen ein, wenn das Profil fehlt', () => {
  const g = game('g1', 'Abend', [{ profileId: 'geloescht', name: 'Tommi' }]);
  assert.equal(applyProfileNames(g, new Map()), false);
  assert.equal(g.players[0].name, 'Tommi');
});

test('findMergeConflicts erwartet zwei echte Profil-IDs', () => {
  const games = [game('g1', 'Abend', [{ profileId: 'a', name: 'Tommi' }, { name: 'Gast' }])];
  // Ein Profil mit sich selbst zusammenzuführen ist trivialerweise ein Konflikt;
  // der Aufrufer fängt den Fall vorher ab (mergeProfiles).
  assert.deepEqual(findMergeConflicts(games, 'a', 'a').map((g) => g.id), ['g1']);
  // Spieler ohne Profil zählen nicht mit, solange echte IDs übergeben werden.
  assert.deepEqual(findMergeConflicts(games, 'a', 'b'), []);
});

test('createProfile übernimmt einen vorgegebenen Seed', () => {
  const p = createProfile({ name: 'Tommi', seed: 'fester-seed' });
  assert.equal(p.avatar.seed, 'fester-seed');
  assert.equal(createProfile({ name: 'X', seed: 'fester-seed' }).avatar.key, p.avatar.key);
});

test('rollUniqueIdenticon darf das eigene Muster wiederverwenden', () => {
  const me = createProfile({ name: 'Ich' });
  // Nur das eigene Muster ist vergeben -> exceptId muss es freigeben.
  const avatar = rollUniqueIdenticon([me], me.id);
  assert.equal(avatar.type, 'identicon');
});

test('isNameTaken ignoriert umgebende Leerzeichen', () => {
  assert.equal(isNameTaken([profile('a', 'Tommi')], '  Tommi  '), true);
  assert.equal(isNameTaken([profile('a', 'Tommi')], ''), false);
});
