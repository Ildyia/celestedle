import { api } from "./api.js";
import { el, byId, clear, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { avatarUrl } from "./profile.js";

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
    try {
      this.render(await api.leaderboard(this.period, this.mode));
    } catch (err) {
      this.note.textContent = err.message;
    }
  }

  row(entry, columns) {
    return el("tr", { className: entry.isMe ? "is-me" : "" }, [
      el("td", { className: "board-rank", text: `#${entry.rank}` }),
      el("td", {}, [
        el("span", { className: "board-player", attrs: { style: `--player-color: ${entry.player.color}` } }, [
          el("img", { attrs: { src: avatarUrl(entry.player.avatar), alt: "" } }),
          el("span", { text: entry.player.name })
        ])
      ]),
      ...columns.map((c) => el("td", { className: "board-num", text: String(c.value(entry) ?? "-") }))
    ]);
  }

  render(board) {
    const columns = COLUMNS[board.period];
    this.head.replaceChildren(
      el("tr", {}, [el("th", { text: "#" }), el("th", { text: "Player" }), ...columns.map((c) => el("th", { text: c.label }))])
    );
    if (board.top.length === 0) {
      this.table.append(el("tr", {}, [el("td", { text: EMPTY_TEXT[board.period], attrs: { colspan: 2 + columns.length } })]));
    } else {
      this.table.append(...board.top.map((entry) => this.row(entry, columns)));
      if (board.me && board.me.rank > 50) this.table.append(this.row(board.me, columns));
    }
    const range = board.range ? ` (${board.range.from} → ${board.range.to})` : "";
    this.note.textContent =
      board.period === "daily"
        ? "Fewest tries first, then fastest time."
        : `Points: 11 minus the number of tries per win, 1 minimum${range}. Hidden profiles are not listed.`;
  }
}
