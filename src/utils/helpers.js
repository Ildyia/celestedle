let database = {};
let officialElementsList = [];

async function loadElementsFromDB(db) {
  try {
    const elements = await db.collection("words").find({}).toArray();

    const newDatabase = {};
    elements.forEach((el) => {
      const { name, ...rest } = el;
      newDatabase[name] = rest;
    });

    database = newDatabase;
    officialElementsList = Object.keys(database).sort();

    console.log(`Successfully loaded ${officialElementsList.length} elements from MongoDB.`);
  } catch (error) {
    console.error("Failed to load elements from MongoDB:", error);
    throw error;
  }
}

function normalizeMetaList(data) {
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0].includes(",")) {
      return data[0].split(",").map((item) => item.trim());
    }
    return data.map((item) => item.trim());
  }
  if (typeof data === "string") {
    return data.split(",").map((item) => item.trim());
  }
  return [];
}

module.exports = {
  get database() {
    return database;
  },
  get officialElementsList() {
    return officialElementsList;
  },
  loadElementsFromDB,
  normalizeMetaList,
};
