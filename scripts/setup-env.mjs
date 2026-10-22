#!/usr/bin/env node
/** Create .env.local from .env.example with a fresh encryption key (never overwrites). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env.local")) {
  console.log(".env.local already exists; nothing to do.");
  process.exit(0);
}
const template = readFileSync(".env.example", "utf8");
const filled = template
  .replace(/^APP_ENCRYPTION_KEY=.*$/m, `APP_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`)
  .replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${randomBytes(16).toString("hex")}`);
writeFileSync(".env.local", filled);
console.log("Wrote .env.local with a new APP_ENCRYPTION_KEY and CRON_SECRET. Add platform credentials when you have them.");
