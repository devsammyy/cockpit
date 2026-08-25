const { Client } = require("pg");

require("dotenv").config({ path: ".env.development.local" });
require("dotenv").config({ path: ".env" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: DATABASE_URL environment variable is not defined.");
  process.exit(1);
}

async function checkConnection() {
  const start = Date.now();
  const timeoutMs = 60000; // 1 minute timeout
  console.log(`🔌 Checking database connectivity using DATABASE_URL...`);

  while (Date.now() - start < timeoutMs) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      console.log("✅ PostgreSQL is up and responding!");
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`⏳ Database not ready yet (${err.message}). Retrying in 2s...`);
      try {
        await client.end();
      } catch {
        // Ignore errors when ending a client that failed to connect
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error("❌ ERROR: Database connectivity check timed out after 60 seconds.");
  process.exit(1);
}

checkConnection();
