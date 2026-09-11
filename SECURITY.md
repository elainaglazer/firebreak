# Security model

Firebreak limits the consequences of credential compromise. It does not promise that credentials cannot be stolen.

## Protected invariants

1. **Exact authorization.** Every payment signature binds vault, chain, epoch, nonce, recipient, amount, transfer mode, and deadline through EIP-712.
2. **Independent everyday factors.** Immediate and delayed device-lane actions require valid signatures from both the seed signer and device signer.
3. **Bounded immediate outflow.** Every immediate lane spends the same continuously refilling token bucket. Splitting a transfer or switching authorization lanes does not create extra allowance.
4. **Large-transfer reaction window.** Delayed actions reserve funds, cannot change recipient or amount, and execute only after `transferDelay`.
5. **Admission before private work.** A seed-signed reservation consumes one on-chain PIN-attempt slot before confidential evaluation.
6. **Report binding.** A CRE result is accepted only through the immutable gateway, for the exact request hash and transfer digest reserved by the vault.
7. **Replay resistance.** Transfer and reservation nonces are scoped by credential epoch and can execute once.
8. **Independent recovery.** Two distinct fixed guardians can freeze the vault and rotate both everyday signers without the old seed, device, or CRE service.
9. **Recovery invalidation.** Starting recovery increments the epoch, disables the PIN lane, cancels the bounded pending queue, and freezes all outbound execution.
10. **Observable exposure.** `exposureState()` derives executable balance from current credit, reservations, matured transfers, balance, epoch, and freeze state.

## Trust assumptions

- The ERC-20 token behaves like a conventional non-rebasing token.
- At least two guardians remain independent and honest for recovery.
- Seed and device signers are stored separately in a real client.
- The live CRE forwarder address and receiver semantics are verified from current Chainlink documentation at deployment time.
- CRE secret storage and the requested Nitro runtime behave as documented.

## Known prototype limits

- The browser demo holds disposable test signers in one local process to make the attack story reproducible. This is not a custody design.
- TestUSD has permissionless minting and has no value.
- Ganache 7.9.2 brings known legacy transitive dependency advisories. It is a development-only disposable chain bound to `127.0.0.1` and must not be included in a production service.
- The local gateway forwarder is a test EOA. No live DON deployment is claimed.
- The broker sees the candidate PIN. A production version should encrypt from client to the confidential handler or use an oblivious/password-authenticated protocol.
- The queue is capped at 16 entries so guardian recovery has bounded invalidation gas. A production version could use epoch-only invalidation plus indexed off-chain discovery.
- Fixed guardians require vault migration to change the guardian set. This intentionally avoids a privileged owner path in the prototype.
- Contracts have not received an independent audit or formal verification.

## Abuse and DDoS position

Firebreak does not claim to stop network-layer DDoS. It makes backup-auth flooding economically and cryptographically irrelevant to PIN guessing after the account’s five on-chain reservations are consumed. Normal device payments do not depend on the backup service, so taking that service offline does not halt ordinary spending. Network controls such as CDN filtering and IP throttling can protect availability, but they are not treated as the security boundary.

## Responsible testing

Run attacks only against the disposable local chain. Never point the included attack scenarios at third-party infrastructure or assets.
