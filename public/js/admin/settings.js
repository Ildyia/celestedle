import { byId } from "../dom.js";
import { admin } from "./client.js";

// Onglet Réglages : renvoie la fonction qui recharge les valeurs actuelles
export function bindSettings({ notify }) {
  const input = byId("repeat-delay-input");

  byId("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { repeatDelayDays } = await admin.saveSettings({ repeatDelayDays: Number(input.value) });
      notify(`Délai de répétition : ${repeatDelayDays} jour(s).`);
    } catch (err) {
      notify(err.message, true);
    }
  });

  return async () => {
    input.value = (await admin.overview()).repeatDelayDays;
  };
}
