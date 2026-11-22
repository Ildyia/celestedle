// Messages Discord des récaps (src/services/recap.js) : objets d'embed
// simples, testables sans Discord. Textes en anglais, comme le jeu.

const COLOR_DAY = 0x5aa8e8;
const COLOR_WEEK = 0xf3c95a;
const MEDALS = ["🥇", "🥈", "🥉"];
const SIDE = { normal: "A-Side", hard: "B-Side" };

// Les noms sont choisis par les joueurs : pas de mise en forme Discord
const escape = (text) => String(text).replace(/([\\*_~`|])/g, "\\$1");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function formatDay(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function formatShort(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function podium(rows, detail) {
  return rows.map((r, i) => `${MEDALS[i]} **${escape(r.name)}** · ${detail(r)}`).join("\n");
}

function celestedleField(day) {
  const lines = [];
  if (day.answer) lines.push(`Answer: ||${capitalize(day.answer)}||`);
  if (!day.finished) lines.push("Nobody climbed this side.");
  else {
    lines.push(
      `${plural(day.finished, "climber")} · ${day.winRate}% made it` + (day.avgTries ? ` · ${day.avgTries} tries on average` : "")
    );
    if (day.podium.length) {
      lines.push(podium(day.podium, (r) => `${r.tries} ${r.tries === 1 ? "try" : "tries"}${r.hints ? ` + ${plural(r.hints, "hint")}` : ""}`));
    }
  }
  return { name: `Celestedle · ${SIDE[day.mode]}`, value: lines.join("\n"), inline: false };
}

function connectionsField(day) {
  const lines = [];
  if (!day.finished) lines.push("Nobody sorted this grid.");
  else {
    lines.push(`${plural(day.finished, "climber")} · ${day.winRate}% solved it`);
    if (day.hardest) lines.push(`Toughest group: ||${escape(day.hardest.label)}|| (found by ${day.hardest.share}%)`);
    if (day.podium.length) {
      lines.push(podium(day.podium, (r) => `${plural(r.mistakes, "mistake")}${r.hints ? ` + ${plural(r.hints, "hint")}` : ""}`));
    }
  }
  return { name: `Connections · ${SIDE[day.mode]}`, value: lines.join("\n"), inline: false };
}

/** Message de minuit : le nouveau jour, puis le récap de la veille. */
function dailyEmbed(recap, siteUrl) {
  return {
    title: "🏔️ A new climb is up!",
    url: siteUrl,
    color: COLOR_DAY,
    description: `Today's puzzles are ready on [Celestedle](${siteUrl}). Here's how ${formatDay(recap.date)} went:`,
    fields: [...recap.celestedle.map(celestedleField), ...(recap.connections ?? []).map(connectionsField)]
  };
}

/** Message du lundi : champion de la semaine terminée. */
function weeklyEmbed(recap, siteUrl) {
  const [champion] = recap.podium;
  const week = `${formatShort(recap.from)} – ${formatShort(recap.to)}`;
  return {
    title: "🏆 Champion of the week",
    url: siteUrl,
    color: COLOR_WEEK,
    description: champion
      ? `**${escape(champion.name)}** wins the week of ${week} with ${plural(champion.points, "point")}! 🍓`
      : `Nobody made the weekly ranking for ${week}. This week's crown is up for grabs!`,
    fields: recap.podium.length
      ? [{ name: "Podium", value: podium(recap.podium, (r) => `${plural(r.points, "point")} · ${plural(r.wins, "win")} in ${plural(r.games, "game")}`) }]
      : []
  };
}

module.exports = { dailyEmbed, weeklyEmbed, escape };
