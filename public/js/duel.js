// Duel sur la page de jeu (index.html?duel=<id>) : même plateau que le jeu du
// jour, branché sur les routes du duel (src/services/duels.js), avec un
// panneau qui montre l'adversaire et le résultat.
// Le serveur n'envoie rien de lui-même : on redemande le salon toutes les
// POLL_MS millisecondes.
import { api } from "./api.js";
import { el, byId, clear } from "./dom.js";
import { formatDuration, capitalize } from "./format.js";
import { player } from "./player.js";
import { avatarUrl, avatarFit } from "./profile.js";
import { showToast } from "./toast.js";
import { CELESTEDLE } from "./catalogs.js";

const POLL_MS = 2500;

export const duelId = () => new URLSearchParams(location.search).get("duel");
// join : on entre tout de suite dans le salon (lien « Join » de la liste)
export const duelUrl = (id, { join = false } = {}) => `index.html?duel=${encodeURIComponent(id)}${join ? "&join=1" : ""}`;

/** Catalogue Celestedle dont les parties passent par le salon. */
export function duelCatalog(id) {
  return {
    ...CELESTEDLE,
    duel: true,
    api: {
      game: async () => (await api.duel(id)).me,
      guess: (mode, guess) => api.duelGuess(id, guess),
      hint: (mode, type, wordId, choice) => api.duelHint(id, type, choice),
      forfeit: () => api.duelForfeit(id)
    }
  };
}

const sideLabel = (mode) => (mode === "hard" ? "B-Side · Hard" : "A-Side · Normal");

function badge(p, extra = "") {
  return el("span", { className: `duel-player ${extra}`, attrs: { style: `--player-color: ${p?.color ?? "#888"}` } }, [
    el("span", { className: "duel-avatar" }, p ? [el("img", { attrs: { src: avatarUrl(p.avatar), alt: "", style: avatarFit(p.avatar) } })] : []),
    el("span", { className: "duel-name", text: p?.name ?? "Waiting…" })
  ]);
}

// Lignes de l'adversaire : une case de couleur par catégorie (le nom deviné
// seulement s'il est révélé)
function miniRows(rows) {
  return el(
    "div",
    { className: "duel-rows" },
    rows.map((row) =>
      el("div", { className: "duel-row", attrs: { title: row.name ?? "" } }, [
        ...CELESTEDLE.categories.map((c) => el("span", { className: `duel-cell ${row.verdict[c] ?? "wrong"}` })),
        row.name ? el("span", { className: "duel-row-name", text: capitalize(row.name) }) : null
      ])
    )
  );
}

// Ma partie, au format de la progression de l'adversaire
function mineProgress(state, room) {
  const seconds = state.finishedAt ? Math.round((Date.parse(state.finishedAt) - Date.parse(room.startedAt)) / 1000) : null;
  return { status: state.status, started: Boolean(state.startedAt), tries: state.tries, hints: state.hints.length, seconds };
}

function progressText(p) {
  if (!p.started && p.status === "playing") return "Thinking…";
  const counts = `${p.tries} ${p.tries === 1 ? "try" : "tries"}, ${p.hints} hint${p.hints === 1 ? "" : "s"}`;
  if (p.status === "won") return `Found it! ${counts} · ${formatDuration(p.seconds)}`;
  if (p.status === "playing") return `Searching… ${counts}`;
  return p.status === "forfeit" ? `Gave up (${counts})` : `Out of luck (${counts})`;
}

/**
 * Prépare la page pour un duel. onReady(room) est appelé une fois le duel
 * commencé et le joueur dedans : la page charge alors sa partie.
 * onUpdate(room) : à chaque nouvelle lecture du salon.
 */
export function startDuel({ id, onReady, onUpdate }) {
  document.documentElement.classList.add("duel");
  const panel = el("section", { className: "duel-panel", attrs: { id: "duel-panel", "aria-live": "polite" } });
  byId("game-status").before(panel);
  let ready = false;
  let timer = null;
  let room = null;
  let rematchShown = false;
  let autoJoin = new URLSearchParams(location.search).has("join");

  const go = (next) => (location.href = duelUrl(next));

  async function act(fn) {
    try {
      await fn();
    } catch (err) {
      showToast(err.message);
    }
  }

  function render() {
    clear(panel);
    const me = room.role;
    const mine = me === "guest" ? room.guest : room.host;
    const theirs = me === "guest" ? room.host : room.guest;
    panel.append(
      el("p", { className: "duel-kicker", text: `Duel · ${sideLabel(room.mode)}${room.isPublic ? "" : " · Private"}` }),
      el("div", { className: "duel-versus" }, [badge(me ? mine : room.host, "me"), el("span", { className: "duel-vs", text: "VS" }), badge(me ? theirs : room.guest)])
    );

    if (room.status === "closed" || room.status === "expired") {
      panel.append(el("p", { className: "duel-note", text: room.status === "closed" ? "This duel was closed by its host." : "Nobody joined this duel in time." }), backLink());
      return;
    }
    if (room.status === "waiting") {
      if (me === "host") {
        const link = new URL(duelUrl(room.id), location.href).href;
        panel.append(
          el("p", { className: "duel-note", text: room.isPublic ? "Waiting for an opponent: your duel is listed in the menu, or send this link." : "Waiting for your opponent: send them this link." }),
          el("div", { className: "duel-link" }, [
            el("input", { attrs: { value: link, readonly: true, "aria-label": "Duel link" }, on: { focus: (e) => e.target.select() } }),
            el("button", { className: "btn-secondary", text: "Copy", attrs: { type: "button" }, on: { click: () => act(async () => { await navigator.clipboard.writeText(link); showToast("Link copied!"); }) } })
          ]),
          el("button", { className: "btn-secondary duel-close", text: "Close this duel", attrs: { type: "button" }, on: { click: () => act(async () => { room = await api.duelClose(room.id); render(); }) } })
        );
      } else {
        panel.append(
          el("p", { className: "duel-note", text: `${room.host?.name ?? "Someone"} is waiting for an opponent. Same ${room.mode === "hard" ? "B-Side" : "A-Side"} rules, a random element: fewest tries wins.` }),
          el("button", { className: "btn-primary duel-join", text: "Join the duel", attrs: { type: "button" }, on: { click: () => act(async () => { await player.ensure(); room = await api.duelJoin(room.id); update(); }) } })
        );
      }
      return;
    }
    if (!me) {
      panel.append(el("p", { className: "duel-note", text: "This duel already has two players." }), backLink());
      return;
    }

    // Duel en cours ou fini : l'adversaire, puis le résultat
    const opp = room.opponent;
    panel.append(el("div", { className: "duel-opponent" }, [el("p", { className: `duel-progress ${opp.status}`, text: `${theirs?.name ?? "Opponent"}: ${progressText(opp)}` }), miniRows(opp.rows)]));
    if (room.result) {
      const won = room.result.winner === me;
      const title = room.result.draw ? "It's a draw!" : won ? "You win the duel! 🏆" : `${theirs?.name ?? "Your opponent"} wins the duel`;
      const answer = room.me?.solution?.nom;
      panel.append(
        el("div", { className: `duel-result ${room.result.draw ? "draw" : won ? "won" : "lost"}` }, [
          el("h2", { text: title }),
          room.me ? el("p", { className: "duel-mine", text: `You: ${progressText(mineProgress(room.me, room))}` }) : null,
          answer ? el("p", { text: `The answer was ${capitalize(answer)}.` }) : null,
          el("div", { className: "duel-actions" }, [
            el("button", {
              className: "btn-primary",
              // Une revanche déjà demandée (par l'autre : sinon on y serait déjà)
              text: room.rematchId ? "Join the rematch" : "Rematch",
              attrs: { type: "button" },
              on: { click: () => act(async () => go((await api.duelRematch(room.id)).id)) }
            }),
            backLink()
          ])
        ])
      );
    } else if (room.me.status !== "playing") {
      panel.append(el("p", { className: "duel-note", text: "Your game is over: waiting for your opponent to finish…" }));
    }
  }

  function backLink() {
    return el("a", { className: "btn-secondary duel-back", text: "Back to the menu", attrs: { href: "menu.html#modes" } });
  }

  async function update() {
    try {
      room = await api.duel(id);
    } catch (err) {
      clear(panel);
      panel.append(el("p", { className: "duel-note", text: err.message }), backLink());
      stop();
      return;
    }
    // Arrivée par « Join » de la liste : on entre sans redemander
    if (autoJoin && room.status === "waiting" && !room.role) {
      autoJoin = false;
      try {
        await player.ensure();
        room = await api.duelJoin(room.id);
      } catch (err) {
        showToast(err.message);
      }
    }
    // Revanche demandée par l'autre : on le signale une fois
    if (room.rematchId && !rematchShown) {
      rematchShown = true;
      showToast("Your opponent wants a rematch!", 4000);
    }
    render();
    if (!ready && room.role && (room.status === "playing" || room.status === "finished")) {
      ready = true;
      onReady?.(room);
    }
    onUpdate?.(room);
    if (room.status === "finished" && !room.rematchId) return schedule(POLL_MS * 2);
    if (["closed", "expired"].includes(room.status) || (!room.role && room.status !== "waiting")) return stop();
    schedule(POLL_MS);
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => (document.hidden ? schedule(ms) : update()), ms);
  }
  function stop() {
    clearTimeout(timer);
  }

  update();
  return { refresh: update };
}

// ===== Menu : créer un duel, voir les salons publics =====

/** Crée un salon et ouvre sa page. */
export async function createDuel({ mode, isPublic }) {
  await player.ensure();
  const room = await api.duelCreate(mode, isPublic);
  location.href = duelUrl(room.id);
}

/** Salons publics qui attendent un adversaire. */
export async function openRooms() {
  return (await api.duels()).rooms;
}
