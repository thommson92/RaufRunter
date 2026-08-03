import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ZOOM,
  coverScale,
  clampView,
  initialView,
  sourceRect,
  zoomAround,
  panBy,
} from '../src/crop-model.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test('coverScale: Querformat wird auf die Höhe skaliert', () => {
  assert.equal(coverScale(2000, 1000, 256), 256 / 1000);
});

test('coverScale: Hochformat wird auf die Breite skaliert', () => {
  assert.equal(coverScale(1000, 2000, 256), 256 / 1000);
});

test('coverScale: Quadrat — beide Kanten gleich', () => {
  assert.equal(coverScale(800, 800, 256), 256 / 800);
});

test('initialView zentriert das Bild bei minimalem Zoom (beide Achsen)', () => {
  const view = initialView({ imgW: 1000, imgH: 2000, viewport: 256 });
  approx(view.scale, coverScale(1000, 2000, 256));
  // Kürzere Kante (Breite) füllt den Viewport exakt aus → x = 0.
  approx(view.x, 0);
  // Längere Kante (Höhe) hat Überschuss, der zentriert wird → y < 0.
  approx(view.y, (256 - 2000 * view.scale) / 2);
});

test('clampView: Zoom unter das Minimum wird auf coverScale angehoben', () => {
  const min = coverScale(1000, 1000, 256);
  const view = clampView({ imgW: 1000, imgH: 1000, viewport: 256, scale: min / 2, x: 0, y: 0 });
  approx(view.scale, min);
});

test('clampView: Zoom über MAX_ZOOM wird gekappt', () => {
  const min = coverScale(1000, 1000, 256);
  const view = clampView({ imgW: 1000, imgH: 1000, viewport: 256, scale: min * 10, x: 0, y: 0 });
  approx(view.scale, min * MAX_ZOOM);
});

test('clampView: Bild darf nicht nach rechts/unten wegrutschen (kein Rand)', () => {
  const min = coverScale(1000, 1000, 256);
  // x > 0 hieße: links vom Bild wäre leerer Rand im Fenster sichtbar.
  const view = clampView({ imgW: 1000, imgH: 1000, viewport: 256, scale: min, x: 50, y: 50 });
  approx(view.x, 0);
  approx(view.y, 0);
});

test('clampView: Bild darf nicht zu weit nach links/oben verschoben werden', () => {
  const scale = coverScale(1000, 1000, 256) * 2;
  const drawn = 1000 * scale;
  const view = clampView({ imgW: 1000, imgH: 1000, viewport: 256, scale, x: -9999, y: -9999 });
  approx(view.x, 256 - drawn);
  approx(view.y, 256 - drawn);
});

test('sourceRect: bei zentrierter Startview liegt der Ausschnitt mittig im Bild', () => {
  const viewport = 256;
  const view = initialView({ imgW: 2000, imgH: 1000, viewport }); // Querformat
  const rect = sourceRect({ imgW: 2000, imgH: 1000, viewport, ...view });
  approx(rect.side, 1000); // volle Höhe ist der limitierende Faktor
  approx(rect.sy, 0);
  approx(rect.sx, (2000 - 1000) / 2); // horizontal mittig ausgeschnitten
});

test('sourceRect: Eckfall nach maximalem Pan liegt am Bildrand', () => {
  const viewport = 256;
  const scale = coverScale(2000, 1000, viewport);
  const view = clampView({ imgW: 2000, imgH: 1000, viewport, scale, x: 9999, y: 0 });
  const rect = sourceRect({ imgW: 2000, imgH: 1000, viewport, ...view });
  approx(rect.sx, 0); // ganz nach links gezogen → Ausschnitt beginnt am linken Bildrand
});

test('zoomAround hält den Bildpunkt unter dem Fokus fest', () => {
  const imgW = 2000, imgH = 2000, viewport = 256;
  const view = initialView({ imgW, imgH, viewport });
  const focusX = 100, focusY = 150;
  const srcBefore = {
    x: (focusX - view.x) / view.scale,
    y: (focusY - view.y) / view.scale,
  };
  const zoomed = zoomAround({ imgW, imgH, viewport, view, factor: 2, focusX, focusY });
  const srcAfter = {
    x: (focusX - zoomed.x) / zoomed.scale,
    y: (focusY - zoomed.y) / zoomed.scale,
  };
  approx(srcAfter.x, srcBefore.x, 1e-6);
  approx(srcAfter.y, srcBefore.y, 1e-6);
});

test('zoomAround bleibt innerhalb der Grenzen, auch bei extremem Faktor', () => {
  const imgW = 500, imgH = 500, viewport = 256;
  const view = initialView({ imgW, imgH, viewport });
  const zoomed = zoomAround({ imgW, imgH, viewport, view, factor: 100, focusX: 0, focusY: 0 });
  approx(zoomed.scale, coverScale(imgW, imgH, viewport) * MAX_ZOOM);
});

// Regression: zoomAround muss scale ERST clampen und x/y darauf verankern,
// nicht umgekehrt — sonst rechnet die Anker-Formel mit einem Maßstab, der
// gar nicht der am Ende angewendete ist, und das Bild springt sichtbar, sobald
// eine Zoom-Geste über die Grenze hinausgeht (siehe Review-Fund).
test('zoomAround: Fokuspunkt bleibt auch fest, wenn der Zoom dabei am oberen Limit gekappt wird', () => {
  const imgW = 1000, imgH = 1000, viewport = 256;
  const maxScale = coverScale(imgW, imgH, viewport) * MAX_ZOOM;
  // Schon (fast) am Limit — ein weiterer Zoom-Schritt muss klemmen.
  const view = clampView({ imgW, imgH, viewport, scale: maxScale * 0.95, x: 0, y: 0 });
  const focusX = 90, focusY = 60;
  const srcBefore = {
    x: (focusX - view.x) / view.scale,
    y: (focusY - view.y) / view.scale,
  };
  const zoomed = zoomAround({ imgW, imgH, viewport, view, factor: 1.5, focusX, focusY });
  approx(zoomed.scale, maxScale); // wurde tatsächlich gekappt
  const srcAfter = {
    x: (focusX - zoomed.x) / zoomed.scale,
    y: (focusY - zoomed.y) / zoomed.scale,
  };
  approx(srcAfter.x, srcBefore.x, 1e-6);
  approx(srcAfter.y, srcBefore.y, 1e-6);
});

test('zoomAround: Fokuspunkt bleibt auch fest, wenn der Zoom dabei am unteren Limit (coverScale) klemmt', () => {
  const imgW = 2000, imgH = 1000, viewport = 256; // Querformat: startet schon bei coverScale
  const view = initialView({ imgW, imgH, viewport });
  const focusX = 40, focusY = 200;
  const srcBefore = {
    x: (focusX - view.x) / view.scale,
    y: (focusY - view.y) / view.scale,
  };
  const zoomed = zoomAround({ imgW, imgH, viewport, view, factor: 0.5, focusX, focusY });
  approx(zoomed.scale, coverScale(imgW, imgH, viewport)); // unverändert, war schon am Minimum
  const srcAfter = {
    x: (focusX - zoomed.x) / zoomed.scale,
    y: (focusY - zoomed.y) / zoomed.scale,
  };
  // x ist die freie Achse (Querformat hat dort Überschuss) — hier darf der
  // Fokuspunkt nicht wegspringen. y ist bei coverScale exakt auf 0 fixiert
  // (keine Freiheit), bleibt hier also trivialerweise ebenfalls stabil.
  approx(srcAfter.x, srcBefore.x, 1e-6);
  approx(srcAfter.y, srcBefore.y, 1e-6);
});

test('panBy verschiebt und clampt, ohne den Zoom zu ändern', () => {
  const imgW = 1000, imgH = 1000, viewport = 256;
  const view = initialView({ imgW, imgH, viewport });
  const panned = panBy({ imgW, imgH, viewport, view, dx: -9999, dy: 5 });
  approx(panned.scale, view.scale);
  const drawn = imgW * view.scale;
  approx(panned.x, viewport - drawn);
});
