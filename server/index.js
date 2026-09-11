import path from "node:path";
import express from "express";
import { createDemo } from "../src/demo-chain.js";

const root = path.resolve(import.meta.dirname, "..");
const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(root, "public")));

let demo = await createDemo();
let authOnline = true;
let evidence = [];
let crePending = null;
let mutation = Promise.resolve();

function serialize(work) {
  const next = mutation.then(work, work);
  mutation = next.catch(() => {});
  return next;
}

function addEvidence(title, outcome, detail, txHash = null) {
  evidence.unshift({ at: new Date().toISOString(), title, outcome, detail, txHash });
  evidence = evidence.slice(0, 40);
}

async function state() {
  const base = await demo.snapshot();
  const ids = await demo.vault.activePending();
  const pending = [];
  for (const id of ids) {
    const p = await demo.vault.getPending(id);
    if (Number(p.status) === 1) pending.push({ id, recipient: p.recipient, amount: demo.display(p.amount), eta: Number(p.eta) });
  }
  return { ...base, authOnline, pending, evidence, policy: { capacity: 100, refillHours: 24, transferDelayMinutes: 60, recoveryDelayMinutes: 3, pinAttempts: 5 }, mode: "LOCAL EVM · SIMULATED AUTHORITY" };
}

app.get("/api/state", async (_req, res, next) => { try { res.json(await state()); } catch (e) { next(e); } });
app.post("/api/reset", (_req, res, next) => serialize(async () => {
  demo = await createDemo(); authOnline = true; evidence = []; crePending = null;
  addEvidence("Disposable vault reset", "READY", "Fresh local chain, independent test credentials, and 1,000 tUSD reserve created.");
  res.json(await state());
}).catch(next));
app.post("/api/pay", (req, res, next) => serialize(async () => {
  const amount = Number(req.body.amount); const mode = Number(req.body.mode);
  if (!Number.isFinite(amount) || amount <= 0 || ![0, 1].includes(mode)) throw new Error("Invalid amount or mode");
  const before = await demo.snapshot();
  if (mode === 0 && amount > before.availableNow + 0.000001) throw new Error("Amount exceeds the current immediate allowance; schedule it instead.");
  const result = await demo.devicePay(amount, mode);
  addEvidence(mode ? "Payment scheduled" : "Everyday payment", "AUTHORIZED", mode ? `${amount} tUSD reserved for delayed execution.` : `${amount} tUSD transferred with exact seed + device authorization.`, result.hash);
  res.json(await state());
}).catch(next));
app.post("/api/attack/seed", (req, res, next) => serialize(async () => {
  const result = await demo.seedOnlyAttack(Number(req.body.amount || 100));
  addEvidence("Stolen seed drain", result.blocked ? "BLOCKED" : "FAILED", result.reason || "Unexpected transfer occurred.");
  res.json(await state());
}).catch(next));
app.post("/api/attack/flood", (_req, res, next) => serialize(async () => {
  if (!authOnline) throw new Error("Backup authenticator is offline");
  const before = await demo.snapshot(); let evaluated = 0;
  while ((await demo.snapshot()).attemptsRemaining > 0) { await demo.reserveGuess(String(100000 + evaluated)); evaluated++; }
  addEvidence("100-request PIN flood", "CONTAINED", `${evaluated} new candidates evaluated; ${100 - evaluated} denied by the on-chain account budget. Device payments remain available.`);
  res.json({ ...(await state()), flood: { requested: 100, evaluated, previouslyUsed: 5 - before.attemptsRemaining } });
}).catch(next));
app.post("/api/cre/prepare", (req, res, next) => serialize(async () => {
  if (!authOnline) throw new Error("Backup authenticator is offline");
  if (crePending) throw new Error("A CRE request is already pending");
  const pin = String(req.body.pin || "");
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be six digits");
  crePending = await demo.prepareAttempt(pin, Number(req.body.amount || 1));
  addEvidence("CRE attempt prepared", "RESERVED", "One on-chain attempt was consumed and bound to an immutable candidate request. Run the official workflow simulation to evaluate it.");
  res.json({ pending: true, attemptId: crePending.attemptId, requestHash: crePending.requestHash });
}).catch(next));
app.get("/api/cre/pending", (_req, res) => {
  if (!crePending) return res.status(404).json({ error: "No CRE request is pending" });
  res.json(crePending);
});
app.post("/api/attack/full", (_req, res, next) => serialize(async () => {
  const before = await demo.snapshot();
  const amount = Math.floor(Math.min(before.balance - before.reserved, before.availableNow) * 1_000_000) / 1_000_000;
  if (amount <= 0) throw new Error("No immediate credit is currently available");
  const result = await demo.devicePay(amount, 0, demo.accounts.attacker.address);
  const after = await demo.snapshot();
  addEvidence("Both everyday factors compromised", "BOUNDED LOSS", `Predicted immediate capacity ${amount} tUSD; observed attacker increase ${after.attackerBalance - before.attackerBalance} tUSD. Capacity refills over time.`, result.hash);
  res.json(await state());
}).catch(next));
app.post("/api/auth/toggle", (req, res) => {
  authOnline = Boolean(req.body.online);
  addEvidence("Backup authenticator", authOnline ? "ONLINE" : "OFFLINE", authOnline ? "Backup PIN evaluations restored." : "Device payments remain available; backup PIN access is unavailable.");
  state().then((s) => res.json(s));
});
app.post("/api/recovery/begin", (_req, res, next) => serialize(async () => {
  await demo.beginRecovery();
  addEvidence("Guardian recovery", "FROZEN", "Two independent guardians approved fresh keys. Outbound activity froze and old-epoch pending authority was invalidated.");
  res.json(await state());
}).catch(next));
app.post("/api/recovery/finish", (_req, res, next) => serialize(async () => {
  await demo.finishRecovery();
  addEvidence("Guardian recovery", "COMPLETED", "Fresh everyday credentials installed. Old credentials invalid. PIN lane remains disabled.");
  res.json(await state());
}).catch(next));
app.post("/api/pending/:id/execute", (req, res, next) => serialize(async () => {
  await (await demo.vault.executeQueued(req.params.id, { gasLimit: 1_000_000 })).wait();
  addEvidence("Scheduled payment", "EXECUTED", "The immutable queued payment reached its delay and executed once.");
  res.json(await state());
}).catch(next));
app.post("/api/time", (req, res, next) => serialize(async () => {
  const seconds = Math.max(0, Math.min(Number(req.body.seconds || 0), 7 * 86400));
  await demo.advance(seconds);
  addEvidence("Local demo clock", "ADVANCED", `${seconds} seconds advanced on the disposable local chain.`);
  res.json(await state());
}).catch(next));
app.use((err, _req, res, _next) => { console.error(err.shortMessage || err.message); res.status(400).json({ error: err.shortMessage || err.message || "Request failed" }); });

const port = Number(process.env.FIREBREAK_PORT || 4173);
app.listen(port, "127.0.0.1", () => console.log(`Firebreak demo: http://127.0.0.1:${port}`));
