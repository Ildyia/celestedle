client.handleBugReport = async ({
  reportId,
  elementName,
  bugType,
  description,
  isSpoiler,
}) => {
  const privateChannel = await client.channels.fetch(privateChannelId);
  const publicChannel = await client.channels.fetch(publicChannelId);

  if (!privateChannel || !publicChannel) {
    throw new Error("Salons Discord introuvables.");
  }

  const spoilerTag = isSpoiler ? " ⚠️ [SPOILER MOT DU JOUR]" : "";
  const embedColor = isSpoiler ? 0xf59e0b : 15158332;

  // 1. Message privé
  const privateMsg = await privateChannel.send({
    embeds: [
      {
        title: `🛠️ Gestion Bug [${reportId}]${spoilerTag}`,
        fields: [
          { name: "ID", value: `\`${reportId}\``, inline: true },
          { name: "Mot / Élément", value: elementName, inline: true },
          { name: "Type", value: bugType || "Non spécifié", inline: true },
          { name: "Statut", value: "🔴 Nouveau", inline: false },
          { name: "Description", value: description },
        ],
        color: embedColor,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Fixed",
            custom_id: `status_fixed_${reportId}`,
          },
          {
            type: 2,
            style: 1,
            label: "Working on it",
            custom_id: `status_working_${reportId}`,
          },
          {
            type: 2,
            style: 2,
            label: "Can't reproduce",
            custom_id: `status_cant_${reportId}`,
          },
          {
            type: 2,
            style: 4,
            label: "Wrong report",
            custom_id: `status_wrong_${reportId}`,
          },
        ],
      },
    ],
  });

  // 2. Message public
  const publicMsg = await publicChannel.send({
    embeds: [
      {
        title: `🐛 Bug Report [${reportId}]${spoilerTag}`,
        fields: [
          { name: "Élément", value: elementName, inline: true },
          { name: "Type", value: bugType || "Non spécifié", inline: true },
          { name: "Statut", value: "🔴 Nouveau", inline: true },
          { name: "Votes", value: "0", inline: true },
          { name: "Description", value: description },
        ],
        color: embedColor,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, emoji: "👍", custom_id: `vote_up_${reportId}` },
          {
            type: 2,
            style: 2,
            emoji: "👎",
            custom_id: `vote_down_${reportId}`,
          },
        ],
      },
    ],
  });

  reportsMap.set(reportId, {
    publicMessageId: publicMsg.id,
    privateMessageId: privateMsg.id,
    votes: new Map(),
  });
};
