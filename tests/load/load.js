/* global __ENV */
/**
 * Load test — sustained realistic traffic against SLO thresholds.
 * Ramps to 50 concurrent users and holds for 5 minutes.
 *
 *   BASE_URL=https://your-domain make load-test
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost";

export const options = {
  stages: [
    { duration: "1m", target: 10 }, // warm up
    { duration: "2m", target: 50 }, // ramp to steady state
    { duration: "5m", target: 50 }, // hold
    { duration: "1m", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
  },
};

export default function () {
  const responses = http.batch([
    ["GET", `${BASE_URL}/api/v1/health`],
    ["GET", `${BASE_URL}/`],
    ["GET", `${BASE_URL}/docs/openapi.json`],
  ]);

  check(responses[0], { "health 200": (r) => r.status === 200 });
  check(responses[1], { "frontend 200": (r) => r.status === 200 });
  check(responses[2], { "openapi 200": (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1);
}
