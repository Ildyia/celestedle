// Journal du menu, en référence au journal du jeu : un carnet qu'on feuillette
// (← →, ou les onglets marque-page). Pages : Progress (stats perso), puis les
// classements : Today (un jeu et un côté), This week et All time (tous les
// modes ensemble). Les classements viennent de la même API que la fenêtre
// Rankings des pages de jeu.
import { api } from "./api.js";
import { el, byId, clear } from "./dom.js";
import { formatDuration } from "./format.js";
import { avatarUrl } from "./profile.js";
import { player } from "./player.js";

const ICON = (name) => `assets/illustration/${name}.png`;

const PAGES = [
  { id: "progress", tab: "Progress" },
  { id: "daily", tab: "Today" },
  { id: "weekly", tab: "Week" },
  { id: "global", tab: "All time" }
];

const BOARD_COLUMNS = {
  daily: [
    { label: "Tries", value: (e) => e.tries },
    { label: "Hints", value: (e) => e.hints },
    { label: "Time", value: (e) => formatDuration(e.seconds) }
  ],
  dailyGrid: [
    { label: "Mistakes", value: (e) => e.mistakes },
    { label: "Hints", value: (e) => e.hints },
    { label: "Time", value: (e) => formatDuration(e.seconds) }
  ],
  weekly: [
    { label: "Points", value: (e) => Math.round(e.score) },
    { label: "Games", value: (e) => e.games },
    { label: "Wins", value: (e) => e.wins }
  ],
  global: [
    { label: "Score", value: (e) => e.score.toFixed(1) },
    { label: "Games", value: (e) => e.games },
    { label: "Wins", value: (e) => e.wins }
  ]
};

const NOTES = {
  daily: "Fewest tries first, then fastest time. Each hint counts as one extra try.",
  dailyGrid: "Fewest mistakes first, then fastest time.",
  weekly: "All games and sides together: each game scores 0 to 100 against that day's players, the week adds them up.",
  global: "All games and sides together: your average game score, smoothed for new climbers."
};

// Identifiant de classement d'un jeu et d'un côté (« cx- » pour Connections)
const boardMode = (game, side) => (game.id === "connections" ? `cx-${game.modes[side]}` : game.modes[side]);

export function createJournal({ getContext }) {
  const wrap = byId("journal");
  let pageIndex = 0;
  // Jeu et côté de la page Today : ceux choisis dans le menu à l'ouverture
  let board = null;
  let request = 0;

  function renderTabs() {
    const tabs = byId("journal-tabs");
    clear(tabs);
    PAGES.forEach((page, i) =>
      tabs.append(
        el("button", {
          className: `journal-tab${i === pageIndex ? " active" : ""}`,
          text: page.tab,
          attrs: { type: "button", "aria-pressed": String(i === pageIndex) },
          on: { click: () => go(i) }
        })
      )
    );
    byId("journal-count").textContent = `${pageIndex + 1} / ${PAGES.length}`;
  }

  function go(index) {
    pageIndex = (index + PAGES.length) % PAGES.length;
    renderTabs();
    renderPage();
  }

  async function renderPage() {
    const page = PAGES[pageIndex];
    const box = byId("journal-page");
    const current = ++request;
    clear(box);
    box.classList.remove("turn");
    void box.offsetWidth; // relance l'animation de page
    box.classList.add("turn");
    if (page.id === "progress") await renderProgress(box, current);
    else await renderBoard(box, page.id, current);
  }

  // ===== Page 1 : Progress =====
  async function renderProgress(box, current) {
    const name = player.profile ? `${player.profile.name}'s journal` : "Journal";
    box.append(el("h3", { text: name }));
    if (!player.profile) {
      box.append(el("p", { className: "journal-empty", text: "No file yet: play a game to start your journal." }));
      return;
    }
    const head = el("tr", {}, [
      el("th", {}),
      ...[
        ["play", "Played"],
        ["strawberry", "Wins"],
        ["skull", "Falls"],
        ["goldflag", "Streak"],
        ["normalflag", "Best streak"],
        ["time", "Best time"]
      ].map(([icon, label]) => el("th", { attrs: { title: label } }, [el("img", { attrs: { src: ICON(icon), alt: label } })]))
    ]);
    const body = el("tbody");
    box.append(el("table", { className: "journal-table" }, [el("thead", {}, [head]), body]));
    const sides = [
      { mode: "normal", label: "A-Side", side: "a" },
      { mode: "hard", label: "B-Side", side: "b" }
    ];
    const stats = await Promise.all(sides.map((s) => api.myStats(s.mode).catch(() => null)));
    if (current !== request) return;
    sides.forEach((s, i) => {
      const st = stats[i];
      if (!st) return;
      body.append(
        el("tr", {}, [
          el("td", {}, [el("span", { className: `side ${s.side}` }), `Celestedle ${s.label}`]),
          el("td", { text: String(st.played) }),
          el("td", { text: String(st.wins) }),
          el("td", { text: String(st.losses + st.forfeits) }),
          el("td", { text: String(st.streak.current) }),
          el("td", { text: String(st.streak.best) }),
          el("td", { text: formatDuration(st.bestSeconds) })
        ])
      );
    });
    box.append(el("p", { className: "journal-note", text: "Connections and Techs will get their own lines here soon." }));
  }

  // ===== Pages de classement =====
  function boardPicker(games) {
    return el(
      "div",
      { className: "journal-picker" },
      games.flatMap((game) =>
        ["a", "b"].map((side) => {
          const active = board.game.id === game.id && board.side === side;
          return el(
            "button",
            {
              className: `pick ${side}${active ? " active" : ""}`,
              attrs: { type: "button", title: `${game.title} ${side === "a" ? "A-Side" : "B-Side"}`, "aria-pressed": String(active) },
              on: {
                click: () => {
                  board = { game, side };
                  renderPage();
                }
              }
            },
            [el("img", { attrs: { src: game.icon, alt: "" } }), side.toUpperCase()]
          );
        })
      )
    );
  }

  async function renderBoard(box, period, current) {
    const { games } = getContext();
    const titles = { daily: "Today", weekly: "This week", global: "All time" };
    box.append(el("h3", { text: titles[period] }));
    let mode = "normal";
    if (period === "daily") {
      box.append(boardPicker(games));
      mode = boardMode(board.game, board.side);
    }
    const table = el("table", { className: "journal-table board" });
    const note = el("p", { className: "journal-note" });
    box.append(table, note);
    let data;
    try {
      data = await api.leaderboard(period, mode);
    } catch (err) {
      if (current === request) note.textContent = err.message;
      return;
    }
    if (current !== request) return;
    const kind = period === "daily" && mode.startsWith("cx-") ? "dailyGrid" : period;
    const columns = BOARD_COLUMNS[kind];
    const row = (entry) =>
      el("tr", { className: entry.isMe ? "me" : "" }, [
        el("td", { className: "rank", text: `#${entry.rank}` }),
        el("td", { className: "who" }, [
          el("span", { className: "avatar", attrs: { style: `--player-color: ${entry.player.color}` } }, [el("img", { attrs: { src: avatarUrl(entry.player.avatar), alt: "" } })]),
          entry.player.name
        ]),
        ...columns.map((c) => el("td", { text: String(c.value(entry) ?? "-") }))
      ]);
    table.append(
      el("thead", {}, [el("tr", {}, [el("th", { text: "#" }), el("th", { text: "Climber" }), ...columns.map((c) => el("th", { text: c.label }))])]),
      el(
        "tbody",
        {},
        data.top.length
          ? [...data.top.map(row), ...(data.me && data.me.rank > 50 ? [row(data.me)] : [])]
          : [el("tr", {}, [el("td", { className: "journal-empty", attrs: { colspan: String(2 + columns.length) }, text: "Nobody on this page yet. Be the first!" })])]
      )
    );
    if (data.oneShots?.length) note.append(el("span", { text: `🍀 Lucky one-shots: ${data.oneShots.map((e) => e.player.name).join(", ")}. ` }));
    const range = period === "weekly" && data.range ? ` (${data.range.from} → ${data.range.to})` : "";
    note.append(`${NOTES[kind]}${range}`);
    if (player.profile?.isAnonymous) note.append(el("span", { className: "journal-warn", text: " You're not listed: save your profile once (Edit profile) to join." }));
  }

  return {
    open() {
      const { games, gameIndex, side } = getContext();
      board = { game: games[gameIndex] ?? games[0], side };
      wrap.hidden = false;
      go(pageIndex);
      byId("journal-close").focus();
    },
    close() {
      wrap.hidden = true;
    },
    isOpen: () => !wrap.hidden,
    flip: (step) => go(pageIndex + step)
  };
}
