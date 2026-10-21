// Petits utilitaires DOM. Les textes passent toujours par textContent : aucune
// donnée venant du serveur ou d'un joueur n'est interprétée comme du HTML.

export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { className, text, attrs, dataset, on } = options;
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(name, value === true ? "" : value);
    }
  }
  if (dataset) Object.assign(node.dataset, dataset);
  if (on) {
    for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function byId(id) {
  return document.getElementById(id);
}

export function clear(node) {
  node?.replaceChildren();
}

// Les fenêtres utilisent la classe .rules-modal et sont masquées par .hidden
export function openModal(id) {
  byId(id)?.classList.remove("hidden");
}

export function closeModal(id) {
  byId(id)?.classList.add("hidden");
}

// Ferme la fenêtre quand on clique sur le fond, ou sur un bouton
// [data-close-modal]
export function bindModalClosing() {
  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-close-modal]");
    if (closer) {
      closeModal(closer.dataset.closeModal);
      return;
    }
    if (e.target.classList?.contains("rules-modal") && e.target.dataset.backdropClose !== "false") {
      e.target.classList.add("hidden");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".rules-modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  });
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
