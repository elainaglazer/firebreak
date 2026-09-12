# Firebreak: product decisions after usage and security simulation

Read this first. These decisions refine FIREBREAK-IMPLEMENTATION-BLUEPRINT.md and take precedence where they change UX or prioritization. The implementation remains unbuilt. The accompanying simulation is an abstract policy model, not a contract audit or evidence of CRE/WebAuthn integration.

## The single product

**A protected stablecoin reserve that you can still use for ordinary payments.**

Normal payment: recipient -> amount -> one explicit confirmation -> receipt.

The system handles the security paths; the user does not choose a lane, sign twice, select an authentication provider, or solve a security questionnaire for each transfer. Backup PIN access and guardian recovery are exceptional flows. The attack lab is a separate demonstration route, not a main navigation item for normal users.

Do not present Firebreak as unrestricted instant money movement. The user intentionally trades instant access to the entire reserve for bounded immediate exposure. This should be a clear choice during setup, not a surprise discovered during an urgent payment.

## What changed after the walkthrough

1. **One confirmation is a release goal.** Start contract tests with an independent ECDSA device adapter, but a polished daily-use claim requires a genuine single-confirmation path. Prefer a verified WebAuthn device adapter. Do not ship two signature popups and call it frictionless. If WebAuthn is blocked, deliver the honest prototype and report the unmet UX goal rather than fake biometric UI.
2. **Hide protocol mechanics, not consequential delays.** Translate token-bucket math to “Available to send now” plus refill rate and exact timing. Never tell users they have a calendar-day limit when that is not what the contract implements.
3. **No attack-mode clutter in the wallet.** Main screen has balance, Send, Receive, pending transfers and transaction history. Security settings and “Need access help?” are secondary. Judge-only Attack Lab links to the same underlying state.
4. **Keep fixed policies.** Choose capacity/delay at vault creation, then show them clearly. Policy changes require migration to a newly configured vault through normal protected transfer rules. This is a limitation, but preferable to a rushed bypass-prone admin mechanism. No secret “raise limit now” button.
5. **Explain recovery setup cost.** Three independent guardian credentials are real setup work. The app guides and verifies enrollment once; do not claim five-second onboarding. Judges can use a clearly identified preconfigured fixture and still inspect the actual setup flow.
6. **No automatic lockdown from wrong guesses.** An attacker exhausting the PIN path must not globally freeze the owner. A seed-only event alone does not trigger recovery or rotate credentials automatically.
7. **Expose the response window.** Large delayed withdrawals offer time to intervene, not automatic protection while the owner is absent. In-app pending-transfer visibility is mandatory. Background notifications/monitoring are unimplemented unless actually built and verified; do not imply a guardian is always watching.

## Concrete usage simulation

All amounts below are test asset units. Example vault starts with 1,000 balance and 100 immediate capacity, replenishing at 100 per 24 hours. Production appropriateness is not asserted.

### A. Ordinary day

The owner opens the wallet on the enrolled device. They send 8, then 12, then 25. Each send has one clear review of recipient and amount followed by device confirmation. No PIN, guardian selection or additional app-level approval is requested. The app shows 955 balance and approximately 55 immediately available before refill.

Storage implementation: S may be an app-managed local credential that signs automatically; D is the independent confirmation credential. Do not repeatedly prompt for the seed. Use a reviewed local keystore approach; if using an IndexedDB non-extractable wrapping CryptoKey, explicitly recognize it does not protect against malicious same-origin JavaScript that can invoke that key. Never save plaintext S in localStorage or source. Do not derive D from S or from a public seed fixture.

The WebAuthn challenge binds the complete typed transfer digest. Verify challenge, RP ID, allowed origin and user verification. The passkey prompt itself is not a trusted display of recipient and amount; compromised same-origin UI can misrepresent a transfer. State that limitation. Never put “malware-proof” in the product.

### B. A larger legitimate payment

The owner enters 150 while only 100 is immediately available. Before confirmation show: “This payment will be available to complete after [time]. You can cancel it before it is sent.” The main button says “Schedule 150,” not “Send now.”

If allowance changes before inclusion, refresh the quote and ask for confirmation again when the outcome changes. Do not silently convert an immediate action into delayed mode, split it into multiple payments, or change amount/recipient. The signed mode is exact.

A queued transfer requires someone to relay execution after eta. The local demo relay may do this while running, and any caller can execute it. Without a running relay, status becomes “Ready to send” with a manual Finish button; never promise it was automatically delivered. Cancellation can lose a race once execution is eligible.

### C. Seed leaked; PIN service flooded

Attack lab grants attacker S and sends candidate requests. Five valid distinct reservations are possible in the configured period. Budget exhaustion blocks further backup evaluations while D remains usable.

Owner sees a restrained alert in Security: “Backup access attempts exhausted. Your registered device still works.” A normal device payment still uses one confirmation. The user may inspect attempts and initiate recovery if compromise is suspected; no mandatory incident wizard interrupts every payment.

Do not display failed guesses as proof of seed theft unless the evidence supports that statement; legitimate mistakes also happen. Successful random guessing remains possible. No global freeze on five failures.

### D. PIN service is offline

On the enrolled device, normal payments do not depend on the PIN service. The home screen need not show a blocking error for a service not involved in that payment.

On a replacement device without D, PIN backup is unavailable while the service is down. The app offers “Recover with guardians,” with its real delay. Do not promise uninterrupted access in this combined failure.

PIN access is rare single-action backup access, with five total attempts per period, not a scalable replacement daily login. Say so. Device loss is resolved through guardian recovery or restoration of the existing independently backed-up passkey if genuinely supported, not by endlessly entering the PIN. Backup exhaustion does not reset by reinstalling the app.

### E. Both everyday factors stolen

Attacker can immediately spend remaining allowance and continue spending as it refills. After consuming 100, about 4.16 more becomes available after one hour. Therefore the headline is “Immediate exposure is bounded,” not “You can only ever lose 100.”

Attacker may also queue a larger withdrawal. Guardians must intervene before execution. Once a guardian quorum begins recovery, outbound operations stop, prior queued permissions are invalidated, and the app shows recovery time remaining.

### F. Recovery

The replacement client creates fresh independent S and D. Guardian approval screens show the vault, intended replacement keys/fingerprints and immutable recovery delay. Two distinct guardians approve the same proposal. A single guardian cannot act.

Quorum initiation freezes the vault. Completion after the delay installs proposed credentials and invalidates old authority. The everyday path works again without the old PIN service. Backup PIN remains disabled until the owner migrates to a newly provisioned vault. Display this honestly in settings; do not silently show all factors restored.

Guardians can act with a standalone local client using saved deployment information. Same-origin browser passkeys may depend on that origin remaining available; offline recovery therefore relies on the independently supported guardian signer path, not a promise that a passkey works from any replacement domain.

## Security critique: how our own marketing could be wrong

| Tempting claim | Counterexample | Required correction |
|---|---|---|
| Only 100 can be stolen | Credit replenishes during an ongoing compromise | Show instantaneous capacity and replenishment separately |
| Seed-only exposure is always zero | A correct PIN guess or captured applicable approval can authorize a transfer | State assumptions and model captured approvals |
| Nothing can leave without fresh signatures | An older approved delayed transfer is already executable | Include matured preauthorized outflow |
| Owner always has access during outages | Device also lost and verifier offline | Show guardian recovery delay |
| One face scan confirms the recipient | Passkey authenticator may not display transaction details | App review is still a trusted UI assumption |
| DDoS cannot stop payments | Chain/RPC/network can be unavailable | Claim PIN-path abuse resistance only |
| Recovery means all factors restored | Auth service still offline or compromised | Recover device path; leave PIN disabled |
| Test attack proves deployed cryptography | Abstract model has no signature verification or concurrency | Separate design evidence from implementation tests |

## What will impress a judge

The strongest sequence is a normal payment, an attack, then another normal payment with the same simple owner flow. Show security preserving the experience, not a gallery of toggles.

Then demonstrate a harder failure: grant both everyday factors, compare the exact current exposure with actual outflow, and recover through independent credentials after stopping the authenticator.

The report is a developer/judge explanation, not something every customer must study. One useful normal-user number is “Available to send now.” The complete compromise analysis lives in the lab.

No additional feature is justified unless it reduces a concrete failure in these scenarios or removes an observed user step while preserving authorization. Prioritize proper passkey confirmation and clear delayed-payment UX over a second sponsor or animated marketing.

## Actual design simulation performed

Eight scenarios passed in a small Python policy model: routine payments; seed-only spending failure and attempt exhaustion with continued device use; rejecting unauthenticated budget consumption; split spending plus refill; matured queued exposure; guardian recovery and old-epoch invalidation; lost-device plus verifier outage; and an honest large payment being delayed.

See DESIGN-SIMULATION-RESULTS.json for observations and limitations. The model does not verify cryptography, Solidity, HPKE, database concurrency, browser ergonomics, gas, transaction races, chain finality, or CRE availability. Sequential reservation checks are not a DDoS benchmark. Required implementation tests in the blueprint remain mandatory.

## Decision

Build this coherent protected-reserve experience. Do not add more features at this point. Finish a single-confirmation ordinary payment, service-independent device access, strict backup admission, explicit delayed exposure, independent recovery, and the reproducible attack narrative. Eligibility, actual integration, correctness and presentation determine whether it can compete; no design guarantees a prize.
