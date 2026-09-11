import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "contracts");
const buildDir = path.join(root, "build");

const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((name) => name.endsWith(".sol"))
    .map((name) => [name, { content: fs.readFileSync(path.join(contractsDir, name), "utf8") }]),
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

function findImport(importPath) {
  const candidates = [path.join(root, "node_modules", importPath), path.join(contractsDir, importPath)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, "utf8") };
  }
  return { error: `Import not found: ${importPath}` };
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const messages = output.errors ?? [];
for (const message of messages) console.error(message.formattedMessage);
if (messages.some((message) => message.severity === "error")) process.exit(1);

fs.mkdirSync(buildDir, { recursive: true });
for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  if (!sourceName.endsWith(".sol") || sourceName.startsWith("@")) continue;
  for (const [contractName, artifact] of Object.entries(contracts)) {
    fs.writeFileSync(
      path.join(buildDir, `${contractName}.json`),
      JSON.stringify({ contractName, sourceName, abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` }, null, 2),
    );
    console.log(`Compiled ${contractName}`);
  }
}
