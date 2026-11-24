// Page « Progression » (Stats) : où en sont les joueurs sur la montagne et
// quels tampons sont durs ou faciles (src/services/progression.js).
import { avatarUrl } from "../profile.js";
import { el, byId, clear } from "../dom.js";
import { formatNumber } from "../format.js";
import { STAMPS } from "../stamps.js";
import { admin } from "./client.js";
import { card, columns, empty, hbars, pct, wide } from "./insights.js";

const STAMP_ART = new Map(STAMPS.map((s) => [s.id, s]));
// Tableau large : défile à l'intérieur de la carte sur téléphone
const scroll = (node) => el("div", { className: "progress-scroll" }, [node]);
const days = (n) => (n === null ? "-" : n === 0 ? "same day" : `${formatNumber(n)} day${n === 1 ? "" : "s"}`);

function summary(data) {
  const s = data.summary;
  const tile = (value, label, title) => el("div", { className: "progress-tile", attrs: title ? { title } : {} }, [el("strong", { text: value }), el("span", { text: label })]);
  return el("div", { className: "progress-tiles" }, [
    tile(String(data.players), "climbers", "Registered players with at least one finished game"),
    tile(s.avgBerries === null ? "-" : formatNumber(s.avgBerries), "strawberries on average", `Median: ${s.medianBerries ?? "-"}, best: ${s.maxBerries ?? "-"}`),
    tile(s.medianChapter ?? "-", "median chapter", "Half the climbers are at this chapter or below"),
    tile(s.avgStamps === null ? "-" : `${formatNumber(s.avgStamps)} / ${data.stamps.total}`, "stamps on average"),
    tile(s.winRate === null ? "-" : `${formatNumber(s.winRate)}%`, "average win rate", "Strawberries out of finished games, averaged over climbers")
  ]);
}

function chaptersTable(data) {
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Chapter" }),
        el("th", { text: "Needs" }),
        el("th", { text: "Reached", attrs: { title: "Climbers who got there, now or on the way up" } }),
        el("th", { text: "Median climb", attrs: { title: "Days from the first game to reaching the chapter, for those who did" } })
      ])
    ]),
    el(
      "tbody",
      {},
      data.chapters.map((c) =>
        el("tr", {}, [
          el("td", { text: c.name }),
          el("td", { text: `${c.berries} 🍓` }),
          el("td", { text: `${pct(c.reached, data.players)} (${c.reached})` }),
          el("td", { text: c.reached ? days(c.medianDays) : "-" })
        ])
      )
    )
  ]);
}

function stampCell(a) {
  const art = STAMP_ART.get(a.id);
  return el("td", { className: "progress-stamp" }, [
    art ? el("img", { attrs: { src: `assets/stamps/${art.image}`, alt: "" } }) : null,
    el("span", { text: a.name, attrs: { title: a.description } })
  ]);
}

function stampsTable(data) {
  if (!data.players) return empty("Nobody has played yet.");
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Stamp" }),
        el("th", { text: "Earned" }),
        el("th", { text: "Others", attrs: { title: "For stamps with a goal: how far the climbers who don't have it are, on average" } })
      ])
    ]),
    el(
      "tbody",
      {},
      data.achievements.map((a) =>
        el("tr", {}, [
          stampCell(a),
          el("td", { text: `${pct(a.earned, data.players)} (${a.earned})` }),
          el("td", { text: a.avgProgress === null ? "-" : `${formatNumber(a.avgProgress)}% of ${a.goal}` })
        ])
      )
    )
  ]);
}

function furthestTable(rows) {
  if (!rows.length) return empty("Nobody has played yet.");
  return el("table", { className: "admin-table compact" }, [
    el("thead", {}, [el("tr", {}, ["#", "Player", "Chapter", "Strawberries", "Falls", "Stamps", "Last game"].map((t) => el("th", { text: t })))]),
    el(
      "tbody",
      {},
      rows.map((r, i) =>
        el("tr", {}, [
          el("td", { text: String(i + 1) }),
          el("td", { className: "progress-player" }, [
            el("img", { attrs: { src: avatarUrl(r.avatar), alt: "", style: `border-color: ${r.color}` } }),
            el("span", { text: r.name }),
            r.isHidden ? el("span", { className: "badge", text: "hidden", attrs: { title: "Hidden from the leaderboards" } }) : null
          ]),
          el("td", { text: r.chapterName }),
          el("td", { text: String(r.berries) }),
          el("td", { text: String(r.falls) }),
          el("td", { text: String(r.stamps) }),
          el("td", { text: r.lastPlayed })
        ])
      )
    )
  ]);
}

export class ProgressionTab {
  constructor() {
    this.days = "";
    document.querySelectorAll("[data-progress-days]").forEach((b) =>
      b.addEventListener("click", () => {
        this.days = b.dataset.progressDays;
        this.load();
      })
    );
  }

  async load() {
    document.querySelectorAll("[data-progress-days]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.progressDays === this.days)));
    const box = byId("progression");
    clear(box);
    box.append(el("p", { className: "small-subtext", text: "Loading…" }));
    const data = await admin.progression(this.days);
    clear(box);
    box.append(
      wide(card("Where the climbers are", this.days ? `Players whose last game is from the last ${this.days} days.` : "Every registered player with a finished game (profiles never saved are left out).", summary(data))),
      card(
        "Current chapter",
        "How many climbers stand at each chapter right now.",
        hbars(data.chapters, { label: (c) => c.name, value: (c) => c.current, title: (c) => `${c.name}: ${c.current} (${pct(c.current, data.players)})`, none: "Nobody has played yet." })
      ),
      card("Chapters reached", "Share of climbers who got to each chapter, and how long it took them.", scroll(chaptersTable(data))),
      card("Stamps, easiest to hardest", "Hover a stamp name for how to earn it.", scroll(stampsTable(data))),
      card(
        "Stamps per climber",
        "How many stamps each climber has.",
        columns(data.stamps.histogram, data.stamps.histogram.map((_, k) => String(k)), { title: (l, v) => `${v} climber${v === 1 ? "" : "s"} with ${l} stamp${l === "1" ? "" : "s"}` })
      ),
      wide(card("Furthest climbers", "Most strawberries; hidden profiles included.", scroll(furthestTable(data.furthest))))
    );
  }
}
