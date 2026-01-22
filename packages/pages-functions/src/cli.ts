#!/usr/bin/env node
/**
 * CLI for @cloudflare/pages-functions
 *
 * Compiles a Pages project's functions directory into a worker entrypoint.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { compileFunctions, DEFAULT_FUNCTIONS_DIR } from "./index.js";

interface CliArgs {
	projectDir: string;
	outfile: string;
	routesJson: string | null;
	functionsDir: string;
	baseURL: string;
	fallbackService: string;
	help: boolean;
}

function parseArgs(args: string[]): CliArgs {
	const result: CliArgs = {
		projectDir: ".",
		outfile: "dist/worker.js",
		routesJson: "_routes.json",
		functionsDir: DEFAULT_FUNCTIONS_DIR,
		baseURL: "/",
		fallbackService: "ASSETS",
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "-h" || arg === "--help") {
			result.help = true;
		} else if (arg === "-o" || arg === "--outfile") {
			result.outfile = args[++i];
		} else if (arg === "--routes-json") {
			result.routesJson = args[++i];
		} else if (arg === "--no-routes-json") {
			result.routesJson = null;
		} else if (arg === "--functions-dir") {
			result.functionsDir = args[++i];
		} else if (arg === "--base-url") {
			result.baseURL = args[++i];
		} else if (arg === "--fallback-service") {
			result.fallbackService = args[++i];
		} else if (!arg.startsWith("-")) {
			result.projectDir = arg;
		}
	}

	return result;
}

function printHelp() {
	console.log(`
Usage: pages-functions [options] [project-dir]

Compiles a Pages project's functions directory into a worker entrypoint.

Arguments:
  project-dir              Path to the project root (default: ".")

Options:
  -o, --outfile <path>     Output file for the worker entrypoint (default: "dist/worker.js")
  --routes-json <path>     Output path for _routes.json (default: "_routes.json")
  --no-routes-json         Don't generate _routes.json
  --functions-dir <dir>    Functions directory relative to project (default: "functions")
  --base-url <url>         Base URL for routes (default: "/")
  --fallback-service <name> Fallback service binding name (default: "ASSETS")
  -h, --help               Show this help message

Examples:
  pages-functions                          # Compile ./functions to dist/worker.js
  pages-functions ./my-project             # Compile my-project/functions
  pages-functions -o worker.js             # Output to worker.js instead
  pages-functions --base-url /api          # Prefix all routes with /api
`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	try {
		const result = await compileFunctions(args.projectDir, {
			functionsDir: args.functionsDir,
			baseURL: args.baseURL,
			fallbackService: args.fallbackService,
		});

		// Ensure output directory exists
		await fs.mkdir(path.dirname(args.outfile), { recursive: true });

		// Write worker entrypoint
		await fs.writeFile(args.outfile, result.code);
		console.log(`✓ Generated ${args.outfile}`);

		// Write _routes.json if requested
		if (args.routesJson) {
			await fs.writeFile(
				args.routesJson,
				JSON.stringify(result.routesJson, null, "\t")
			);
			console.log(`✓ Generated ${args.routesJson}`);
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
