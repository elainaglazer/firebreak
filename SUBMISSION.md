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

## Demo video script — 2 minutes 30 seconds

**0:00–0:15 — Hook**

“A wallet should answer more than ‘was this signed?’ Firebreak tells you how much an attacker can execute before you have time to react—and lets you prove it.”

**0:15–0:40 — Daily use**

Show the 1,000 tUSD balance and 100 tUSD available meter. Send 25 tUSD. Point out that recipient, amount, mode, nonce, epoch, expiry, chain, and vault are signed. Enter 150 tUSD and show that the button changes to “Schedule” before confirmation.

**0:40–1:15 — Attack Lab**

Run the stolen-seed attack and show `BLOCKED`. Run the 100-request flood and show five evaluated and 95 denied by the on-chain account budget. Explain that IP rotation cannot create more account attempts.

**1:15–1:35 — Availability**

Stop the PIN service in Security, return to Wallet, and send 20 tUSD. Explain that recovery-service failure does not disable the independent everyday lane.

**1:35–2:00 — Recovery**

Begin guardian recovery. Show the vault freeze and epoch change. Explain that two of three guardians can act without the old seed, device, or PIN service; pending authority is invalidated immediately.

**2:00–2:20 — CRE**

Show `workflows/pin-auth/workflow.ts`: Nitro TEE request, CRE secrets, account-bound verifier, constant-work compare, and the exact ABI report. Show `CREAuthGateway.sol` accepting only the immutable forwarder and one bound vault.

**2:20–2:30 — Evidence**

Run `npm run check:all` and finish on the Attack Lab evidence. “Firebreak does not ask you to trust the security story. It runs the attack.”

## Submission checklist

- [x] Public GitHub repository created and the prepared `main` branch pushed.
- [ ] Record the demo with the script above; keep terminal output visible for the final test command.
- [ ] Add the repository URL and video URL to the contest form.
- [ ] Select the Chainlink CRE prize track.
- [x] Official authenticated CRE simulation completed with production limits; state clearly that this is not a live DON deployment.
- [ ] Do not describe the prototype as audited, production ready, end-to-end encrypted, or resistant to network-layer DDoS.
