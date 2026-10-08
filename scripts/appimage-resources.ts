import { accessSync, constants, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(
  "src-tauri",
  "target",
  "x86_64-unknown-linux-gnu",
  "release",
  "bundle",
  "appimage",
  "Talos Pilot.AppDir",
);
const required = new Set(["WebKitNetworkProcess", "WebKitWebProcess"]);
let entries = 0;

function inspect(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    entries += 1;
    if (entries > 10_000) throw new Error("AppImage resource inspection exceeded its file bound.");
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (entry.isFile() && required.has(entry.name)) {
      accessSync(path, constants.X_OK);
      required.delete(entry.name);
    }
  }
}

inspect(root);
if (required.size !== 0)
  throw new Error(`AppImage is missing executable WebKit resources: ${[...required].join(", ")}.`);
console.info("AppImage contains both executable WebKit helper processes.");
