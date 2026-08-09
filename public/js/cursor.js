export const CursorManager = {
  init() {
    const cursorContainer = document.getElementById("custom-cursor");
    const defaultCursor = document.getElementById("default-cursor");
    const pointerCursor = document.getElementById("pointer-cursor");
    const textCursor = document.getElementById("text-hover-cursor");

    if (!cursorContainer || !defaultCursor || !pointerCursor || !textCursor)
      return;

    window.addEventListener("mousemove", (e) => {
      cursorContainer.style.left = `${e.clientX}px`;
      cursorContainer.style.top = `${e.clientY}px`;

      const target = e.target;
      const isText =
        target.matches("input[type='text'], input:not([type]), textarea") ||
        target.isContentEditable;
      const isClickable = target.closest(
        "button, a, .suggestion-item, [role='button'], input[type='submit'], input[type='button'], select",
      );

      defaultCursor.style.display = "none";
      pointerCursor.style.display = "none";
      textCursor.style.display = "none";

      if (isText) {
        textCursor.style.display = "block";
      } else if (isClickable) {
        pointerCursor.style.display = "block";
      } else {
        defaultCursor.style.display = "block";
      }
    });
  },
};
