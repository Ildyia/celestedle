import { api } from "./api.js";
import { byId } from "./dom.js";
import { storage } from "./storage.js";

// Onglets Celestedle / Connections au-dessus du jeu, le sélecteur Normal/Hard
// entre les deux. L'onglet Connections n'apparaît que pour qui peut y jouer ;
// sans lui, il ne reste que le sélecteur, comme avant.
const SEEN_KEY = "celestedle_cx_seen";

export async function initGameTabs(current) {
  const bar = byId("game-tabs");
  const tab = byId("connections-tab");
  if (current === "connections") storage.set(SEEN_KEY, "1");
  try {
    const { access, canPlay } = await api.connectionsAccess();
    bar.classList.toggle("has-tabs", canPlay);
    const badge = access !== "public" ? "🧪" : storage.get(SEEN_KEY) ? "" : "New";
    const badgeEl = byId("connections-tab-badge");
    badgeEl.textContent = badge;
    badgeEl.hidden = !badge;
    badgeEl.classList.toggle("is-new", badge === "New");
    tab.title = access === "public" ? "" : "Playtest: not open to everyone yet";
  } catch {
    bar.classList.remove("has-tabs");
  }
}
