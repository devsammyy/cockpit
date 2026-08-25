/* global __ENV */
/**
 * Smoke test — minimal load, verifies the deployment is functional.
 * Run right after every deployment (CI does this automatically).
 *
 *   BASE_URL=https://your-domain make load-smoke
 *   docker run --rm -i --network host grafana/k6 run -e BASE_URL=http://localhost - < tests/load/smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost";

export const options = {
  vus: 2,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/api/v1/health`);
  check(health, {
    "health returns 200": (r) => r.status === 200,
    "health reports ok": (r) => r.json("status") === "ok",
  });

  const ready = http.get(`${BASE_URL}/api/v1/health/ready`);
  check(ready, {
    "readiness returns 200": (r) => r.status === 200,
  });

  const frontend = http.get(`${BASE_URL}/`);
  check(frontend, {
    "frontend returns 200": (r) => r.status === 200,
  });

  sleep(1);
}
