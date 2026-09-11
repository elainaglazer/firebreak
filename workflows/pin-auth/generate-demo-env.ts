import fs from "node:fs";
import path from "node:path";
import { createVerifier, requestSchema } from "./workflow.js";

const endpoint = process.env.FIREBREAK_REQUEST_URL ?? "http://127.0.0.1:4173/api/cre/pending";
const correctPin = process.env.FIREBREAK_DEMO_PIN ?? "482913";
const pepper = process.env.FIREBREAK_DEMO_PEPPER ?? "local-demo-pepper-not-for-production";
const response = await fetch(endpoint);
if (!response.ok) throw new Error(`No prepared request at ${endpoint}: HTTP ${response.status}`);
const request = requestSchema.parse(await response.json());
const expected = createVerifier({ ...request, candidatePin: correctPin }, pepper);
const output = `CRE_FIREBREAK_PEPPER=${pepper}\nCRE_FIREBREAK_VERIFIER=${expected}\n`;
const destination = path.join(import.meta.dirname, ".env.simulation");
fs.writeFileSync(destination, output, { encoding: "utf8", mode: 0o600 });
console.log(`Wrote local-only simulator secrets to ${destination}`);
