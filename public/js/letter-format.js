// Mise en forme d'une lettre de la boîte aux lettres : un petit Markdown,
// le même que Discord lit. Paragraphes séparés par une ligne vide, listes
// « - », **gras**, *italique*, [lien](https://…). Tout est construit en DOM :
// aucun HTML de la lettre n'est interprété.
import { el } from "./dom.js";

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;

function inline(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, bold, italic, label, href] = match;
    if (bold) nodes.push(el("strong", { text: bold }));
    else if (italic) nodes.push(el("em", { text: italic }));
    else nodes.push(el("a", { text: label, attrs: { href, target: "_blank", rel: "noopener noreferrer" } }));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Retours à la ligne gardés dans un paragraphe
function lines(text) {
  return text.split("\n").flatMap((line, i) => (i ? [el("br"), ...inline(line)] : inline(line)));
}

/** Nœuds DOM du corps d'une lettre. */
export function renderLetter(body) {
  return String(body)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const rows = block.split("\n");
      if (rows.every((row) => /^[-•]\s+/.test(row))) {
        return el("ul", {}, rows.map((row) => el("li", {}, inline(row.replace(/^[-•]\s+/, "")))));
      }
      return el("p", {}, lines(block));
    });
}
