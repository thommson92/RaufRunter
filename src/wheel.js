// wheel.js — Glücksrad zur Auslosung des ersten Gebers beim Anlegen eines
// neuen Spiels. DOM/SVG-Baustein ohne Framework, analog zu charts.js.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 240; // muss zu --wheel-center in styles.css passen (SIZE/2)
const CENTER = SIZE / 2;
const RADIUS = 108;

// Gleiche kategoriale Palette wie die Charts (--series-1..8, dark-validiert).
const SLICE_VARS = [
  '--series-1', '--series-2', '--series-3', '--series-4',
  '--series-5', '--series-6', '--series-7', '--series-8',
];

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Punkt auf dem Kreis; 0° = oben (12 Uhr), im Uhrzeigersinn. */
function polar(angleDeg, r = RADIUS) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + r * Math.cos(rad), CENTER + r * Math.sin(rad)];
}

function sectorPath(startDeg, endDeg) {
  const [x1, y1] = polar(startDeg);
  const [x2, y2] = polar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${CENTER},${CENTER} L${x1.toFixed(2)},${y1.toFixed(2)} A${RADIUS},${RADIUS} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

/** Lese-Rotation für ein Label an einem gegebenen WELT-Winkel (0=oben, im
 * Uhrzeigersinn) — nie kopfüber: in der unteren Hälfte wird um 180° gedreht. */
function uprightRotation(worldAngleDeg) {
  const a = ((worldAngleDeg % 360) + 360) % 360;
  return a > 90 && a < 270 ? a + 180 : a;
}

/**
 * Baut ein drehbares Glücksrad zur Geber-Auslosung.
 * @param {string[]} names Spielernamen in Sitzreihenfolge (je ein Sektor)
 * @param {(winnerIndex:number)=>void} onSettled wird aufgerufen, sobald das Rad steht
 * @returns {HTMLElement} Rad + "Los!"-Button, fertig zum Einhängen
 */
export function buildDealerWheel(names, onSettled) {
  const n = names.length;
  const sectorAngle = 360 / n;

  const wrap = document.createElement('div');
  wrap.className = 'wheel-wrap';

  const svg = svgEl('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'wheel-svg' });
  const group = svgEl('g', { class: 'wheel-group' });

  // Label-Metadaten (Element + eigener Mittel-Winkel) merken: die Rotation
  // jedes Labels muss beim Drehen neu berechnet werden (siehe unten), sonst
  // steht der Name des Gewinners nach der Animation kopfüber.
  const labels = [];

  for (let i = 0; i < n; i++) {
    const start = i * sectorAngle;
    const end = start + sectorAngle;
    const slice = svgEl('path', { d: sectorPath(start, end), class: 'wheel-slice' });
    slice.style.fill = `var(${SLICE_VARS[i % SLICE_VARS.length]})`;
    group.appendChild(slice);

    const mid = start + sectorAngle / 2;
    const [lx, ly] = polar(mid, RADIUS * 0.62);
    const label = svgEl('text', {
      x: lx, y: ly, class: 'wheel-label',
      transform: `rotate(${uprightRotation(mid)}, ${lx.toFixed(2)}, ${ly.toFixed(2)})`,
      'text-anchor': 'middle',
    });
    label.textContent = names[i];
    group.appendChild(label);
    labels.push({ el: label, mid, lx, ly });
  }
  svg.appendChild(group);

  // Zeiger (fix, oberhalb der rotierenden Gruppe) + Nabe in der Mitte.
  svg.appendChild(svgEl('polygon', {
    points: `${CENTER - 10},${CENTER - RADIUS - 16} ${CENTER + 10},${CENTER - RADIUS - 16} ${CENTER},${CENTER - RADIUS + 4}`,
    class: 'wheel-pointer',
  }));
  svg.appendChild(svgEl('circle', { cx: CENTER, cy: CENTER, r: 15, class: 'wheel-hub' }));

  wrap.appendChild(svg);

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.width = '100%';
  btn.style.marginTop = '16px';
  btn.textContent = "🎡 Los geht's!";
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    btn.disabled = true;
    const winner = Math.floor(Math.random() * n);

    // Zielsektor unter den fixen Zeiger (oben, 0°) drehen + ein paar volle
    // Umdrehungen für den Schwung.
    const targetCenter = (winner + 0.5) * sectorAngle;
    const rotationNeeded = (360 - (targetCenter % 360)) % 360;
    const finalRotation = 5 * 360 + rotationNeeded;

    // Jedes Label bekommt VOR dem Drehen die Rotation, die es nach der
    // Landung braucht: die Gruppe dreht gleich um `finalRotation`, das
    // addiert sich zur eigenen Lese-Rotation jedes Labels dazu. Ohne diese
    // Neuberechnung würde ausgerechnet der Name über dem Zeiger nach dem
    // Stopp zufällig kopfüber stehen.
    labels.forEach(({ el, mid, lx, ly }) => {
      const restingWorldAngle = mid + finalRotation;
      const desiredTotal = uprightRotation(restingWorldAngle);
      const localRotation = desiredTotal - finalRotation;
      el.setAttribute('transform', `rotate(${localRotation}, ${lx.toFixed(2)}, ${ly.toFixed(2)})`);
    });

    group.style.transition = 'none';
    group.style.transform = 'rotate(0deg)';
    void group.getBoundingClientRect(); // Reflow erzwingen: Startzustand malen, bevor die Transition greift
    requestAnimationFrame(() => {
      group.style.transition = 'transform 4200ms cubic-bezier(0.12,0.8,0.24,1)';
      group.style.transform = `rotate(${finalRotation}deg)`;
    });

    function onEnd(e) {
      if (e.propertyName !== 'transform') return;
      group.removeEventListener('transitionend', onEnd);
      onSettled(winner);
    }
    group.addEventListener('transitionend', onEnd);
  });

  return wrap;
}
