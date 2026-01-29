#!/usr/bin/env node
/**
 * CLI for @cloudflare/pages-functions
 *
 * Compiles a Pages project's functions directory into a worker entrypoint.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { compileFunctions } from "./index.js";

const HELP = `
Usage: pages-functions [options] [project-dir]

Compiles a Pages project's functions directory into a worker entrypoint.

Arguments:
  project-dir              Path to the project root (default: ".")

Options:
  -o, --outfile <path>     Output file for the worker entrypoint (default: "dist/worker.js")
  --routes-json <path>     Output path for _routes.json (default: "_routes.json")
  --no-routes-json         Don't generate _routes.json
  --base-url <url>         Base URL for routes (default: "/")
  --fallback-service <name> Fallback service binding name (default: "ASSETS")
  -h, --help               Show this help message

Examples:
  pages-functions                          # Compile ./functions to dist/worker.js
  pages-functions ./my-project             # Compile my-project/functions
  pages-functions -o worker.js             # Output to worker.js instead
  pages-functions --base-url /api          # Prefix all routes with /api
`;

async function main() {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			outfile: { type: "string", short: "o", default: "dist/worker.js" },
			"routes-json": { type: "string", default: "_routes.json" },
			"no-routes-json": { type: "boolean", default: false },
			"base-url": { type: "string", default: "/" },
			"fallback-service": { type: "string", default: "ASSETS" },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	const projectDir = positionals[0] ?? ".";
	const outfile = values.outfile ?? "dist/worker.js";
	const routesJson = values["no-routes-json"]
		? null
		: values["routes-json"] ?? "_routes.json";
	const baseURL = values["base-url"] ?? "/";
	const fallbackService = values["fallback-service"] ?? "ASSETS";

	try {
		const result = await compileFunctions(projectDir, {
			baseURL,
			fallbackService,
		});

		// Ensure output directory exists
		await fs.mkdir(path.dirname(outfile), { recursive: true });

		// Write worker entrypoint
		await fs.writeFile(outfile, result.code);
		console.log(`✓ Generated ${outfile}`);

		// Write _routes.json if requested
		if (routesJson) {
			await fs.writeFile(
				routesJson,
				JSON.stringify(result.routesJson, null, "\t")
			);
			console.log(`✓ Generated ${routesJson}`);
		}

		// Print routes summary
		console.log("\nRoutes:");
		for (const route of result.routes) {
			const method = route.method || "ALL";
			console.log(`  ${method.padEnd(6)} ${route.routePath}`);
		}
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);
		} else {
			console.error("An unexpected error occurred");
		}
		process.exit(1);
	}
}

void main();
