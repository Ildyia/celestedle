// Petits sons de menu, fabriqués à la volée (Web Audio) : aucun fichier son.
// Coupés par défaut ; option « Sounds » du menu et du menu pause.
import { storage, KEYS } from "./storage.js";

let context = null;

// [fréquence de départ, fréquence d'arrivée, durée (s), forme, volume]
const SOUNDS = {
  move: [[520, 520, 0.045, "square", 0.05]],
  change: [[620, 760, 0.06, "square", 0.05]],
  confirm: [[520, 780, 0.07, "square", 0.06], [780, 1040, 0.09, "square", 0.06]],
  back: [[520, 330, 0.09, "square", 0.05]],
  // Coup de tampon : un choc grave et court
  stamp: [[170, 55, 0.14, "triangle", 0.35]]
};

export const soundsOn = () => storage.getBool(KEYS.sounds, false);

export function playSound(name) {
  if (!soundsOn() || !SOUNDS[name]) return;
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") context.resume();
    let at = context.currentTime;
    for (const [from, to, duration, type, volume] of SOUNDS[name]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + duration);
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
      at += duration;
    }
  } catch {
    // Pas de son sur ce navigateur : sans conséquence
  }
}

// Son d'une touche de menu : flèches, Entrée, Échap
export function keySound(key) {
  if (key.startsWith("Arrow")) playSound(key === "ArrowLeft" || key === "ArrowRight" ? "change" : "move");
  else if (key === "Enter" || key === " ") playSound("confirm");
  else if (key === "Escape") playSound("back");
}
