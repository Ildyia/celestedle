export function initTimer(containerNode) {
  if (!containerNode) return;

  const updateTimer = () => {
    const now = new Date();
    const parisStr = now.toLocaleString("en-US", { timeZone: "Europe/Paris" });
    const parisDate = new Date(parisStr);

    const parisReset = new Date(parisStr);
    parisReset.setHours(24, 0, 0, 0);

    const diff = parisReset - parisDate;

    if (diff <= 0) {
      containerNode.textContent = "00:00:00";
      setTimeout(() => location.reload(), 1000);
      return;
    }

    const hours = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, "0");
    const minutes = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, "0");
    const seconds = String(Math.floor((diff / 1000) % 60)).padStart(2, "0");

    containerNode.textContent = `${hours}:${minutes}:${seconds}`;
  };

  updateTimer();
  setInterval(updateTimer, 1000);
}