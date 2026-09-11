# Official CRE simulation

Firebreak passed an authenticated run with the official Chainlink CRE simulator on September 11, 2026. The CLI binary matched the official Windows SHA-256 checksum:

```text
d0c21f7522317de2ad231cd333d15c7c91d6d7d498e42e67a9d158684e005dea
```

```text
CRE CLI: v1.33.0
Bun: 1.4.2
Javy: v8.1.0
Binary hash: f3e307433c7e98b53db0f978e93712205d18a5bbdd43e138514001b2b5339842
Config hash: e175ca627aedf4f3500b199a73e1ee162598b263a5a5ba70b669337910707d8b
Correct candidate: "APPROVE"
Wrong candidate: "REJECT"
```

The test ran both a correctly bound candidate and an incorrect candidate through a temporary HTTPS tunnel to the disposable local broker. The tunnel was closed immediately afterward. The relevant CLI transcript is stored in `evidence/cre-simulation.txt`.

This proves that the workflow compiles and executes through the official simulator with production limits enabled. The simulator explicitly states that it is not a real TEE. Firebreak does not claim a live DON deployment.

## Reproduce it

With the app running in one terminal:

```bash
curl -X POST http://127.0.0.1:4173/api/cre/prepare \
  -H "content-type: application/json" \
  -d '{"pin":"482913","amount":7}'
npm --prefix workflows/pin-auth run demo:secrets
```

Expose `/api/cre/pending` through a temporary HTTPS endpoint and put that full URL in `workflows/pin-auth/config.staging.json`. Then authenticate and simulate:

```bash
cre login
cre workflow simulate workflows/pin-auth \
  --project-root workflows/pin-auth \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --env workflows/pin-auth/.env.simulation
```

The generated `.env.simulation` contains disposable local values and is gitignored. Reset the vault before preparing another request. On Windows, CRE CLI v1.33.0 can misquote project paths containing spaces; use a temporary no-space project path if compilation reports that error.
