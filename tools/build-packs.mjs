/**
 * Compile src/packs/<name>/*.json into Foundry LevelDB compendiums at packs/<name>.
 * Run with: npm run build:packs   (close Foundry first — it locks the pack databases)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

// Foundry keeps the pack databases open while it runs. Rebuilding underneath it gets the packs wiped when Foundry
// next writes them, so refuse unless Foundry is fully quit (Cmd+Q; logging out of the world isn't enough).
if (!process.argv.includes("--force")) {
  let running = false;
  try {
    running = !!execSync('pgrep -f "Foundry Virtual Tabletop|FoundryVTT|foundryvtt.*main.(m?js)"', { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch { /* pgrep exits 1 when nothing matches */ }
  if (running) {
    console.error("Foundry is running. Quit it completely (Cmd+Q), then build the packs. (--force skips this check.)");
    process.exit(1);
  }
}

const SRC = "src/packs";
const DEST = "packs";

for (const name of fs.readdirSync(SRC)) {
  const src = path.join(SRC, name);
  if (!fs.statSync(src).isDirectory()) continue;
  const dest = path.join(DEST, name);
  fs.rmSync(dest, { recursive: true, force: true });
  await compilePack(src, dest, { log: false });
  console.log(`Packed ${name} (${fs.readdirSync(src).length} documents)`);
}
