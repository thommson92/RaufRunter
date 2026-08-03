// app.js — UI, Routing, Event-Handling (Vanilla, kein Build-Step).
// Daten kommen live aus Firestore (store-firebase.js): jede Ansicht für ein
// einzelnes Spiel abonniert das Dokument und rendert bei jeder Änderung neu.
import { createGame } from './store.js';
import { fb } from './store-firebase.js';
import { profiles } from './store-profiles.js';
import { randomName } from './names.js';
import { esc } from './html.js';
import {
  createProfile,
  rollUniqueIdenticon,
  isNameTaken,
  matchProfiles,
  gamesUsingProfile,
  findMergeConflicts,
  remapGameProfile,
  applyProfileNames,
  unassignedPlayers,
  planNameAssignment,
} from './profile-model.js';
import {
  avatarHtml,
  avatarNameHtml,
  photoToDataUrl,
  pickerHtml,
  pickerOptionsHtml,
} from './profile-ui.js';
import {
  standings,
  moneyPayouts,
  allowedBids,
  biddingOrder,
  rotateToStart,
  tricksCheck,
  randomTrump,
  totalRounds,
  rankProgression,
  bidTrickTotals,
  accuracyStats,
  longestCorrectStreak,
  extremeRounds,
  trumpCounts,
  dealerMalusStats,
  roundEvents,
} from './engine.js';
import { assignSeriesColors, buildScoreChart, buildRankChart, buildBidVsTricksChart } from './charts.js';
import { buildDealerWheel } from './wheel.js';
import { generateRoundCommentary } from './commentary.js';

const appEl = document.getElementById('app');

// Spenden-Link auf der Startseite. Bewusst der paypal.me-Handle statt der
// E-Mail-Adresse, damit die Adresse nicht im öffentlichen HTML crawlbar ist.
const PAYPAL_URL = 'https://paypal.me/Thommyguun';

// Feedback-Link auf der Startseite — bewusst als mailto:, damit Rückmeldungen
// direkt beim Entwickler landen statt über ein eigenes Formular/Backend.
// Die Adresse steht dadurch (anders als beim Spendenlink oben) im HTML.
const FEEDBACK_MAILTO = `mailto:thomas-kellner@web.de?subject=${encodeURIComponent('Rauf Runter – Feedback')}`;

// Startseite zeigt anfangs nur die letzten N Spiele (Spenden-/Feedback-Buttons
// unten sollen bei vielen Spielen nicht erst nach langem Scrollen kommen).
const HOME_PAGE_SIZE = 5;

// Ausschüttungsmodi des Geldtopfs: Label fürs <select> + Kurzerklärung darunter.
const PAYOUT_MODE_LABELS = {
  'winner-takes-all': 'Sieger bekommt alles',
  'runner-up-refund': 'Zweiter bekommt seinen Einsatz zurück',
  'podium-cascade': 'Dritter Einsatz zurück, Zweiter doppelten Einsatz',
  manual: 'Manuelle Eingabe nach Spielende',
};
const PAYOUT_MODE_HINTS = {
  'winner-takes-all': 'Der Erstplatzierte bekommt den kompletten Topf (Einsatz × Spieleranzahl).',
  'runner-up-refund': 'Der Zweite bekommt seinen Einsatz zurück, der Rest des Topfs geht an den Sieger.',
  'podium-cascade': 'Der Dritte bekommt seinen Einsatz zurück, der Zweite den doppelten Einsatz, der Rest geht an den Sieger.',
  manual: 'Kein festes Schema — die Gewinne/Verluste werden nach der letzten Runde von Hand eingetragen.',
};

// Flüchtiger UI-Zustand (nicht persistiert).
const ui = {
  draft: null,        // Entwurf im "Neues Spiel"-Formular
  activeRound: null,  // welche Runde im Eingabe-Panel offen ist
  tableSort: 'seat',  // Punktestand-Sortierung: 'seat' (Sitzreihe) | 'rank' (Punkte)
  tableTranspose: false, // Achsen tauschen: false = Spieler-Zeilen, true = Runden-Zeilen
  lottery: null, // { profiles, winner } während der Geber-Auslosung beim Anlegen (#/new)
  homeVisibleCount: HOME_PAGE_SIZE, // wie viele Spiele auf der Startseite sichtbar sind
  pickerQuery: {}, // Sucheingabe je Combobox (Schlüssel = data-i)
  adminUnlocked: false, // Passwort im Admin-Bereich eingegeben (nur für diese Sitzung)
  admin: null, // { games, mergeFrom, mergeTo } im Admin-Bereich
};

/**
 * data-i-Präfix der Comboboxen in der Verwaltung („alte Runden zuordnen").
 * Der Schlüssel ist zugleich der Unterscheider zwischen den beiden
 * Einsatzorten der Combobox — siehe pickerStateFor().
 */
const ASSIGN_PREFIX = 'assign:';

// Nur eine einfache Hürde gegen versehentliches Löschen/Zusammenführen, keine
// echte Auth — bewusst im Client hinterlegt. Schützt: Spiel löschen, Profil
// löschen, Profile zusammenführen.
const ADMIN_PASSWORD = 'Leclec';

/** Passwortabfrage. @returns {boolean} true = freigegeben */
function askPassword(what) {
  const pw = prompt(`${what}\n\nBitte Passwort eingeben:`);
  if (pw === null) return false; // abgebrochen
  if (pw !== ADMIN_PASSWORD) {
    alert('Falsches Passwort – nichts geändert.');
    return false;
  }
  return true;
}

// Aktuell abonniertes Spiel (Live-Cache aus Firestore).
//   game === undefined  -> lädt noch
//   game === null        -> nicht gefunden
const current = { id: null, game: undefined, unsub: null };

// ---------- Helpers ----------

/**
 * Eingabefeld robust in eine endliche Zahl umwandeln — `parseFloat('1e309')`
 * liefert z. B. `Infinity`, das (anders als `NaN`) die `|| 0`-Falle nicht
 * auslöst und unbemerkt bis in Firestore und `moneyPayouts()` durchsickern
 * würde (dort macht `Infinity * 0 = NaN` dann JEDE Auszahlung kaputt, nicht
 * nur die des Spielers, der den Wert eingegeben hat).
 */
function toFiniteNumber(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtScore(n) {
  if (n == null) return '–';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${n}</span>`;
}

/** Reiner Betrag ohne Vorzeichen/Farbe, z. B. für Einsatz/Topf-Angaben. */
function fmtEuro(n) {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Gewinn/Verlust mit Vorzeichen und Farbe (grün/rot), z. B. für die Auszahlungs-Übersicht. */
function fmtMoney(n) {
  if (n == null) return '<span class="muted">–</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${fmtEuro(n)}</span>`;
}

function seatSorted(game) {
  return [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
}

/** Profil zu einem Spieler-Eintrag eines Spiels (null bei Altdaten ohne Zuordnung). */
function profileOf(gamePlayer) {
  return profiles.byId(gamePlayer.profileId);
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
  const { view, id } = currentRoute();
  switch (view) {
    case 'new':
      return renderNew();
    case 'game':
      return renderScorer();
    case 'players':
      return renderPlayers();
    case 'view':
      return renderViewer();
    case 'profiles':
      return id ? renderProfileEditor(id) : renderProfileList();
    case 'admin':
      return renderAdmin();
    default:
      return renderHome();
  }
}

/**
 * Solange die Profile fehlen, kann keine Ansicht sinnvoll rendern. Ein Fehler
 * (typisch: fehlende Firestore-Regel) muss dabei sichtbar werden — sonst steht
 * die App ohne Erklärung still.
 * @returns {boolean} true, wenn stattdessen ein Platzhalter gerendert wurde
 */
function renderProfileGate() {
  if (profiles.error) {
    appEl.innerHTML = `
      <div class="topbar"><button class="icon-btn btn-ghost" data-action="home">‹</button><h1>Spielerprofile</h1></div>
      <div class="card"><p style="margin:0">⚠️ ${esc(profiles.error)}</p></div>`;
    return true;
  }
  if (!profiles.isLoaded) {
    renderLoading('Lade Spielerprofile …');
    return true;
  }
  return false;
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

  const visible = games.slice(0, ui.homeVisibleCount);
  const remaining = games.length - visible.length;

  const items = games.length
    ? visible
        .map((g) => {
          const done = g.rounds.filter((r) => r.done).length;
          const total = g.rounds.length;
          const lead = standings(g).ranking[0];
          const date = g.createdAt
            ? new Date(g.createdAt).toLocaleDateString('de-DE')
            : null;
          return `
            <button class="card list-item" data-action="open" data-id="${esc(g.id)}">
              <div class="meta">
                <strong>${esc(g.name)}</strong><br/>
                <small>${date ? `${date} · ` : ''}${g.players.length} Spieler · Runde ${Math.min(done + 1, total)}/${total}${
            done === total ? ' · fertig' : ''
          }${lead && done ? ` · 🥇 ${esc(lead.name)}` : ''}</small>
              </div>
              <span class="muted">›</span>
            </button>`;
        })
        .join('')
    : `<div class="empty">Noch keine Spiele.<br/>Leg unten ein neues an.</div>`;

  appEl.innerHTML = `
    <div class="topbar">
      <h1>🃏 Rauf Runter</h1>
      <button class="icon-btn btn-ghost" data-action="profiles" title="Spielerprofile">👥</button>
    </div>
    ${items}
    ${
      remaining > 0
        ? `<button class="btn-ghost" data-action="show-more-games" style="width:100%;margin-bottom:14px">+ ${remaining} ${
            remaining === 1 ? 'weiteres Spiel' : 'weitere Spiele'
          } anzeigen</button>`
        : ''
    }
    <div class="card center" style="border-style:dashed">
      <button class="btn-primary" data-action="new" style="width:100%">+ Neues Spiel</button>
    </div>
    <div class="btn-row" style="margin-bottom:14px">
      <a class="btn-ghost" href="${PAYPAL_URL}" target="_blank" rel="noopener noreferrer">☕ Entwickler unterstützen</a>
      <a class="btn-ghost" href="${FEEDBACK_MAILTO}">✉️ Feedback geben</a>
    </div>
    <p class="center muted" style="font-size:0.8rem">Rauf & Runter – Punkte App · © ${new Date().getFullYear()} Thomas Kellner</p>
  `;
}

/**
 * Zustand einer Spieler-Combobox. Die Vorschläge hängen davon ab, wo die Box
 * steht: beim Anlegen einer Runde sind schon gesetzte Mitspieler ausgeblendet,
 * im Admin-Bereich stehen alle Profile zur Wahl.
 * @param {string} key data-i der Box
 * @param {string} query aktuelle Eingabe
 */
function pickerStateFor(key, query) {
  const all = profiles.all();
  // Der Schlüssel sagt, wo die Box steht — bewusst nicht die Route: sonst gäbe
  // es zwei Wahrheiten über denselben Sachverhalt (hier und im Klick-Handler),
  // und ein dritter Einsatzort bräche stillschweigend beide.
  if (key.startsWith(ASSIGN_PREFIX)) {
    return {
      key,
      profile: null,
      query,
      matches: matchProfiles(all, query),
      nameTaken: isNameTaken(all, query),
      placeholder: 'Profil suchen …',
    };
  }
  const index = +key;
  const seats = ui.draft ? ui.draft.players : [];
  return {
    key,
    profile: profiles.byId(seats[index]),
    query,
    matches: matchProfiles(all, query, {
      excludeIds: seats.filter((id, i) => id && i !== index),
    }),
    // Gegen ALLE Profile prüfen, nicht nur gegen die angezeigten Treffer: ein
    // schon auf einem anderen Sitz gewähltes Profil ist hier ausgeblendet.
    nameTaken: isNameTaken(all, query),
  };
}

/**
 * „💰 Geld"-Karte: ob um Geld gespielt wird, Einsatz, Ausschüttungsmodus.
 * Identisches Markup (gleiche `data-field`-Namen) für den Entwurf im
 * "Neues Spiel"-Formular (`renderNew`) UND die nachträgliche Bearbeitung in
 * der Schreiber-Ansicht (`renderScorer`) — nur die Auswertung des `change`-
 * Events unterscheidet sich je Route (siehe `onChange`).
 * `podium-cascade` braucht mindestens 3 Spieler (sonst bekäme bei 2 Spielern
 * der Zweite den doppelten Einsatz und der "Sieger" ginge leer aus oder
 * sogar ins Minus — das Gegenteil der Modus-Idee) und ist bei weniger
 * deaktiviert, siehe `moneyPayouts` in `src/engine.js`.
 * @param {{moneyEnabled:boolean, stake:number, payoutMode:string}} fields
 * @param {number} playerCount aktuelle Spieleranzahl (Entwurf oder Spiel)
 */
function moneyCard(fields, playerCount) {
  const modeOptions = Object.entries(PAYOUT_MODE_LABELS)
    .map(([value, label]) => {
      const disabled = value === 'podium-cascade' && playerCount < 3;
      return `<option value="${value}" ${fields.payoutMode === value ? 'selected' : ''} ${
        disabled ? 'disabled' : ''
      }>${esc(label)}${disabled ? ' (ab 3 Spielern)' : ''}</option>`;
    })
    .join('');
  return `
    <div class="card">
      <h2 style="margin:0 0 10px">💰 Geld</h2>
      <label class="check-row">
        <input type="checkbox" data-field="moneyEnabled" ${fields.moneyEnabled ? 'checked' : ''} />
        <span>Es wird um Geld gespielt</span>
      </label>
      ${
        fields.moneyEnabled
          ? `
        <label>Einsatz pro Spieler (€, fürs ganze Spiel)</label>
        <div class="stepper">
          <button type="button" class="stepper-btn" data-action="stake-dec" aria-label="Einsatz verringern" ${
            fields.stake <= 0 ? 'disabled' : ''
          }>−</button>
          <input class="stepper-value" data-field="stake" type="number" inputmode="decimal" min="0" step="1" value="${fields.stake}" />
          <button type="button" class="stepper-btn" data-action="stake-inc" aria-label="Einsatz erhöhen">+</button>
        </div>
        <label>Ausschüttung</label>
        <select data-field="payoutMode">${modeOptions}</select>
        <small class="muted">${esc(PAYOUT_MODE_HINTS[fields.payoutMode] || '')}</small>`
          : ''
      }
    </div>`;
}

function renderNew() {
  if (ui.lottery) return renderDealerLottery();
  if (renderProfileGate()) return;
  if (!ui.draft) {
    ui.draft = {
      name: '',
      maxCards: 10,
      players: [null, null], // Profil-IDs in Sitzreihenfolge
      restrictLastBid: true,
      upOnly: false,
      rollDealer: false,
      moneyEnabled: false,
      stake: 10,
      payoutMode: 'winner-takes-all',
    };
  }
  const d = ui.draft;
  const playerInputs = d.players
    .map(
      (_, i) => `
      <div class="player-row">
        <span class="seat">${i + 1}</span>
        ${pickerHtml(pickerStateFor(String(i), ui.pickerQuery[i] || ''))}
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
      <div class="stepper">
        <button type="button" class="stepper-btn" data-action="maxcards-dec" aria-label="Weniger Karten" ${
          d.maxCards <= 1 ? 'disabled' : ''
        }>−</button>
        <input class="stepper-value" data-field="maxCards" type="number" inputmode="numeric" min="1" max="15" value="${d.maxCards}" />
        <button type="button" class="stepper-btn" data-action="maxcards-inc" aria-label="Mehr Karten" ${
          d.maxCards >= 15 ? 'disabled' : ''
        }>+</button>
      </div>
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
    ${moneyCard(d, d.players.length)}
    <div class="card">
      <div class="row spread">
        <h2 style="margin:0">Spieler & Sitzreihenfolge</h2>
        <button class="btn-ghost btn-sm" data-action="profiles" style="min-width:auto">👥 Profile</button>
      </div>
      <p class="muted" style="margin:6px 0 4px;font-size:0.8rem">Namen eintippen – ab dem ersten Buchstaben kommen Vorschläge. Wer noch kein Profil hat, bekommt hier direkt eins.</p>
      ${playerInputs}
      <button class="btn-ghost btn-sm" data-action="add-player" style="margin-top:10px">+ Spieler</button>
      <label class="check-row">
        <input type="checkbox" data-field="rollDealer" ${d.rollDealer ? 'checked' : ''} />
        <span>Ersten Geber auslosen (Glücksrad)</span>
      </label>
      <small class="muted">Vor dem Start entscheidet ein Glücksrad, wer in Runde 1 gibt.</small>
    </div>
    <button class="btn-primary" data-action="start" style="width:100%">Spiel starten</button>
  `;
}

/** Zwischenschritt vorm Anlegen: Glücksrad lost aus, wer zuerst gibt. */
function renderDealerLottery() {
  const names = ui.lottery.profiles.map((p) => p.name);
  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="lottery-cancel">‹</button>
      <h1>Wer gibt zuerst?</h1>
    </div>
    <div class="card center" id="lottery-card">
      <p class="muted" style="margin-top:0">Dreh das Rad – wer getroffen wird, gibt in Runde 1.</p>
      <div id="wheel-mount"></div>
    </div>
  `;
  document.getElementById('wheel-mount').appendChild(buildDealerWheel(names, onWheelSettled));
}

/** Callback des Glücksrads, sobald es steht: Ergebnis anzeigen, Spiel noch nicht anlegen. */
function onWheelSettled(winnerIndex) {
  if (!ui.lottery || currentRoute().view !== 'new') return; // inzwischen weggenavigiert
  ui.lottery.winner = winnerIndex;
  const card = document.getElementById('lottery-card');
  if (!card) return;

  const p = document.createElement('p');
  p.className = 'lottery-result';
  p.textContent = `🎉 ${ui.lottery.profiles[winnerIndex].name} gibt als Erstes!`;

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.width = '100%';
  btn.style.marginTop = '10px';
  btn.textContent = 'Weiter zum Spiel';
  btn.dataset.action = 'lottery-continue';

  card.append(p, btn);
}

/** Legt das Spiel an (mit gegebener Spielerreihenfolge), speichert & navigiert hin. */
function createAndEnterGame(seatedProfiles) {
  const newGame = createGame({
    name: ui.draft.name,
    maxCards: ui.draft.maxCards,
    profiles: seatedProfiles,
    restrictLastBid: ui.draft.restrictLastBid !== false,
    upOnly: ui.draft.upOnly === true,
    moneyEnabled: ui.draft.moneyEnabled === true,
    stake: ui.draft.stake,
    payoutMode: ui.draft.payoutMode,
  });
  // Bewusst ohne await — wie in saveCurrent(): Firestore löst das Promise erst
  // bei Server-Bestätigung auf, offline also nie. Wir würden nicht navigieren,
  // und ein zweiter Tipp legte ein zweites Spiel an. Der lokale Cache kennt das
  // Spiel sofort, der Write wird nachgeholt.
  fb.saveGame(newGame).catch((e) => {
    console.error(e);
    alert('Speichern fehlgeschlagen – bist du online? Das Spiel wird nachgetragen, sobald wieder Verbindung besteht.');
  });
  resetDraft();
  ui.activeRound = null;
  navigate('/game/' + newGame.id);
}

/** Formular-Zustand des "Neues Spiel"-Entwurfs vollständig verwerfen. */
function resetDraft() {
  ui.draft = null;
  ui.lottery = null;
  ui.pickerQuery = {};
}

function renderPlayers() {
  const game = current.game;
  if (game === undefined) return renderLoading('Lade Spiel …');
  if (game === null) return renderNotFound();
  const seated = seatSorted(game);
  const rows = seated
    .map((p, i) => {
      const profile = profileOf(p);
      const label = profile
        ? `<button class="btn-ghost btn-sm player-profile-link" data-action="profile" data-pid="${esc(profile.id)}">
             ${avatarNameHtml(profile, profile.name, 28)}
           </button>`
        : `<span class="player-profile-link">${avatarNameHtml(null, p.name, 28)}</span>`;
      return `
      <div class="player-row" data-pid="${esc(p.id)}">
        <span class="seat">${i + 1}</span>
        ${label}
        <button class="icon-btn btn-ghost" data-action="seat-up" data-pid="${esc(p.id)}" ${
          i === 0 ? 'disabled' : ''
        }>▲</button>
        <button class="icon-btn btn-ghost" data-action="seat-down" data-pid="${esc(p.id)}" ${
          i === seated.length - 1 ? 'disabled' : ''
        }>▼</button>
      </div>`;
    })
    .join('');

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="open" data-id="${esc(game.id)}">‹</button>
      <h1>Spieler</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-top:0">Reihenfolge per ▲▼ ändern. Punkte bleiben erhalten. Namen und Bilder kommen aus dem Spielerprofil – tippe auf einen Namen, um es zu bearbeiten.</p>
      ${rows}
    </div>
    <button class="btn-primary" data-action="open" data-id="${esc(game.id)}" style="width:100%">Fertig</button>
  `;
}

// ---------- Spielerprofile ----------

/** Übersicht aller Profile — jeder darf hier neue anlegen. */
async function renderProfileList() {
  if (renderProfileGate()) return;
  const list = matchProfiles(profiles.all(), '');
  const games = await loadGamesQuietly();
  if (currentRoute().view !== 'profiles' || currentRoute().id) return; // inzwischen weggenavigiert

  // Ein Durchlauf statt einer Suche pro Profil.
  const counts = new Map();
  for (const game of games) {
    for (const p of game.players) {
      if (p.profileId) counts.set(p.profileId, (counts.get(p.profileId) || 0) + 1);
    }
  }
  const countOf = (id) => counts.get(id) || 0;

  const cards = list.length
    ? list
        .map((p) => {
          const n = countOf(p.id);
          return `
          <button class="profile-tile" data-action="profile" data-pid="${esc(p.id)}">
            ${avatarHtml(p, 64)}
            <strong>${esc(p.name)}</strong>
            <small class="muted">${n === 1 ? '1 Spiel' : `${n} Spiele`}</small>
          </button>`;
        })
        .join('')
    : '<div class="empty">Noch keine Profile.<br/>Leg unten das erste an.</div>';

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="home">‹</button>
      <h1>Spielerprofile</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-top:0">Profile werden bei jeder neuen Runde wiederverwendet – so heißt jeder immer gleich und die Statistiken passen zusammen.</p>
      <div class="profile-grid">${cards}</div>
    </div>
    <div class="card">
      <label>Neues Profil</label>
      <div class="row">
        <input data-field="new-profile" placeholder="z.B. ${esc(randomName())}" autocomplete="off" />
        <button class="btn-primary" data-action="add-profile" style="flex:0 0 auto">Anlegen</button>
      </div>
    </div>
    <button class="btn-ghost" data-action="admin" style="width:100%">🔧 Verwaltung</button>
  `;
}

/** Einzelnes Profil: Name & Profilbild ändern, löschen. */
async function renderProfileEditor(id) {
  if (renderProfileGate()) return;
  const profile = profiles.byId(id);
  if (!profile) {
    appEl.innerHTML = `
      <div class="topbar"><button class="icon-btn btn-ghost" data-action="profiles">‹</button><h1>Profil</h1></div>
      <div class="empty">Profil nicht gefunden.</div>`;
    return;
  }

  const games = await loadGamesQuietly();
  const route = currentRoute();
  if (route.view !== 'profiles' || route.id !== id) return; // inzwischen weggenavigiert
  const used = gamesUsingProfile(games, id);

  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="profiles">‹</button>
      <h1>${esc(profile.name)}</h1>
    </div>
    <div class="card center">
      <div class="profile-hero">${avatarHtml(profile, 120)}</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn-ghost" data-action="roll-avatar" data-pid="${esc(profile.id)}">🎲 Anderes Muster</button>
        <button class="btn-ghost" data-action="pick-photo" data-pid="${esc(profile.id)}">📷 Foto wählen</button>
      </div>
      <input type="file" accept="image/*" data-photo-input="${esc(profile.id)}" hidden />
      <p class="muted" style="margin:12px 0 0;font-size:0.8rem">
        Jedes Profilbild ist eindeutig – ein bereits vergebenes Muster wird nie ein zweites Mal vergeben.
      </p>
    </div>
    <div class="card">
      <label>Name</label>
      <div class="row">
        <input data-field="profile-name" value="${esc(profile.name)}" autocomplete="off" />
        <button class="btn-primary" data-action="save-profile-name" data-pid="${esc(profile.id)}" style="flex:0 0 auto">Speichern</button>
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:0.8rem">
        Der Name wird in allen ${used.length === 1 ? '1 Spiel' : `${used.length} Spielen`} nachgezogen – auch rückwirkend.
      </p>
    </div>
    <div class="card">
      <h2>Gespielt</h2>
      ${
        used.length
          ? used
              .map(
                (g) => `<button class="card list-item" data-action="open" data-id="${esc(g.id)}">
                  <div class="meta"><strong>${esc(g.name)}</strong><br/>
                  <small>${g.createdAt ? new Date(g.createdAt).toLocaleDateString('de-DE') : ''}</small></div>
                  <span class="muted">›</span></button>`,
              )
              .join('')
          : '<p class="muted" style="margin:0">Noch kein Spiel gespielt.</p>'
      }
    </div>
    <button class="btn-danger" data-action="delete-profile" data-pid="${esc(profile.id)}" style="width:100%">
      Profil löschen
    </button>
  `;
}

/**
 * Spiele laden, ohne die Ansicht zu blockieren, wenn es schiefgeht — die
 * Profilseiten funktionieren auch ohne die Spielliste (nur ohne Zählwerte).
 */
async function loadGamesQuietly() {
  try {
    return await fb.listGames();
  } catch (e) {
    console.error('Spiele konnten nicht geladen werden:', e);
    return [];
  }
}

// ---------- Verwaltung ----------

async function renderAdmin() {
  if (renderProfileGate()) return;
  if (!ui.adminUnlocked) {
    appEl.innerHTML = `
      <div class="topbar">
        <button class="icon-btn btn-ghost" data-action="profiles">‹</button>
        <h1>Verwaltung</h1>
      </div>
      <div class="card center">
        <p style="margin-top:0">Hier werden Profile zusammengeführt, alten Runden zugeordnet und gelöscht. Das geht nur mit Passwort.</p>
        <button class="btn-primary" data-action="admin-unlock" style="width:100%">Passwort eingeben</button>
      </div>`;
    return;
  }

  if (!ui.admin) {
    appEl.innerHTML = `
      <div class="topbar"><button class="icon-btn btn-ghost" data-action="profiles">‹</button><h1>Verwaltung</h1></div>
      <div class="empty">Lade Spiele …</div>`;
    let games;
    try {
      games = await fb.listGames();
    } catch (e) {
      // Hier darf keine stille leere Liste durchrutschen: sie sähe aus wie
      // „alles zugeordnet, keine Konflikte" und würde beim Zusammenführen zu
      // einem Profil-Löschen ohne Umhängen führen.
      console.error(e);
      if (currentRoute().view !== 'admin') return;
      appEl.innerHTML = `
        <div class="topbar"><button class="icon-btn btn-ghost" data-action="profiles">‹</button><h1>Verwaltung</h1></div>
        <div class="card"><p style="margin:0">⚠️ Die Spiele konnten nicht geladen werden. Ohne sie lässt sich nichts sicher zusammenführen oder zuordnen.</p></div>
        <button class="btn-ghost" data-action="admin-reload" style="width:100%">↻ Erneut versuchen</button>`;
      return;
    }
    if (currentRoute().view !== 'admin') return;
    ui.admin = { games, mergeFrom: null, mergeTo: null };
  }

  const { games } = ui.admin;
  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="profiles">‹</button>
      <h1>Verwaltung</h1>
    </div>
    ${mergeCard()}
    ${assignCard(games)}
    <button class="btn-ghost" data-action="admin-reload" style="width:100%">↻ Neu laden</button>
  `;
}

/** Zwei Profile zu einem zusammenführen (z.B. „Dimmes" und „Tommi"). */
function mergeCard() {
  const all = matchProfiles(profiles.all(), '');
  const option = (p, selected) =>
    `<option value="${esc(p.id)}" ${selected === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
  const from = profiles.byId(ui.admin.mergeFrom);
  const to = profiles.byId(ui.admin.mergeTo);
  const ready = from && to && from.id !== to.id;

  return `
    <div class="card">
      <h2>Profile zusammenführen</h2>
      <p class="muted" style="margin:0 0 8px;font-size:0.85rem">
        Derselbe Mensch unter zwei Namen? Alle Spiele des ersten Profils werden auf das zweite umgehängt, danach wird das erste gelöscht.
      </p>
      <label>Dieses Profil auflösen</label>
      <select data-field="merge-from">
        <option value="">– auswählen –</option>
        ${all.map((p) => option(p, ui.admin.mergeFrom)).join('')}
      </select>
      <label>… und übernehmen als</label>
      <select data-field="merge-to">
        <option value="">– auswählen –</option>
        ${all.map((p) => option(p, ui.admin.mergeTo)).join('')}
      </select>
      ${
        ready
          ? `<p style="margin:12px 0 0">Aus <strong>${esc(from.name)}</strong> wird überall <strong>${esc(
              to.name,
            )}</strong>.</p>`
          : ''
      }
      <button class="btn-danger" data-action="merge-profiles" style="width:100%;margin-top:12px" ${
        ready ? '' : 'disabled'
      }>Zusammenführen</button>
    </div>`;
}

/** Bestandsspieler ohne Profil den richtigen Profilen zuordnen. */
function assignCard(games) {
  const groups = unassignedPlayers(games);
  if (!groups.length) {
    return `
      <div class="card">
        <h2>Alte Runden zuordnen</h2>
        <p class="muted" style="margin:0">✅ Alle Spieler in allen Runden haben ein Profil.</p>
      </div>`;
  }

  const rows = groups
    .map((g) => {
      const key = ASSIGN_PREFIX + g.name;
      return `
      <div class="assign-row">
        <div class="assign-name">
          <strong>${esc(g.name)}</strong>
          <small class="muted">${g.count === 1 ? '1 Runde' : `${g.count} Runden`}: ${esc(
            [...new Set(g.entries.map((e) => e.gameName))].join(', '),
          )}</small>
        </div>
        ${pickerHtml(pickerStateFor(key, ui.pickerQuery[key] || g.name))}
      </div>`;
    })
    .join('');

  return `
    <div class="card">
      <h2>Alte Runden zuordnen</h2>
      <p class="muted" style="margin:0 0 10px;font-size:0.85rem">
        Diese Namen aus früheren Runden gehören noch zu keinem Profil. Profil auswählen oder neu anlegen – der Name wird dann in den alten Runden auf den Profilnamen gesetzt.
      </p>
      ${rows}
    </div>`;
}

function entryPanel(game) {
  const seated = seatSorted(game);
  // Ansage-Reihenfolge folgt dem rotierenden Geber: er sagt zuletzt an und
  // trägt den Nachteil der verbotenen Ansage. Rotiert pro Runde weiter.
  const order = biddingOrder(seated, ui.activeRound);
  const round = game.rounds[ui.activeRound];
  if (!round) return '';
  const cc = round.cardCount;

  const allBids = order.every((p) => round.bids[p.id] != null);
  const trump = round.trump;
  const restrict = game.restrictLastBid !== false; // fehlend ⇒ Standardregel an
  const dealer = order[order.length - 1];

  // Ansage-Zeilen (in Ansage-Reihenfolge, Geber zuletzt)
  const bidRows = order
    .map((p, pos) => {
      const isLast = pos === order.length - 1;
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
            data-action="set-bid" data-pid="${esc(p.id)}" data-v="${v}" ${forbidden ? 'disabled' : ''}>${v}</button>`,
        );
      }
      return `
        <div class="entry-player">${avatarNameHtml(profileOf(p), p.name)} ${
        isLast ? '<span class="pill">🃏 gibt</span>' : ''
      }${
        isLast && restrict ? ' <span class="pill">letzte Ansage</span>' : ''
      }</div>
        <div class="bid-grid">${pills.join('')}</div>`;
    })
    .join('');

  // Stiche-Zeilen (erst wenn alle Ansagen da sind) — gleiche Reihenfolge
  let tricksSection = '';
  if (allBids) {
    const tRows = order
      .map((p) => {
        const pills = [];
        for (let v = 0; v <= cc; v++) {
          const sel = round.tricks[p.id] === v;
          pills.push(
            `<button class="bid-pill ${sel ? 'selected' : ''}"
              data-action="set-trick" data-pid="${esc(p.id)}" data-v="${v}">${v}</button>`,
          );
        }
        return `
          <div class="entry-player">${avatarNameHtml(profileOf(p), p.name)}
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
      <h3 class="section-label">Auswertung</h3>
      ${tRows}
      ${warn}
      <button class="btn-primary" data-action="finish-round" style="width:100%;margin-top:12px"
        ${allTricks ? '' : 'disabled'}>
        ${round.done ? 'Änderungen speichern' : 'Runde abschließen'}
      </button>`;
  }

  return `
    <div class="card">
      <h2 style="margin:0">Runde ${ui.activeRound + 1}/${game.rounds.length}</h2>
      ${
        dealer
          ? `<h3 class="section-label">Geber</h3>
             <p class="dealer-line">${avatarNameHtml(profileOf(dealer), dealer.name)}<span>gibt ${cc} ${
              cc === 1 ? 'Karte' : 'Karten'
            } 🃏${restrict ? ' · sagt zuletzt an' : ''}</span></p>`
          : ''
      }
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
      <h3 class="section-label">Ansagen</h3>
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
  const doneRounds = game.rounds.filter((r) => r.done);
  const rankOf = {};
  ranking.forEach((r) => (rankOf[r.playerId] = r.rank));

  // Spielerreihenfolge nach Sortierung: Sitzreihe oder Punktestand.
  const byId = Object.fromEntries(game.players.map((p) => [p.id, p]));
  const players =
    ui.tableSort === 'rank'
      ? ranking.map((r) => byId[r.playerId])
      : seatSorted(game);

  const isLeader = (pid) => rankOf[pid] === 1 && byPlayer[pid].total !== 0;
  const nameCell = (p) => `${isLeader(p.id) ? '🥇 ' : ''}${esc(p.name)}`;

  let head, body;
  if (!ui.tableTranspose) {
    // Layout A: Spieler = Zeilen, Runden = Spalten
    head = `
      <tr>
        <th class="name">Spieler</th>
        ${doneRounds.map((r) => `<th title="Runde ${r.index + 1}">${r.cardCount}</th>`).join('')}
        <th class="sticky-right">Gesamt</th>
      </tr>`;
    body = players
      .map((p) => {
        const cells = byPlayer[p.id].perRound
          .map((v) => `<td>${fmtScore(v)}</td>`)
          .join('');
        return `
        <tr>
          <td class="name ${isLeader(p.id) ? 'rank-1' : ''}">${nameCell(p)}</td>
          ${cells}
          <td class="total sticky-right">${fmtScore(byPlayer[p.id].total)}</td>
        </tr>`;
      })
      .join('');
  } else {
    // Layout B: Runden = Zeilen, Spieler = Spalten (Achsen getauscht)
    head = `
      <tr>
        <th class="name">Karten</th>
        ${players
          .map(
            (p) => `<th class="${isLeader(p.id) ? 'rank-1' : ''}">${nameCell(p)}</th>`,
          )
          .join('')}
      </tr>`;
    const roundRows = doneRounds
      .map((r, i) => {
        const cells = players
          .map((p) => `<td>${fmtScore(byPlayer[p.id].perRound[i])}</td>`)
          .join('');
        return `
        <tr>
          <td class="name" title="Runde ${r.index + 1}">${r.cardCount}</td>
          ${cells}
        </tr>`;
      })
      .join('');
    const totalRow = `
      <tr>
        <td class="name total">Gesamt</td>
        ${players
          .map((p) => `<td class="total">${fmtScore(byPlayer[p.id].total)}</td>`)
          .join('')}
      </tr>`;
    body = roundRows + totalRow;
  }

  return `
    <div class="card">
      <h2 style="margin:0 0 10px">Punktestand</h2>
      <div class="table-controls">
        <div>
          <span class="table-controls-label">Sortieren nach</span>
          <div class="seg-group">
            <button class="seg-btn ${ui.tableSort !== 'rank' ? 'active' : ''}" data-action="set-sort" data-v="seat">Sitzreihenfolge</button>
            <button class="seg-btn ${ui.tableSort === 'rank' ? 'active' : ''}" data-action="set-sort" data-v="rank">Punktestand</button>
          </div>
        </div>
        <div>
          <span class="table-controls-label">Pro Zeile</span>
          <div class="seg-group">
            <button class="seg-btn ${!ui.tableTranspose ? 'active' : ''}" data-action="set-axis" data-v="players">1 Spieler</button>
            <button class="seg-btn ${ui.tableTranspose ? 'active' : ''}" data-action="set-axis" data-v="rounds">1 Runde</button>
          </div>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table></div>
      ${
        doneRounds.length === 0
          ? '<p class="center" style="margin:10px 0 0">Noch keine fertige Runde.</p>'
          : ''
      }
    </div>`;
}

// Scrollt die Punktestand-Tabelle immer ganz nach rechts (aktuellste Runde) —
// nur relevant für Layout A, wo Runden als Spalten nach rechts wachsen.
function scrollTableToLatest() {
  if (ui.tableTranspose) return;
  const wrap = appEl.querySelector('.table-wrap');
  if (wrap) wrap.scrollLeft = wrap.scrollWidth;
}

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * „💰 Auszahlung"-Karte: wer hat am Ende wie viel gewonnen/verloren
 * (`engine.moneyPayouts`). Nur sichtbar, wenn für das Spiel Geld läuft;
 * berechnet wird erst nach der letzten Runde (vorher nur ein Hinweis).
 * Bei `payoutMode === 'manual'` sind die Beträge in der Schreiber-Ansicht
 * (`editable === true`) direkt eintragbare Zahlenfelder (schreibt in
 * `current.game.manualPayouts` und speichert über `saveCurrent()`, siehe
 * `onClick`/`onChange`), in der Zuschauer-Ansicht reiner Text.
 * @param {object} game
 * @param {boolean} editable Schreiber-Ansicht (true) oder Zuschauer-Ansicht (false)
 */
function payoutCard(game, editable) {
  if (!game.moneyEnabled) return '';

  const allDone = game.rounds.length > 0 && game.rounds.every((r) => r.done);
  if (!allDone) {
    return `
      <div class="card">
        <h2 style="margin:0 0 10px">💰 Auszahlung</h2>
        <p class="muted" style="margin:0">Wird nach der letzten Runde berechnet.</p>
      </div>`;
  }

  const isManual = game.payoutMode === 'manual';
  const payouts = [...moneyPayouts(game)].sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity));
  const byId = Object.fromEntries(game.players.map((p) => [p.id, p]));

  const rows = payouts
    .map((entry) => {
      const p = byId[entry.playerId];
      const place = RANK_MEDALS[entry.rank] || `${entry.rank}.`;
      const amount =
        isManual && editable
          ? `<input class="payout-input" type="number" step="0.5" data-action="set-manual-payout"
               data-pid="${esc(entry.playerId)}" value="${entry.net ?? ''}" placeholder="0" />`
          : entry.net == null
            ? '<span class="muted payout-empty">noch nicht eingetragen</span>'
            : fmtMoney(entry.net);
      return `
        <div class="payout-row">
          <span class="payout-rank">${place}</span>
          ${avatarNameHtml(profileOf(p), entry.name)}
          <span class="payout-amount">${amount}</span>
        </div>`;
    })
    .join('');

  const pot = (game.stake || 0) * game.players.length;
  // Fehlendes payoutMode (z.B. Geld nachträglich aktiviert, aber Auswahl nie
  // angefasst — moneyCard zeigt dann zwar korrekt "Sieger bekommt alles" an,
  // schreibt das aber erst bei echter Auswahl ins Dokument) ⇒ gleicher
  // Default wie in moneyCard/moneyPayouts, sonst würde hier "undefined" stehen.
  const effectiveMode = game.payoutMode || 'winner-takes-all';
  const subline = isManual
    ? esc(PAYOUT_MODE_LABELS.manual)
    : `Einsatz ${fmtEuro(game.stake || 0)} × ${game.players.length} Spieler = Topf ${fmtEuro(pot)} · ${esc(
        PAYOUT_MODE_LABELS[effectiveMode],
      )}`;

  return `
    <div class="card">
      <h2 style="margin:0 0 4px">💰 Auszahlung</h2>
      <p class="muted" style="margin:0 0 10px;font-size:0.8rem">${subline}</p>
      ${rows}
    </div>`;
}

/**
 * Avatar-Leiste ganz oben in der Zuschaueransicht — der einzige Ort, an dem
 * alle Spieler mit Profilbild dauerhaft sichtbar sind, auch nach der letzten
 * Runde (wenn die Karte „Aktuelle Runde" schon verschwunden ist). Vor der
 * ersten fertigen Runde in Sitzreihenfolge ohne Platz/Punkte, sonst nach
 * Punktestand sortiert mit Platzierung (Top 3 als Medaille).
 */
function playerStrip(game) {
  const doneRounds = game.rounds.filter((r) => r.done);
  if (!doneRounds.length) {
    const items = seatSorted(game)
      .map(
        (p) => `
        <div class="player-strip-item">
          ${avatarHtml(profileOf(p), 52)}
          <span class="player-strip-name">${esc(p.name)}</span>
        </div>`,
      )
      .join('');
    return `<div class="card player-strip">${items}</div>`;
  }

  const { byPlayer, ranking } = standings(game);
  const byId = Object.fromEntries(game.players.map((p) => [p.id, p]));
  const items = ranking
    .map((r) => {
      const p = byId[r.playerId];
      const place = RANK_MEDALS[r.rank] || `${r.rank}.`;
      return `
        <div class="player-strip-item">
          ${avatarHtml(profileOf(p), 52)}
          <span class="player-strip-name-row">
            <span class="player-strip-rank">${place}</span>
            <span class="player-strip-name">${esc(p.name)}</span>
          </span>
          <span class="player-strip-score">${fmtScore(byPlayer[p.id].total)}</span>
        </div>`;
    })
    .join('');
  return `<div class="card player-strip">${items}</div>`;
}

/**
 * Live-Status der aktuell laufenden Runde für die Zuschaueransicht: Geber &
 * Kartenzahl, wer bereits angesagt hat (und was), wie viele Stiche noch
 * offen/schon zu viel angesagt sind, wer als Nächstes dran ist — bzw. sobald
 * alle angesagt haben: wer schon Stiche eingetragen hat.
 */
function currentRoundCard(game) {
  const idx = game.rounds.findIndex((r) => !r.done);
  if (idx === -1) return '';
  const round = game.rounds[idx];
  const seated = seatSorted(game);
  const order = biddingOrder(seated, idx);
  const dealer = order[order.length - 1];
  const cc = round.cardCount;
  const trump = round.trump;
  const allBids = order.every((p) => round.bids[p.id] != null);
  const nextBidder = order.find((p) => round.bids[p.id] == null);

  let bidSum = 0;
  const bidRows = order
    .map((p) => {
      const has = round.bids[p.id] != null;
      if (has) bidSum += round.bids[p.id];
      const isNext = !has && nextBidder && p.id === nextBidder.id;
      const status = has
        ? `<span class="pill">angesagt: ${round.bids[p.id]}</span>`
        : isNext
          ? '<span class="pill pill-next">ist dran</span>'
          : '<span class="muted" style="font-size:0.8rem">wartet</span>';
      return `
        <div class="live-row ${has ? 'live-row-done' : isNext ? 'live-row-next' : 'live-row-waiting'}">
          <span>${avatarNameHtml(profileOf(p), p.name)}${p.id === dealer.id ? ' 🃏' : ''}</span>
          ${status}
        </div>`;
    })
    .join('');

  const remaining = cc - bidSum;
  const bidSummary = allBids
    ? ''
    : remaining >= 0
      ? `<p class="muted" style="margin:8px 0 0">Noch offen: <strong>${remaining}</strong> von ${cc}</p>`
      : `<p class="muted" style="margin:8px 0 0">Bereits <strong>${Math.abs(remaining)}</strong> mehr angesagt als Karten (${cc})</p>`;

  let tricksBlock = '';
  if (allBids) {
    let trickSum = 0;
    const trickRows = order
      .map((p) => {
        const has = round.tricks[p.id] != null;
        if (has) trickSum += round.tricks[p.id];
        return `
          <div class="live-row ${has ? 'live-row-done' : 'live-row-waiting'}">
            <span>${avatarNameHtml(profileOf(p), p.name)}</span>
            ${
              has
                ? `<span class="pill">Stiche: ${round.tricks[p.id]}</span>`
                : '<span class="muted" style="font-size:0.8rem">wartet</span>'
            }
          </div>`;
      })
      .join('');
    tricksBlock = `
      <h3 class="section-label">Auswertung</h3>
      ${trickRows}
      <p class="muted" style="margin:8px 0 0">Bisher gemacht: <strong>${trickSum}</strong> von ${cc}</p>`;
  }

  return `
    <div class="card">
      <h2 style="margin:0">Aktuelle Runde</h2>
      <h3 class="section-label">Geber</h3>
      <p class="dealer-line">${avatarNameHtml(profileOf(dealer), dealer.name)}<span>gibt ${cc} ${
    cc === 1 ? 'Karte' : 'Karten'
  } 🃏${
    trump ? ` · <span class="trump"><span class="dot dot-${trump}"></span>${trump}</span>` : ''
  }</span></p>
      <h3 class="section-label">Ansagen</h3>
      ${bidRows}
      ${bidSummary}
      ${tricksBlock}
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
      <button class="icon-btn btn-ghost" data-action="players" data-id="${esc(game.id)}" title="Spieler">👥</button>
      <button class="icon-btn btn-ghost" data-action="share" data-id="${esc(game.id)}" title="Teilen">🔗</button>
    </div>
    ${entryPanel(game)}
    ${roundsHistory(game)}
    ${standingsTable(game)}
    ${payoutCard(game, true)}
    ${moneyCard(
      {
        moneyEnabled: game.moneyEnabled === true,
        stake: game.stake || 10,
        payoutMode: game.payoutMode || 'winner-takes-all',
      },
      game.players.length,
    )}
    <div class="card">
      <div class="btn-row">
        <button class="btn-ghost" data-action="view" data-id="${esc(game.id)}">👁 Zuschauer-Ansicht</button>
        <button class="btn-danger" data-action="delete" data-id="${esc(game.id)}">Spiel löschen</button>
      </div>
    </div>
  `;
  scrollTableToLatest();
}

function renderViewer() {
  const game = current.game;
  if (game === undefined) return renderLoading('Lade Live-Tabelle …');
  if (game === null) return renderNotFound();

  const done = game.rounds.filter((r) => r.done).length;
  appEl.innerHTML = `
    <div class="topbar">
      <button class="icon-btn btn-ghost" data-action="open" data-id="${esc(game.id)}">‹</button>
      <h1>${esc(game.name)} <span class="pill">live</span></h1>
    </div>
    <p class="muted progress" style="margin-top:0">Runde ${Math.min(done + 1, game.rounds.length)}/${
    game.rounds.length
  } · nur Ansicht</p>
    ${playerStrip(game)}
    ${currentRoundCard(game)}
    ${commentaryCard(game)}
    ${standingsTable(game)}
    ${payoutCard(game, false)}
    ${chartCard('Punkteverlauf', 'score')}
    ${chartCard('Platzierungsverlauf', 'rank')}
    ${statsFactsCard(game)}
    ${malusCard(game)}
    ${chartCard('Angesagt vs. gemacht', 'bidtrick')}
  `;
  scrollTableToLatest();
  mountStatsCharts(game);
}

// ---------- Statistiken (Zuschaueransicht) ----------
const TRUMP_EMOJI = { Rot: '🔴', Blau: '🔵', Grün: '🟢', Gelb: '🟡' };

/**
 * Bestes & schlechtestes Element einer Liste { name, value } — für Fakten-
 * Kacheln. Bei Gleichstand werden ALLE Namen am Extremwert genannt, nicht
 * nur der erstbeste (z. B. zwei Spieler mit derselben Anzahl Ansagen).
 */
function extremeGroup(entries) {
  if (!entries.length) return { best: null, worst: null };
  const maxVal = Math.max(...entries.map((e) => e.value));
  const minVal = Math.min(...entries.map((e) => e.value));
  return {
    best: { value: maxVal, names: entries.filter((e) => e.value === maxVal).map((e) => e.name) },
    worst: { value: minVal, names: entries.filter((e) => e.value === minVal).map((e) => e.name) },
  };
}

function statTile(icon, label, value, sub) {
  return `
    <div class="stat-tile">
      <div class="stat-tile-icon">${icon}</div>
      <div class="stat-tile-label">${esc(label)}</div>
      <div class="stat-tile-value">${value}</div>
      <div class="stat-tile-sub">${esc(sub)}</div>
    </div>`;
}

function statsFactsCard(game) {
  const doneRounds = game.rounds.filter((r) => r.done);
  const body = !doneRounds.length
    ? '<p class="center muted" style="margin:10px 0 0">Noch keine fertige Runde.</p>'
    : statsFacts(game, doneRounds);
  return `<div class="card"><h2>Statistiken</h2>${body}</div>`;
}

const namesList = (names) => names.map(esc).join(', ');

function statsFacts(game, doneRounds) {
  const acc = accuracyStats(game);
  const totals = bidTrickTotals(game);
  const streaks = longestCorrectStreak(game);
  const { best: bestRounds } = extremeRounds(game);
  const trumps = trumpCounts(game);

  const accEntries = game.players
    .map((p) => ({ name: p.name, value: acc[p.id].accuracy }))
    .filter((e) => e.value != null);
  const { best: bestAcc, worst: worstAcc } = extremeGroup(accEntries);

  const bidEntries = game.players.map((p) => ({ name: p.name, value: totals[p.id].bidSum }));
  const { best: mostBid, worst: fewestBid } = extremeGroup(bidEntries);

  const streakEntries = game.players
    .map((p) => ({ name: p.name, value: streaks[p.id] }))
    .filter((e) => e.value > 0);
  const bestStreak = extremeGroup(streakEntries).best;

  const maxTrump = trumps && Object.values(trumps).length ? Math.max(...Object.values(trumps)) : 0;
  const topTrumpColors = maxTrump > 0 ? Object.keys(trumps).filter((c) => trumps[c] === maxTrump) : [];

  const tiles = [];
  if (bestAcc) {
    tiles.push(statTile('🎯', 'Treffsicherste Ansage', namesList(bestAcc.names), `${Math.round(bestAcc.value * 100)}% Treffer`));
  }
  if (worstAcc && worstAcc.value !== bestAcc.value) {
    tiles.push(statTile('🎲', 'Unsicherste Ansage', namesList(worstAcc.names), `${Math.round(worstAcc.value * 100)}% Treffer`));
  }
  if (mostBid) {
    tiles.push(statTile('✋', 'Meiste Stiche angesagt', namesList(mostBid.names), `${mostBid.value} insgesamt`));
  }
  if (fewestBid && fewestBid.value !== mostBid.value) {
    tiles.push(statTile('🤏', 'Wenigste Stiche angesagt', namesList(fewestBid.names), `${fewestBid.value} insgesamt`));
  }
  if (bestStreak) {
    tiles.push(statTile('🔥', 'Längste Treffer-Serie', namesList(bestStreak.names), `${bestStreak.value} Runden in Folge`));
  }
  if (bestRounds.length) {
    const signed = bestRounds[0].score > 0 ? '+' + bestRounds[0].score : String(bestRounds[0].score);
    const who = bestRounds.map((e) => `${esc(e.name)} (R${e.roundIndex + 1})`).join(', ');
    tiles.push(statTile('🏆', 'Beste Einzelrunde', who, `${signed} Punkte`));
  }
  if (topTrumpColors.length) {
    const icon = topTrumpColors.length === 1 ? TRUMP_EMOJI[topTrumpColors[0]] || '🎲' : '🎲';
    tiles.push(statTile(icon, 'Liebste Trumpffarbe', namesList(topTrumpColors), `${maxTrump}× gelost`));
  }

  return `<div class="stat-grid">${tiles.join('')}</div>`;
}

/**
 * Kreisdiagramm für einen Spieler: Anteil der Geber-Runden ohne Einfluss
 * (grau), mit Malus + richtig (grün) und mit Malus + falsch (rot). Feste
 * Reihenfolge im Uhrzeigersinn (neutral → richtig → falsch), damit die
 * Farbbedeutung über alle Spieler hinweg gleich bleibt.
 */
function malusPie(r) {
  const total = r.dealerRounds;
  if (total === 0) {
    return '<div class="malus-pie" style="background: var(--surface)"></div>';
  }
  const p1 = (r.neutral / total) * 100;
  const p2 = p1 + (r.malusCorrect / total) * 100;
  return `<div class="malus-pie" style="background: conic-gradient(
    var(--muted) 0 ${p1}%,
    var(--good) ${p1}% ${p2}%,
    var(--bad) ${p2}% 100%
  )"></div>`;
}

/**
 * Bilanz-Karte: wie oft war jemand als letzter Ansagender (Geber) dran, wie
 * oft hatte die verbotene Ansage dabei überhaupt Einfluss auf ihn — und lag
 * er dann richtig oder falsch? Immer sichtbar, auch ohne bisherigen Malus.
 */
function malusCard(game) {
  const stats = dealerMalusStats(game);
  const rows = game.players
    .map((p) => ({ name: p.name, ...stats[p.id] }))
    .sort((a, b) => b.dealerRounds - a.dealerRounds);

  const body = rows
    .map(
      (r) => `
        <div class="malus-player">
          ${malusPie(r)}
          <div class="malus-player-name">${esc(r.name)}</div>
          <div class="malus-player-detail muted">
            ${r.dealerRounds}× Geber<br/>${r.neutral} ohne Einfluss · ${r.malusCorrect} richtig · ${r.malusWrong} falsch
          </div>
        </div>`,
    )
    .join('');

  return `
    <div class="card">
      <h2>Malus-Bilanz</h2>
      <p class="muted" style="margin:0 0 10px;font-size:0.8rem">Wie oft war jemand als Geber eingeschränkt (Ansage durfte nicht aufgehen) — und lag dann richtig oder falsch?</p>
      <div class="malus-legend">
        <span><span class="dot" style="background:var(--muted)"></span>ohne Einfluss</span>
        <span><span class="dot" style="background:var(--good)"></span>Malus, richtig</span>
        <span><span class="dot" style="background:var(--bad)"></span>Malus, falsch</span>
      </div>
      <div class="malus-grid">${body}</div>
    </div>`;
}

/** Regelbasierter „Kommentator"-Text zur zuletzt fertig gespielten Runde. */
function commentaryCard(game) {
  const doneIndexes = game.rounds.filter((r) => r.done).map((r) => r.index);
  if (!doneIndexes.length) return '';
  const lastIndex = doneIndexes[doneIndexes.length - 1];
  const events = roundEvents(game, lastIndex);
  const text = generateRoundCommentary(events);
  if (!text) return '';
  return `
    <div class="card">
      <h2>🎙️ Rundenkommentar</h2>
      <p style="margin:0">${esc(text)}</p>
    </div>`;
}

function chartCard(title, chartId) {
  return `
    <div class="card">
      <h2 style="margin-bottom:4px">${esc(title)}</h2>
      <div class="chart-mount" data-chart="${chartId}"></div>
    </div>`;
}

function mountStatsCharts(game) {
  const series = assignSeriesColors(game.players);
  const progression = rankProgression(game);
  const totals = bidTrickTotals(game);

  const scoreMount = appEl.querySelector('[data-chart="score"]');
  if (scoreMount) scoreMount.replaceChildren(buildScoreChart(progression, series));

  const rankMount = appEl.querySelector('[data-chart="rank"]');
  if (rankMount) rankMount.replaceChildren(buildRankChart(progression, series));

  const bidTrickMount = appEl.querySelector('[data-chart="bidtrick"]');
  if (bidTrickMount) bidTrickMount.replaceChildren(buildBidVsTricksChart(game.players, totals));
}

// ---------- Combobox (Spielerauswahl) ----------
// Offen/zu wird direkt am DOM geschaltet statt über einen Re-Render — sonst
// verlöre das Eingabefeld bei jedem Tastendruck den Fokus.

/** Sucheingaben aller sichtbaren Comboboxen in den UI-Zustand übernehmen. */
function syncPickerQueries() {
  appEl.querySelectorAll('[data-pquery]').forEach((inp) => {
    ui.pickerQuery[inp.dataset.pquery] = inp.value;
  });
}

function openPicker(input) {
  const box = input.closest('.picker');
  if (!box) return;
  closePickers(box);
  box.classList.add('open');
  refreshPickerOptions(input);
  input.select();
}

function closePickers(except = null) {
  appEl.querySelectorAll('.picker.open').forEach((box) => {
    if (box !== except) box.classList.remove('open');
  });
}

/** Nur die Vorschlagsliste neu setzen — das Eingabefeld bleibt unangetastet. */
function refreshPickerOptions(input) {
  const list = input.closest('.picker')?.querySelector('[data-picker-list]');
  if (!list) return;
  list.innerHTML = pickerOptionsHtml(pickerStateFor(input.dataset.pquery, input.value));
}

/** Profil auf einen Sitzplatz im "Neues Spiel"-Formular setzen. */
function selectDraftProfile(index, profileId) {
  readDraftFromInputs();
  ui.draft.players[index] = profileId;
  delete ui.pickerQuery[index];
  renderNew();
}

/** Ein gewähltes oder frisch angelegtes Profil dorthin geben, wo die Box steht. */
async function applyPickedProfile(key, profile) {
  if (key.startsWith(ASSIGN_PREFIX)) {
    await assignNameToProfile(key.slice(ASSIGN_PREFIX.length), profile);
  } else {
    selectDraftProfile(+key, profile.id);
  }
}

// ---------- Aktionen ----------
function readDraftFromInputs() {
  if (!ui.draft) return;
  const name = appEl.querySelector('[data-field="name"]');
  const max = appEl.querySelector('[data-field="maxCards"]');
  if (name) ui.draft.name = name.value;
  if (max) ui.draft.maxCards = Math.max(1, Math.min(15, parseInt(max.value, 10) || 1));
  const restrict = appEl.querySelector('[data-field="restrictLastBid"]');
  if (restrict) ui.draft.restrictLastBid = restrict.checked;
  const playDown = appEl.querySelector('[data-field="playDown"]');
  if (playDown) ui.draft.upOnly = !playDown.checked;
  const rollDealer = appEl.querySelector('[data-field="rollDealer"]');
  if (rollDealer) ui.draft.rollDealer = rollDealer.checked;
  const moneyEnabled = appEl.querySelector('[data-field="moneyEnabled"]');
  if (moneyEnabled) ui.draft.moneyEnabled = moneyEnabled.checked;
  const stake = appEl.querySelector('[data-field="stake"]');
  if (stake) ui.draft.stake = Math.max(0, toFiniteNumber(stake.value));
  const payoutMode = appEl.querySelector('[data-field="payoutMode"]');
  if (payoutMode) ui.draft.payoutMode = payoutMode.value;
  syncPickerQueries();
}

/**
 * Profil aus einer freien Eingabe anlegen & speichern — gemeinsamer Weg für die
 * Spielerauswahl beim Anlegen einer Runde und die Profil-Übersicht.
 * @returns {Promise<object|null>} null, wenn abgelehnt oder fehlgeschlagen
 */
function createProfileFromInput(rawName) {
  const name = String(rawName).trim();
  if (!name) {
    alert('Bitte zuerst einen Namen eintippen.');
    return null;
  }
  if (isNameTaken(profiles.all(), name)) {
    alert(`„${name}" gibt es schon – bitte aus der Liste auswählen.`);
    return null;
  }
  const profile = createProfile({ name });
  try {
    // Startbild garantiert unterscheidbar von allen vorhandenen Profilen.
    profile.avatar = rollUniqueIdenticon(profiles.all());
  } catch (e) {
    console.error(e);
    alert('Es ist kein freies Profilbild-Muster mehr übrig.');
    return null;
  }
  // Ohne await (siehe createAndEnterGame): der Profil-Cache kennt es sofort,
  // sonst hinge das Anlegen offline und ein zweiter Tipp legte ein Duplikat an.
  profiles.save(profile).catch((e) => {
    console.error(e);
    alert('Speichern fehlgeschlagen – bist du online? Das Profil wird nachgetragen, sobald wieder Verbindung besteht.');
  });
  return profile;
}

/** Profil umbenennen und den neuen Namen in alle Spiele nachziehen. */
async function renameProfile(profile, rawName) {
  const name = String(rawName).trim();
  if (!name || name === profile.name) return;
  if (isNameTaken(profiles.all(), name, profile.id)) {
    return alert(`„${name}" gibt es schon. Zum Verschmelzen die Verwaltung nutzen.`);
  }

  const previous = profile.name;
  profile.name = name;
  try {
    await profiles.save(profile);
  } catch (e) {
    console.error(e);
    profile.name = previous;
    renderActiveView();
    return alert('Umbenennen fehlgeschlagen – bist du online?');
  }

  // Das Profil ist die einzige Wahrheit — der neue Name wird auch rückwirkend
  // in alte Runden geschrieben. Getrennter try-Block: das Profil ist zu diesem
  // Zeitpunkt schon umbenannt, ein Fehler hier ist ein *anderer* Zustand.
  try {
    const games = await fb.listGames();
    const touched = games.filter((g) => applyProfileNames(g, profiles.byIdMap()));
    await fb.saveGames(touched);
  } catch (e) {
    console.error(e);
    alert(
      `Das Profil heißt jetzt „${name}", aber die alten Runden konnten nicht angepasst werden.\n\n` +
        'Bitte bei bestehender Verbindung noch einmal speichern.',
    );
  }
  renderActiveView();
}

/** Profilbild setzen (Identicon-Muster oder Foto). */
async function setAvatar(profile, avatar) {
  const previous = profile.avatar;
  profile.avatar = avatar;
  try {
    await profiles.save(profile);
  } catch (e) {
    console.error(e);
    profile.avatar = previous;
    alert('Profilbild konnte nicht gespeichert werden – bist du online?');
  }
  renderActiveView();
}

/**
 * Spiele frisch laden, bevor die Verwaltung sie umschreibt.
 * `fb.saveGames` überschreibt ganze Dokumente — mit einem beim Öffnen der
 * Verwaltung eingefrorenen Stand würden zwischenzeitlich gespielte Runden
 * verloren gehen.
 * @returns {Promise<object[]|null>} null, wenn das Laden fehlgeschlagen ist
 */
async function freshGamesForAdmin() {
  try {
    const games = await fb.listGames();
    ui.admin.games = games;
    return games;
  } catch (e) {
    console.error(e);
    alert('Die Spiele konnten nicht geladen werden – bist du online? Es wurde nichts geändert.');
    return null;
  }
}

/** Alle Bestands-Einträge eines Namens auf ein Profil legen (Verwaltung). */
async function assignNameToProfile(name, profile) {
  const games = await freshGamesForAdmin();
  if (!games) return renderActiveView();

  const plan = planNameAssignment(games, name, profile);
  if (plan.conflicts.length) {
    renderActiveView();
    return alert(
      `Nicht möglich: In ${plan.conflicts
        .map((g) => `„${g.name}"`)
        .join(', ')} sitzt „${profile.name}" schon am Tisch. Das wären zwei Sitzplätze für eine Person.`,
    );
  }

  try {
    await fb.saveGames(plan.touched);
  } catch (e) {
    console.error(e);
    ui.admin = null; // mutierten Speicherstand verwerfen, sonst sieht es erledigt aus
    renderActiveView();
    return alert('Zuordnen fehlgeschlagen – bist du online?');
  }
  delete ui.pickerQuery[ASSIGN_PREFIX + name];
  renderActiveView();
}

/** Zwei Profile zu einem zusammenführen (passwortgeschützt). */
async function mergeProfiles() {
  const from = profiles.byId(ui.admin.mergeFrom);
  const to = profiles.byId(ui.admin.mergeTo);
  if (!from || !to || from.id === to.id) return;

  const games = await freshGamesForAdmin();
  if (!games) return renderActiveView();

  const conflicts = findMergeConflicts(games, from.id, to.id);
  if (conflicts.length) {
    renderActiveView();
    return alert(
      `Nicht möglich: In ${conflicts
        .map((g) => `„${g.name}"`)
        .join(', ')} spielen beide mit. Das wären zwei Sitzplätze für eine Person.`,
    );
  }

  const affected = gamesUsingProfile(games, from.id);
  const scope = affected.length === 1 ? '1 Spiel wird' : `${affected.length} Spiele werden`;
  if (!confirm(`„${from.name}" in „${to.name}" auflösen?\n\n${scope} umgeschrieben, „${from.name}" wird gelöscht.`)) return;
  if (!askPassword(`Profile zusammenführen: „${from.name}" → „${to.name}".`)) return;

  affected.forEach((g) => remapGameProfile(g, from.id, to.id, to.name));
  try {
    // Erst die Spiele umhängen, dann das Profil löschen — andersherum bliebe
    // bei einem Fehler eine profileId ohne Profil zurück, die sich über die
    // Verwaltung nicht mehr reparieren lässt.
    await fb.saveGames(affected);
    await profiles.remove(from.id);
  } catch (e) {
    console.error(e);
    alert('Zusammenführen fehlgeschlagen – bist du online?');
  }
  ui.admin = null; // Spiele neu laden, damit die Zuordnungen wieder stimmen
  renderActiveView();
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
      resetDraft();
      navigate('/new');
      break;
    case 'show-more-games':
      ui.homeVisibleCount += HOME_PAGE_SIZE;
      renderHome();
      break;
    case 'open':
      ui.activeRound = null;
      navigate('/game/' + gid);
      break;
    case 'players':
      navigate('/players/' + gid);
      break;
    case 'profiles':
      navigate('/profiles');
      break;
    case 'profile':
      navigate('/profiles/' + pid);
      break;
    case 'admin':
      ui.admin = null;
      navigate('/admin');
      break;
    case 'view':
      navigate('/view/' + gid);
      break;
    case 'share':
      shareGame(gid);
      break;

    case 'set-sort':
      ui.tableSort = v;
      renderActiveView();
      break;
    case 'set-axis':
      ui.tableTranspose = v === 'rounds';
      renderActiveView();
      break;

    case 'maxcards-dec':
    case 'maxcards-inc':
      readDraftFromInputs();
      ui.draft.maxCards = Math.max(
        1,
        Math.min(15, ui.draft.maxCards + (action === 'maxcards-inc' ? 1 : -1)),
      );
      renderNew();
      break;

    case 'stake-dec':
    case 'stake-inc': {
      const delta = action === 'stake-inc' ? 1 : -1;
      // Gleiche Karte in zwei Routen (siehe moneyCard): im laufenden Spiel
      // direkt am geladenen Dokument ändern, im Entwurf am Formular-State.
      if (currentRoute().view === 'game' && current.game) {
        current.game.stake = Math.max(0, (current.game.stake || 0) + delta);
        saveCurrent();
      } else {
        readDraftFromInputs();
        ui.draft.stake = Math.max(0, ui.draft.stake + delta);
        renderNew();
      }
      break;
    }

    case 'add-player':
      readDraftFromInputs();
      ui.draft.players.push(null);
      renderNew();
      break;
    case 'rm-player':
      readDraftFromInputs();
      ui.draft.players.splice(+i, 1);
      ui.pickerQuery = {};
      // "Dritter/Zweiter"-Ausschüttung ergibt unter 3 Spielern keinen Sinn
      // mehr (siehe moneyCard) — Auswahl sonst als deaktivierte, aber noch
      // ausgewählte Option hängen lassen.
      if (ui.draft.payoutMode === 'podium-cascade' && ui.draft.players.length < 3) {
        ui.draft.payoutMode = 'winner-takes-all';
      }
      renderNew();
      break;

    case 'pick-profile': {
      syncPickerQueries();
      const profile = profiles.byId(pid);
      if (profile) await applyPickedProfile(i, profile);
      break;
    }
    case 'create-profile': {
      syncPickerQueries();
      const profile = createProfileFromInput(ui.pickerQuery[i] || '');
      if (profile) await applyPickedProfile(i, profile);
      break;
    }
    case 'picker-clear':
      readDraftFromInputs();
      ui.draft.players[+i] = null;
      delete ui.pickerQuery[i];
      renderNew();
      break;

    case 'add-profile': {
      const input = appEl.querySelector('[data-field="new-profile"]');
      if (!input) break;
      const profile = createProfileFromInput(input.value);
      if (profile) navigate('/profiles/' + profile.id);
      break;
    }
    case 'save-profile-name': {
      const profile = profiles.byId(pid);
      const input = appEl.querySelector('[data-field="profile-name"]');
      if (profile && input) await renameProfile(profile, input.value);
      break;
    }
    case 'roll-avatar': {
      const profile = profiles.byId(pid);
      if (!profile) break;
      try {
        await setAvatar(profile, rollUniqueIdenticon(profiles.all(), profile.id));
      } catch (err) {
        console.error(err);
        alert('Es ist kein freies Profilbild-Muster mehr übrig.');
      }
      break;
    }
    case 'pick-photo':
      appEl.querySelector('[data-photo-input]')?.click();
      break;
    case 'delete-profile': {
      const profile = profiles.byId(pid);
      if (!profile) break;
      // Bewusst NICHT loadGamesQuietly: dessen leere Liste bei einem Ladefehler
      // sähe hier aus wie "wird nirgends benutzt" und gäbe das Profil zum
      // Löschen frei. Ein Profil ohne Spiel ist über die UI nicht mehr zu
      // reparieren (unassignedPlayers findet Spieler mit profileId nicht).
      let games;
      try {
        games = await fb.listGames();
      } catch (err) {
        console.error(err);
        return alert('Die Spiele konnten nicht geprüft werden – bist du online? Es wurde nichts gelöscht.');
      }
      const used = gamesUsingProfile(games, profile.id);
      if (used.length) {
        alert(
          `„${profile.name}" spielt in ${used.length === 1 ? '1 Runde' : `${used.length} Runden`} mit und kann deshalb nicht gelöscht werden.\n\n` +
            'Falls es eine Dublette ist: in der Verwaltung mit dem richtigen Profil zusammenführen.',
        );
        break;
      }
      if (!confirm(`Profil „${profile.name}" wirklich löschen?`)) break;
      if (!askPassword(`Profil löschen: „${profile.name}".`)) break;
      try {
        await profiles.remove(profile.id);
      } catch (err) {
        console.error(err);
        return alert('Löschen fehlgeschlagen – bist du online?');
      }
      navigate('/profiles');
      break;
    }

    case 'admin-unlock':
      if (!askPassword('Verwaltung öffnen.')) break;
      ui.adminUnlocked = true;
      renderActiveView();
      break;
    case 'admin-reload':
      ui.admin = null;
      renderActiveView();
      break;
    case 'merge-profiles':
      await mergeProfiles();
      break;

    case 'start': {
      readDraftFromInputs();
      // Angetippter, aber nicht bestätigter Text ist kein Mitspieler — darauf
      // hinweisen, statt die Zeile beim Start stillschweigend zu schlucken.
      const unconfirmed = ui.draft.players
        .map((profileId, idx) => (profileId ? null : (ui.pickerQuery[idx] || '').trim()))
        .filter(Boolean);
      if (unconfirmed.length) {
        return alert(
          `Noch nicht ausgewählt: ${unconfirmed.map((n) => `„${n}"`).join(', ')}.\n\n` +
            'Bitte aus der Vorschlagsliste auswählen oder als neues Profil anlegen.',
        );
      }
      const seated = ui.draft.players.map((profileId) => profiles.byId(profileId)).filter(Boolean);
      if (seated.length < 2) {
        return alert('Bitte mindestens 2 Spieler auswählen – jeder Mitspieler braucht ein Profil.');
      }
      if (ui.draft.rollDealer) {
        ui.lottery = { profiles: seated, winner: null };
        renderNew();
        break;
      }
      createAndEnterGame(seated);
      break;
    }

    case 'lottery-cancel':
      ui.lottery = null;
      renderNew();
      break;

    case 'lottery-continue': {
      if (!ui.lottery || ui.lottery.winner == null) break;
      const ordered = rotateToStart(ui.lottery.profiles, ui.lottery.winner);
      createAndEnterGame(ordered);
      break;
    }

    case 'seat-up':
    case 'seat-down': {
      if (!game) break;
      const seated = seatSorted(game);
      const idx = seated.findIndex((p) => p.id === pid);
      if (idx < 0) break;
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
      if (!confirm(`„${game.name}" wirklich löschen?`)) break;
      if (!askPassword(`Spiel löschen: „${game.name}".`)) break;
      try {
        await fb.deleteGame(gid);
      } catch (err) {
        console.error(err);
        return alert('Löschen fehlgeschlagen – bist du online?');
      }
      ui.activeRound = null;
      navigate('/');
      break;
    }
  }
}

function onInput(e) {
  const picker = e.target.closest('[data-pquery]');
  if (picker) {
    ui.pickerQuery[picker.dataset.pquery] = picker.value;
    refreshPickerOptions(picker);
  }
}

function onKeydown(e) {
  const picker = e.target.closest('[data-pquery]');
  if (!picker) return;
  if (e.key === 'Escape') {
    closePickers();
    picker.blur();
  } else if (e.key === 'Enter') {
    // Erster Vorschlag = das, was die Liste ganz oben anbietet (Profil oder „neu anlegen").
    e.preventDefault();
    picker.closest('.picker')?.querySelector('.picker-option')?.click();
  }
}

function onFocusIn(e) {
  const picker = e.target.closest('[data-pquery]');
  if (picker) openPicker(picker);
}

async function onChange(e) {
  // Manuelle Auszahlung eingetragen (payoutMode "manual", Schreiber-Ansicht).
  const manualPayoutInput = e.target.closest('[data-action="set-manual-payout"]');
  if (manualPayoutInput && current.game) {
    const pid = manualPayoutInput.dataset.pid;
    const raw = manualPayoutInput.value.trim();
    current.game.manualPayouts = current.game.manualPayouts || {};
    if (raw === '') delete current.game.manualPayouts[pid];
    else current.game.manualPayouts[pid] = toFiniteNumber(raw);
    saveCurrent();
    return;
  }

  // Foto für ein Profilbild gewählt
  if (e.target.closest('[data-photo-input]')) {
    const file = e.target.files?.[0];
    const profile = profiles.byId(e.target.dataset.photoInput);
    e.target.value = ''; // gleiche Datei erneut wählbar
    if (!file || !profile) return;
    try {
      const dataUrl = await photoToDataUrl(file);
      await setAvatar(profile, { type: 'photo', dataUrl });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Das Bild konnte nicht verarbeitet werden.');
    }
    return;
  }

  // Auswahl im Zusammenführen-Formular
  const mergeFrom = e.target.closest('[data-field="merge-from"]');
  const mergeTo = e.target.closest('[data-field="merge-to"]');
  if ((mergeFrom || mergeTo) && ui.admin) {
    ui.admin.mergeFrom = appEl.querySelector('[data-field="merge-from"]').value || null;
    ui.admin.mergeTo = appEl.querySelector('[data-field="merge-to"]').value || null;
    renderActiveView();
    return;
  }

  // Geld-Einstellungen nachträglich in der Schreiber-Ansicht geändert →
  // direkt am geladenen Spiel mutieren und speichern (gleiches Muster wie
  // set-bid/set-trick: current.game ist die einzige Wahrheit, saveCurrent()
  // rendert danach neu).
  const moneyField = e.target.closest(
    '[data-field="moneyEnabled"], [data-field="stake"], [data-field="payoutMode"]',
  );
  if (moneyField && currentRoute().view === 'game' && current.game) {
    if (moneyField.dataset.field === 'moneyEnabled') current.game.moneyEnabled = moneyField.checked;
    else if (moneyField.dataset.field === 'stake') current.game.stake = Math.max(0, toFiniteNumber(moneyField.value));
    else if (moneyField.dataset.field === 'payoutMode') current.game.payoutMode = moneyField.value;
    saveCurrent();
    return;
  }

  // Änderungen im "Neues Spiel"-Formular (Kartenzahl/Schalter) → neu rendern,
  // damit Rundenfolge und -anzahl sofort stimmen.
  if (currentRoute().view !== 'new') return;
  if (
    e.target.closest(
      '[data-field="maxCards"], [data-field="playDown"], [data-field="restrictLastBid"], [data-field="moneyEnabled"], [data-field="stake"], [data-field="payoutMode"]',
    )
  ) {
    readDraftFromInputs();
    renderNew();
  }
}

// ---------- Bootstrap ----------
appEl.addEventListener('click', onClick);
appEl.addEventListener('input', onInput);
appEl.addEventListener('keydown', onKeydown);
appEl.addEventListener('focusin', onFocusIn);
appEl.addEventListener('change', onChange);
// Klick irgendwo außerhalb schließt eine offene Vorschlagsliste.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.picker')) closePickers();
});
window.addEventListener('hashchange', route);

route();

// Profile sind für fast jede Ansicht nötig (Namen & Bilder) und wenige, kleine
// Dokumente — deshalb einmal komplett abonnieren statt pro Ansicht nachzuladen.
let lastProfileSignature = null;
profiles.subscribe(() => {
  // Firestore feuert auch für den eigenen Echo-Write und für Feldänderungen,
  // die keine Ansicht betreffen. Ohne diesen Vergleich würde jeder fremde
  // Snapshot die aktive Ansicht neu bauen — inklusive Charts, Tabellen-Scroll
  // und laufendem Glücksrad.
  const signature = profiles.signature();
  if (signature === lastProfileSignature) return;
  lastProfileSignature = signature;

  // Nicht in eine offene Suchliste hineinrendern (Fokus & Tipp-Stand).
  if (appEl.querySelector('.picker.open')) return;
  // Das drehende Glücksrad hängt am DOM-Knoten: neu rendern hieße, die
  // laufende Auslosung ohne Ergebnis wegzuwerfen.
  if (ui.lottery) return;
  // Getippte Formularwerte retten, bevor aus ui.draft neu gebaut wird.
  if (currentRoute().view === 'new') readDraftFromInputs();
  renderActiveView();
});
