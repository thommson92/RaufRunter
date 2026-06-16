// app.js — UI, Routing, Event-Handling (Vanilla, kein Build-Step).
// Daten kommen live aus Firestore (store-firebase.js): jede Ansicht für ein
// einzelnes Spiel abonniert das Dokument und rendert bei jeder Änderung neu.
import { createGame } from './store.js';
import { fb } from './store-firebase.js';
import { randomName } from './names.js';
import {
  standings,
  allowedBids,
  tricksCheck,
  randomTrump,
  totalRounds,
} from './engine.js';

const appEl = document.getElementById('app');

// Flüchtiger UI-Zustand (nicht persistiert).
const ui = {
  draft: null,        // Entwurf im "Neues Spiel"-Formular
  activeRound: null,  // welche Runde im Eingabe-Panel offen ist
};

// Aktuell abonniertes Spiel (Live-Cache aus Firestore).
//   game === undefined  -> lädt noch
//   game === null        -> nicht gefunden
const current = { id: null, game: undefined, unsub: null };

// ---------- Helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );

function fmtScore(n) {
  if (n == null) return '–';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${n}</span>`;
}

function seatSorted(game) {
  return [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function currentRoute() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  return { view: parts[0] || 'home', id: parts[1] };
}

function saveCurrent() {
  if (!current.game) return;
  // Optimistisch sofort rendern, im Hintergrund nach Firestore schreiben.
  // Der onSnapshot-Listener gleicht danach mit dem Server-Stand ab.
  renderActiveView();
  fb.saveGame(current.game).catch((e) => {
    console.error('Speichern fehlgeschlagen:', e);
    alert('Speichern fehlgeschlagen – bist du online? Änderung wird nachgeholt, sobald wieder Verbindung besteht.');
  });
}

// ---------- Subscription ----------
function ensureSubscribed(id) {
  if (current.id === id && current.unsub) return;
  clearSubscription();
  current.id = id;
  current.game = undefined;
  ui.activeRound = null;
  current.unsub = fb.subscribeGame(id, (g) => {
    current.game = g;
    if (currentRoute().id === id) renderActiveView();
  });
}

function clearSubscription() {
  if (current.unsub) current.unsub();
  current.unsub = null;
  current.id = null;
  current.game = undefined;
}

// ---------- Router ----------
function route() {
  const { view, id } = currentRoute();
  if (['game', 'players', 'view'].includes(view) && id) ensureSubscribed(id);
  else clearSubscription();
  renderActiveView();
}

function renderActiveView() {
  const { view } = currentRoute();
  switch (view) {
    case 'new':
      return renderNew();
    case 'game':
      return renderScorer();
    case 'players':
      return renderPlayers();
    case 'view':
      return renderViewer();
    default:
      return renderHome();
  }
}

function renderLoading(text = 'Lädt …') {
  appEl.innerHTML = `
    <div class="topbar"><button class="icon-btn btn-ghost" data-action="home">‹</button><h1>Rauf Runter</h1></div>
    <div class="empty">${esc(text)}</div>`;
}

function renderNotFound() {
  appEl.innerHTML = `
    <div class="topbar"><button class="icon-btn btn-ghost" data-action="home">‹</button><h1>Rauf Runter</h1></div>
    <div class="empty">Spiel nicht gefunden.<br/><small>Vielleicht wurde es gelöscht oder der Link stimmt nicht.</small></div>`;
}

// ---------- Views ----------
async function renderHome() {
  appEl.innerHTML = `
    <div class="topbar"><h1>🃏 Rauf Runter</h1></div>
    <div class="empty">Lade Spiele …</div>`;
  let games;
  try {
    games = await fb.listGames();
  } catch (e) {
    console.error(e);
    games = [];
  }
  if (currentRoute().view !== 'home') return; // inzwischen weggenavigiert

  const items = games.length
    ? games
        .map((g) => {
          const done = g.rounds.filter((r) => r.done).length;
          const total = g.rounds.length;
          const lead = standings(g).ranking[0];
          return `
            <button class="card list-item" data-action="open" data-id="${g.id}">
              <div class="meta">
                <strong>${esc(g.name)}</strong><br/>
                <small>${g.players.length} Spieler · Runde ${Math.min(done + 1, total)}/${total}${
            done === total ? ' · fertig' : ''
          }${lead && done ? ` · 🥇 ${esc(lead.name)}` : ''}</small>
              </div>
              <span class="muted">›</span>
            </button>`;
        })
        .join('')
    : `<div class="empty">Noch keine Spiele.<br/>Leg unten ein neues an.</div>`;

  appEl.innerHTML = `
    <div class="topbar"><h1>🃏 Rauf Runter</h1></div>
    ${items}
    <div class="card center" style="border-style:dashed">
      <button class="btn-primary" data-action="new" style="width:100%">+ Neues Spiel</button>
    </div>
    <p class="center muted" style="font-size:0.8rem">10 rauf, 10 runter — Punkte-App</p>
  `;
}

// Hält pro Spieler-Slot einen (möglichst eindeutigen) Vorschlagsnamen vor,
// damit Platzhalter beim Re-Render stabil bleiben.
function ensureSuggestions(d) {
  d.suggestions = d.suggestions || [];
  while (d.suggestions.length < d.players.length) {
    d.suggestions.push(randomName(d.suggestions));
  }
  d.suggestions.length = d.players.length;
}

function renderNew() {
  if (!ui.draft) {
    ui.draft = { name: '', maxCards: 7, players: ['', ''], restrictLastBid: true, upOnly: false };
  }
  const d = ui.draft;
  ensureSuggestions(d);
  const playerInputs = d.players
    .map(
      (name, i) => `
      <div class="player-row">
        <span class="seat">${i + 1}</span>
        <input data-pname="${i}" value="${esc(name)}" placeholder="z.B. ${esc(d.suggestions[i])}" />
        <button class="icon-btn btn-ghost" data-action="suggest-name" data-i="${i}" title="Lustigen Namen einsetzen">🎲</button>
        <button class="icon-btn btn-ghost" data-action="rm-player" data-i="${i}" ${
        d.players.length <= 2 ? 'disabled' : ''
      }>✕</button>
      </div>`,
    )
    .join('');

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="home">‹</button>
      <h1>Neues Spiel</h1>
    </div>
    <div class="card">
      <label>Name des Spiels</label>
      <input data-field="name" value="${esc(d.name)}" placeholder="z.B. Spieleabend" />
      <label>Bis wie viele Karten? (Höhepunkt)</label>
      <input data-field="maxCards" type="number" inputmode="numeric" min="1" max="20" value="${d.maxCards}" />
      <label class="check-row">
        <input type="checkbox" data-field="playDown" ${d.upOnly ? '' : 'checked'} />
        <span>Nach dem Höhepunkt wieder herunterspielen</span>
      </label>
      <small class="muted">Runden: ${
        d.upOnly ? `1 → ${d.maxCards}` : `1 → ${d.maxCards} → 1`
      } = ${totalRounds(d.maxCards, d.upOnly)} Runden</small>
      <label class="check-row">
        <input type="checkbox" data-field="restrictLastBid" ${d.restrictLastBid ? 'checked' : ''} />
        <span>Letzter Spieler darf die Ansage nicht aufgehen lassen</span>
      </label>
      <small class="muted">Standardregel an: Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen. Aus = beliebige Ansagen erlaubt.</small>
    </div>
    <div class="card">
      <div class="row spread">
        <h2 style="margin:0">Spieler & Sitzreihenfolge</h2>
        <button class="btn-ghost btn-sm" data-action="fill-names" style="min-width:auto">🎲 Alle würfeln</button>
      </div>
      <p class="muted" style="margin:6px 0 4px;font-size:0.8rem">Tipp: 🎲 setzt einen lustigen Namen ein – oder eigene eintippen.</p>
      ${playerInputs}
      <button class="btn-ghost btn-sm" data-action="add-player" style="margin-top:10px">+ Spieler</button>
    </div>
    <button class="btn-primary" data-action="start" style="width:100%">Spiel starten</button>
  `;
}

function renderPlayers() {
  const game = current.game;
  if (game === undefined) return renderLoading('Lade Spiel …');
  if (game === null) return renderNotFound();
  const seated = seatSorted(game);
  const rows = seated
    .map(
      (p, i) => `
      <div class="player-row">
        <span class="seat">${i + 1}</span>
        <input data-edit-name="${p.id}" value="${esc(p.name)}" />
        <button class="icon-btn btn-ghost" data-action="seat-up" data-id="${p.id}" ${
        i === 0 ? 'disabled' : ''
      }>▲</button>
        <button class="icon-btn btn-ghost" data-action="seat-down" data-id="${p.id}" ${
        i === seated.length - 1 ? 'disabled' : ''
      }>▼</button>
      </div>`,
    )
    .join('');

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="open" data-id="${game.id}">‹</button>
      <h1>Spieler</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-top:0">Reihenfolge per ▲▼ ändern, Namen direkt bearbeiten. Punkte bleiben erhalten.</p>
      ${rows}
    </div>
    <button class="btn-primary" data-action="open" data-id="${game.id}" style="width:100%">Fertig</button>
  `;
}

function entryPanel(game) {
  const seated = seatSorted(game);
  const round = game.rounds[ui.activeRound];
  if (!round) return '';
  const cc = round.cardCount;

  const allBids = seated.every((p) => round.bids[p.id] != null);
  const trump = round.trump;
  const restrict = game.restrictLastBid !== false; // fehlend ⇒ Standardregel an

  // Ansage-Zeilen
  const bidRows = seated
    .map((p, pos) => {
      const isLast = pos === seated.length - 1;
      let sumOther = 0;
      let othersAllBid = true;
      seated.forEach((o) => {
        if (o.id === p.id) return;
        if (round.bids[o.id] == null) othersAllBid = false;
        else sumOther += round.bids[o.id];
      });
      const allowed = allowedBids({
        cardCount: cc,
        isLastBidder: isLast && othersAllBid && restrict,
        sumOtherBids: sumOther,
      });
      const pills = [];
      for (let v = 0; v <= cc; v++) {
        const forbidden = !allowed.includes(v);
        const sel = round.bids[p.id] === v;
        pills.push(
          `<button class="bid-pill ${sel ? 'selected' : ''} ${forbidden ? 'forbidden' : ''}"
            data-action="set-bid" data-pid="${p.id}" data-v="${v}" ${forbidden ? 'disabled' : ''}>${v}</button>`,
        );
      }
      return `
        <div class="entry-player">${esc(p.name)} ${
        isLast && restrict ? '<span class="pill">letzte Ansage</span>' : ''
      }</div>
        <div class="bid-grid">${pills.join('')}</div>`;
    })
    .join('');

  // Stiche-Zeilen (erst wenn alle Ansagen da sind)
  let tricksSection = '';
  if (allBids) {
    const tRows = seated
      .map((p) => {
        const pills = [];
        for (let v = 0; v <= cc; v++) {
          const sel = round.tricks[p.id] === v;
          pills.push(
            `<button class="bid-pill ${sel ? 'selected' : ''}"
              data-action="set-trick" data-pid="${p.id}" data-v="${v}">${v}</button>`,
          );
        }
        return `
          <div class="entry-player">${esc(p.name)}
            <span class="entry-sub">angesagt: ${round.bids[p.id]}</span></div>
          <div class="bid-grid">${pills.join('')}</div>`;
      })
      .join('');

    const chk = tricksCheck(round);
    const warn =
      Object.keys(round.tricks).length > 0 && !chk.ok
        ? `<div class="warn-box">⚠️ Summe der Stiche ist ${chk.sum}, sollte ${chk.expected} sein.</div>`
        : '';
    const allTricks = seated.every((p) => round.tricks[p.id] != null);

    tricksSection = `
      <h3 style="margin-top:18px">Gemachte Stiche</h3>
      ${tRows}
      ${warn}
      <button class="btn-primary" data-action="finish-round" style="width:100%;margin-top:12px"
        ${allTricks ? '' : 'disabled'}>
        ${round.done ? 'Änderungen speichern' : 'Runde abschließen'}
      </button>`;
  }

  return `
    <div class="card">
      <div class="row spread">
        <h2 style="margin:0">Runde ${ui.activeRound + 1}/${game.rounds.length}</h2>
        <span class="pill">${cc} ${cc === 1 ? 'Karte' : 'Karten'}</span>
      </div>
      <div class="row spread" style="margin-top:12px">
        <div>
          ${
            trump
              ? `<span class="trump"><span class="dot dot-${trump}"></span>${trump}</span>`
              : '<span class="muted" style="font-size:0.85rem">Kein Trumpf gelost</span>'
          }
        </div>
        <div class="btn-row" style="flex:0">
          <button class="btn-ghost btn-sm" data-action="lose-trump" style="min-width:auto">🎲 Farbe losen</button>
          ${
            trump
              ? '<button class="btn-ghost btn-sm" data-action="clear-trump" style="min-width:auto;flex:0">✕</button>'
              : ''
          }
        </div>
      </div>
      <h3 style="margin-top:18px">Ansagen</h3>
      ${bidRows}
      ${tricksSection}
    </div>`;
}

function roundsHistory(game) {
  const done = game.rounds.filter((r) => r.done);
  if (!done.length) return '';
  const items = done
    .map((r) => {
      const active = r.index === ui.activeRound;
      return `<button class="bid-pill btn-sm ${active ? 'selected' : ''}"
        data-action="edit-round" data-i="${r.index}" title="Runde ${r.index + 1} bearbeiten">
        ${r.index + 1}<small style="opacity:.7"> (${r.cardCount})</small></button>`;
    })
    .join('');
  return `
    <div class="card">
      <div class="row spread"><h2 style="margin:0">Fertige Runden</h2>
      <span class="muted" style="font-size:0.8rem">tippen zum Bearbeiten</span></div>
      <div class="bid-grid">${items}</div>
    </div>`;
}

function standingsTable(game) {
  const { byPlayer, ranking } = standings(game);
  const seated = seatSorted(game);
  const doneRounds = game.rounds.filter((r) => r.done);
  const rankOf = {};
  ranking.forEach((r) => (rankOf[r.playerId] = r.rank));

  const head = `
    <tr>
      <th class="name">Spieler</th>
      ${doneRounds.map((r) => `<th>R${r.index + 1}</th>`).join('')}
      <th>Gesamt</th>
    </tr>`;

  const rows = seated
    .map((p) => {
      const pr = byPlayer[p.id].perRound;
      const cells = pr.map((v) => `<td>${fmtScore(v)}</td>`).join('');
      const isLeader = rankOf[p.id] === 1 && byPlayer[p.id].total !== 0;
      return `
      <tr>
        <td class="name ${isLeader ? 'rank-1' : ''}">${isLeader ? '🥇 ' : ''}${esc(p.name)}</td>
        ${cells}
        <td class="total">${fmtScore(byPlayer[p.id].total)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card">
      <h2>Punktestand</h2>
      <div class="table-wrap"><table>
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${
        doneRounds.length === 0
          ? '<p class="center" style="margin:10px 0 0">Noch keine fertige Runde.</p>'
          : ''
      }
    </div>`;
}

function renderScorer() {
  const game = current.game;
  if (game === undefined) return renderLoading('Lade Spiel …');
  if (game === null) return renderNotFound();

  // aktive Runde bestimmen (erste nicht fertige, sonst letzte)
  if (ui.activeRound == null || !game.rounds[ui.activeRound]) {
    const next = game.rounds.findIndex((r) => !r.done);
    ui.activeRound = next === -1 ? game.rounds.length - 1 : next;
  }

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="home">‹</button>
      <h1>${esc(game.name)}</h1>
      <button class="icon-btn btn-ghost" data-action="players" data-id="${game.id}" title="Spieler">👥</button>
      <button class="icon-btn btn-ghost" data-action="share" data-id="${game.id}" title="Teilen">🔗</button>
    </div>
    ${entryPanel(game)}
    ${roundsHistory(game)}
    ${standingsTable(game)}
    <div class="card">
      <div class="btn-row">
        <button class="btn-ghost" data-action="view" data-id="${game.id}">👁 Zuschauer-Ansicht</button>
        <button class="btn-danger" data-action="delete" data-id="${game.id}">Spiel löschen</button>
      </div>
    </div>
  `;
}

function renderViewer() {
  const game = current.game;
  if (game === undefined) return renderLoading('Lade Live-Tabelle …');
  if (game === null) return renderNotFound();

  const done = game.rounds.filter((r) => r.done).length;
  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="home">‹</button>
      <h1>${esc(game.name)} <span class="pill">live</span></h1>
    </div>
    <p class="muted progress" style="margin-top:0">Runde ${Math.min(done + 1, game.rounds.length)}/${
    game.rounds.length
  } · nur Ansicht</p>
    ${standingsTable(game)}
  `;
}

// ---------- Aktionen ----------
function readDraftFromInputs() {
  if (!ui.draft) return;
  const name = appEl.querySelector('[data-field="name"]');
  const max = appEl.querySelector('[data-field="maxCards"]');
  if (name) ui.draft.name = name.value;
  if (max) ui.draft.maxCards = Math.max(1, Math.min(20, parseInt(max.value, 10) || 1));
  const restrict = appEl.querySelector('[data-field="restrictLastBid"]');
  if (restrict) ui.draft.restrictLastBid = restrict.checked;
  const playDown = appEl.querySelector('[data-field="playDown"]');
  if (playDown) ui.draft.upOnly = !playDown.checked;
  appEl.querySelectorAll('[data-pname]').forEach((inp) => {
    ui.draft.players[+inp.dataset.pname] = inp.value;
  });
}

async function shareGame(id) {
  const url = `${location.origin}${location.pathname}#/view/${id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Rauf Runter', text: 'Live-Tabelle', url });
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link kopiert:\n' + url);
    }
  } catch {
    /* abgebrochen */
  }
}

async function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id, i, pid, v } = t.dataset;
  const gid = id;
  const game = current.game;

  switch (action) {
    case 'home':
      ui.activeRound = null;
      navigate('/');
      break;
    case 'new':
      ui.draft = null;
      navigate('/new');
      break;
    case 'open':
      ui.activeRound = null;
      navigate('/game/' + gid);
      break;
    case 'players':
      navigate('/players/' + gid);
      break;
    case 'view':
      navigate('/view/' + gid);
      break;
    case 'share':
      shareGame(gid);
      break;

    case 'add-player':
      readDraftFromInputs();
      ui.draft.players.push('');
      renderNew();
      break;
    case 'rm-player':
      readDraftFromInputs();
      ui.draft.players.splice(+i, 1);
      if (ui.draft.suggestions) ui.draft.suggestions.splice(+i, 1);
      renderNew();
      break;
    case 'suggest-name': {
      readDraftFromInputs();
      const used = ui.draft.players.filter(Boolean);
      ui.draft.players[+i] = randomName(used);
      renderNew();
      break;
    }
    case 'fill-names': {
      readDraftFromInputs();
      ui.draft.players.forEach((n, idx) => {
        if (!n.trim()) {
          ui.draft.players[idx] = randomName(ui.draft.players.filter(Boolean));
        }
      });
      renderNew();
      break;
    }
    case 'start': {
      readDraftFromInputs();
      const names = ui.draft.players.map((n) => n.trim()).filter(Boolean);
      if (names.length < 2) return alert('Bitte mindestens 2 Spieler eintragen.');
      const newGame = createGame({
        name: ui.draft.name,
        maxCards: ui.draft.maxCards,
        playerNames: names,
        restrictLastBid: ui.draft.restrictLastBid !== false,
        upOnly: ui.draft.upOnly === true,
      });
      try {
        await fb.saveGame(newGame);
      } catch (err) {
        console.error(err);
        return alert('Spiel konnte nicht angelegt werden – bist du online?');
      }
      ui.draft = null;
      ui.activeRound = null;
      navigate('/game/' + newGame.id);
      break;
    }

    case 'seat-up':
    case 'seat-down': {
      if (!game) break;
      const seated = seatSorted(game);
      const idx = seated.findIndex((p) => p.id === pid);
      const swap = action === 'seat-up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= seated.length) break;
      const tmp = seated[idx].seatOrder;
      seated[idx].seatOrder = seated[swap].seatOrder;
      seated[swap].seatOrder = tmp;
      saveCurrent();
      break;
    }

    case 'set-bid':
    case 'set-trick': {
      if (!game) break;
      const round = game.rounds[ui.activeRound];
      const map = action === 'set-bid' ? round.bids : round.tricks;
      const val = +v;
      if (map[pid] === val) delete map[pid]; // nochmal tippen = abwählen
      else map[pid] = val;
      saveCurrent();
      break;
    }

    case 'finish-round': {
      if (!game) break;
      game.rounds[ui.activeRound].done = true;
      const next = game.rounds.findIndex((r) => !r.done);
      ui.activeRound = next === -1 ? game.rounds.length - 1 : next;
      saveCurrent();
      break;
    }

    case 'edit-round':
      ui.activeRound = +i;
      renderActiveView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;

    case 'lose-trump': {
      if (!game) break;
      game.rounds[ui.activeRound].trump = randomTrump();
      saveCurrent();
      break;
    }
    case 'clear-trump': {
      if (!game) break;
      delete game.rounds[ui.activeRound].trump;
      saveCurrent();
      break;
    }

    case 'delete': {
      if (!game) break;
      if (confirm(`„${game.name}" wirklich löschen?`)) {
        try {
          await fb.deleteGame(gid);
        } catch (err) {
          console.error(err);
          return alert('Löschen fehlgeschlagen – bist du online?');
        }
        ui.activeRound = null;
        navigate('/');
      }
      break;
    }
  }
}

// Namen in der Spieler-Bearbeitung — gebündelt speichern (Tippen erzeugt sonst viele Writes).
let nameSaveTimer = null;
function onInput(e) {
  const nameEdit = e.target.closest('[data-edit-name]');
  if (nameEdit && current.game) {
    const p = current.game.players.find((x) => x.id === nameEdit.dataset.editName);
    if (p) {
      p.name = e.target.value;
      clearTimeout(nameSaveTimer);
      nameSaveTimer = setTimeout(() => fb.saveGame(current.game).catch(console.error), 400);
    }
  }
}

// Änderungen im "Neues Spiel"-Formular (Kartenzahl/Schalter) → neu rendern,
// damit Rundenfolge und -anzahl sofort stimmen.
function onChange(e) {
  if (currentRoute().view !== 'new') return;
  if (e.target.closest('[data-field="maxCards"], [data-field="playDown"], [data-field="restrictLastBid"]')) {
    readDraftFromInputs();
    renderNew();
  }
}

// ---------- Bootstrap ----------
appEl.addEventListener('click', onClick);
appEl.addEventListener('input', onInput);
appEl.addEventListener('change', onChange);
window.addEventListener('hashchange', route);
route();
