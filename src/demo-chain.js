import fs from "node:fs";
import path from "node:path";
import ganache from "ganache";
import { AbiCoder, BrowserProvider, ContractFactory, HDNodeWallet, Wallet, TypedDataEncoder, keccak256, toUtf8Bytes } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const readArtifact = (name) => JSON.parse(fs.readFileSync(path.join(root, "build", `${name}.json`), "utf8"));
const units = (value) => BigInt(Math.round(Number(value) * 1_000_000));
const display = (value) => Number(value) / 1_000_000;

export const transferTypes = {
  Transfer: [
    { name: "epoch", type: "uint256" }, { name: "nonce", type: "uint256" },
    { name: "recipient", type: "address" }, { name: "amount", type: "uint256" },
    { name: "mode", type: "uint8" }, { name: "deadline", type: "uint256" },
  ],
};
const reserveTypes = {
  ReserveAttempt: [
    { name: "epoch", type: "uint256" }, { name: "reservationNonce", type: "uint256" },
    { name: "actionDigest", type: "bytes32" }, { name: "requestHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};
const recoveryTypes = {
  Recovery: [
    { name: "epoch", type: "uint256" }, { name: "recoveryNonce", type: "uint256" },
    { name: "newSeedSigner", type: "address" }, { name: "newDeviceSigner", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
};

export async function createDemo() {
  const mnemonic = "test test test test test test test test test test test junk";
  const eip1193 = ganache.provider({
    wallet: { mnemonic, totalAccounts: 12, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: "shanghai" }, logging: { quiet: true },
  });
  const provider = new BrowserProvider(eip1193);
  const signer = await provider.getSigner(0);
  const wallet = (index) => HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`).connect(provider);
  const accounts = {
    deployer: signer, seed: wallet(1), device: wallet(2), gateway: wallet(3),
    guardians: [wallet(4), wallet(5), wallet(6)], recipient: wallet(7), attacker: wallet(8),
  };
  const gatewaySender = await provider.getSigner(3);
  const tokenArtifact = readArtifact("TestUSD");
  const vaultArtifact = readArtifact("FirebreakVault");
  const gatewayArtifact = readArtifact("CREAuthGateway");
  const token = await new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, signer).deploy();
  await token.waitForDeployment();
  const gateway = await new ContractFactory(gatewayArtifact.abi, gatewayArtifact.bytecode, signer).deploy(accounts.gateway.address);
  await gateway.waitForDeployment();
  const vault = await new ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, signer).deploy(
    await token.getAddress(), accounts.seed.address, accounts.device.address, await gateway.getAddress(),
    accounts.guardians.map((g) => g.address), units(100), 86400, 3600, 180, 5, 30 * 86400,
  );
  await vault.waitForDeployment();
  await (await gateway.bindVault(await vault.getAddress(), { gasLimit: 1_000_000 })).wait();
  await (await token.mint(await vault.getAddress(), units(1000), { gasLimit: 1_000_000 })).wait();

  const network = await provider.getNetwork();
  const domain = { name: "FirebreakVault", version: "1", chainId: Number(network.chainId), verifyingContract: await vault.getAddress() };
  let nonce = 1000n;
  let reservationNonce = 5000n;

  async function snapshot() {
    const [balance, credit, reserved, matured, exposure] = await vault.exposureState();
    const attempts = await vault.attemptsRemaining();
    const recovery = await vault.recovery();
    return {
      balance: display(balance), availableNow: display(credit), reserved: display(reserved),
      matured: display(matured), executableWithBothFactors: display(exposure), attemptsRemaining: Number(attempts),
      frozen: await vault.frozen(), epoch: Number(await vault.epoch()), pinEnabled: await vault.pinEnabled(),
      recoveryReadyAt: Number(recovery.readyAt), recipientBalance: display(await token.balanceOf(accounts.recipient.address)),
      attackerBalance: display(await token.balanceOf(accounts.attacker.address)), vaultAddress: await vault.getAddress(),
    };
  }

  async function makeAction(amount, mode = 0, recipient = accounts.recipient.address) {
    const block = await provider.getBlock("latest");
    return { epoch: await vault.epoch(), nonce: nonce++, recipient, amount: units(amount), mode, deadline: BigInt(block.timestamp + 3600) };
  }

  async function devicePay(amount, mode = 0, recipient = accounts.recipient.address) {
    const action = await makeAction(amount, mode, recipient);
    const [seedSig, deviceSig] = await Promise.all([
      accounts.seed.signTypedData(domain, transferTypes, action), accounts.device.signTypedData(domain, transferTypes, action),
    ]);
    const tx = await vault.executeDevice(action, seedSig, deviceSig, { gasLimit: 1_000_000 });
    const receipt = await tx.wait();
    return { hash: receipt.hash, action };
  }

  async function seedOnlyAttack(amount) {
    const action = await makeAction(amount, 0, accounts.attacker.address);
    const seedSig = await accounts.seed.signTypedData(domain, transferTypes, action);
    const fakeDevice = await accounts.attacker.signTypedData(domain, transferTypes, action);
    try { await (await vault.executeDevice(action, seedSig, fakeDevice, { gasLimit: 1_000_000 })).wait(); return { blocked: false }; }
    catch { return { blocked: true, reason: "Independent device approval missing" }; }
  }

  async function prepareAttempt(pin, amount = 1) {
    const action = await makeAction(amount, 0, accounts.attacker.address);
    const actionDigest = TypedDataEncoder.hash(domain, transferTypes, action);
    const requestHash = keccak256(toUtf8Bytes(JSON.stringify({ pin, actionDigest, nonce: reservationNonce.toString() })));
    const block = await provider.getBlock("latest");
    const reservation = { epoch: action.epoch, reservationNonce: reservationNonce++, actionDigest, requestHash, deadline: BigInt(block.timestamp + 900) };
    const signature = await accounts.seed.signTypedData(domain, reserveTypes, reservation);
    const attemptId = keccak256(AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256"], [await vault.getAddress(), action.epoch, reservation.reservationNonce],
    ));
    await (await vault.reserveAttempt(action, reservation.reservationNonce, requestHash, reservation.deadline, signature, { gasLimit: 1_000_000 })).wait();
    return {
      version: 1, attemptId, requestHash, actionDigest, chainId: String(network.chainId),
      vault: await vault.getAddress(), epoch: String(action.epoch), credentialId: "firebreak-local-demo", candidatePin: pin,
    };
  }

  async function resolveAttempt(prepared, approved) {
    const protocolDomain = keccak256(toUtf8Bytes("FIREBREAK_PIN_AUTH_V1"));
    const report = AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bool"],
      [protocolDomain, prepared.attemptId, prepared.requestHash, prepared.actionDigest, approved],
    );
    await (await gateway.connect(gatewaySender).onReport("0x", report, { gasLimit: 1_000_000 })).wait();
    if (approved) await (await vault.executePin(prepared.attemptId, { gasLimit: 1_000_000 })).wait();
    return { attemptId: prepared.attemptId, approved };
  }

  async function reserveGuess(pin, amount = 1) {
    const prepared = await prepareAttempt(pin, amount);
    return resolveAttempt(prepared, pin === "482913");
  }

  async function beginRecovery() {
    const newSeed = Wallet.createRandom();
    const newDevice = Wallet.createRandom();
    const block = await provider.getBlock("latest");
    const proposal = { epoch: await vault.epoch(), recoveryNonce: await vault.recoveryNonce(), newSeedSigner: newSeed.address, newDeviceSigner: newDevice.address, deadline: BigInt(block.timestamp + 3600) };
    const signatures = await Promise.all(accounts.guardians.slice(0, 2).map((g) => g.signTypedData(domain, recoveryTypes, proposal)));
    await (await vault.beginRecovery(proposal.recoveryNonce, proposal.newSeedSigner, proposal.newDeviceSigner, proposal.deadline, signatures, { gasLimit: 1_000_000 })).wait();
    accounts.nextSeed = newSeed.connect(provider); accounts.nextDevice = newDevice.connect(provider);
    return proposal;
  }

  async function finishRecovery() {
    await eip1193.request({ method: "evm_increaseTime", params: [181] });
    await eip1193.request({ method: "evm_mine", params: [] });
    await (await vault.completeRecovery({ gasLimit: 1_000_000 })).wait();
    accounts.seed = accounts.nextSeed; accounts.device = accounts.nextDevice;
  }

  async function advance(seconds) {
    await eip1193.request({ method: "evm_increaseTime", params: [seconds] });
    await eip1193.request({ method: "evm_mine", params: [] });
  }

  return { provider, eip1193, token, vault, gateway, accounts, domain, snapshot, devicePay, seedOnlyAttack, prepareAttempt, resolveAttempt, reserveGuess, beginRecovery, finishRecovery, advance, units, display };
}
