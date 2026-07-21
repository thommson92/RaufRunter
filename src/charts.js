// charts.js — kleine SVG/HTML-Chart-Bausteine für die Statistik-Sektion.
// DOM-Code (im Gegensatz zu engine.js), baut fertige Elemente, die app.js
// direkt in die Zuschaueransicht einhängt. Kein Chart-Framework, kein Build-Step.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Feste, per Validator geprüfte kategoriale Palette (8 Slots, dunkle Oberfläche).
// Reihenfolge ist die CVD-Sicherheit — nicht neu mischen, siehe styles.css :root.
const SERIES_VARS = [
  '--series-1', '--series-2', '--series-3', '--series-4',
  '--series-5', '--series-6', '--series-7', '--series-8',
];

/**
 * Weist jedem Spieler (nach Sitzreihenfolge, stabil) einen Farb-Slot zu.
 * @param {Array<{id:string,name:string,seatOrder:number}>} players
 * @returns {Array<{id:string,name:string,colorVar:string}>}
 */
export function assignSeriesColors(players) {
  const seated = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
  return seated.map((p, i) => ({
    id: p.id,
    name: p.name,
    colorVar: SERIES_VARS[i % SERIES_VARS.length],
  }));
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function pickTickIndices(count, maxTicks = 6) {
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const idx = new Set();
  for (let k = 0; k < maxTicks; k++) idx.add(Math.round((k * (count - 1)) / (maxTicks - 1)));
  return [...idx].sort((a, b) => a - b);
}

/** Runde Y-Achsen-Ticks (Vielfaches von 2/5/10 je nach Spannweite). */
function niceScoreTicks(min, max, count = 4) {
  let lo = min, hi = max;
  if (lo === hi) { lo -= 5; hi += 5; }
  const span = hi - lo;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / mag;
  const step = (norm < 2 ? 2 : norm < 5 ? 5 : 10) * mag;
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v));
  return { ticks, domainMin: niceMin, domainMax: niceMax };
}

/**
 * Baut einen interaktiven Mehrlinien-Chart (Punkte- oder Platzierungsverlauf).
 * @param {object} opts
 * @param {Array<{roundIndex:number, cardCount:number, values:Object<string,number>}>} opts.points
 * @param {Array<{id:string, name:string, colorVar:string}>} opts.series
 * @param {boolean} [opts.invertY] true = kleinerer Wert oben (Platzierung, 1 = Spitze)
 * @param {(v:number)=>string} [opts.yTickFormat]
 * @param {string} [opts.emptyText]
 * @returns {HTMLElement}
 */
function buildLineChart({ points, series, invertY = false, yTickFormat = String, emptyText }) {
  const wrap = el('div', 'chart');
  if (!points.length) {
    const empty = el('p', 'center muted');
    empty.style.margin = '10px 0 0';
    empty.textContent = emptyText || 'Noch keine Daten.';
    wrap.appendChild(empty);
    return wrap;
  }

  const W = 320, H = 170;
  const margin = { top: 10, right: 10, bottom: 22, left: invertY ? 22 : 32 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const n = points.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const xScale = (i) => margin.left + (n > 1 ? i * xStep : plotW / 2);

  let domainMin, domainMax, yTicks;
  if (invertY) {
    domainMin = 1;
    domainMax = Math.max(series.length, 2);
    yTicks = [];
    for (let r = 1; r <= domainMax; r++) yTicks.push(r);
  } else {
    let lo = 0, hi = 0;
    for (const pt of points) {
      for (const s of series) {
        const v = pt.values[s.id];
        if (v == null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const nice = niceScoreTicks(lo, hi);
    domainMin = nice.domainMin;
    domainMax = nice.domainMax;
    yTicks = nice.ticks;
  }
  const yRange = domainMax - domainMin || 1;
  const yScale = (v) => {
    const t = (v - domainMin) / yRange;
    return invertY
      ? margin.top + t * plotH
      : margin.top + plotH - t * plotH;
  };

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart-svg',
    role: 'img',
    'aria-hidden': 'true',
  });

  // Gridlines (hairline, rezessiv) + Y-Ticks
  for (const t of yTicks) {
    const y = yScale(t);
    svg.appendChild(svgEl('line', {
      x1: margin.left, x2: W - margin.right, y1: y, y2: y, class: 'chart-grid',
    }));
    const label = svgEl('text', {
      x: margin.left - 6, y: y + 3, class: 'chart-axis-label', 'text-anchor': 'end',
    });
    label.textContent = yTickFormat(t);
    svg.appendChild(label);
  }

  // X-Ticks (Rundennummer)
  for (const i of pickTickIndices(n)) {
    const x = xScale(i);
    const label = svgEl('text', {
      x, y: H - 4, class: 'chart-axis-label', 'text-anchor': 'middle',
    });
    label.textContent = 'R' + (points[i].roundIndex + 1);
    svg.appendChild(label);
  }

  // Baseline bei 0 (nur Punkteverlauf) etwas kräftiger als die übrigen Gridlines.
  if (!invertY && domainMin < 0 && domainMax > 0) {
    const y0 = yScale(0);
    svg.appendChild(svgEl('line', {
      x1: margin.left, x2: W - margin.right, y1: y0, y2: y0, class: 'chart-baseline',
    }));
  }

  // Linien + End-Marker je Serie.
  for (const s of series) {
    const coords = points
      .map((pt, i) => (pt.values[s.id] == null ? null : [xScale(i), yScale(pt.values[s.id])]))
      .filter(Boolean);
    if (coords.length < 1) continue;
    if (coords.length > 1) {
      const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const path = svgEl('path', { d, class: 'chart-line' });
      path.style.stroke = `var(${s.colorVar})`;
      svg.appendChild(path);
    }
    const [lx, ly] = coords[coords.length - 1];
    const dot = svgEl('circle', { cx: lx, cy: ly, r: 4, class: 'chart-end-dot' });
    dot.style.fill = `var(${s.colorVar})`;
    svg.appendChild(dot);
  }

  // Crosshair + Hover-Dots (anfangs unsichtbar).
  const crosshair = svgEl('line', {
    x1: margin.left, x2: margin.left, y1: margin.top, y2: H - margin.bottom,
    class: 'chart-crosshair', visibility: 'hidden',
  });
  svg.appendChild(crosshair);
  const hoverDots = series.map((s) => {
    const dot = svgEl('circle', { r: 4, class: 'chart-hover-dot', visibility: 'hidden' });
    dot.style.fill = `var(${s.colorVar})`;
    svg.appendChild(dot);
    return dot;
  });

  // Hit-Layer (deckt die gesamte Plotfläche ab, fängt Pointer-Events).
  const hit = svgEl('rect', {
    x: margin.left, y: margin.top, width: plotW, height: plotH, class: 'chart-hit',
  });
  svg.appendChild(hit);

  wrap.appendChild(svg);

  // Legende (Farbe folgt der Entität — gleiche Zuordnung wie in beiden Charts).
  const legend = el('div', 'chart-legend');
  for (const s of series) {
    const item = el('span', 'chart-legend-item');
    const swatch = el('span', 'chart-legend-swatch');
    swatch.style.background = `var(${s.colorVar})`;
    item.appendChild(swatch);
    const name = document.createTextNode(s.name);
    item.appendChild(name);
    legend.appendChild(item);
  }
  wrap.appendChild(legend);

  // Tooltip
  const tooltip = el('div', 'chart-tooltip');
  tooltip.hidden = true;
  const tooltipHead = el('div', 'chart-tooltip-head');
  const tooltipBody = el('div', 'chart-tooltip-body');
  tooltip.appendChild(tooltipHead);
  tooltip.appendChild(tooltipBody);
  wrap.appendChild(tooltip);

  function showAt(idx) {
    idx = Math.max(0, Math.min(n - 1, idx));
    const pt = points[idx];
    const x = xScale(idx);
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.setAttribute('visibility', 'visible');

    tooltipHead.textContent = `Runde ${pt.roundIndex + 1} · ${pt.cardCount} ${pt.cardCount === 1 ? 'Karte' : 'Karten'}`;
    tooltipBody.replaceChildren();

    series.forEach((s, i) => {
      const v = pt.values[s.id];
      hoverDots[i].setAttribute('cx', x);
      if (v == null) {
        hoverDots[i].setAttribute('visibility', 'hidden');
        return;
      }
      hoverDots[i].setAttribute('cy', yScale(v));
      hoverDots[i].setAttribute('visibility', 'visible');

      const row = el('div', 'chart-tooltip-row');
      const key = el('span', 'chart-tooltip-key');
      key.style.background = `var(${s.colorVar})`;
      row.appendChild(key);
      const name = el('span', 'chart-tooltip-name');
      name.textContent = s.name;
      row.appendChild(name);
      const val = el('span', 'chart-tooltip-value');
      val.textContent = yTickFormat(v);
      row.appendChild(val);
      tooltipBody.appendChild(row);
    });

    const pct = ((x - margin.left) / plotW) * 100;
    tooltip.style.left = `${(x / W) * 100}%`;
    tooltip.dataset.align = pct < 20 ? 'start' : pct > 80 ? 'end' : 'center';
    tooltip.hidden = false;
  }

  function hide() {
    crosshair.setAttribute('visibility', 'hidden');
    hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tooltip.hidden = true;
  }

  function onMove(e) {
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const idx = n > 1 ? Math.round((localX - margin.left) / xStep) : 0;
    showAt(idx);
  }

  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onMove);
  hit.addEventListener('pointerleave', hide);

  return wrap;
}

/**
 * Punkteverlauf: kumulierter Punktestand je Spieler über die Runden.
 * @param {Array<{roundIndex:number,cardCount:number,totals:Object<string,number>}>} progression
 * @param {Array<{id:string,name:string,colorVar:string}>} series
 */
export function buildScoreChart(progression, series) {
  const points = progression.map((p) => ({
    roundIndex: p.roundIndex, cardCount: p.cardCount, values: p.totals,
  }));
  return buildLineChart({
    points, series,
    yTickFormat: (v) => (v > 0 ? '+' + v : String(v)),
    emptyText: 'Noch keine fertige Runde.',
  });
}

/**
 * Platzierungsverlauf: Rang je Spieler über die Runden (1 = Spitze, oben).
 * @param {Array<{roundIndex:number,cardCount:number,ranks:Object<string,number>}>} progression
 * @param {Array<{id:string,name:string,colorVar:string}>} series
 */
export function buildRankChart(progression, series) {
  const points = progression.map((p) => ({
    roundIndex: p.roundIndex, cardCount: p.cardCount, values: p.ranks,
  }));
  return buildLineChart({
    points, series, invertY: true,
    yTickFormat: (v) => '#' + v,
    emptyText: 'Noch keine fertige Runde.',
  });
}

/**
 * Angesagte vs. tatsächlich gemachte Stiche (Summe) je Spieler — horizontale
 * Balken in reinem HTML/CSS, sortiert nach angesagten Stichen absteigend.
 * @param {Array<{id:string,name:string}>} players
 * @param {Object<string,{bidSum:number,trickSum:number}>} totals
 */
export function buildBidVsTricksChart(players, totals) {
  const wrap = el('div', 'chart bar-chart');
  const rows = players
    .map((p) => ({ id: p.id, name: p.name, ...totals[p.id] }))
    .sort((a, b) => b.bidSum - a.bidSum);

  if (!rows.length || rows.every((r) => r.bidSum === 0 && r.trickSum === 0)) {
    const empty = el('p', 'center muted');
    empty.style.margin = '10px 0 0';
    empty.textContent = 'Noch keine fertige Runde.';
    wrap.appendChild(empty);
    return wrap;
  }

  const max = Math.max(1, ...rows.map((r) => Math.max(r.bidSum, r.trickSum)));

  for (const r of rows) {
    const row = el('div', 'bar-row');
    const name = el('div', 'bar-row-name');
    name.textContent = r.name;
    row.appendChild(name);

    const bars = el('div', 'bar-row-bars');
    for (const [key, cls] of [['bidSum', 'bar-bid'], ['trickSum', 'bar-trick']]) {
      const track = el('div', 'bar-track');
      const fill = el('div', `bar-fill ${cls}`);
      fill.style.width = `${(r[key] / max) * 100}%`;
      const val = el('span', 'bar-value');
      val.textContent = String(r[key]);
      fill.appendChild(val);
      track.appendChild(fill);
      bars.appendChild(track);
    }
    row.appendChild(bars);
    wrap.appendChild(row);
  }

  const legend = el('div', 'chart-legend');
  const items = [['bar-bid', 'Angesagt'], ['bar-trick', 'Gemacht']];
  for (const [cls, label] of items) {
    const item = el('span', 'chart-legend-item');
    const swatch = el('span', `chart-legend-swatch ${cls}`);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  }
  wrap.appendChild(legend);

  return wrap;
}
