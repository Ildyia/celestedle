import { formatDuration } from "./format.js";

// Chrono de la partie, calé sur les heures du serveur : temps écoulé en mode
// normal, compte à rebours en mode Hard
export class GameTimer {
  constructor(display) {
    this.display = display;
    this.intervalId = null;
    this.onExpire = () => {};
  }

  update(state) {
    this.stop();
    this.state = state;
    // Décalage entre l'horloge du joueur et celle du serveur
    this.offset = state.startedAt
      ? Date.now() - (Date.parse(state.startedAt) + state.elapsedSeconds * 1000)
      : 0;
    this.render();
    if (state.status === "playing" && state.startedAt) {
      this.intervalId = setInterval(() => this.render(), 1000);
    }
  }

  elapsed() {
    const { state } = this;
    if (!state?.startedAt) return 0;
    if (state.status !== "playing") return state.elapsedSeconds;
    return Math.floor((Date.now() - this.offset - Date.parse(state.startedAt)) / 1000);
  }

  render() {
    const { state } = this;
    if (!this.display || !state) return;

    if (state.rules.timeLimitSeconds) {
      const left = state.startedAt
        ? state.rules.timeLimitSeconds - this.elapsed()
        : state.rules.timeLimitSeconds;
      this.display.textContent = formatDuration(Math.max(0, left));
      this.display.classList.toggle("timer-urgent", state.status === "playing" && left <= 30);
      if (left <= 0 && state.status === "playing" && state.startedAt) {
        this.stop();
        this.onExpire();
      }
    } else {
      this.display.textContent = formatDuration(this.elapsed());
      this.display.classList.remove("timer-urgent");
    }
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
