import { api } from "./api.js";
import { byId } from "./dom.js";
import { storage } from "./storage.js";

// Onglets des jeux au-dessus du sélecteur de mode. Un jeu en test n'apparaît
// que pour qui peut y jouer ; sans autre jeu que Celestedle, il ne reste que
// le sélecteur, comme avant.
const GAMES = [
  { id: "connections", access: () => api.connectionsAccess(), seenKey: "celestedle_cx_seen" },
  { id: "techs", access: () => api.techsAccess(), seenKey: "celestedle_techs_seen" }
];

async function showTab(game, current) {
  const tab = byId(`${game.id}-tab`);
  const badge = byId(`${game.id}-tab-badge`);
  if (!tab) return false;
  if (current === game.id) storage.set(game.seenKey, "1");
  try {
    const { access, canPlay } = await game.access();
    tab.hidden = !canPlay;
    // 🧪 en test, « New » une fois ouvert, jusqu'à la première visite
    const text = access !== "public" ? "🧪" : storage.get(game.seenKey) ? "" : "New";
    badge.textContent = text;
    badge.hidden = !text;
    badge.classList.toggle("is-new", text === "New");
    tab.title = access === "public" ? "" : "Playtest: not open to everyone yet";
    return canPlay;
  } catch {
    tab.hidden = true;
    return false;
  }
}

export async function initGameTabs(current) {
  const shown = await Promise.all(GAMES.map((game) => showTab(game, current)));
  byId("game-tabs").classList.toggle("has-tabs", shown.some(Boolean) || current !== "celestedle");
}
