// names.js — lustige, alliterierende Spielernamen als Vorschläge.
// Bekannte & erfundene deutsche Namen, bei denen Vor- und Nachname mit
// demselben Buchstaben beginnen.
export const FUN_NAMES = [
  'Daniel Düsentrieb',
  'Donald Duck',
  'Micky Maus',
  'Max Mustermann',
  'Bibi Blocksberg',
  'Benjamin Blümchen',
  'Peter Pan',
  'Paulchen Panther',
  'Fritz Fuchs',
  'Gustav Gans',
  'Susi Sorglos',
  'Klaus Kleber',
  'Tina Turner',
  'Bertolt Brecht',
  'Willi Wacker',
  'Frieda Fröhlich',
  'Rudi Rüssel',
  'Carla Conrad',
  'Karl Kohl',
  'Lisa Lustig',
  'Nina Neumann',
  'Olli Ohnesorg',
  'Walter Wackelzahn',
  'Heidi Hummel',
  'Sven Sausewind',
  'Vera Vogel',
  'Mona Maus',
  'Gerda Grün',
  'Theo Tausendsassa',
  'Robin Rotkehlchen',
];

/**
 * Zufälligen lustigen Namen liefern, möglichst keinen aus `exclude`.
 * @param {string[]} [exclude] bereits vergebene Namen
 * @returns {string}
 */
export function randomName(exclude = []) {
  const pool = FUN_NAMES.filter((n) => !exclude.includes(n));
  const list = pool.length ? pool : FUN_NAMES;
  return list[Math.floor(Math.random() * list.length)];
}
