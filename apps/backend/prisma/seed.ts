import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as crypto from "crypto";
import { hashPassword } from "../src/common/utils/crypto";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting database seeding...");

  // 1. Seed Model Definitions
  console.log("🤖 Seeding model definitions...");
  const models = [
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-turbo",
      displayName: "Qwen Turbo",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: false,
      supportsStructured: false,
      supportsEmbeddings: true,
      inputPricePerMillion: 300,
      outputPricePerMillion: 600,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-plus",
      displayName: "Qwen Plus",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: true,
      inputPricePerMillion: 1000,
      outputPricePerMillion: 2000,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-max",
      displayName: "Qwen Max",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 6000,
      outputPricePerMillion: 12000,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "OPENAI",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 2500,
      outputPricePerMillion: 10000,
      status: "ACTIVE",
    },
    // ── Alibaba Cloud Model Studio catalog (free-quota) ──
    // Chat / vision / coder models work through the /ai/sandbox chat endpoint.
    // Image, video, and realtime models are listed for selection but require
    // their own dedicated endpoints (not the OpenAI-compatible chat route).
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen3-coder-plus-2025-07-22",
      displayName: "Qwen3 Coder Plus",
      contextWindow: 1000000,
      maxOutputTokens: 65536,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: false,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen3-vl-plus",
      displayName: "Qwen3 VL Plus",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen3-vl-235b-a22b-thinking",
      displayName: "Qwen3 VL 235B A22B (Thinking)",
      contextWindow: 262144,
      maxOutputTokens: 32768,
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-vl-max-2025-08-13",
      displayName: "Qwen VL Max (2025-08-13)",
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-omni-turbo",
      displayName: "Qwen Omni Turbo",
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen2.5-omni-7b",
      displayName: "Qwen2.5 Omni 7B",
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen3-omni-flash-realtime",
      displayName: "Qwen3 Omni Flash Realtime",
      contextWindow: 32768,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "tongyi-embedding-vision-plus",
      displayName: "Tongyi Embedding Vision Plus",
      contextWindow: 8192,
      maxOutputTokens: 0,
      supportsStreaming: false,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: true,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "qwen-image",
      displayName: "Qwen Image",
      contextWindow: 4096,
      maxOutputTokens: 0,
      supportsStreaming: false,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(),
      provider: "QWEN",
      modelId: "wan2.2-i2v-flash",
      displayName: "Wan 2.2 Image-to-Video Flash",
      contextWindow: 4096,
      maxOutputTokens: 0,
      supportsStreaming: false,
      supportsToolCalling: false,
      supportsVision: true,
      supportsStructured: false,
      supportsEmbeddings: false,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      status: "ACTIVE",
    },
  ];

  for (const m of models) {
    const existing = await prisma.modelDefinition.findFirst({
      where: { modelId: m.modelId },
    });
    if (!existing) {
      await prisma.modelDefinition.create({ data: m });
      console.log(`   Seeded model: ${m.displayName}`);
    }
  }

  // 2. Seed Default Admin User & Organization
  const seedAdmin = process.env["SEED_ADMIN"] !== "false";
  if (!seedAdmin) {
    console.log("👤 SEED_ADMIN is false. Skipping user seeding.");
    return;
  }

  const email = (process.env["ADMIN_EMAIL"] || "admin@example.com").toLowerCase();
  const password = process.env["ADMIN_PASSWORD"] || "ChangeMe123!";
  const displayName = process.env["ADMIN_DISPLAY_NAME"] || "System Administrator";

  console.log(`👤 Checking default admin user: ${email}...`);
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log("   Admin user already exists. Skipping user registration seeding.");
    return;
  }

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const hashedPassword = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    // Create User
    await tx.user.create({
      data: {
        id: userId,
        email,
        passwordHash: hashedPassword,
        displayName,
        status: "ACTIVE",
      },
    });

    // Create Organization
    await tx.organization.create({
      data: {
        id: orgId,
        name: `${displayName}'s Workspace`,
        slug: `workspace-${crypto.randomBytes(3).toString("hex")}`,
        settings: {
          defaultAIProvider: "QWEN",
          executionTimeoutMs: 60000,
          maxConcurrentExecutions: 5,
          webhookSecret: crypto.randomBytes(32).toString("hex"),
        },
      },
    });

    // Create Default System Role
    await tx.role.create({
      data: {
        id: roleId,
        organizationId: orgId,
        name: "Owner",
        description: "Full control over organization resources",
        isSystem: true,
        permissions: [
          "agent:create",
          "agent:read",
          "agent:update",
          "agent:delete",
          "workflow:create",
          "workflow:read",
          "workflow:update",
          "workflow:delete",
          "workflow:execute",
          "execution:read",
          "execution:cancel",
          "organization:read",
          "organization:update",
          "organization:manage-members",
        ],
      },
    });

    // Create Membership link
    await tx.organizationMember.create({
      data: {
        id: memberId,
        organizationId: orgId,
        userId: userId,
        roleId: roleId,
        status: "ACTIVE",
      },
    });
  });

  console.log("✅ Seeding completed successfully!");
  console.log(`   Admin Login Email:    ${email}`);
  console.log(`   Admin Login Password: ${password}`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
