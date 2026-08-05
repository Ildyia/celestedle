function createDailyStatsStore() {
  const successByKey = new Map();

  function getDayKey(secretName) {
    const dateString = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Europe/Paris",
    });
    return `${dateString}:${secretName}`;
  }

  return {
    getCount(secretName) {
      return successByKey.get(getDayKey(secretName))?.size || 0;
    },
    registerSuccess(secretName, playerId) {
      const key = getDayKey(secretName);
      const players = successByKey.get(key) || new Set();
      players.add(playerId);
      successByKey.set(key, players);
      return players.size;
    },
    getCountForKey(key) {
      return successByKey.get(key)?.size || 0;
    },
  };
}

module.exports = {
  createDailyStatsStore,
};
