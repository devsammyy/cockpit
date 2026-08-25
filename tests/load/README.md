# Load Testing

k6-based performance suite. No local k6 install needed — the Makefile targets
run the official container image.

| Script      | Purpose                                                    | When                               |
| ----------- | ---------------------------------------------------------- | ---------------------------------- |
| `smoke.js`  | 2 VUs / 30s — deployment is alive and within SLO           | After every deploy (CI runs)       |
| `load.js`   | 50 VUs sustained — realistic traffic against SLOs          | Before releases, capacity planning |
| `stress.js` | Ramp to 300 VUs — find breaking point, verify 429s not 5xx | Quarterly, after infra changes     |

## Running

```bash
# Against local production stack
make load-smoke
make load-test
make load-stress

# Against a deployed environment
BASE_URL=https://your-domain.com make load-smoke
```

Or directly:

```bash
docker run --rm -i --network host grafana/k6 run \
  -e BASE_URL=http://localhost - < tests/load/smoke.js
```

## Thresholds (SLOs)

- Error rate < 1% (smoke), < 2% (load)
- p95 latency < 1s (smoke), < 2s (load)
- Under stress: server errors < 5%; rate limiting (429) is the expected
  degradation mode, not crashes

## Interpreting results

k6 exits non-zero when a threshold fails. Correlate failures with the
Grafana **Platform Overview** dashboard (request rate, p95 latency, error
rate) and **Infrastructure** dashboard (CPU/memory saturation) captured
during the run window.
