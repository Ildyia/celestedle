import { formatDuration } from "./format.js";
import { HINT_NAMES } from "./hints.js";

const EMOJI = { correct: "🟩", partial: "🟨", notTotallyWrong: "🟧", wrong: "🟥" };
const SITE_URL = "https://celestedle.vercel.app/";

export function buildShareText(state) {
  const modeLabel = state.mode === "hard" ? " (Hard)" : "";
  const time = `⏱️ Time: ${formatDuration(state.elapsedSeconds)}`;
  const hints = state.hints.length
    ? `${state.hints.length} hint${state.hints.length > 1 ? "s" : ""} used (${state.hints
        .map((h) => HINT_NAMES[h.type])
        .join(", ")})`
    : "No hints used";

  const outcome = {
    won: `in ${state.tries} ${state.tries === 1 ? "try" : "tries"} (${time})`,
    forfeit: `: Forfeit ❌ (${state.tries} tries - ${time})`,
    lost: `: Lost ⏳ (${state.tries} tries - ${time})`
  }[state.status];

  const grid = state.guesses
    .map((g) => ["type", "lieu", "couleur", "shape"].map((c) => EMOJI[g.verdict[c]] || "🟥").join(""))
    .join("\n");

  return `Celestedle${modeLabel} of the day ${outcome}\n${hints}\n\n${grid}\n\n${SITE_URL}`;
}

export async function copyShareText(state) {
  await navigator.clipboard.writeText(buildShareText(state));
}
