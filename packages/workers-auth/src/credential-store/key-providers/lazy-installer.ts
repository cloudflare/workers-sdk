import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import type { SpawnSyncReturns } from "node:child_process";

// This module is deliberately synchronous (`spawnSync`, `existsSync`,
// `writeFileSync`): the `KeyProvider` / `CredentialStore` contract it
// feeds is synchronous all the way up (`read()`, `getKey()`), because the
// credential lookups happen on hot, synchronous code paths in the OAuth
// state layer. Switching to `node:fs/promises` here would force async
// through that entire stack for no real benefit.
//
// `@napi-rs/keyring` is *lazy-installed on first Windows opt-in* rather
// than declared as a (regular or optional) dependency so the ~99% of
// users who never opt into keyring storage — and all macOS/Linux opt-in
// users, who use the built-in `security` / `secret-tool` tools — never
// download a native binary. Only Windows opt-in users ever fetch it.

/**
 * Pinned version of `@napi-rs/keyring` that gets installed lazily on
 * Windows when the user opts into keyring storage.
 *
 * Hard-coded so we stamp the same version into both the user-facing
 * "install it globally" hint and the actual `npm install` command —
 * ensuring CI users running the global-install workaround see exactly
 * the version we tested against.
 */
export const PINNED_KEYRING_VERSION = "1.3.0";

/** Signature of the `npm` invoker. Overridable for tests. */
export type NpmRunner = (args: string[]) => SpawnSyncReturns<string>;

function defaultNpmRunner(args: string[]): SpawnSyncReturns<string> {
	// `shell: true` on Windows so `spawnSync` resolves the `npm.cmd` /
	// `npm.ps1` shim that ships with Node for Windows.
	//
	// This is the *only* way to launch a `.cmd`/`.bat` since Node
	// 20.12.2 / 21.7.2 / 22.x: CVE-2024-27980 made the runtime refuse to
	// spawn batch files without an explicit `shell: true`. Spawning
	// `npm.cmd` directly with `shell: false` (a common pre-CVE pattern)
	// now throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`-style
	// errors on supported Node versions. See
	// https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
	//
	// `shell: true` does pass arguments through `cmd.exe`, which in
	// principle interprets `&|<>^` etc. as metacharacters. The only
	// path-shaped argument we pass is the `--prefix` value derived from
	// the consumer-provided config path, which is built from `HOME` /
	// `APPDATA` (i.e. the user's own env vars — not attacker-controlled
	// input). Node's array-form arg handling for shell launches on
	// Windows also applies the upstream CVE-2024-27980 escaping fix.
	// Defense-in-depth concern, not a real injection surface; the
	// alternative (`shell: false`) is incompatible with .cmd files on
	// modern Node, so we accept the trade-off.
	//
	// On POSIX `shell: false` keeps the argv shape simple.
	return spawnSync("npm", args, {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		shell: process.platform === "win32",
	});
}

let npmRunner: NpmRunner = defaultNpmRunner;

/**
 * Cached {@link findKeyringBinding} results, keyed by install dir. The
 * resolver re-runs the resolution on every credential read/write, so without
 * memoization we would spawn `npm root -g` on every operation when the binding
 * is not present locally. A missing key means "not yet probed"; a `null` value
 * is a real "no binding found" cache entry.
 *
 * Keyed by install dir so consumers with different config paths (e.g. wrangler
 * vs. a future `cf` CLI) don't share a stale probe result. Invalidated by
 * {@link installKeyringBindingSync} (so a fresh install is picked up
 * immediately) and by {@link setNpmRunner} (so tests can swap the runner and
 * re-probe).
 */
const cachedBindingPathByDir = new Map<string, string | null>();

/**
 * Override the `npm` invoker for tests. Pass `undefined` to restore the
 * default real-process runner. Resets the memoized
 * {@link findKeyringBinding} cache so the next call re-probes through
 * the new runner.
 */
export function setNpmRunner(fn: NpmRunner | undefined): void {
	npmRunner = fn ?? defaultNpmRunner;
	cachedBindingPathByDir.clear();
}

/**
 * Directory used to host the lazy-installed `@napi-rs/keyring` binding, under
 * the consumer-provided global config directory (`configPath`). A sibling of
 * the credentials dir so `runInTempDir()` test fixtures (which redirect `HOME`
 * / `XDG_CONFIG_HOME`) isolate the install dir alongside everything else stored
 * under the config path.
 *
 * `configPath` is supplied by the client (wrangler, or a future `cf` CLI) — the
 * same value used for the credential files — so each CLI's native binding lives
 * under its own config directory rather than a hard-coded wrangler location.
 */
export function getKeyringInstallDir(configPath: string): string {
	return path.join(configPath, "native", "keyring");
}

/** Absolute path to the `index.js` of the lazy-installed binding. */
function getInstalledBindingPath(installDir: string): string {
	return path.join(installDir, "node_modules", "@napi-rs", "keyring");
}

/**
 * Locate an installed `@napi-rs/keyring` binding usable from this process.
 *
 * Search order:
 *   1. The private install dir written by {@link installKeyringBindingSync}.
 *   2. The user's global npm root, so a manual `npm install -g
 *      @napi-rs/keyring` works in CI environments where the lazy install
 *      path is unavailable.
 *
 * Returns `null` when no binding is available; callers handle the missing
 * binding case explicitly so they can surface remediation instructions.
 *
 * The result is memoized per-process, keyed by `installDir`. The resolver
 * calls this on every credential operation, so without caching we would spawn
 * `npm root -g` each time the binding is not in the lazy dir. The cache is
 * invalidated by {@link installKeyringBindingSync} on a successful install and
 * by {@link setNpmRunner} for test isolation.
 */
export function findKeyringBinding(installDir: string): string | null {
	const cached = cachedBindingPathByDir.get(installDir);
	if (cached !== undefined) {
		return cached;
	}
	const lazy = getInstalledBindingPath(installDir);
	if (existsSync(path.join(lazy, "index.js"))) {
		cachedBindingPathByDir.set(installDir, lazy);
		return lazy;
	}
	try {
		const r = npmRunner(["root", "-g"]);
		if (r.status === 0) {
			const global = path.join(r.stdout.trim(), "@napi-rs", "keyring");
			if (existsSync(path.join(global, "index.js"))) {
				cachedBindingPathByDir.set(installDir, global);
				return global;
			}
		}
	} catch {
		// `npm root -g` is best-effort: if `npm` is not on PATH we silently
		// move on and report "not installed" to the resolver.
	}
	cachedBindingPathByDir.set(installDir, null);
	return null;
}

/**
 * Install `@napi-rs/keyring` into the private install dir using the user's
 * `npm`.
 *
 * Throws a {@link UserError} when `npm` cannot be spawned or returns a
 * non-zero exit code, so callers can surface actionable remediation hints
 * rather than a raw stack trace.
 */
export function installKeyringBindingSync(installDir: string): void {
	const dir = installDir;
	mkdirSync(dir, { recursive: true });
	const hostPkgJson = path.join(dir, "package.json");
	if (!existsSync(hostPkgJson)) {
		// `npm install --prefix` requires *some* package.json at the prefix
		// to anchor the install. A minimal private one keeps npm happy and
		// signals to anyone poking around that this dir is auth-managed.
		writeFileSync(
			hostPkgJson,
			JSON.stringify(
				{ private: true, name: "cloudflare-auth-keyring-host" },
				null,
				"\t"
			),
			"utf-8"
		);
	}
	let r: SpawnSyncReturns<string>;
	try {
		r = npmRunner([
			"install",
			`@napi-rs/keyring@${PINNED_KEYRING_VERSION}`,
			"--prefix",
			dir,
			"--no-save",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
			"--loglevel=error",
		]);
	} catch (e) {
		throw new UserError(
			`Failed to spawn \`npm\` to install the keyring backend: ${
				e instanceof Error ? e.message : String(e)
			}\n\n` +
				`Install \`npm\` and retry, or install the binding globally:\n` +
				`  npm install -g @napi-rs/keyring@${PINNED_KEYRING_VERSION}`,
			{ telemetryMessage: "workers-auth keyring npm spawn failed" }
		);
	}
	if (r.status !== 0) {
		throw new UserError(
			`Failed to install \`@napi-rs/keyring\` (npm exited ${r.status}):\n${r.stderr?.trim() ?? "(no stderr)"}\n\n` +
				`Retry once the underlying issue is fixed, or install the binding globally:\n` +
				`  npm install -g @napi-rs/keyring@${PINNED_KEYRING_VERSION}`,
			{ telemetryMessage: "workers-auth keyring npm install failed" }
		);
	}
	// Fresh install landed on disk — invalidate the cached "not found"
	// result for this install dir so the next `findKeyringBinding()` call
	// picks the new path up immediately instead of returning the stale `null`.
	cachedBindingPathByDir.delete(installDir);
}

/**
 * Minimal slice of `@napi-rs/keyring`'s `Entry` class that {@link
 * NapiKeyringKeyProvider} depends on.
 *
 * Defined locally so we can load the underlying module lazily — the native
 * binary must not be required (and `dlopen`-ed) unless the user has
 * actually opted into keyring storage.
 */
export interface KeyringEntry {
	setPassword(password: string): void;
	getPassword(): string | null;
	deletePassword(): boolean;
}

/** Factory signature used by `NapiKeyringKeyProvider` to create entries. */
export type KeyringEntryFactory = (
	service: string,
	account: string
) => KeyringEntry;

let entryFactoryOverride: KeyringEntryFactory | undefined;

/**
 * Override the keyring entry factory used by `NapiKeyringKeyProvider`.
 *
 * Tests use this to inject an in-memory fake so they never touch the
 * developer machine's real keychain. Pass `undefined` to restore the
 * default (lazy dynamic require).
 */
export function setKeyringEntryFactory(
	factory: KeyringEntryFactory | undefined
): void {
	entryFactoryOverride = factory;
}

interface KeyringModule {
	Entry: new (service: string, account: string) => KeyringEntry;
}

// `createRequire` is used to load the lazy-installed binding from an
// absolute path computed at runtime, defeating esbuild's static analysis
// of `require(...)`. The anchor `__filename` is provided in both the
// bundled CJS output and the source-loaded test environment.
// eslint-disable-next-line no-restricted-globals -- runtime resolution requires a CJS anchor
const dynamicRequire = createRequire(__filename);

/**
 * Resolve the active keyring entry factory, loading the lazy-installed
 * binding from `installDir` when no test override is registered.
 */
export function resolveKeyringEntryFactory(
	installDir: string
): KeyringEntryFactory {
	if (entryFactoryOverride !== undefined) {
		return entryFactoryOverride;
	}
	const bindingPath = findKeyringBinding(installDir);
	if (bindingPath === null) {
		throw new Error(
			"`@napi-rs/keyring` binding not found. Call `installKeyringBindingSync()` first."
		);
	}
	const mod = dynamicRequire(bindingPath) as KeyringModule;
	return (service, account) => new mod.Entry(service, account);
}
