import { formatDuration } from "./format.js";

// Compte à rebours jusqu'au prochain mot (minuit, heure de Paris)
export function initNextWordTimer(node, onNewDay) {
  if (!node) return;

  const msUntilParisMidnight = () => {
    const parisNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const midnight = new Date(parisNow);
    midnight.setHours(24, 0, 0, 0);
    return midnight - parisNow;
  };

  let fired = false;
  const tick = () => {
    const seconds = Math.ceil(msUntilParisMidnight() / 1000);
    const hours = Math.floor(seconds / 3600);
    node.textContent = `${String(hours).padStart(2, "0")}:${formatDuration(seconds % 3600)}`;
    // Juste après minuit, l'écart repasse à ~24 h : on charge le nouveau mot une fois
    if (seconds >= 24 * 3600 - 2 && !fired) {
      fired = true;
      onNewDay();
    } else if (seconds < 24 * 3600 - 10) {
      fired = false;
    }
  };

  tick();
  setInterval(tick, 1000);
}
