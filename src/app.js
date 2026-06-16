// app.js — UI, Routing, Event-Handling (Vanilla, kein Build-Step).
import { store, createGame } from './store.js';
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

// ---------- Router ----------
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean); // z.B. ['game','abc']

  if (parts.length === 0) return renderHome();
  if (parts[0] === 'new') return renderNew();
  if (parts[0] === 'game' && parts[1]) return renderScorer(parts[1]);
  if (parts[0] === 'players' && parts[1]) return renderPlayers(parts[1]);
  if (parts[0] === 'view' && parts[1]) return renderViewer(parts[1]);
  return renderHome();
}

// ---------- Views ----------
function renderHome() {
  const games = store.listGames();
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

function renderNew() {
  if (!ui.draft) {
    ui.draft = { name: '', maxCards: 7, players: ['', ''] };
  }
  const d = ui.draft;
  const playerInputs = d.players
    .map(
      (name, i) => `
      <div class="player-row">
        <span class="seat">${i + 1}</span>
        <input data-pname="${i}" value="${esc(name)}" placeholder="Spieler ${i + 1}" />
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
      <small class="muted">Runden: 1 → ${d.maxCards} → 1 = ${totalRounds(d.maxCards)} Runden</small>
    </div>
    <div class="card">
      <div class="row spread"><h2>Spieler & Sitzreihenfolge</h2></div>
      ${playerInputs}
      <button class="btn-ghost btn-sm" data-action="add-player" style="margin-top:10px">+ Spieler</button>
    </div>
    <button class="btn-primary" data-action="start" style="width:100%">Spiel starten</button>
  `;
}

function renderPlayers(id) {
  const game = store.getGame(id);
  if (!game) return renderHome();
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
      <button class="icon-btn btn-ghost" data-action="open" data-id="${id}">‹</button>
      <h1>Spieler</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-top:0">Reihenfolge per ▲▼ ändern, Namen direkt bearbeiten. Punkte bleiben erhalten.</p>
      ${rows}
    </div>
    <button class="btn-primary" data-action="open" data-id="${id}" style="width:100%">Fertig</button>
  `;
}

function entryPanel(game) {
  const seated = seatSorted(game);
  const round = game.rounds[ui.activeRound];
  if (!round) return '';
  const cc = round.cardCount;

  const allBids = seated.every((p) => round.bids[p.id] != null);
  const trump = round.trump;

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
        isLastBidder: isLast && othersAllBid,
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
        isLast ? '<span class="pill">letzte Ansage</span>' : ''
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

function standingsTable(game, { editable } = {}) {
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

function renderScorer(id) {
  const game = store.getGame(id);
  if (!game) return renderHome();

  // aktive Runde bestimmen (erste nicht fertige, sonst letzte)
  if (ui.activeRound == null || !game.rounds[ui.activeRound]) {
    const next = game.rounds.findIndex((r) => !r.done);
    ui.activeRound = next === -1 ? game.rounds.length - 1 : next;
  }

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="home">‹</button>
      <h1>${esc(game.name)}</h1>
      <button class="icon-btn btn-ghost" data-action="players" data-id="${id}" title="Spieler">👥</button>
      <button class="icon-btn btn-ghost" data-action="share" data-id="${id}" title="Teilen">🔗</button>
    </div>
    ${entryPanel(game)}
    ${roundsHistory(game)}
    ${standingsTable(game)}
    <div class="card">
      <div class="btn-row">
        <button class="btn-ghost" data-action="view" data-id="${id}">👁 Zuschauer-Ansicht</button>
        <button class="btn-danger" data-action="delete" data-id="${id}">Spiel löschen</button>
      </div>
    </div>
  `;
}

function renderViewer(id) {
  const game = store.getGame(id);
  if (!game) {
    appEl.innerHTML = `<div class="empty">Spiel nicht gefunden.<br/>
      <small>Read-only-Links funktionieren erst mit der Cloud-Anbindung (M3) geräteübergreifend.</small></div>`;
    return;
  }
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

function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id, i, pid, v } = t.dataset;
  const gid = id;

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
      renderNew();
      break;
    case 'start': {
      readDraftFromInputs();
      const names = ui.draft.players.map((n) => n.trim()).filter(Boolean);
      if (names.length < 2) return alert('Bitte mindestens 2 Spieler eintragen.');
      const game = createGame({
        name: ui.draft.name,
        maxCards: ui.draft.maxCards,
        playerNames: names,
      });
      store.saveGame(game);
      ui.draft = null;
      ui.activeRound = null;
      navigate('/game/' + game.id);
      break;
    }

    case 'seat-up':
    case 'seat-down': {
      const game = store.getGame(currentGameId());
      const seated = seatSorted(game);
      const idx = seated.findIndex((p) => p.id === pid);
      const swap = action === 'seat-up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= seated.length) break;
      const a = seated[idx];
      const b = seated[swap];
      const tmp = a.seatOrder;
      a.seatOrder = b.seatOrder;
      b.seatOrder = tmp;
      store.saveGame(game);
      renderPlayers(game.id);
      break;
    }

    case 'set-bid':
    case 'set-trick': {
      const game = store.getGame(currentGameId());
      const round = game.rounds[ui.activeRound];
      const map = action === 'set-bid' ? round.bids : round.tricks;
      const val = +v;
      if (map[pid] === val) delete map[pid]; // nochmal tippen = abwählen
      else map[pid] = val;
      // Wenn eine Ansage geändert wird, könnte die verbotene Regel andere ungültig machen — Stiche bleiben.
      store.saveGame(game);
      renderScorer(game.id);
      break;
    }

    case 'finish-round': {
      const game = store.getGame(currentGameId());
      const round = game.rounds[ui.activeRound];
      round.done = true;
      store.saveGame(game);
      // zur nächsten offenen Runde springen
      const next = game.rounds.findIndex((r) => !r.done);
      ui.activeRound = next === -1 ? game.rounds.length - 1 : next;
      renderScorer(game.id);
      break;
    }

    case 'edit-round':
      ui.activeRound = +i;
      renderScorer(currentGameId());
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;

    case 'lose-trump': {
      const game = store.getGame(currentGameId());
      game.rounds[ui.activeRound].trump = randomTrump();
      store.saveGame(game);
      renderScorer(game.id);
      break;
    }
    case 'clear-trump': {
      const game = store.getGame(currentGameId());
      delete game.rounds[ui.activeRound].trump;
      store.saveGame(game);
      renderScorer(game.id);
      break;
    }

    case 'delete': {
      const game = store.getGame(gid);
      if (confirm(`„${game.name}" wirklich löschen?`)) {
        store.deleteGame(gid);
        ui.activeRound = null;
        navigate('/');
      }
      break;
    }
  }
}

// Spiel-ID aus dem aktuellen Hash (für Aktionen ohne data-id)
function currentGameId() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  return parts[1];
}

function onInput(e) {
  // Namen in der Spieler-Bearbeitung sofort speichern
  const nameEdit = e.target.closest('[data-edit-name]');
  if (nameEdit) {
    const game = store.getGame(currentGameId());
    const p = game.players.find((x) => x.id === nameEdit.dataset.editName);
    if (p) {
      p.name = e.target.value;
      store.saveGame(game);
    }
  }
}

// ---------- Bootstrap ----------
appEl.addEventListener('click', onClick);
appEl.addEventListener('input', onInput);
window.addEventListener('hashchange', route);
route();
