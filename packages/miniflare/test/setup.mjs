import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import {
	_enableControlEndpoints,
	_initialiseInstanceRegistry,
} from "../dist/src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, "..");

// Default-enabled registries must not advertise test Workers to real dev
// sessions. Each test file gets its own Cloudflare config directory, while
// explicit registry paths remain available for cross-instance tests.
const configRoot = mkdtempSync(path.join(os.tmpdir(), "miniflare-config-"));
const previousConfigRoot = process.env.XDG_CONFIG_HOME;
const previousRegistryPath = process.env.CLOUDFLARE_DEV_REGISTRY_PATH;
process.env.XDG_CONFIG_HOME = configRoot;
delete process.env.CLOUDFLARE_DEV_REGISTRY_PATH;

afterAll(() => {
	if (previousConfigRoot === undefined) {
		delete process.env.XDG_CONFIG_HOME;
	} else {
		process.env.XDG_CONFIG_HOME = previousConfigRoot;
	}
	if (previousRegistryPath === undefined) {
		delete process.env.CLOUDFLARE_DEV_REGISTRY_PATH;
	} else {
		process.env.CLOUDFLARE_DEV_REGISTRY_PATH = previousRegistryPath;
	}
	rmSync(configRoot, { recursive: true, force: true });
});

// Monkeypatch Node's resolver to require built `miniflare` package when we call
// `require("miniflare")`. We could fix this by adding `miniflare` as a
// dev dependency of itself, but Turborepo doesn't allow this.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (spec, ...args) {
	if (spec === "miniflare") spec = pkgRoot;
	return originalResolveFilename.call(this, spec, ...args);
};

const registry = _initialiseInstanceRegistry();
const bigSeparator = "=".repeat(80);
const separator = "-".repeat(80);

_enableControlEndpoints();

afterAll(() => {
	if (registry.size === 0) return;

	// If there are Miniflare instances that weren't disposed, throw
	const s = registry.size === 1 ? "" : "s";
	const was = registry.size === 1 ? "was" : "were";
	const message = `Found ${registry.size} Miniflare instance${s} that ${was} not dispose()d`;
	const stacks = Array.from(registry.values()).join(`\n${separator}\n`);
	// eslint-disable-next-line no-console
	console.log(
		[bigSeparator, message, separator, stacks, bigSeparator].join("\n")
	);
	throw new Error(message);
});
