import { cre, hexToBase64, ok, text, type TeeRuntime } from "@chainlink/cre-sdk";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem";
import { z } from "zod";

export const configSchema = z.object({
  schedule: z.string(),
  requestUrl: z.string().url(),
  pepperSecretId: z.string(),
  verifierSecretId: z.string(),
});
type Config = z.infer<typeof configSchema>;

export const requestSchema = z.object({
  version: z.literal(1),
  attemptId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  requestHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  actionDigest: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  chainId: z.string().regex(/^\d+$/),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  epoch: z.string().regex(/^\d+$/),
  credentialId: z.string().min(1).max(128),
  candidatePin: z.string().regex(/^\d{6}$/),
});
export type PinRequest = z.infer<typeof requestSchema>;

function canonical(request: PinRequest): string {
  return [request.credentialId, request.vault.toLowerCase(), request.chainId, request.epoch, request.candidatePin].join("|");
}

export function createVerifier(request: PinRequest, pepper: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(canonical(request))));
}

export function evaluateCandidate(request: PinRequest, pepper: string, expectedVerifierHex: string): boolean {
  const candidate = hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(canonical(request)));
  const expected = hexToBytes(expectedVerifierHex);
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < candidate.length; i++) difference |= candidate[i] ^ expected[i];
  return difference === 0;
}

export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  const pepper = runtime.getSecret({ id: runtime.config.pepperSecretId }).result().value;
  const expectedVerifier = runtime.getSecret({ id: runtime.config.verifierSecretId }).result().value;
  const response = new cre.capabilities.HTTPClient().sendRequest(runtime, {
    url: runtime.config.requestUrl,
    method: "GET",
  }).result();
  if (!ok(response)) throw new Error(`Confidential request failed: ${response.statusCode}`);

  // The response body and both secrets remain inside this handler. The broker
  // can still see the submitted PIN in this prototype; this is not end-to-end HPKE.
  const request = requestSchema.parse(JSON.parse(text(response)));
  const approved = evaluateCandidate(request, pepper, expectedVerifier);
  const protocolDomain = keccak256(toBytes("FIREBREAK_PIN_AUTH_V1"));
  const payload = encodeAbiParameters(
    parseAbiParameters("bytes32 protocolDomain, bytes32 attemptId, bytes32 requestHash, bytes32 actionDigest, bool approved"),
    [protocolDomain, request.attemptId as `0x${string}`, request.requestHash as `0x${string}`, request.actionDigest as `0x${string}`, approved],
  );
  runtime.usingTheDons().report({
    encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256",
  }).result();
  return approved ? "APPROVE" : "REJECT";
};

export function initWorkflow(config: Config) {
  const trigger = new cre.capabilities.CronCapability();
  return [cre.handlerInTee(trigger.trigger({ schedule: config.schedule }), onCronTrigger, [
    { tee: "nitro", regions: ["us-west-2"] },
  ])];
}
