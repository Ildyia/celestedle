// Fiche publique d'un joueur : son ticket (nom, avatar, fraises, morts,
// série, meilleur temps, tampons, chapitre, trophées). Montrée par le site
// (fiche des classements) et par le bot Discord (/profile). Comme les
// classements, rien pour un profil caché ou anonyme.
const achievements = require("./achievements");
const players = require("./players");
const trophies = require("./trophies");
const { expireOverdueGames } = require("./games");

/** La fiche de `target`, ou null s'il n'a pas de fiche publique. */
function publicCard(target) {
  if (!target || target.isHidden || target.isAnonymous) return null;
  expireOverdueGames();
  const normal = players.playerStats(target, "normal");
  const hard = players.playerStats(target, "hard");
  const times = [normal.bestSeconds, hard.bestSeconds].filter((t) => t !== null && t !== undefined);
  const climb = achievements.playerClimb(target);
  return {
    player: { id: target.id, name: target.name, avatar: target.avatar, color: target.color },
    wins: climb.berries,
    falls: climb.chapters.reduce((sum, c) => sum + c.deaths, 0),
    streak: Math.max(normal.streak.current, hard.streak.current),
    bestTime: times.length ? Math.min(...times) : null,
    stamps: achievements.playerAchievements(target).filter((a) => a.earned).map((a) => a.id),
    chapter: climb.chapter,
    trophies: trophies.playerTrophies(target.id)
  };
}

module.exports = { publicCard };
