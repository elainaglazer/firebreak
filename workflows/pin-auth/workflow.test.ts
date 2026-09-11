import test from "node:test";
import assert from "node:assert/strict";
import { createVerifier, evaluateCandidate, type PinRequest } from "./workflow";

const request: PinRequest = {
  version: 1,
  attemptId: `0x${"11".repeat(32)}`,
  requestHash: `0x${"22".repeat(32)}`,
  actionDigest: `0x${"33".repeat(32)}`,
  chainId: "11155111",
  vault: "0x1111111111111111111111111111111111111111",
  epoch: "0",
  credentialId: "demo-vault-1",
  candidatePin: "482913",
};

test("private verifier accepts only the exact account-bound candidate", () => {
  const pepper = "test-only-secret-pepper";
  const verifier = createVerifier(request, pepper);
  assert.equal(evaluateCandidate(request, pepper, verifier), true);
  assert.equal(evaluateCandidate({ ...request, candidatePin: "482914" }, pepper, verifier), false);
  assert.equal(evaluateCandidate({ ...request, vault: "0x2222222222222222222222222222222222222222" }, pepper, verifier), false);
  assert.equal(evaluateCandidate({ ...request, chainId: "1" }, pepper, verifier), false);
});
