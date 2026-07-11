const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("CRITICAL ERROR: MONGO_URI env variable is missing!");
  process.exit(1);
}

const client = new MongoClient(uri);
let db = null;

async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    // Utilise le nom spécifié dans l'URI ou "celestedle" par défaut
    db = client.db(); 
    console.log("Successfully connected to MongoDB");
    return db;
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}

module.exports = { connectDB, getDB };