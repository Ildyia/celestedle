import { api } from "./api.js";
import { el, byId, clear, openModal } from "./dom.js";
import { formatDuration } from "./format.js";
import { avatarUrl } from "./profile.js";
import { player } from "./player.js";

const COLUMNS = {
  daily: [
    { label: "Tries", value: (e) => e.tries },
    { label: "Time", value: (e) => formatDuration(e.seconds) }
  ],
  // Connections : erreurs au lieu d'essais
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
  season: [
    { label: "Score", value: (e) => e.score.toFixed(1) },
    { label: "Games", value: (e) => e.games },
    { label: "Wins", value: (e) => e.wins }
  ]
};

const EMPTY_TEXT = {
  daily: "Nobody has found today's word yet. Be the first!",
  dailyGrid: "Nobody has solved today's grid yet. Be the first!",
  weekly: "No games this week yet.",
  season: "No games this season yet."
};

const SCORE_TEXT =
  "Each game scores 0 to 100: the share of that day's players you beat in the same mode (a loss scores 0), so a win on a hard day is worth more. All modes count.";

const NOTES = {
  daily: "Fewest tries first, then fastest time. First-try wins are pure luck: they're listed apart, without a rank (they still count for the week and all-time rankings).",
  dailyGrid: "Fewest mistakes first (a hint counts as one), then fastest time.",
  weekly: `${SCORE_TEXT} Weekly points add up every game of the week.`,
  season: `${SCORE_TEXT} Season score: your average game score, smoothed so that it stays close to the community average until you've played a few games (the ranking settles as the season goes on).`
};

function isGrid(mode) {
  return mode.startsWith("cx-");
}

export class LeaderboardPanel {
  constructor({ getMode }) {
    this.getMode = getMode;
    this.period = "daily";
    this.mode = "normal";
    this.seasonId = null; // null = saison en cours
    this.seasonSelect = byId("leaderboard-season");
    this.seasonSelect.addEventListener("change", () => {
      this.seasonId = Number(this.seasonSelect.value);
      this.load();
    });
    this.table = byId("leaderboard-body");
    this.head = byId("leaderboard-head");
    this.note = byId("leaderboard-note");
    this.oneShots = byId("leaderboard-one-shots");
    this.anonymousNote = byId("leaderboard-anonymous-note");

    byId("leaderboard-btn")?.addEventListener("click", () => this.open());
    document.querySelectorAll("[data-board-period]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this.period = btn.dataset.boardPeriod;
        this.load();
      })
    );
    document.querySelectorAll("[data-board-mode]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this.mode = btn.dataset.boardMode;
        this.load();
      })
    );
  }

  open() {
    this.mode = this.getMode();
    this.showGridModes();
    openModal("leaderboard-modal");
    this.load();
  }

  // Classements du jour de Connections : pour qui peut y jouer
  async showGridModes() {
    let canPlay = false;
    try {
      ({ canPlay } = await api.connectionsAccess());
    } catch {
      // Lien caché par défaut
    }
    document.querySelectorAll("[data-board-mode^='cx-']").forEach((btn) => (btn.hidden = !canPlay));
    if (!canPlay && isGrid(this.mode)) {
      this.mode = "normal";
      this.load();
    }
  }

  async load() {
    document.querySelectorAll("[data-board-period]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.boardPeriod === this.period))
    );
    document.querySelectorAll("[data-board-mode]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.boardMode === this.mode))
    );
    // Semaine et saison : tous les modes ensemble
    byId("leaderboard-modes").hidden = this.period !== "daily";
    this.seasonSelect.hidden = this.period !== "season";
    clear(this.table);
    this.oneShots.hidden = true;
    this.anonymousNote.hidden = !player.profile?.isAnonymous;
    try {
      this.render(await api.leaderboard(this.period, this.mode, this.seasonId));
    } catch (err) {
      this.note.textContent = err.message;
    }
  }

  playerBadge(entry) {
    return el("span", { className: "board-player", attrs: { style: `--player-color: ${entry.player.color}` } }, [
      el("img", { attrs: { src: avatarUrl(entry.player.avatar), alt: "" } }),
      el("span", { text: entry.player.name })
    ]);
  }

  row(entry, columns) {
    return el("tr", { className: entry.isMe ? "is-me" : "" }, [
      el("td", { className: "board-rank", text: `#${entry.rank}` }),
      el("td", {}, [this.playerBadge(entry)]),
      ...columns.map((c) => el("td", { className: "board-num", text: String(c.value(entry) ?? "-") }))
    ]);
  }

  render(board) {
    const kind = board.period === "daily" && isGrid(board.mode) ? "dailyGrid" : board.period;
    const columns = COLUMNS[kind];
    this.head.replaceChildren(
      el("tr", {}, [el("th", { text: "#" }), el("th", { text: "Player" }), ...columns.map((c) => el("th", { text: c.label }))])
    );
    if (board.top.length === 0) {
      const text = board.oneShots?.length ? "No ranked win yet today (first-try wins are listed below)." : EMPTY_TEXT[kind];
      this.table.append(el("tr", {}, [el("td", { text, attrs: { colspan: 2 + columns.length } })]));
    } else {
      this.table.append(...board.top.map((entry) => this.row(entry, columns)));
      if (board.me && board.me.rank > 50) this.table.append(this.row(board.me, columns));
    }
    this.renderOneShots(board.oneShots ?? []);
    if (board.seasons) this.renderSeasons(board);
    const range =
      board.period === "daily" ? "" : `${board.range.from} → ${board.season?.current ? "today" : board.range.to}. `;
    this.note.textContent = `${range}${NOTES[kind]} Hidden profiles are not listed.`;
  }

  renderSeasons(board) {
    this.seasonSelect.replaceChildren(
      ...board.seasons.map((season) =>
        el("option", {
          text: season.current ? `${season.name} (current)` : season.name,
          attrs: { value: String(season.id), ...(season.id === board.season.id ? { selected: "" } : {}) }
        })
      )
    );
  }

  // Victoires du jour au premier essai : mentionnées à part, sans rang
  renderOneShots(entries) {
    clear(this.oneShots);
    this.oneShots.hidden = entries.length === 0;
    if (!entries.length) return;
    this.oneShots.append(
      el("p", { className: "one-shots-title", text: "🍀 Lucky one-shots" }),
      el("div", { className: "one-shots-list" }, entries.map((entry) => this.playerBadge(entry)))
    );
  }
}
