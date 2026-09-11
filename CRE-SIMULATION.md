# Official CRE simulation

The workflow passes TypeScript validation and its verifier unit test. On September 11, 2026, the project was also attempted with the official Chainlink CRE CLI v1.33.0. The binary was downloaded from the official `smartcontractkit/cre-cli` GitHub release and matched the published Windows SHA-256 checksum:

```text
d0c21f7522317de2ad231cd333d15c7c91d6d7d498e42e67a9d158684e005dea
```

The simulator stopped before compilation because current CRE CLI versions require a Chainlink account login or `CRE_API_KEY`:

```text
Authentication required: not logged in and no CRE_API_KEY set
```

No successful official CRE simulation is claimed in this repository yet.

## Complete the simulation

With the app running in one terminal:

```bash
curl -X POST http://127.0.0.1:4173/api/cre/prepare \
  -H "content-type: application/json" \
  -d '{"pin":"482913","amount":7}'
npm --prefix workflows/pin-auth run demo:secrets
```

Authenticate and simulate with the current official CRE CLI:

```bash
cre login
cre workflow simulate workflows/pin-auth \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --env workflows/pin-auth/.env.simulation
```

The generated `.env.simulation` contains disposable local values and is gitignored. Reset the vault before preparing another request.

If the host HTTP bridge is unavailable in a particular simulator release, change `requestUrl` in `config.staging.json` to an HTTPS tunnel that targets the local `/api/cre/pending` endpoint. Do not expose the demo server beyond the temporary simulation window.
