// Copy the client-side files over so that they can be uploaded by the pages publish command.
import fs from "node:fs";
import { client, cloudflare } from "./paths.mjs";
fs.cpSync(client, cloudflare, { recursive: true });
