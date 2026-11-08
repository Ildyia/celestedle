import { formatDuration } from "./format.js";
import { HINT_NAMES } from "./hints.js";
import { CELESTEDLE, modeKind } from "./catalogs.js";

const EMOJI = { correct: "🟩", partial: "🟨", notTotallyWrong: "🟧", wrong: "🟥", higher: "⬆️", lower: "⬇️" };

export function buildShareText(state, catalog = CELESTEDLE) {
  const modeLabel = modeKind(catalog, state.mode) === "hard" ? " (Hard)" : "";
  const time = `⏱️ Time: ${formatDuration(state.elapsedSeconds)}`;
  const hints = state.hints.length
    ? `${state.hints.length} hint${state.hints.length > 1 ? "s" : ""} used (${state.hints
        .map((h) => catalog.hintNames[h.type] ?? HINT_NAMES[h.type])
        .join(", ")})`
    : "No hints used";

  const outcome = {
    won: `in ${state.tries} ${state.tries === 1 ? "try" : "tries"} (${time})`,
    forfeit: `: Forfeit ❌ (${state.tries} tries - ${time})`,
    lost: `: Lost ⏳ (${state.tries} tries - ${time})`
  }[state.status];

  const grid = state.guesses
    .map((g) => catalog.categories.map((c) => EMOJI[g.verdict[c]] || "🟥").join(""))
    .join("\n");

  return `${catalog.title}${modeLabel} of the day ${outcome}\n${hints}\n\n${grid}\n\n${catalog.siteUrl}`;
}

export async function copyShareText(state, catalog = CELESTEDLE) {
  await navigator.clipboard.writeText(buildShareText(state, catalog));
}
