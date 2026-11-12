// Fin de partie : chaque jeu l'annonce ici, l'interface Modern affiche
// alors son écran de fin façon « chapitre terminé » (interface.js).
// On n'annonce que la fin d'une partie jouée pendant la visite (passage de
// « playing » à gagné / perdu / abandon), pas une partie déjà finie qu'on
// recharge.
const lastStatus = new Map();

/**
 * @param {string} key  partie suivie (mode, grille…)
 * @param {string} status  "playing", "won", "lost" ou "forfeit"
 * @param {() => object} describe  détails pour l'écran de fin, appelé seulement à la fin
 */
export function announceEnd(key, status, describe) {
  const before = lastStatus.get(key);
  lastStatus.set(key, status);
  if (before !== "playing" || status === "playing") return;
  document.dispatchEvent(new CustomEvent("game-end", { detail: { status, ...describe() } }));
}
