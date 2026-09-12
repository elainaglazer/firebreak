# Contest submission pack

## Project name

Firebreak

## Repository

https://github.com/elainaglazer/firebreak

## Automated verification

https://github.com/elainaglazer/firebreak/actions/workflows/verify.yml

## Tagline

A stablecoin reserve that measures and limits what an attacker can take before the owner can react.

## Short description

Firebreak turns wallet recovery and spending controls into one verifiable loss-containment system. Small payments use exact seed + device signatures. Large withdrawals become cancellable delayed transfers. Backup PIN attempts are admitted on-chain before a Chainlink CRE confidential workflow evaluates an account-bound verifier, so endpoint rotation cannot bypass the guess budget. If the old credentials or service disappear, two of three guardians freeze the vault and rotate both signers. Its Attack Lab runs each threat against the same disposable EVM and compares predicted exposure with observed loss.

## Problem

A seed phrase is an all-or-nothing bearer secret. Wallets add recovery features, but users and judges still have to trust separate claims about spend limits, backup authentication, outages, and recovery. A stolen credential can become an instant full-balance loss, while a centralized recovery service can become both a brute-force target and an availability dependency.

## Solution

Firebreak exposes one concrete safety quantity: **assets executable now under a stated compromise assumption**. The vault enforces exact two-factor EIP-712 authorization, one shared continuously refilling spend bucket, delayed high-value transfers, on-chain admission control for private PIN evaluation, and epoch-based guardian recovery. The UI keeps the normal path to recipient, amount, and one device confirmation; the attack controls live in a separate lab.

## Chainlink CRE usage

CRE handles the part that cannot be public on-chain: evaluating a PIN candidate against private peppered verifier material. The confidential handler validates the request, performs a constant-work HMAC comparison bound to credential ID, vault, chain, and epoch, and asks the DON to sign an exact decision report. The vault accepts that result only after a seed-signed reservation has consumed the account’s on-chain attempt budget and only if the returned request hash and transfer digest match. This makes CRE part of the authorization protocol rather than a decorative API call.

## What is technically impressive

- One token bucket covers every immediate authorization lane, preventing policy shopping.
- A PIN request consumes scarce account budget before private evaluation.
- Reports bind protocol, vault request, action digest, epoch, and one-time attempt.
- Guardian recovery is independent of the seed and CRE availability and freezes immediately.
- Pending transfers are bounded and invalidated during recovery.
- The contract itself calculates current exposure; the attack simulation measures the resulting balance delta.
- Twelve adversarial tests and a real browser test deploy and exercise the bytecode.

## Zero-cost stack

Solidity, OpenZeppelin, ethers, Ganache, Express, Playwright, and the Chainlink CRE TypeScript SDK. The complete judged demo runs locally with test assets and no paid RPC, API, or cloud account.

## Demo video — 3 minutes 43 seconds

The prepared full-HD visual master and human narration script cover ordinary payment, delayed transfer, exposure measurement, seed theft, request flooding, authenticator outage, continued payment, guardian recovery, full compromise, CRE architecture, official simulator evidence, and reproducible verification. The final narration is recorded by the entrant; ETHOnline explicitly prohibits synthetic voice-over.

See [`docs/DEMO-NARRATION.md`](docs/DEMO-NARRATION.md) for the timestamped script.

## AI disclosure

See [`AI-USAGE.md`](AI-USAGE.md). The entrant defined and directed the product and security requirements, reviewed the running interface, authenticated the official CRE CLI, and records the demo narration. Codex assisted with implementation, research, tests, documentation, CI, screenshots, and video editing assets.

## Submission checklist

- [x] Public GitHub repository created and the prepared `main` branch pushed.
- [x] Prepare a 1080p, 3:43 visual master and timestamped narration script.
- [ ] Record the entrant's narration and combine it with the prepared visual master.
- [ ] Add the repository URL and video URL to the contest form.
- [ ] Select **Chainlink — Best Confidential Workflow** in the Hacker Dashboard.
- [x] Official authenticated CRE simulation completed with production limits; state clearly that this is not a live DON deployment.
- [x] Link every Chainlink integration file from the README.
- [x] Include the AI-assistance disclosure and planning artifacts required by the event rules.
- [ ] Do not describe the prototype as audited, production ready, end-to-end encrypted, or resistant to network-layer DDoS.
