// Waits for Redis to accept TCP connections before the backend starts.
// podman-compose does not reliably honor `depends_on: condition: service_healthy`,
// so we gate startup here to avoid boot-time ECONNREFUSED against Redis.
const net = require("net");

const host = process.env.REDIS_HOST || "redis";
const port = Number(process.env.REDIS_PORT || 6379);
const maxAttempts = 60;

let attempts = 0;

function attempt() {
  attempts += 1;
  const socket = net.connect(port, host);
  socket.setTimeout(2000);

  const retry = (reason) => {
    socket.destroy();
    if (attempts >= maxAttempts) {
      console.error(
        `❌ Redis unreachable at ${host}:${port} after ${attempts} attempts (${reason})`,
      );
      process.exit(1);
    }
    setTimeout(attempt, 1000);
  };

  socket.on("connect", () => {
    socket.destroy();
    console.log(`✅ Redis is ready at ${host}:${port}`);
    process.exit(0);
  });
  socket.on("error", (err) => retry(err.code || "error"));
  socket.on("timeout", () => retry("timeout"));
}

console.log(`⏳ Waiting for Redis at ${host}:${port}...`);
attempt();
