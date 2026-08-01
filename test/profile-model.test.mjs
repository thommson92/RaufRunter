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

test('applyProfileNames akzeptiert auch ein einfaches Objekt', () => {
  const g = game('g1', 'Abend', [{ profileId: 'a', name: 'alt' }]);
  assert.equal(applyProfileNames(g, { a: profile('a', 'Neu') }), true);
  assert.equal(g.players[0].name, 'Neu');
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
