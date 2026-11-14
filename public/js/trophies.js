// Marques à côté d'un nom dans les classements (src/services/trophies.js) :
// 🏆 le champion en titre (premier de la dernière semaine terminée) et la baie
// lunaire du record de trophées (jours gagnés dans ce mode pour un classement
// du jour, tous les trophées pour la semaine et le général).
import { el } from "./dom.js";

export function trophyMarks(entry, daily = true) {
  const marks = [];
  if (entry.champion) {
    marks.push(el("span", { className: "trophy champion", text: "🏆", attrs: { title: "Reigning champion: first of last week's ranking" } }));
  }
  if (entry.record) {
    const what = daily ? `won days in this mode` : "trophies";
    marks.push(
      el("img", {
        className: "trophy record",
        attrs: { src: "assets/entities/moon-berry.png", alt: "", title: `Most ${what}: ${entry.record}` }
      })
    );
  }
  return marks;
}
