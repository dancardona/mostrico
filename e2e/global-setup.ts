import { rm } from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {
  await rm(path.join(process.cwd(), ".next-e2e", "local-state.json"), { force: true });
}
