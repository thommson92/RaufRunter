import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identiconPattern,
  identiconKey,
  identiconSvg,
  randomSeed,
  IDENTICON_COLORS,
} from '../src/identicon.js';

test('gleicher Seed liefert immer dasselbe Muster', () => {
  assert.deepEqual(identiconPattern('abc'), identiconPattern('abc'));
  assert.equal(identiconKey('abc'), identiconKey('abc'));
  assert.equal(identiconSvg('abc'), identiconSvg('abc'));
});

test('verschiedene Seeds liefern verschiedene Muster', () => {
  assert.notDeepEqual(identiconPattern('abc'), identiconPattern('abd'));
});

test('Muster hat 15 Zellen (linke Hälfte inkl. Mittelspalte) und gültigen Farbindex', () => {
  for (const seed of ['a', 'tommi', 'schuulsen', '12345']) {
    const { cells, colorIndex } = identiconPattern(seed);
    assert.equal(cells.length, 15);
    assert.ok(cells.every((c) => typeof c === 'boolean'));
    assert.ok(colorIndex >= 0 && colorIndex < IDENTICON_COLORS.length);
  }
});

test('Muster ist nie fast leer oder fast voll', () => {
  for (let i = 0; i < 2000; i++) {
    const { cells } = identiconPattern('seed-' + i);
    // Mittelspalte (Index % 3 === 2) zählt einfach, die übrigen gespiegelt doppelt.
    const filled = cells.reduce((sum, on, idx) => (on ? sum + (idx % 3 === 2 ? 1 : 2) : sum), 0);
    assert.ok(filled >= 7 && filled <= 18, `Seed ${i}: ${filled} gefüllte Kacheln`);
  }
});

test('SVG ist links/rechts gespiegelt', () => {
  const svg = identiconSvg('spiegel');
  const xs = [...svg.matchAll(/<rect x="(\d)" y="(\d)"/g)].map((m) => `${m[1]},${m[2]}`);
  const set = new Set(xs);
  for (const cell of set) {
    const [x, y] = cell.split(',').map(Number);
    // Muster liegt bei x = 1..5, Spiegelachse ist x = 3.
    assert.ok(set.has(`${6 - x},${y}`), `Gegenstück zu ${cell} fehlt`);
  }
});

test('SVG enthält Größe und genau eine Musterfarbe', () => {
  const svg = identiconSvg('farbe', 96);
  assert.match(svg, /width="96" height="96"/);
  const colors = new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
  colors.delete('#0f172a'); // Hintergrund
  assert.equal(colors.size, 1);
  assert.ok(IDENTICON_COLORS.includes([...colors][0]));
});

test('Musterraum ist groß genug für viele Profile', () => {
  const keys = new Set();
  const total = 5000;
  for (let i = 0; i < total; i++) keys.add(identiconKey(randomSeed()));
  // Sanity-Check gegen einen degenerierten Hash. Ein paar Kollisionen sind bei
  // 5000 Ziehungen statistisch normal (Geburtstagsparadoxon, Musterraum ~2·10⁵);
  // die echte Eindeutigkeitsgarantie liefert rollUniqueIdenticon().
  assert.ok(keys.size > total * 0.96, `nur ${keys.size} verschiedene Keys von ${total}`);
});

test('randomSeed liefert unterschiedliche Werte', () => {
  const seeds = new Set(Array.from({ length: 100 }, randomSeed));
  assert.ok(seeds.size > 95);
});
