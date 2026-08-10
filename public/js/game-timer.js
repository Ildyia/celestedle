export const GameTimer = {
  intervalId: null,
  secondsElapsed: 0,
  displayNode: null,

  init(displayNode) {
    this.displayNode = displayNode;
    this.secondsElapsed = parseInt(
      localStorage.getItem("celestedle_elapsed_time") || "0",
      10
    );
    this.render();
  },

  start() {
    if (this.intervalId) return;

    this.render();

    this.intervalId = setInterval(() => {
      // Si la partie est terminée, on met en pause automatiquement
      if (localStorage.getItem("celestedle_gameover") === "true") {
        this.stop();
        return;
      }

      this.secondsElapsed += 1;
      localStorage.setItem(
        "celestedle_elapsed_time",
        this.secondsElapsed.toString()
      );
      this.render();
    }, 1000);
  },

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  reset() {
    this.stop();
    this.secondsElapsed = 0;
    localStorage.removeItem("celestedle_elapsed_time");
    this.render();
  },

  getTimeInSeconds() {
    const saved = parseInt(
      localStorage.getItem("celestedle_elapsed_time") || "0",
      10
    );
    return Math.max(this.secondsElapsed || 0, saved);
  },

  render() {
    if (!this.displayNode) return;

    const mins = Math.floor(this.secondsElapsed / 60);
    const secs = this.secondsElapsed % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    this.displayNode.textContent = formatted;
  }
};
