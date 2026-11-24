// Tri des tableaux de l'admin : un clic sur l'intitulé d'une colonne trie les
// lignes selon elle, un second clic inverse l'ordre. Un seul écouteur pour
// toute la page, donc les tableaux créés plus tard sont triables aussi.
// Words et Reports (classe « sortable ») trient eux-mêmes leurs données.
// Une cellule peut donner sa valeur de tri dans data-sort ; une colonne sans
// intitulé (boutons) ou avec data-nosort n'est pas triable.

const EMPTY = new Set(["", "-", "—", "–"]);
const DURATION = /^(?:(\d+):)?(\d+):(\d{2})$/;
const LEADING_NUMBER = /^[-+]?\d[\d\s,]*(?:\.\d+)?/;

// Valeur de tri d'une cellule : un nombre quand on peut, sinon le texte
function cellValue(cell) {
  const raw = (cell?.dataset.sort ?? cell?.textContent ?? "").trim();
  if (EMPTY.has(raw)) return null;
  // Date ISO (2026-11-16, 2026-11-22 11:58) : les plus récentes d'abord au premier clic
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const time = Date.parse(raw.replace(" ", "T"));
    return Number.isNaN(time) ? raw : time;
  }
  const duration = raw.match(DURATION);
  if (duration) return Number(duration[1] ?? 0) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  // Date écrite (23 Nov 2026, 14:54)
  if (/[A-Za-z]/.test(raw) && /\b\d{4}\b/.test(raw)) {
    const time = Date.parse(raw.replace(",", ""));
    if (!Number.isNaN(time)) return time;
  }
  const number = raw.match(LEADING_NUMBER);
  if (number) return Number(number[0].replace(/[\s,]/g, ""));
  return raw;
}

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

function sortBy(th) {
  const table = th.closest("table");
  const body = table.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
  // Ligne « rien à montrer » sur toute la largeur : rien à trier
  if (rows.length < 2 || rows.some((r) => [...r.cells].some((c) => c.colSpan > 1))) return;
  const index = [...th.parentElement.cells].indexOf(th);
  const values = new Map(rows.map((r) => [r, cellValue(r.cells[index])]));
  const current = th.getAttribute("aria-sort");
  // Premier clic : les plus grands nombres (et dates récentes) d'abord, le texte de A à Z
  const numeric = [...values.values()].filter((v) => v !== null).every((v) => typeof v === "number");
  const descending = current ? current === "ascending" : numeric;
  rows.sort((ra, rb) => {
    const a = values.get(ra);
    const b = values.get(rb);
    // Cellules vides toujours en bas
    if (a === null || b === null) return (a === null) - (b === null);
    return descending ? compare(b, a) : compare(a, b);
  });
  body.append(...rows);
  for (const cell of th.parentElement.cells) cell.removeAttribute("aria-sort");
  th.setAttribute("aria-sort", descending ? "descending" : "ascending");
}

const sortable = (th) => th && !th.closest("table.sortable") && th.closest("table.admin-table") && !("nosort" in th.dataset) && th.textContent.trim() !== "";

export function enableTableSort(root = document) {
  root.addEventListener("click", (event) => {
    const th = event.target.closest?.("thead th");
    if (sortable(th)) sortBy(th);
  });
}
