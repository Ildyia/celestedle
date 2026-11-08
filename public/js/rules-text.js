import { formatDuration, plural } from "./format.js";
import { HINT_NAMES } from "./hints.js";

// Textes des règles d'un mode, à partir des réglages envoyés par le serveur

function minutesText(seconds) {
  return seconds % 60 === 0 ? plural(seconds / 60, "minute") : `${formatDuration(seconds)} min`;
}

// Les indices bonus ne comptent pas dans la limite : « 1 hint + Element Info »
function hintsText(rules, names = {}) {
  const base = rules.maxHints === 0 ? "no hints" : plural(rules.maxHints, "hint");
  const bonus = (rules.bonusHints ?? []).map((type) => names[type] ?? HINT_NAMES[type]);
  return bonus.length ? `${base} + ${bonus.join(" + ")}` : base;
}

function limits(rules, names) {
  return {
    hints: hintsText(rules, names),
    tries: !rules.maxTries ? "unlimited tries" : rules.maxTries === 1 ? "1 try" : `${rules.maxTries} tries`
  };
}

// Bandeau sous le sélecteur de mode
export function rulesSummary(rules, names) {
  const { hints, tries } = limits(rules, names);
  const time = rules.timeLimitSeconds ? formatDuration(rules.timeLimitSeconds) : "no time limit";
  const parts = [hints, tries, time, `suggestions from ${rules.suggestionMinChars} letters`];
  if (rules.consistentGuesses) parts.push("guesses must fit your clues (or cost a try)");
  return parts.join(" · ");
}

// Phrase de la fenêtre des règles
export function rulesSentence(rules, names) {
  const { hints, tries } = limits(rules, names);
  const time = rules.timeLimitSeconds
    ? `${minutesText(rules.timeLimitSeconds)} from your first guess (or your hint, if you take it first)`
    : "no time limit";
  return `${hints[0].toUpperCase()}${hints.slice(1)}, ${tries} and ${time}.`;
}

// Remplit les éléments [data-rules-mode][data-rules-text="sentence|summary|suggestions"]
// names : noms des indices propres au jeu (« Tech Info »)
export function fillRulesText(modeId, rules, names) {
  document.querySelectorAll(`[data-rules-mode="${modeId}"]`).forEach((node) => {
    const kind = node.dataset.rulesText;
    if (kind === "sentence") node.textContent = rulesSentence(rules, names);
    if (kind === "summary") node.textContent = rulesSummary(rules, names);
    if (kind === "suggestions") node.textContent = String(rules.suggestionMinChars);
  });
}
