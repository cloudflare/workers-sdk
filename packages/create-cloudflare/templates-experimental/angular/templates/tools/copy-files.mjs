// Copy the files over so that they can be uploaded by the pages publish command.
import fs from "node:fs";
import { join } from "node:path";
import { client, cloudflare, ssr, worker } from "./paths.mjs";

fs.cpSync(client, cloudflare, { recursive: true });
fs.cpSync(ssr, worker, { recursive: true });

fs.renameSync(join(worker, "server.mjs"), join(worker, "index.js"));
