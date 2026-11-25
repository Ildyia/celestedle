// Importe dans une base les tags exportés depuis l'admin (onglet Connections,
// « Export tags »), pour tester le générateur avec de vrais tags.
//
//   DB_PATH=/chemin/test.db node scripts/import-tags.js connections-tags-AAAA-MM-JJ.json
//
// Un tag du même nom est remplacé. Les éléments sont retrouvés par leur nom ;
// ceux inconnus de cette base sont signalés et ignorés. Les tags importés
// sont tous marqués relus (complets), comme dans l'export s'ils n'avaient
// pas d'élément à classer.
const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage : node scripts/import-tags.js <export.json>");
  process.exit(1);
}

const elementsRepo = require("../src/repositories/elements");
const repo = require("../src/repositories/connections");
const connections = require("../src/services/connections");

const { tags } = JSON.parse(fs.readFileSync(file, "utf8"));
const existing = new Map(repo.listTags().map((t) => [t.label.toLowerCase(), t.id]));
let imported = 0;
const unknown = new Set();
for (const tag of tags) {
  const elementIds = [];
  for (const name of tag.elements) {
    const element = elementsRepo.findByName(name);
    if (element) elementIds.push(element.id);
    else unknown.add(name);
  }
  if (tag.unreviewed?.length) console.warn(`« ${tag.label} » : ${tag.unreviewed.length} élément(s) pas encore classé(s) dans l'export`);
  connections.saveTag(existing.get(tag.label.toLowerCase()) ?? null, { label: tag.label, description: tag.description ?? "", difficulty: tag.difficulty ?? 2, elementIds });
  imported++;
}
console.log(`${imported} tag(s) importé(s).`);
if (unknown.size) console.warn(`Éléments inconnus ignorés : ${[...unknown].join(", ")}`);
