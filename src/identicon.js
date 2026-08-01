// identicon.js — generierte Profilbilder im GitHub-Stil, deterministisch aus einem Seed.
// Bewusst selbst gerechnet statt über einen Dienst wie DiceBear: kein externer
// Request, damit die PWA auch offline Avatare zeichnen kann.
//
// Reines Modul (kein DOM) — liefert Muster-Daten und einen SVG-String.

/** Farben der Kacheln — muss zu --series-1..8 in styles.css passen. */
export const IDENTICON_COLORS = [
  '#3987e5',
  '#199e70',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
];

const GRID = 5; // 5×5 Kacheln
const HALF = 3; // Spalten 0..2 werden gewürfelt, 3 & 4 spiegeln 1 & 0

// Wie viele der 25 sichtbaren Kacheln gefüllt sein dürfen. Fast leere oder fast
// volle Muster sehen sich alle ähnlich — solche Würfe werden verworfen.
const MIN_FILLED = 7;
const MAX_FILLED = 18;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Kleiner PRNG (mulberry32) — gleicher Startwert ⇒ gleiche Folge. */
function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Muster zu einem Seed.
 * @param {string} seed
 * @returns {{ cells: boolean[], colorIndex: number }} `cells` hat GRID*HALF
 *   Einträge (zeilenweise, nur die linke Hälfte inkl. Mittelspalte).
 */
export function identiconPattern(seed) {
  const next = mulberry32(fnv1a(String(seed)));
  let cells;
  let filled;
  do {
    cells = [];
    filled = 0;
    for (let i = 0; i < GRID * HALF; i++) {
      const on = next() < 0.5;
      cells.push(on);
      // Mittelspalte (col === HALF-1) erscheint einmal, die anderen gespiegelt zweimal.
      if (on) filled += i % HALF === HALF - 1 ? 1 : 2;
    }
  } while (filled < MIN_FILLED || filled > MAX_FILLED);
  return { cells, colorIndex: Math.floor(next() * IDENTICON_COLORS.length) };
}

/**
 * Kurzer, stabiler Schlüssel für ein Muster — zwei Profile mit gleichem Key
 * sähen identisch aus. Wird beim Speichern eines Profils auf Eindeutigkeit
 * geprüft (siehe profile-model.js).
 * @param {string} seed
 * @returns {string}
 */
export function identiconKey(seed) {
  const { cells, colorIndex } = identiconPattern(seed);
  const bits = cells.reduce((acc, on, i) => (on ? acc + 2 ** i : acc), 0);
  return `${bits.toString(36)}-${colorIndex}`;
}

/**
 * Identicon als SVG-String (direkt in innerHTML einsetzbar).
 * @param {string} seed
 * @param {number} [size] Kantenlänge in px
 */
export function identiconSvg(seed, size = 48) {
  const { cells, colorIndex } = identiconPattern(seed);
  const color = IDENTICON_COLORS[colorIndex];
  const rects = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      // Rechte Hälfte spiegelt die linke: Spalte 3 ⇒ 1, Spalte 4 ⇒ 0.
      const src = col < HALF ? col : GRID - 1 - col;
      if (!cells[row * HALF + src]) continue;
      rects.push(`<rect x="${col + 1}" y="${row + 1}" width="1" height="1" fill="${color}"/>`);
    }
  }
  // viewBox 7×7 = 5×5 Muster mit einer Kachel Rand ringsum.
  return (
    `<svg class="avatar-img" viewBox="0 0 7 7" width="${size}" height="${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-hidden="true">` +
    `<rect width="7" height="7" fill="#0f172a"/>${rects.join('')}</svg>`
  );
}

/** Zufälliger Seed für „🎲 neu würfeln". */
export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}
