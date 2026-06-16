import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FUN_NAMES, randomName } from '../src/names.js';

test('FUN_NAMES: nicht leer, alle eindeutig', () => {
  assert.ok(FUN_NAMES.length >= 10);
  assert.equal(new Set(FUN_NAMES).size, FUN_NAMES.length);
});

test('FUN_NAMES: Vor- und Nachname beginnen mit gleichem Buchstaben', () => {
  for (const name of FUN_NAMES) {
    const parts = name.split(' ');
    assert.equal(parts.length, 2, `"${name}" sollte aus genau zwei Wörtern bestehen`);
    const a = parts[0][0].toLowerCase();
    const b = parts[1][0].toLowerCase();
    assert.equal(a, b, `"${name}" ist nicht alliterierend (${a} ≠ ${b})`);
  }
});

test('randomName: liefert gültigen Namen', () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(FUN_NAMES.includes(randomName()));
  }
});

test('randomName: meidet ausgeschlossene Namen, solange möglich', () => {
  const exclude = FUN_NAMES.slice(0, FUN_NAMES.length - 1);
  // Nur ein Name übrig — muss dieser sein.
  for (let i = 0; i < 20; i++) {
    assert.equal(randomName(exclude), FUN_NAMES[FUN_NAMES.length - 1]);
  }
});
