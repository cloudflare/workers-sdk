// Copy the files over so that they can be uploaded by the pages publish command.
import fs from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../");
const client = resolve(root, "dist/browser");
const ssr = resolve(root, "dist/server");
const cloudflare = resolve(root, "dist/cloudflare");
const worker = resolve(cloudflare, "_worker.js");

fs.cpSync(client, cloudflare, { recursive: true });
fs.cpSync(ssr, worker, { recursive: true });

fs.renameSync(join(worker, "server.mjs"), join(worker, "index.js"));
