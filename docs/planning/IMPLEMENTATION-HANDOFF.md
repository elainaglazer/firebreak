# Prompt for the implementation model

First read 00-PRODUCT-AND-UX-DECISIONS.md, then implement FIREBREAK-IMPLEMENTATION-BLUEPRINT.md as a hackathon prototype. Read both fully before choosing the stack or editing code. The product/UX decisions take precedence where they refine the earlier blueprint. The goal is a reproducible, distinctive sponsor-prize submission with zero additional cash expenditure, not a production wallet or a generic security dashboard.

Start with the access/sponsor preflight and contract kernel. Preserve the exact authorization matrix, immutable policy, shared transfer nonce protection, independent recovery, privacy assumptions, and exposure accounting. If a dependency or requirement is blocked, explain the specific issue and continue independent work. Never silently substitute a security mechanism or label a mock as real.

Required deliverables:

1. Working single-asset vault and meaningful security tests.
2. Real CRE confidential workflow integration in a clearly identified simulation or verified live mode.
3. Persistent, account-bound authentication reservation/deduplication.
4. Owner UI, bounded attack lab, and deterministic predicted-versus-observed evidence.
5. Independent guardian recovery that works while the authenticator is stopped.
6. Reproducible setup, sanitized evidence, architecture/threat-model docs, and a concise demo script.

Do not add chains, tokens, DAOs, chatbots, arbitrary-call wallet modules, paid services, or UI claims unsupported by actual execution. Do not write custom cryptographic primitives. No mainnet or real funds. Use existing/free dependencies and disposable test assets. A refundable registration deposit is still a cash cost and is not authorized.

Work in acceptance-gate order. Show real results for the required attack cases. The exposure display must account for matured queued transfers and captured prior authorizations; it cannot simply output zero whenever the attacker lacks a fresh signature.

Use the independent ECDSA device signer first for kernel tests and label it accurately. After the core passes, prioritize a real single-confirmation WebAuthn path and clear delayed-payment UX over secondary sponsor integrations. Never use a decorative passkey button. If actual WebAuthn is blocked, report the unmet UX goal. Keep all keys independent of the exposed seed.

Keep the product visually restrained: everyday wallet first, Security as secondary settings, and Attack Lab on a separate demo route. Normal payment requires one explicit confirmation, with no PIN/guardian/protocol choices. Every claim should connect to an action, a receipt or actual revert, and a balance/state consequence. Do not fabricate tests, users, novelty, audits, sponsor qualification, or successful deployment.

When finished, report which acceptance gates passed, exact runnable commands, remaining limitations, actual sponsor evidence, and any user-owned enrollment/submission steps still required. Do not declare a prize or eligibility guaranteed.
