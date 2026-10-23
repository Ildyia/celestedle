import { api } from "./api.js";
import { el, byId, clear, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { avatarUrl } from "./profile.js";
import { player } from "./player.js";

const COLUMNS = {
  daily: [
    { label: "Tries", value: (e) => e.tries },
    { label: "Time", value: (e) => formatDuration(e.seconds) }
  ],
  weekly: [
    { label: "Points", value: (e) => e.points },
    { label: "Wins", value: (e) => e.wins },
    { label: "Time", value: (e) => formatDuration(e.totalSeconds) }
  ],
  global: [
    { label: "Points", value: (e) => e.points },
    { label: "Wins", value: (e) => e.wins },
    { label: "Avg. tries", value: (e) => formatNumber(e.avgTries) }
  ]
};

const EMPTY_TEXT = {
  daily: "Nobody has found today's word yet. Be the first!",
  weekly: "No wins this week yet.",
  global: "No wins yet."
};

export class LeaderboardPanel {
  constructor({ getMode }) {
    this.getMode = getMode;
    this.period = "daily";
    this.mode = "normal";
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
    openModal("leaderboard-modal");
    this.load();
  }

  async load() {
    document.querySelectorAll("[data-board-period]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.boardPeriod === this.period))
    );
    document.querySelectorAll("[data-board-mode]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.boardMode === this.mode))
    );
    clear(this.table);
    this.oneShots.hidden = true;
    this.anonymousNote.hidden = !player.profile?.isAnonymous;
    try {
      this.render(await api.leaderboard(this.period, this.mode));
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
    const luck = entry.oneShots
      ? el("span", { className: "one-shot-count", text: `🍀${entry.oneShots}`, attrs: { title: "First-try wins (not counted)" } })
      : null;
    return el("tr", { className: entry.isMe ? "is-me" : "" }, [
      el("td", { className: "board-rank", text: `#${entry.rank}` }),
      el("td", {}, luck ? [this.playerBadge(entry), luck] : [this.playerBadge(entry)]),
      ...columns.map((c) => el("td", { className: "board-num", text: String(c.value(entry) ?? "-") }))
    ]);
  }

  render(board) {
    const columns = COLUMNS[board.period];
    this.head.replaceChildren(
      el("tr", {}, [el("th", { text: "#" }), el("th", { text: "Player" }), ...columns.map((c) => el("th", { text: c.label }))])
    );
    if (board.top.length === 0) {
      const text = board.oneShots?.length ? "No ranked win yet today (first-try wins are listed below)." : EMPTY_TEXT[board.period];
      this.table.append(el("tr", {}, [el("td", { text, attrs: { colspan: 2 + columns.length } })]));
    } else {
      this.table.append(...board.top.map((entry) => this.row(entry, columns)));
      if (board.me && board.me.rank > 50) this.table.append(this.row(board.me, columns));
    }
    this.renderOneShots(board.oneShots ?? []);
    const range = board.range ? ` (${board.range.from} → ${board.range.to})` : "";
    this.note.textContent =
      board.period === "daily"
        ? "Fewest tries first, then fastest time. First-try wins are pure luck: they get a mention, not a rank."
        : `Points: 11 minus the number of tries per win, 1 minimum${range}. First-try wins (🍀) are pure luck and score no points. Hidden profiles are not listed.`;
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
