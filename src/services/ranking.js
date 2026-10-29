// Score de 0 à 100 de chaque partie, comparable d'un mode à l'autre : la part
// des joueurs du même jour et du même mode qu'on a battus. Une défaite vaut 0 ;
// les perdants comptent comme battus par les gagnants, donc gagner un jour où
// peu de joueurs gagnent rapporte beaucoup (Hard notamment).

// En dessous de ce nombre de joueurs, la comparaison n'a pas de sens : une
// victoire vaut 50
const MIN_PLAYERS = 3;
const FEW_PLAYERS_WIN = 50;

// Classement général : moyenne « lissée », comme si chacun avait déjà joué
// PRIOR_GAMES parties au score moyen de la communauté. Un compte neuf reste
// près de la moyenne tant qu'il n'a pas fait ses preuves.
const PRIOR_GAMES = 10;
const DEFAULT_AVERAGE = 50;

// results : [{ playerId, board, date, won, cost }] où board identifie le mode
// (ex. "normal", "cx-hard") et cost le nombre d'essais ou d'erreurs (plus
// petit = meilleur). Renvoie les mêmes objets avec un champ score.
function scoreGames(results) {
  const days = new Map();
  for (const r of results) {
    const key = `${r.board}|${r.date}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  }

  const scored = [];
  for (const games of days.values()) {
    const others = games.length - 1;
    for (const game of games) {
      let score = 0;
      if (game.won && games.length < MIN_PLAYERS) {
        score = FEW_PLAYERS_WIN;
      } else if (game.won) {
        let beaten = 0;
        for (const other of games) {
          if (other === game) continue;
          if (!other.won || other.cost > game.cost) beaten += 1;
          else if (other.cost === game.cost) beaten += 0.5;
        }
        score = (100 * beaten) / others;
      }
      scored.push({ ...game, score });
    }
  }
  return scored;
}

// Totaux par joueur : somme (semaine), moyenne lissée (général), parties,
// victoires
function playerTotals(scored) {
  const average = scored.length ? scored.reduce((sum, g) => sum + g.score, 0) / scored.length : DEFAULT_AVERAGE;
  const players = new Map();
  for (const g of scored) {
    const p = players.get(g.playerId) ?? { playerId: g.playerId, points: 0, games: 0, wins: 0 };
    p.points += g.score;
    p.games += 1;
    p.wins += g.won ? 1 : 0;
    players.set(g.playerId, p);
  }
  return [...players.values()].map((p) => ({
    ...p,
    rating: (p.points + PRIOR_GAMES * average) / (p.games + PRIOR_GAMES)
  }));
}

module.exports = { MIN_PLAYERS, FEW_PLAYERS_WIN, PRIOR_GAMES, scoreGames, playerTotals };
