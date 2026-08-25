import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Container health probe endpoint. Used by the Docker HEALTHCHECK, the
 * reverse proxy upstream checks, and the load balancer target health checks.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    service: "qwen-autopilot-frontend",
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
