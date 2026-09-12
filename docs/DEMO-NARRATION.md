# Firebreak human narration

Read naturally. The teleprompter allocates about 145 words per minute plus a short pause between scenes.

## 00:00 — Firebreak

A wallet normally asks whether a transaction was signed. Firebreak adds the question that matters after credentials fail: how much can an attacker execute before the owner can react? This demo runs every security claim against deployed contracts on a disposable local EVM.

## 00:19 — Everyday use stays simple

The normal path is recipient, amount, and one device confirmation. Underneath, both factors authorize the exact recipient, amount, mode, nonce, epoch, expiry, chain, and vault. This twenty-five test-dollar payment transfers immediately.

## 00:33 — Large transfers wait

When the amount exceeds the immediate allowance, the interface changes before confirmation. This one-hundred-fifty test-dollar payment becomes a scheduled transfer. The contract reserves the exact payment and leaves a cancellation window for the owner.

## 00:49 — One measurable safety quantity

The Attack Lab centers the design on one measurable quantity: assets executable now if both everyday factors are compromised. The contract calculates this exposure, including matured scheduled transfers, and the lab compares that prediction with actual balance changes.

## 01:06 — Seed theft is blocked

First, the lab steals only the seed and attempts a one-hundred-dollar drain. The contract rejects the forged device signature. This blocked result comes from the same deployed vault used by the wallet screen, rather than a mocked alert.

## 01:23 — Request flooding is contained

Next, the lab sends one hundred backup requests. Five candidates reach private evaluation and ninety-five are denied by an on-chain budget attached to this vault. Rotating IP addresses, endpoints, or relays cannot create extra guesses for the same account.

## 01:41 — Outage without lockout

Availability is part of security. Here the backup authenticator goes offline. Firebreak shows that state clearly while the seed-plus-device lane remains available, preventing a recovery dependency from becoming a denial-of-service switch for normal spending.

## 01:56 — The independent lane still works

Another twenty test dollars transfers while the PIN service remains offline. Separate authorization lanes preserve ordinary use, while both lanes share the same immediate-loss budget so an attacker cannot shop between policies.

## 02:11 — Recovery freezes first

If old credentials and the service are unavailable, two distinct guardians begin recovery. The vault freezes immediately, invalidates old-epoch authority, and installs fresh everyday credentials only after a visible delay. Recovery needs neither the compromised seed nor the PIN provider.

## 02:29 — Predicted loss equals observed loss

The strongest scenario gives the attacker both everyday factors. The contract predicts the current capacity, the attack withdraws exactly that amount, and the evidence reports the observed increase. The remaining reserve cannot move immediately, creating a bounded response window.

## 02:47 — CRE is inside the authorization protocol

Chainlink Runtime Environment evaluates the private PIN candidate against peppered, account-bound verifier material inside a confidential handler. A seed-signed reservation consumes attempt budget first. The decision report binds the protocol, vault, epoch, request hash, transfer digest, and one-time attempt.

## 03:04 — Official CRE simulation evidence

The official authenticated CRE simulator compiled and executed the workflow with production limits. The bound candidate returned approve and a wrong candidate returned reject. The repository includes the transcript, official CLI checksum, workflow hash, and configuration hash, without claiming a live deployment.

## 03:23 — Verified and reproducible

Twelve adversarial tests execute deployed bytecode. The CRE workflow typechecks and tests account binding. A browser test performs the user journey, and GitHub Actions passes on the published commit. Firebreak does not ask judges to trust the security story. It runs the attack.

Target finish: 03:43
