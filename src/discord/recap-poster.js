// Récap quotidien du bot : à minuit (heure de Paris) et une minute, le
// message du jour dans le salon choisi par /setup-daily ; le lundi, le
// champion de la semaine en plus. Un post manqué (serveur arrêté à minuit)
// est rattrapé au redémarrage, jusqu'à CATCH_UP_HOURS heures du matin : plus
// tard, « A new climb is up » n'aurait plus de sens.
const config = require("../config");
const settingsRepo = require("../repositories/settings");
const recap = require("../services/recap");
const { dailyEmbed, weeklyEmbed } = require("./recap-embeds");
const { todayParis, addDays, weekStart, msUntilNextDay } = require("../utils/dates");

const CHANNEL_KEY = "discord_daily_channel_id";
const POSTED_KEY = "discord_daily_posted";
const CATCH_UP_HOURS = 6;
const DELAY_AFTER_MIDNIGHT_MS = 60 * 1000;

const PARIS_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false });

/** Messages du jour `today` : récap de la veille, et de la semaine le lundi. */
function recapEmbeds(today) {
  const embeds = [dailyEmbed(recap.dailyRecap(addDays(today, -1)), config.siteUrl)];
  if (weekStart(today) === today) embeds.push(weeklyEmbed(recap.weeklyRecap(addDays(today, -7)), config.siteUrl));
  return embeds;
}

/** Pour l'aperçu : la veille et la dernière semaine terminée, quel que soit le jour. */
function previewEmbeds(today) {
  return [
    dailyEmbed(recap.dailyRecap(addDays(today, -1)), config.siteUrl),
    weeklyEmbed(recap.weeklyRecap(addDays(weekStart(today), -7)), config.siteUrl)
  ];
}

const channelId = () => settingsRepo.get(CHANNEL_KEY);
const setChannelId = (id) => settingsRepo.set(CHANNEL_KEY, id);

/**
 * send(channelId, embeds) envoie le message ; now() donne l'heure (tests).
 * Renvoie { postIfDue, start, stop }.
 */
function createRecapPoster({ send, now = () => new Date() }) {
  let timer = null;

  // true si un message est parti
  async function postIfDue() {
    const channel = channelId();
    if (!channel) return false;
    const at = now();
    const today = todayParis(at);
    if (settingsRepo.get(POSTED_KEY) === today) return false;
    if (Number(PARIS_HOUR.format(at)) % 24 >= CATCH_UP_HOURS) return false;
    // Noté avant l'envoi : une erreur Discord ne doit pas faire poster deux fois
    settingsRepo.set(POSTED_KEY, today);
    await send(channel, recapEmbeds(today));
    return true;
  }

  function schedule() {
    timer = setTimeout(async () => {
      await postIfDue().catch((err) => console.error("[DISCORD] Récap du jour impossible :", err.message));
      schedule();
    }, msUntilNextDay(now()) + DELAY_AFTER_MIDNIGHT_MS);
    timer.unref?.();
  }

  function start() {
    postIfDue().catch((err) => console.error("[DISCORD] Récap du jour impossible :", err.message));
    schedule();
  }

  function stop() {
    clearTimeout(timer);
  }

  return { postIfDue, start, stop };
}

module.exports = { createRecapPoster, recapEmbeds, previewEmbeds, channelId, setChannelId, CHANNEL_KEY, POSTED_KEY };
