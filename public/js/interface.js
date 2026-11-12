// Interface « Modern » des pages de jeu : décor et style des menus du jeu
// (modern.css), par-dessus la page Classic. Tout le style est rangé sous
// html.ui-modern : sans la classe, la page reste exactement la Classic.
// La classe est posée dès le <head> par un petit script (pas d'éclair au
// chargement) ; ce module l'ajoute ou la retire quand l'option change et
// construit le décor (ciel, lune, montagne) et le lien de retour au menu.
import { el } from "./dom.js";

function buildDecor() {
  const scene = el("div", { attrs: { id: "modern-scene", "aria-hidden": "true" } }, [
    el("div", { className: "m-stars" }),
    el("div", { className: "m-moon" }, [el("span", { className: "m-moon-glow" }), el("span", { className: "m-moon-body" })]),
    el("img", { className: "m-mountain", attrs: { src: "assets/menu/mountain.png", alt: "", decoding: "async" } })
  ]);
  const back = el("a", { attrs: { id: "modern-back", href: "menu.html" } }, [el("span", { className: "m-back-arrow", text: "◂" }), "Menu"]);
  document.body.prepend(scene, back);
}

export function applyInterface(on) {
  document.documentElement.classList.toggle("ui-modern", on);
  if (on && !document.getElementById("modern-scene")) buildDecor();
}
