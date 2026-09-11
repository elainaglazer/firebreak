import test from "node:test";
import assert from "node:assert/strict";
import { AbiCoder, TypedDataEncoder, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { createDemo, transferTypes } from "../src/demo-chain.js";

test("ordinary device payment uses exact two-factor authorization", async () => {
  const d = await createDemo();
  const before = await d.snapshot();
  await d.devicePay(25);
  const after = await d.snapshot();
  assert.equal(before.balance - after.balance, 25);
  assert.equal(after.availableNow, 75);
  assert.equal(after.recipientBalance, 25);
});

test("stolen seed cannot spend and cannot block the independent device lane", async () => {
  const d = await createDemo();
  assert.equal((await d.seedOnlyAttack(100)).blocked, true);
  for (const guess of ["000000", "111111", "123456", "654321", "999999"]) {
    assert.equal((await d.reserveGuess(guess)).approved, false);
  }
  assert.equal((await d.snapshot()).attemptsRemaining, 0);
  await assert.rejects(() => d.reserveGuess("222222"));
  await d.devicePay(20);
  assert.equal((await d.snapshot()).recipientBalance, 20);
});

test("successful PIN authorization is exact and single-use", async () => {
  const d = await createDemo();
  const result = await d.reserveGuess("482913", 12);
  assert.equal(result.approved, true);
  assert.equal((await d.snapshot()).balance, 988);
  await assert.rejects(() => d.vault.executePin(result.attemptId));
});

test("same transfer nonce cannot execute through both lanes", async () => {
  const d = await createDemo();
  const action = await (async () => {
    const block = await d.provider.getBlock("latest");
    return { epoch: 0n, nonce: 42n, recipient: d.accounts.recipient.address, amount: d.units(10), mode: 0, deadline: BigInt(block.timestamp + 3600) };
  })();
  const seedSig = await d.accounts.seed.signTypedData(d.domain, transferTypes, action);
  const deviceSig = await d.accounts.device.signTypedData(d.domain, transferTypes, action);
  await (await d.vault.executeDevice(action, seedSig, deviceSig, { gasLimit: 1_000_000 })).wait();
  await assert.rejects(async () => (await d.vault.executeDevice(action, seedSig, deviceSig, { gasLimit: 1_000_000 })).wait());
});

test("split payments cannot exceed token bucket, which refills over time", async () => {
  const d = await createDemo();
  for (let i = 0; i < 4; i++) await d.devicePay(25);
  await assert.rejects(() => d.devicePay(1));
  await d.advance(3600);
  await d.devicePay(4);
  const state = await d.snapshot();
  assert(state.availableNow < 0.18 && state.availableNow >= 0.16);
});

test("large payment is queued, reserved, delayed and executes once", async () => {
  const d = await createDemo();
  const result = await d.devicePay(150, 1);
  const ids = await d.vault.activePending();
  assert.equal(ids.length, 1);
  assert.equal((await d.snapshot()).reserved, 150);
  await assert.rejects(() => d.vault.executeQueued(ids[0]));
  await d.advance(3601);
  await (await d.vault.executeQueued(ids[0], { gasLimit: 1_000_000 })).wait();
  assert.equal((await d.snapshot()).recipientBalance, 150);
  await assert.rejects(async () => (await d.vault.executeQueued(ids[0], { gasLimit: 1_000_000 })).wait());
  assert(result.hash.startsWith("0x"));
});

test("guardian recovery freezes, invalidates old epoch and works without gateway", async () => {
  const d = await createDemo();
  const oldSeed = d.accounts.seed;
  const oldDevice = d.accounts.device;
  await d.devicePay(150, 1);
  await d.beginRecovery();
  let state = await d.snapshot();
  assert.equal(state.frozen, true);
  assert.equal(state.reserved, 0);
  await assert.rejects(() => d.devicePay(1));
  await d.finishRecovery();
  state = await d.snapshot();
  assert.equal(state.frozen, false);
  assert.equal(state.epoch, 2);
  assert.equal(state.pinEnabled, false);

  const block = await d.provider.getBlock("latest");
  const oldAction = { epoch: 0n, nonce: 999n, recipient: d.accounts.recipient.address, amount: d.units(1), mode: 0, deadline: BigInt(block.timestamp + 3600) };
  const [s, dev] = await Promise.all([
    oldSeed.signTypedData(d.domain, transferTypes, oldAction), oldDevice.signTypedData(d.domain, transferTypes, oldAction),
  ]);
  await assert.rejects(() => d.vault.executeDevice(oldAction, s, dev));
  await d.devicePay(20);
  assert.equal((await d.snapshot()).recipientBalance, 20);
});

test("one guardian and duplicate guardian signatures cannot recover", async () => {
  const d = await createDemo();
  const newSeed = Wallet.createRandom();
  const newDevice = Wallet.createRandom();
  const block = await d.provider.getBlock("latest");
  const proposal = { epoch: 0n, recoveryNonce: 0n, newSeedSigner: newSeed.address, newDeviceSigner: newDevice.address, deadline: BigInt(block.timestamp + 3600) };
  const types = { Recovery: [
    { name: "epoch", type: "uint256" }, { name: "recoveryNonce", type: "uint256" },
    { name: "newSeedSigner", type: "address" }, { name: "newDeviceSigner", type: "address" }, { name: "deadline", type: "uint256" },
  ] };
  const sig = await d.accounts.guardians[0].signTypedData(d.domain, types, proposal);
  await assert.rejects(() => d.vault.beginRecovery(0, newSeed.address, newDevice.address, proposal.deadline, [sig]));
  await assert.rejects(() => d.vault.beginRecovery(0, newSeed.address, newDevice.address, proposal.deadline, [sig, sig]));
});

test("only the configured CRE forwarder can deliver an authorization report", async () => {
  const d = await createDemo();
  const prepared = await d.prepareAttempt("482913", 10);
  const protocolDomain = keccak256(toUtf8Bytes("FIREBREAK_PIN_AUTH_V1"));
  const report = AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "bytes32", "bool"],
    [protocolDomain, prepared.attemptId, prepared.requestHash, prepared.actionDigest, true],
  );
  await assert.rejects(async () => (
    await d.gateway.connect(d.accounts.attacker).onReport("0x", report, { gasLimit: 1_000_000 })
  ).wait());
  assert.equal(Number((await d.vault.getAttempt(prepared.attemptId)).status), 1);
});

test("CRE reports are bound to the protocol, request, and exact action", async () => {
  const d = await createDemo();
  const prepared = await d.prepareAttempt("482913", 10);
  await assert.rejects(() => d.resolveAttempt({ ...prepared, requestHash: keccak256(toUtf8Bytes("other request")) }, true));
  await assert.rejects(() => d.resolveAttempt({ ...prepared, actionDigest: keccak256(toUtf8Bytes("other action")) }, true));
  assert.equal(Number((await d.vault.getAttempt(prepared.attemptId)).status), 1);

  const badDomain = keccak256(toUtf8Bytes("ANOTHER_PROTOCOL"));
  const report = AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "bytes32", "bool"],
    [badDomain, prepared.attemptId, prepared.requestHash, prepared.actionDigest, true],
  );
  await assert.rejects(async () => (
    await d.gateway.connect(await d.provider.getSigner(3)).onReport("0x", report, { gasLimit: 1_000_000 })
  ).wait());
});

test("exposure estimator includes matured queue and becomes zero while frozen", async () => {
  const d = await createDemo();
  await d.devicePay(150, 1);
  let state = await d.snapshot();
  assert.equal(state.matured, 0);
  assert.equal(state.executableWithBothFactors, 100);
  await d.advance(3601);
  state = await d.snapshot();
  assert.equal(state.matured, 150);
  assert.equal(state.executableWithBothFactors, 250);
  await d.beginRecovery();
  state = await d.snapshot();
  assert.equal(state.matured, 0);
  assert.equal(state.executableWithBothFactors, 0);
  assert.equal(state.reserved, 0);
});

test("a rejected PIN attempt cannot execute and still consumes admission budget", async () => {
  const d = await createDemo();
  const before = await d.snapshot();
  const result = await d.reserveGuess("000000", 10);
  assert.equal(result.approved, false);
  await assert.rejects(() => d.vault.executePin(result.attemptId));
  const after = await d.snapshot();
  assert.equal(after.attemptsRemaining, before.attemptsRemaining - 1);
  assert.equal(after.balance, before.balance);
});
