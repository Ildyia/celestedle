// Fenêtres de la page de jeu (profil, classements, signalement de bug)
// ouvertes directement dans le menu, sans quitter l'écran.
// Leur HTML vit dans index.html : on l'y prend au premier besoin (une seule
// source à maintenir), puis on branche les mêmes modules que la page de jeu.
import { api } from "./api.js";
import { bindModalClosing } from "./dom.js";
import { storage, KEYS } from "./storage.js";
import { ProfilePanel } from "./profile.js";
import { ReportsPanel } from "./reports.js";
import { LeaderboardPanel } from "./leaderboard.js";

const MODAL_IDS = ["profile-modal", "leaderboard-modal", "bug-modal"];
let loading = null;

async function load() {
  const html = await fetch("index.html").then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const id of MODAL_IDS) {
    const node = doc.getElementById(id);
    if (node) document.body.append(document.importNode(node, true));
  }
  bindModalClosing();
  const elements = await api.elements().catch(() => []);
  return {
    profile: new ProfilePanel(),
    reports: new ReportsPanel({ getElements: () => elements }),
    leaderboard: new LeaderboardPanel({ getMode: () => (storage.get(KEYS.mode) === "hard" ? "hard" : "normal") })
  };
}

/** Ouvre une fenêtre : "profile", "reports" ou "leaderboard". */
export async function openPanel(name) {
  loading ??= load().catch((err) => {
    loading = null;
    throw err;
  });
  const panels = await loading;
  panels[name].open();
}

/** Une fenêtre est-elle ouverte (le clavier du menu doit alors se taire) ? */
export function panelOpen() {
  return Boolean(document.querySelector(".rules-modal:not(.hidden)"));
}
