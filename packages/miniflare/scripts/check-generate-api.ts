#!/usr/bin/env -S node -r esbuild-register
/**
 * CI check: verify that generated OpenAPI types are up-to-date.
 *
 * Downloads the Cloudflare OpenAPI spec from a pinned commit, runs the
 * generate:api pipeline, and fails if any generated files differ from what
 * is checked in.
 *
 * To update the pinned commit, change OPENAPI_COMMIT below and re-run
 * `OPENAPI_INPUT_PATH=<path> pnpm generate:api` locally.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OPENAPI_COMMIT = "5a81015dd2d335664a2dd2dcabd3fd666334c9c2";
const OPENAPI_RAW_URL = `https://raw.githubusercontent.com/cloudflare/api-schemas/${OPENAPI_COMMIT}/openapi.json`;

const GENERATED_PATHS = [
	"src/workers/local-explorer/openapi.local.json",
	"src/workers/local-explorer/generated",
];

async function main(): Promise<void> {
	const miniflareRoot = join(__dirname, "..");

	// 1. Download the pinned OpenAPI spec
	console.log(`Downloading OpenAPI spec from pinned commit ${OPENAPI_COMMIT}…`);
	const response = await fetch(OPENAPI_RAW_URL);
	if (!response.ok) {
		throw new Error(
			`Failed to download OpenAPI spec: ${response.status} ${response.statusText}`
		);
	}
	const specContent = await response.text();

	const tmpDir = mkdtempSync(join(tmpdir(), "miniflare-openapi-"));
	const specPath = join(tmpDir, "openapi.json");
	writeFileSync(specPath, specContent, "utf-8");
	console.log(`Wrote spec to ${specPath}`);

	// 2. Run generate:api with the downloaded spec
	console.log("Running generate:api…");
	execSync(`pnpm generate:api`, {
		cwd: miniflareRoot,
		stdio: "inherit",
		env: { ...process.env, OPENAPI_INPUT_PATH: specPath },
	});

	// 3. Check for uncommitted changes in generated files
	console.log("Checking for uncommitted changes in generated files…");
	const diffPaths = GENERATED_PATHS.map((p) => join("packages/miniflare", p));
	try {
		execSync(`git diff --exit-code -- ${diffPaths.join(" ")}`, {
			cwd: join(miniflareRoot, "../.."),
			stdio: "inherit",
		});
	} catch {
		console.error(
			"\n" +
				"ERROR: Generated OpenAPI files are out of date.\n" +
				"Run the following command locally and commit the result:\n" +
				"\n" +
				`  OPENAPI_INPUT_PATH=<path-to-openapi.json> pnpm -F miniflare generate:api\n` +
				"\n" +
				"See packages/miniflare/src/workers/local-explorer/README.md for details.\n" +
				`The CI check uses the spec pinned at commit ${OPENAPI_COMMIT}.\n`
		);
		process.exit(1);
	}

	console.log("Generated OpenAPI files are up to date.");
}

void main();
