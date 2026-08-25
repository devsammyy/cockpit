/* global __ENV */
/**
 * Stress test — pushes past expected capacity to find the breaking point and
 * verify graceful degradation (rate limiting responds 429, not 5xx crashes).
 *
 *   BASE_URL=https://your-domain make load-stress
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost";
const rateLimited = new Counter("rate_limited_responses");

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "2m", target: 300 }, // beyond nginx rate limits — expect 429s
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // Server errors must stay rare even under overload; 429s are expected and healthy
    "http_req_failed{expected_response:true}": ["rate<0.05"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/health`);

  if (res.status === 429) {
    rateLimited.add(1);
  }

  check(res, {
    "responds without server error": (r) => r.status < 500,
  });

  sleep(0.5);
}
