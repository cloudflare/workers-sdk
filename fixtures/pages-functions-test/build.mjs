#!/usr/bin/env node
/**
 * Build script that uses @cloudflare/pages-functions to compile
 * the functions directory into a worker entrypoint.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { compileFunctions } from "@cloudflare/pages-functions";

// Ensure dist directory exists
mkdirSync("./dist", { recursive: true });

// Compile the functions directory
const result = await compileFunctions("./functions");

// Write the generated worker entrypoint
writeFileSync("./dist/worker.js", result.code);
console.log("✓ Generated dist/worker.js");

// Write _routes.json
writeFileSync("./_routes.json", JSON.stringify(result.routesJson, null, 2));
console.log("✓ Generated _routes.json");

console.log("\nRoutes:");
for (const route of result.routes) {
	const method = route.method || "ALL";
	console.log(`  ${method.padEnd(6)} ${route.routePath}`);
}
