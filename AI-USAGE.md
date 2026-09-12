# AI assistance disclosure

Firebreak was developed with OpenAI Codex as an implementation and research tool. This disclosure is intentionally specific so reviewers can distinguish the entrant's direction from generated or assisted work.

## Entrant contribution

The entrant defined the project objective, zero-budget constraint, contest target, ambition level, usability requirement, and requirement to test attacks rather than present a feature list. The entrant repeatedly directed the system toward a coherent security product, reviewed the running interface, chose to continue development, authenticated the official Chainlink CRE CLI through their account, and owns the final submission and presentation.

## AI-assisted work

Codex assisted with architecture research, Solidity and TypeScript implementation, the local demo interface, adversarial tests, CRE workflow integration, documentation, CI configuration, evidence capture, and video editing assets. The files in `contracts/`, `src/`, `server/`, `public/`, `scripts/`, `test/`, and `workflows/` were generated or edited with Codex assistance under the entrant's direction. Codex also assisted with the Markdown documentation and generated screenshots.

No generated text is presented as a third-party audit, formal verification, live DON deployment, or production-security guarantee. The demo narration is recorded by the human entrant because ETHOnline rules prohibit synthetic or AI voice-over.

## Development record

The specifications and security walkthrough that guided implementation are preserved in [`docs/planning/`](docs/planning/). Git history records the implemented baseline, authenticated CRE evidence, portability fixes, timing-race fix, and submission polish. The public CI workflow reproduces compilation and automated verification from the repository.
