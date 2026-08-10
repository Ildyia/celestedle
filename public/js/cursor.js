export const CursorManager = {
  init() {
    const cursorContainer = document.getElementById("custom-cursor");
    const defaultCursor = document.getElementById("default-cursor");
    const pointerCursor = document.getElementById("pointer-cursor");
    const textCursor = document.getElementById("text-hover-cursor");

    if (!cursorContainer || !defaultCursor || !pointerCursor || !textCursor)
      return;

    let mouseX = 0;
    let mouseY = 0;
    let isTicking = false;

    // 1. On se contente de stocker les coordonnées (zéro calcul lourd ici)
    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!isTicking) {
        window.requestAnimationFrame(() => {
          cursorContainer.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
          isTicking = false;
        });
        isTicking = true;
      }

      // 2. Optimisation : on vérifie le type de curseur uniquement si nécessaire,
      // ou on délègue via un survol CSS/classes si possible.
      // Mais pour garder ta logique exacte sans alourdir, on peut l'alléger ainsi :
      const target = e.target;
      const isText =
        target.matches("input[type='text'], input:not([type]), textarea") ||
        target.isContentEditable;
      const isClickable = target.closest(
        "button, a, .suggestion-item, [role='button'], input[type='submit'], input[type='button'], select"
      );

      // On évite de modifier le display si l'état ne change pas (gros gain de perf)
      if (isText && textCursor.style.display !== "block") {
        defaultCursor.style.display = "none";
        pointerCursor.style.display = "none";
        textCursor.style.display = "block";
      } else if (isClickable && pointerCursor.style.display !== "block") {
        defaultCursor.style.display = "none";
        pointerCursor.style.display = "block";
        textCursor.style.display = "none";
      } else if (
        !isText &&
        !isClickable &&
        defaultCursor.style.display !== "block"
      ) {
        defaultCursor.style.display = "block";
        pointerCursor.style.display = "none";
        textCursor.style.display = "none";
      }
    });
  }
};
