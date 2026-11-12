// Ciel selon l'heure locale du joueur : nuit, aube, jour ou crépuscule.
// Posé sur <html data-sky="…"> ; les couleurs sont dans modern.css (chargé
// par le menu et les pages de jeu). Le <head> de chaque page le pose déjà
// au chargement (même calcul) pour éviter un éclair ; ce module le tient à
// jour et suit l'option « Sky » (Auto, ou un ciel fixe au choix).
import { storage, KEYS } from "./storage.js";

export function skyPeriod(hour = new Date().getHours()) {
  if (hour >= 21 || hour < 5) return "night";
  if (hour < 8) return "dawn";
  if (hour < 17) return "day";
  return "dusk";
}

// Réglage « Sky » : "true" (ou rien) = suit l'heure ; sinon un ciel fixe.
// "false" est l'ancien réglage « désactivé » : nuit.
export const SKY_CHOICES = [
  ["true", "Auto"],
  ["dawn", "Dawn"],
  ["day", "Day"],
  ["dusk", "Dusk"],
  ["night", "Night"]
];

export function skySetting() {
  const value = storage.get(KEYS.timeSky, "true");
  if (value === "false") return "night";
  return SKY_CHOICES.some(([id]) => id === value) ? value : "true";
}

export function applySky() {
  const setting = skySetting();
  document.documentElement.dataset.sky = setting === "true" ? skyPeriod() : setting;
  // Barre du navigateur (mobile) de la couleur du haut du ciel
  const top = getComputedStyle(document.documentElement).getPropertyValue("--sky-top").trim();
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  if (top) meta.content = top;
}

let timer = null;
export function startSky() {
  applySky();
  clearInterval(timer);
  timer = setInterval(() => applySky(), 5 * 60 * 1000);
}
