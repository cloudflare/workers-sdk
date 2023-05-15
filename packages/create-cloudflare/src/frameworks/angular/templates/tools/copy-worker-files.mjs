// Copy the lazy loaded modules into the dist folder so that they can be
// uploaded along with the main Worker module.
import fs from "node:fs";
import path from "node:path";
import { ssr, worker } from "./paths.mjs";
fs.cpSync(ssr, worker, { recursive: true });
fs.renameSync(
	path.resolve(worker, "main.js"),
	path.resolve(worker, "index.js")
);
