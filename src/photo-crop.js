// photo-crop.js — Zuschnitt-Widget für Profilfotos: Bild per Ziehen/Pinch/
// Zoom-Regler im quadratischen Rahmen positionieren. DOM/Pointer-Events-Code
// (kein Framework, kein Build-Step), analog zu wheel.js. Die eigentliche
// Geometrie (was "innerhalb des Rahmens" überhaupt heißt) steckt komplett in
// crop-model.js — dieses Modul übersetzt nur Zeiger-Events in Aufrufe davon.

import {
  initialView,
  zoomAround,
  panBy,
  sourceRect,
  coverScale,
  MAX_ZOOM,
} from './crop-model.js';

// Kantenlänge des Zuschnittfensters in CSS-Pixeln. loadPhotoSource() liefert
// die Bildquelle bereits auf max. 1024px verkleinert — der Viewport bleibt
// bewusst kleiner, damit auch beim vollen 4×-Zoom keine Lücke entstehen kann.
const VIEWPORT = 280;
const ZOOM_STEPS = 1000; // Auflösung des <input type="range">, rein UI-seitig

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Baut das Zuschnitt-Widget für eine bereits geladene Bildquelle.
 * @param {HTMLCanvasElement} source von profile-ui.js `loadPhotoSource()`
 * @param {{ onConfirm: (rect:{sx:number,sy:number,side:number}) => void, onCancel: () => void }} handlers
 * @returns {HTMLElement}
 */
export function buildPhotoCropper(source, { onConfirm, onCancel }) {
  const imgW = source.width;
  const imgH = source.height;
  const geo = { imgW, imgH, viewport: VIEWPORT };
  const minScale = coverScale(imgW, imgH, VIEWPORT);
  const maxScale = minScale * MAX_ZOOM;
  let view = initialView(geo);

  const root = document.createElement('div');
  root.className = 'crop-root';

  const stage = document.createElement('div');
  stage.className = 'crop-stage';
  stage.style.width = stage.style.height = `${VIEWPORT}px`;

  source.className = 'crop-image';
  stage.appendChild(source);

  const mask = document.createElement('div');
  mask.className = 'crop-mask';
  mask.setAttribute('aria-hidden', 'true');
  stage.appendChild(mask);

  const zoomRow = document.createElement('div');
  zoomRow.className = 'crop-zoom-row';
  const zoomOut = document.createElement('span');
  zoomOut.className = 'crop-zoom-icon';
  zoomOut.textContent = '🔍';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'crop-zoom';
  slider.min = '0';
  slider.max = String(ZOOM_STEPS);
  slider.setAttribute('aria-label', 'Zoom');
  const zoomIn = document.createElement('span');
  zoomIn.className = 'crop-zoom-icon crop-zoom-icon-big';
  zoomIn.textContent = '🔍';
  zoomRow.append(zoomOut, slider, zoomIn);

  const actions = document.createElement('div');
  actions.className = 'btn-row';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-ghost';
  cancelBtn.textContent = 'Abbrechen';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary';
  confirmBtn.textContent = 'Übernehmen';
  actions.append(cancelBtn, confirmBtn);

  root.append(stage, zoomRow, actions);

  function applyTransform() {
    source.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  function syncSlider() {
    const t = (view.scale - minScale) / (maxScale - minScale);
    slider.value = String(Math.round(t * ZOOM_STEPS));
  }

  function setView(next) {
    view = next;
    applyTransform();
    syncSlider();
  }

  applyTransform();
  syncSlider();

  // ---- Zoom-Regler: zoomt um die Mitte des Fensters (kein Fokuspunkt nötig) ----
  slider.addEventListener('input', () => {
    const t = Number(slider.value) / ZOOM_STEPS;
    const targetScale = minScale + t * (maxScale - minScale);
    setView(
      zoomAround({
        ...geo,
        view,
        factor: targetScale / view.scale,
        focusX: VIEWPORT / 2,
        focusY: VIEWPORT / 2,
      }),
    );
  });

  // ---- Ziehen (Maus/ein Finger) & Kneifen-Zoom (zwei Finger) ----
  // Pointer Events statt touch/mouse getrennt: ein Codepfad für Maus, Stift
  // und Touch. touch-action:none (siehe styles.css) verhindert, dass der
  // Browser das Ziehen als Seiten-Scroll interpretiert.
  const pointers = new Map(); // pointerId -> {x, y} in Stage-Koordinaten
  let pinchDist = null;

  const relPoint = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, relPoint(e.clientX, e.clientY));
    pinchDist = null;
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = relPoint(e.clientX, e.clientY);
    pointers.set(e.pointerId, cur);

    if (pointers.size === 1) {
      setView(panBy({ ...geo, view, dx: cur.x - prev.x, dy: cur.y - prev.y }));
      return;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = dist(a, b);
      if (pinchDist != null) {
        const mid = midpoint(a, b);
        setView(
          zoomAround({ ...geo, view, factor: d / pinchDist, focusX: mid.x, focusY: mid.y }),
        );
      }
      pinchDist = d;
    }
  });

  const releasePointer = (e) => {
    pointers.delete(e.pointerId);
    pinchDist = null;
  };
  stage.addEventListener('pointerup', releasePointer);
  stage.addEventListener('pointercancel', releasePointer);

  // ---- Mausrad als Desktop-Komfort neben dem Regler ----
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const focus = relPoint(e.clientX, e.clientY);
      setView(
        zoomAround({
          ...geo,
          view,
          factor: e.deltaY < 0 ? 1.08 : 1 / 1.08,
          focusX: focus.x,
          focusY: focus.y,
        }),
      );
    },
    { passive: false },
  );

  cancelBtn.addEventListener('click', () => onCancel());
  confirmBtn.addEventListener('click', () => onConfirm(sourceRect({ ...geo, ...view })));

  return root;
}
