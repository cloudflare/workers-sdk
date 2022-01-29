import path from "path";
import os from "os";
import { mkdirSync, writeFileSync } from "node:fs";

export function writeUserConfig(
  oauth_token?: string,
  refresh_token?: string,
  expiration_time?: string
) {
  const lines: string[] = [];
  if (oauth_token) {
    lines.push(`oauth_token = "${oauth_token}"`);
  }
  if (refresh_token) {
    lines.push(`refresh_token = "${refresh_token}"`);
  }
  if (expiration_time) {
    lines.push(`expiration_time = "${expiration_time}"`);
  }
  const configPath = path.join(os.homedir(), ".wrangler/config");
  mkdirSync(configPath, { recursive: true });
  writeFileSync(
    path.join(configPath, "default.toml"),
    lines.join("\n"),
    "utf-8"
  );
}
