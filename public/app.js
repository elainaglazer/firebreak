let state;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const fmt = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n ?? 0);

async function api(path, body) {
  document.body.classList.add("loading");
  try {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    state = data; render(); return data;
  } finally { document.body.classList.remove("loading"); }
}

function toast(message, error = false) {
  const el = $("#toast"); el.textContent = message; el.className = `show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "", 3300);
}

function quote() {
  if (!state) return;
  const amount = Number($("#amount").value || 0); const delayed = amount > state.availableNow;
  const el = $("#quote"); el.classList.toggle("delay", delayed);
  el.textContent = delayed ? `Schedules after a ${state.policy.transferDelayMinutes}-minute demo delay. You can cancel before execution.` : "Sends immediately from the protected everyday allowance.";
  $("#pay-button").textContent = delayed ? `Schedule ${fmt(amount)} tUSD` : `Confirm ${fmt(amount)} tUSD`;
}

function render() {
  $("#mode").textContent = state.mode;
  $("#balance").textContent = fmt(state.balance); $("#available").textContent = `${fmt(state.availableNow)} tUSD`;
  $("#meter").style.width = `${Math.min(100, state.availableNow)}%`; $("#attempts").textContent = state.attemptsRemaining;
  $("#auth-pill").textContent = state.authOnline ? "ONLINE" : "OFFLINE"; $("#auth-pill").className = `pill ${state.authOnline ? "good" : "bad"}`;
  $("#auth-toggle").textContent = state.authOnline ? "Stop PIN service" : "Restore PIN service";
  $("#exposure").textContent = fmt(state.executableWithBothFactors); $("#attacker-balance").textContent = fmt(state.attackerBalance);
  $("#vault-state").textContent = state.frozen ? "FROZEN" : "ACTIVE"; $("#epoch").textContent = state.epoch;
  $("#pending-count").textContent = `${state.pending.length} active`;
  $("#pending").innerHTML = state.pending.length ? state.pending.map((p) => `<div class="pending-row"><div><b>${fmt(p.amount)} tUSD</b><small>${p.recipient.slice(0, 8)}…${p.recipient.slice(-5)}</small></div><small>ETA ${new Date(p.eta * 1000).toLocaleTimeString()}</small><button class="secondary" data-pending="${p.id}">Finish</button></div>`).join("") : '<div class="empty">Nothing is waiting.</div>';
  $$('[data-pending]').forEach((button) => button.onclick = () => api(`/api/pending/${button.dataset.pending}/execute`, {}).then(() => toast("Scheduled payment executed")).catch((e) => toast("Not ready yet", true)));
  const active = state.recoveryReadyAt > 0;
  $("#recovery-title").textContent = active ? "Vault frozen for recovery" : state.pinEnabled ? "No recovery in progress" : "Recovered · backup PIN disabled";
  $("#recovery-copy").textContent = active ? "Guardian quorum approved fresh credentials. Complete installs them after the visible delay." : state.pinEnabled ? "Two distinct guardians can freeze the vault and install fresh credentials after a three-minute demo delay." : "Fresh everyday credentials work. Migrate to a freshly provisioned vault to restore backup PIN access.";
  $("#recovery-button").textContent = active ? "Complete recovery" : "Begin guardian recovery";
  $("#recovery-button").disabled = !active && !state.pinEnabled;
  $("#evidence").innerHTML = state.evidence.length ? state.evidence.map((e) => `<div class="evidence-row"><time>${new Date(e.at).toLocaleTimeString()}</time><b data-kind="${e.outcome}">${e.outcome}</b><p><strong>${e.title}</strong> · ${e.detail}${e.txHash ? ` · ${e.txHash.slice(0, 10)}…` : ""}</p></div>`).join("") : '<div class="empty">Run a scenario to produce evidence.</div>';
  quote();
}

$$('.nav').forEach((button) => button.onclick = () => { $$('.nav,.view').forEach((el) => el.classList.remove('active')); button.classList.add('active'); $(`#${button.dataset.view}`).classList.add('active'); history.replaceState(null, '', `#${button.dataset.view}`); });
$("#amount").addEventListener("input", quote);
function submitPayment(event) {
  event?.preventDefault();
  const amount = Number($("#amount").value);
  const mode = amount > state.availableNow ? 1 : 0;
  api("/api/pay", { amount, mode }).then(() => toast(mode ? "Payment scheduled" : "Payment sent")).catch((e) => toast(e.message, true));
}
$("#pay-form").addEventListener("submit", submitPayment);
$("#pay-button").addEventListener("click", submitPayment);
$$('[data-attack]').forEach((button) => button.onclick = () => api(`/api/attack/${button.dataset.attack}`, button.dataset.attack === "seed" ? { amount: 100 } : {}).then(() => toast("Scenario executed against the local vault")).catch((e) => toast(e.message, true)));
$("#auth-toggle").onclick = () => api("/api/auth/toggle", { online: !state.authOnline }).then(() => toast("Authenticator state changed"));
$("#recovery-button").onclick = () => api(state.recoveryReadyAt > 0 ? "/api/recovery/finish" : "/api/recovery/begin", {}).then(() => toast(state.frozen ? "Vault frozen; recovery is pending" : "Recovery completed")).catch((e) => toast(e.message, true));
$("#reset").onclick = () => api("/api/reset", {}).then(() => toast("Fresh disposable vault ready"));

api("/api/state").catch((e) => toast(e.message, true));
