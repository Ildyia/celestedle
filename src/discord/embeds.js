// Construction des messages Discord des reports

const FIELD_LIMIT = 1024;

const STATUS = {
  new: { label: "🔴 New", color: 0xef4444 },
  working: { label: "🟡 Working on it", color: 0xf59e0b },
  fixed: { label: "🟢 Fixed", color: 0x10b981 },
  cant_reproduce: { label: "⚪ Can't reproduce", color: 0x64748b },
  wrong: { label: "🔴 Wrong report", color: 0xef4444 }
};

// Boutons de gestion : la clé du custom_id correspond au statut
const STATUS_BUTTONS = [
  { key: "fixed", label: "Fixed", style: 3 },
  { key: "working", label: "Working on it", style: 1 },
  { key: "cant", label: "Can't reproduce", style: 2 },
  { key: "wrong", label: "Wrong report", style: 4 }
];
const STATUS_FROM_BUTTON = { fixed: "fixed", working: "working", cant: "cant_reproduce", wrong: "wrong" };

const SPOILER_COLOR = 0xf59e0b;

function truncate(text, limit = FIELD_LIMIT) {
  const value = String(text || "-");
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function spoiler(text, isSpoiler) {
  if (!isSpoiler) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() ? `||${line.trim()}||` : ""))
    .join("\n");
}

function baseFields(report) {
  return {
    element: spoiler(report.elementName || "N/A", report.isSpoiler),
    description: truncate(spoiler(report.description, report.isSpoiler))
  };
}

function title(prefix, report) {
  return `${prefix} [${report.id}]${report.isSpoiler ? " ⚠️ [TODAY'S WORD SPOILER]" : ""}`;
}

function publicEmbed(report) {
  const { element, description } = baseFields(report);
  const status = STATUS[report.status] ?? STATUS.new;
  return {
    title: title("Bug Report", report),
    fields: [
      { name: "Element", value: truncate(element), inline: true },
      { name: "Category", value: truncate(report.bugType), inline: true },
      { name: "Status", value: status.label, inline: true },
      { name: "Votes", value: String(report.score ?? 0), inline: true },
      { name: "Description", value: description }
    ],
    color: report.isSpoiler && report.status === "new" ? SPOILER_COLOR : status.color,
    timestamp: new Date().toISOString()
  };
}

function privateEmbed(report, updatedBy) {
  const { element, description } = baseFields(report);
  const status = STATUS[report.status] ?? STATUS.new;
  return {
    title: title("🛠️ Bug Management", report),
    fields: [
      { name: "ID", value: `\`${report.id}\``, inline: true },
      { name: "Element", value: truncate(element), inline: true },
      { name: "Category", value: truncate(report.bugType), inline: true },
      { name: "Status", value: updatedBy ? `${status.label} (by ${updatedBy})` : status.label },
      { name: "Description", value: description }
    ],
    color: status.color,
    timestamp: new Date().toISOString()
  };
}

// Style 1 (bleu) pour le vote actuel de l'utilisateur, 2 (gris) sinon
function voteButtons(reportId, userVote = 0) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: userVote === 1 ? 1 : 2, emoji: { name: "👍" }, custom_id: `vote_up_${reportId}` },
        { type: 2, style: userVote === -1 ? 1 : 2, emoji: { name: "👎" }, custom_id: `vote_down_${reportId}` }
      ]
    }
  ];
}

function statusButtons(reportId) {
  return [
    {
      type: 1,
      components: STATUS_BUTTONS.map(({ key, label, style }) => ({
        type: 2,
        style,
        label,
        custom_id: `status_${key}_${reportId}`
      }))
    }
  ];
}

// "vote_up_BUG-1A2B" → { kind: "vote", isUp: true, reportId }
// "status_fixed_BUG-1A2B[_<ancien id de message>]" → { kind: "status", status, reportId }
function parseCustomId(customId) {
  const parts = customId.split("_");
  if (parts[0] === "vote" && parts.length >= 3) {
    return { kind: "vote", isUp: parts[1] === "up", reportId: parts[2] };
  }
  if (parts[0] === "status" && parts.length >= 3) {
    return { kind: "status", status: STATUS_FROM_BUTTON[parts[1]], reportId: parts[2] };
  }
  return null;
}

module.exports = { publicEmbed, privateEmbed, voteButtons, statusButtons, parseCustomId, truncate };
