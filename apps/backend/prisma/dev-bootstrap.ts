import { spawn } from "child_process";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: ".env.development.local", override: false });
dotenv.config({ path: ".env", override: false });

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not defined.");
}

async function waitForDatabase(): Promise<void> {
  const start = Date.now();
  const timeoutMs = 60000;

  console.log("🔌 Checking database connectivity using DATABASE_URL...");

  while (Date.now() - start < timeoutMs) {
    const client = new Client({ connectionString });

    try {
      await client.connect();
      console.log("✅ PostgreSQL is up and responding!");
      await client.end();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`⏳ Database not ready yet (${message}). Retrying in 2s...`);

      try {
        await client.end();
      } catch {
        // Ignore errors when ending a client that failed to connect.
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Database connectivity check timed out after 60 seconds.");
}

async function main(): Promise<void> {
  await waitForDatabase();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"],
      {
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Prisma migrate deploy exited with code ${code ?? "unknown"}`));
    });
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
