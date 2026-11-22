// /profile : le ticket d'un joueur en message Discord, à partir de sa fiche
// publique (src/services/player-card.js).
const { CHAPTERS } = require("../services/chapters");
const { ACHIEVEMENTS } = require("../services/achievements");

const escape = (text) => String(text).replace(/([\\*_~`|])/g, "\\$1");

function avatarUrl(avatar, siteUrl) {
  const path = avatar.includes("/") ? `assets/avatars/${avatar}.png` : `assets/entities/${avatar}.png`;
  return new URL(path, siteUrl).href;
}

function duration(seconds) {
  if (seconds === null || seconds === undefined) return "-";
  const m = Math.floor(seconds / 60);
  return m ? `${m} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`;
}

function profileEmbed(card, siteUrl) {
  const chapter = CHAPTERS[card.chapter];
  const next = CHAPTERS[card.chapter + 1];
  const trophies = card.trophies ?? { winner: 0, champion: 0, isChampion: false };
  return {
    title: `${escape(card.player.name)}${trophies.isChampion ? " 👑" : ""}`,
    url: new URL(`index.html?player=${encodeURIComponent(card.player.id)}`, siteUrl).href,
    color: parseInt(String(card.player.color).replace("#", ""), 16) || 0x5aa8e8,
    thumbnail: { url: avatarUrl(card.player.avatar, siteUrl) },
    description: next
      ? `**${chapter.name}** · ${next.berries - card.wins} 🍓 to ${next.name}`
      : `**${chapter.name}** · all the way to the moon!`,
    fields: [
      { name: "Strawberries", value: `🍓 ${card.wins}`, inline: true },
      { name: "Deaths", value: `💀 ${card.falls}`, inline: true },
      { name: "Streak", value: `🔥 ${card.streak} day${card.streak === 1 ? "" : "s"}`, inline: true },
      { name: "Best time", value: duration(card.bestTime), inline: true },
      { name: "Stamps", value: `${card.stamps.length} / ${ACHIEVEMENTS.length}`, inline: true },
      { name: "Trophies", value: `🏅 ${trophies.winner} · 🏆 ${trophies.champion}`, inline: true }
    ]
  };
}

module.exports = { profileEmbed, avatarUrl };
