// crop-model.js — Geometrie für den Profilfoto-Zuschnitt (rein, kein DOM/Canvas).
//
// Der Nutzer sieht ein quadratisches Zuschnittfenster ("viewport", Kantenlänge
// in denselben Einheiten wie x/y). Das Foto wird darin frei verschoben (x, y
// = Position der Bild-Ecke oben-links relativ zur Viewport-Ecke) und gezoomt
// (scale = Bild-Pixel → Viewport-Einheiten). Die einzige Invariante, die
// dieses Modul durchsetzt: das Bild darf das Fenster nie mit einem leeren
// Rand zeigen — es muss es immer vollständig ausfüllen ("cover").

/** Wie viel Zoom über das Mindestmaß hinaus erlaubt ist. */
export const MAX_ZOOM = 4;

/**
 * Kleinster Maßstab, bei dem das Bild den quadratischen Viewport noch
 * vollständig ausfüllt — die kürzere Bildkante wird exakt auf die
 * Viewport-Kante skaliert.
 */
export function coverScale(imgW, imgH, viewport) {
  return viewport / Math.min(imgW, imgH);
}

/**
 * Begrenzt Maßstab und Position so, dass der Viewport immer voll ausgefüllt
 * bleibt: `scale` liegt zwischen `coverScale` und `coverScale * MAX_ZOOM`,
 * `x`/`y` halten die entsprechende Bildkante innerhalb des Fensters.
 * @returns {{scale:number, x:number, y:number}}
 */
export function clampView({ imgW, imgH, viewport, scale, x, y }) {
  const min = coverScale(imgW, imgH, viewport);
  const clampedScale = Math.min(Math.max(scale, min), min * MAX_ZOOM);

  // Gültiger Bereich für die Bild-Ecke: das Fenster (0..viewport) muss
  // vollständig innerhalb des gezeichneten Bilds (x..x+imgW*scale) liegen.
  const clampAxis = (pos, imgSize) => {
    const drawnSize = imgSize * clampedScale;
    const minPos = viewport - drawnSize; // Bildkante darf höchstens hier enden
    const maxPos = 0; // … und frühestens am Fensteranfang beginnen
    return Math.min(Math.max(pos, minPos), maxPos);
  };

  return {
    scale: clampedScale,
    x: clampAxis(x, imgW),
    y: clampAxis(y, imgH),
  };
}

/**
 * Startview: Bild zentriert, minimal gezoomt (genau ausgefüllt).
 */
export function initialView({ imgW, imgH, viewport }) {
  const scale = coverScale(imgW, imgH, viewport);
  return clampView({
    imgW,
    imgH,
    viewport,
    scale,
    x: (viewport - imgW * scale) / 2,
    y: (viewport - imgH * scale) / 2,
  });
}

/**
 * Rechnet die sichtbare Viewport-Fläche in Bild-Pixelkoordinaten um — direkt
 * als Quellrechteck für `drawImage`/`getImageData` nutzbar.
 * @returns {{sx:number, sy:number, side:number}}
 */
export function sourceRect({ imgW, imgH, viewport, scale, x, y }) {
  return {
    sx: -x / scale,
    sy: -y / scale,
    side: viewport / scale,
  };
}

/**
 * Zoomt um `factor` (>1 = rein, <1 = raus), wobei der Bildpunkt unter
 * `(focusX, focusY)` (Viewport-Koordinaten, z.B. Fingerposition beim Pinch)
 * an derselben Stelle stehen bleibt. Ergebnis ist bereits geclampt.
 */
export function zoomAround({ imgW, imgH, viewport, view, factor, focusX, focusY }) {
  // Bild-Pixel unter dem Fokuspunkt vor dem Zoom festhalten, danach so
  // positionieren, dass er nach dem Zoom wieder unter demselben Punkt liegt.
  const srcX = (focusX - view.x) / view.scale;
  const srcY = (focusY - view.y) / view.scale;
  const scale = view.scale * factor;
  return clampView({
    imgW,
    imgH,
    viewport,
    scale,
    x: focusX - srcX * scale,
    y: focusY - srcY * scale,
  });
}

/**
 * Verschiebt die aktuelle View um ein Delta (Viewport-Einheiten, z.B. aus
 * einem Pointer-move). Ergebnis ist bereits geclampt.
 */
export function panBy({ imgW, imgH, viewport, view, dx, dy }) {
  return clampView({
    imgW,
    imgH,
    viewport,
    scale: view.scale,
    x: view.x + dx,
    y: view.y + dy,
  });
}
