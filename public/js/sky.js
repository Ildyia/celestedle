// Ciel selon l'heure locale du joueur : nuit, aube, jour ou crépuscule.
// Posé sur <html data-sky="…"> ; les couleurs sont dans modern.css (chargé
// par le menu et les pages de jeu). Le <head> de chaque page le pose déjà
// au chargement (même calcul) pour éviter un éclair ; ce module le tient à
// jour et suit l'option « Time of day sky » (sinon : nuit permanente).
import { storage, KEYS } from "./storage.js";

export function skyPeriod(hour = new Date().getHours()) {
  if (hour >= 21 || hour < 5) return "night";
  if (hour < 8) return "dawn";
  if (hour < 17) return "day";
  return "dusk";
}

export function applySky(on = storage.getBool(KEYS.timeSky, true)) {
  document.documentElement.dataset.sky = on ? skyPeriod() : "night";
}

let timer = null;
export function startSky() {
  applySky();
  clearInterval(timer);
  timer = setInterval(() => applySky(), 5 * 60 * 1000);
}
