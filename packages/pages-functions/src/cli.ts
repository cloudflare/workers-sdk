import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildPagesFunctions, PagesFunctionsNoRoutesError } from "./build";

/**
 * CLI entry point for `pages-functions build`.
 *
 * Parses command-line arguments and invokes the Pages Functions compiler.
 */
async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			outdir: { type: "string", default: "dist" },
			minify: { type: "boolean", default: false },
			sourcemap: { type: "boolean", default: false },
			"fallback-service": { type: "string", default: "ASSETS" },
			external: { type: "string", multiple: true },
			"routes-output": { type: "string" },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});

	if (values.version) {
		const { readFile } = await import("node:fs/promises");
		const pkgPath = resolve(import.meta.dirname, "..", "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
		console.log(pkg.version);
		process.exit(0);
	}

	if (values.help) {
		printUsage();
		process.exit(0);
	}

	const [command, functionsDirectory] = positionals;

	if (command !== "build") {
		console.error(
			command
				? `Unknown command: ${command}`
				: "No command specified. Use 'pages-functions build'."
		);
		printUsage();
		process.exit(1);
	}

	const directory = functionsDirectory || "functions";

	if (!existsSync(directory)) {
		console.error(
			`Functions directory not found: ${directory}\nPlease ensure the directory exists and contains your Pages Functions.`
		);
		process.exit(1);
	}

	const outdir = values.outdir;

	await mkdir(outdir, { recursive: true });

	try {
		const result = await buildPagesFunctions({
			functionsDirectory: directory,
			outputDirectory: outdir,
			minify: values.minify,
			sourcemap: values.sourcemap,
			fallbackService: values["fallback-service"],
			external: values.external,
		});

		// Write _routes.json if requested or by default alongside the output
		const routesOutputPath =
			values["routes-output"] || resolve(outdir, "_routes.json");
		await mkdir(dirname(routesOutputPath), { recursive: true });
		await writeFile(
			routesOutputPath,
			JSON.stringify(result.routesJSON, null, 2)
		);

		console.log(`Compiled Worker successfully to ${outdir}/index.js`);
	} catch (error) {
		if (error instanceof PagesFunctionsNoRoutesError) {
			console.error(
				`No routes found in Functions directory: ${directory}\n` +
					"Please ensure your functions export onRequest handlers."
			);
			process.exit(156);
		}
		throw error;
	}
}

/**
 * Print CLI usage information.
 */
function printUsage() {
	console.log(`
Usage: pages-functions build [directory] [options]

Compile a Pages Functions directory into a Cloudflare Worker bundle.

This command only compiles your Functions. It does not deploy them or create
deployment configuration. Your deployment must configure the selected fallback
service binding (ASSETS by default), including when using assets: imports.

Arguments:
  directory                 Path to the functions directory (default: "functions")

Options:
  --outdir <path>           Output directory for the compiled Worker (default: "dist")
  --minify                  Minify the output Worker script
  --sourcemap               Generate a source map
  --fallback-service <name> Fallback service binding name (default: "ASSETS")
  --external <module>       Module specifiers to exclude from bundling (repeatable)
  --routes-output <path>    Path to write the generated _routes.json
  -h, --help                Show this help message
  -v, --version             Show version number
`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
