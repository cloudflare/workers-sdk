import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { setKeyProviderFactoryForTesting } from "../../src/credential-store/key-providers/factory";
import {
	getKeyringInstallDir,
	setNpmRunner,
} from "../../src/credential-store/key-providers/lazy-installer";
import { setLinuxSecretToolRunner } from "../../src/credential-store/key-providers/linux-secret-tool";
import { setMacSecurityCommandRunner } from "../../src/credential-store/key-providers/mac-security";
import { createCredentialStorageContext } from "../../src/credential-store/resolver";
import { resetCredentialStorageState } from "../../src/credential-store/state";
import type { OAuthFlowLogger } from "../../src/context";
import type { CredentialStore } from "../../src/credential-store/interface";
import type { KeyProvider } from "../../src/credential-store/key-providers/interface";
import type { SpawnSyncReturns } from "node:child_process";

function mockResult({
	status = 0,
	stdout = "",
	stderr = "",
}: {
	status?: number | null;
	stdout?: string;
	stderr?: string;
} = {}): SpawnSyncReturns<string> {
	return {
		status,
		stdout,
		stderr,
		signal: null,
		output: [null, stdout, stderr],
		pid: 1,
	} as SpawnSyncReturns<string>;
}

class InMemoryKeyProvider implements KeyProvider {
	private key: Uint8Array | undefined;
	getKey() {
		return this.key;
	}
	setKey(key: Uint8Array) {
		this.key = key;
	}
	deleteKey() {
		this.key = undefined;
	}
	describe() {
		return "in-memory test keyring";
	}
}

const ORIGINAL_PLATFORM = process.platform;
function stubPlatform(platform: NodeJS.Platform): void {
	Object.defineProperty(process, "platform", {
		value: platform,
		configurable: true,
	});
}
function restorePlatform(): void {
	Object.defineProperty(process, "platform", {
		value: ORIGINAL_PLATFORM,
		configurable: true,
	});
}

const warn = vi.fn();
const log = vi.fn();
const silentLogger: OAuthFlowLogger = {
	debug: () => {},
	info: () => {},
	log,
	warn,
	error: () => {},
};

interface StateOptions {
	isKeyringEnabled?: boolean;
	isNonInteractiveOrCI?: boolean;
}

function resolveStore(opts: StateOptions = {}): CredentialStore {
	const { getActiveStore } = createCredentialStorageContext({
		serviceName: "wrangler",
		getConfigPath: () => getGlobalConfigPath(),
		isKeyringEnabled: () => opts.isKeyringEnabled ?? true,
		logger: silentLogger,
		isNonInteractiveOrCI: () => opts.isNonInteractiveOrCI ?? false,
		cliName: "wrangler",
	});
	return getActiveStore();
}

describe("createCredentialStorageContext — resolver", () => {
	runInTempDir();

	beforeEach(() => {
		warn.mockClear();
		log.mockClear();
		resetCredentialStorageState();
	});

	afterEach(() => {
		setKeyProviderFactoryForTesting(undefined);
		setMacSecurityCommandRunner(undefined);
		setLinuxSecretToolRunner(undefined);
		setNpmRunner(undefined);
		resetCredentialStorageState();
		restorePlatform();
	});

	describe("precedence", () => {
		it("defaults to FileCredentialStore when keyring is disabled in preferences", ({
			expect,
		}) => {
			expect(resolveStore({ isKeyringEnabled: false }).kind).toBe("file");
		});

		it("CLOUDFLARE_AUTH_USE_KEYRING=false forces FileCredentialStore", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "false");
			expect(resolveStore({ isKeyringEnabled: true }).kind).toBe("file");
		});

		it("CLOUDFLARE_AUTH_USE_KEYRING=true forces the encrypted store even when the preference is off", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "true");
			setKeyProviderFactoryForTesting(() => new InMemoryKeyProvider());
			expect(resolveStore({ isKeyringEnabled: false }).kind).toBe(
				"encrypted-file"
			);
		});

		it("uses the encrypted store when keyring is enabled and a provider is available", ({
			expect,
		}) => {
			setKeyProviderFactoryForTesting(() => new InMemoryKeyProvider());
			expect(resolveStore({ isKeyringEnabled: true }).kind).toBe(
				"encrypted-file"
			);
		});

		it("CLOUDFLARE_AUTH_USE_KEYRING=true with an unavailable backend throws a UserError", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "true");
			stubPlatform("freebsd" as NodeJS.Platform);

			expect(() => resolveStore({ isKeyringEnabled: true })).toThrow(
				/CLOUDFLARE_AUTH_USE_KEYRING is set but no keyring backend is available on `freebsd`/
			);
		});
	});

	describe("darwin", () => {
		it("returns an encrypted store backed by MacSecurityKeyProvider", ({
			expect,
		}) => {
			stubPlatform("darwin");
			setMacSecurityCommandRunner(() => mockResult({ status: 44 }));

			const store = resolveStore({ isKeyringEnabled: true });
			expect(store.kind).toBe("encrypted-file");
			expect(store.describe()).toContain("macOS Keychain");
		});
	});

	describe("linux", () => {
		it("returns an encrypted store backed by LinuxSecretToolKeyProvider when secret-tool is present", ({
			expect,
		}) => {
			stubPlatform("linux");
			setLinuxSecretToolRunner((args) => {
				if (args[0] === "--version") {
					return mockResult({ stdout: "secret-tool 0.21.7" });
				}
				return mockResult({ status: 1 });
			});

			const store = resolveStore({ isKeyringEnabled: true });
			expect(store.kind).toBe("encrypted-file");
			expect(store.describe()).toContain("secret-tool");
		});

		it("warns and falls back to FileCredentialStore when secret-tool is missing (interactive)", ({
			expect,
		}) => {
			stubPlatform("linux");
			setLinuxSecretToolRunner(() => {
				throw new Error("ENOENT");
			});

			const store = resolveStore({
				isKeyringEnabled: true,
				isNonInteractiveOrCI: false,
			});
			expect(store.kind).toBe("file");
			expect(warn).toHaveBeenCalledWith(expect.stringContaining("secret-tool"));
		});

		it("hard-errors when secret-tool is missing in a non-interactive context", ({
			expect,
		}) => {
			stubPlatform("linux");
			setLinuxSecretToolRunner(() => {
				throw new Error("ENOENT");
			});

			expect(() =>
				resolveStore({ isKeyringEnabled: true, isNonInteractiveOrCI: true })
			).toThrow(/`secret-tool` is required for OS keyring storage on Linux/);
		});

		it("hard-errors with the CLOUDFLARE_AUTH_USE_KEYRING-prefixed message when forced and missing", ({
			expect,
		}) => {
			stubPlatform("linux");
			vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "true");
			setLinuxSecretToolRunner(() => mockResult({ status: 127 }));

			expect(() => resolveStore({ isKeyringEnabled: true })).toThrow(
				/CLOUDFLARE_AUTH_USE_KEYRING is set but `secret-tool` is required/
			);
		});

		it("warns at most once per process about the secret-tool fallback", ({
			expect,
		}) => {
			stubPlatform("linux");
			setLinuxSecretToolRunner(() => {
				throw new Error("ENOENT");
			});

			const { getActiveStore } = createCredentialStorageContext({
				serviceName: "wrangler",
				getConfigPath: () => getGlobalConfigPath(),
				isKeyringEnabled: () => true,
				logger: silentLogger,
				isNonInteractiveOrCI: () => false,
				cliName: "wrangler",
			});
			getActiveStore();
			getActiveStore();
			getActiveStore();
			const matches = warn.mock.calls.filter(
				(call) => typeof call[0] === "string" && call[0].includes("secret-tool")
			);
			expect(matches.length).toBe(1);
		});
	});

	describe("win32", () => {
		it("returns an encrypted store when the binding is already installed", ({
			expect,
		}) => {
			stubPlatform("win32");
			// Seed the lazy install dir so findKeyringBinding() picks it up.
			const bindingDir = path.join(
				getKeyringInstallDir(getGlobalConfigPath()),
				"node_modules",
				"@napi-rs",
				"keyring"
			);
			mkdirSync(bindingDir, { recursive: true });
			writeFileSync(path.join(bindingDir, "index.js"), "module.exports = {};");

			const store = resolveStore({ isKeyringEnabled: true });
			expect(store.kind).toBe("encrypted-file");
			expect(store.describe()).toContain("Windows Credential Manager");
		});

		it("hard-errors when the binding is missing in a non-interactive context", ({
			expect,
		}) => {
			stubPlatform("win32");
			setNpmRunner(() => mockResult({ status: 0, stdout: "/nonexistent\n" }));

			expect(() =>
				resolveStore({ isKeyringEnabled: true, isNonInteractiveOrCI: true })
			).toThrow(
				/`@napi-rs\/keyring` is required for OS keyring storage on Windows/
			);
		});

		it("includes the pinned version in the global-install hint", ({
			expect,
		}) => {
			stubPlatform("win32");
			setNpmRunner(() => mockResult({ status: 0, stdout: "/nowhere\n" }));

			expect(() =>
				resolveStore({ isKeyringEnabled: true, isNonInteractiveOrCI: true })
			).toThrow(/@napi-rs\/keyring@\d+\.\d+\.\d+/);
		});

		it("invokes the lazy installer when interactive and binding is missing", ({
			expect,
		}) => {
			stubPlatform("win32");

			let installCalls = 0;
			setNpmRunner((args) => {
				if (args[0] === "install") {
					installCalls += 1;
					// Seed the install dir as if npm had just run successfully.
					const bindingDir = path.join(
						getKeyringInstallDir(getGlobalConfigPath()),
						"node_modules",
						"@napi-rs",
						"keyring"
					);
					mkdirSync(bindingDir, { recursive: true });
					writeFileSync(
						path.join(bindingDir, "index.js"),
						"module.exports = {};"
					);
					return mockResult({});
				}
				if (args[0] === "root") {
					return mockResult({ status: 0, stdout: "/nowhere\n" });
				}
				return mockResult({ status: 1 });
			});

			const store = resolveStore({
				isKeyringEnabled: true,
				isNonInteractiveOrCI: false,
			});
			expect(store.kind).toBe("encrypted-file");
			expect(installCalls).toBe(1);
		});

		it("memoizes install failures so the install is not retried within the session", ({
			expect,
		}) => {
			stubPlatform("win32");

			let installCalls = 0;
			setNpmRunner((args) => {
				if (args[0] === "install") {
					installCalls += 1;
					return mockResult({ status: 1, stderr: "boom" });
				}
				return mockResult({ status: 0, stdout: "/nowhere\n" });
			});

			const { getActiveStore } = createCredentialStorageContext({
				serviceName: "wrangler",
				getConfigPath: () => getGlobalConfigPath(),
				isKeyringEnabled: () => true,
				logger: silentLogger,
				isNonInteractiveOrCI: () => false,
				cliName: "wrangler",
			});
			expect(getActiveStore().kind).toBe("file");
			expect(getActiveStore().kind).toBe("file");
			expect(getActiveStore().kind).toBe("file");
			expect(installCalls).toBe(1);
		});

		it("hard-errors when CLOUDFLARE_AUTH_USE_KEYRING=true and install fails", ({
			expect,
		}) => {
			stubPlatform("win32");
			vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "true");
			setNpmRunner((args) => {
				if (args[0] === "install") {
					return mockResult({ status: 1, stderr: "boom" });
				}
				return mockResult({ status: 0, stdout: "/nowhere\n" });
			});

			expect(() =>
				resolveStore({ isKeyringEnabled: true, isNonInteractiveOrCI: false })
			).toThrow();
		});
	});

	describe("unsupported platform", () => {
		it("falls back to file with a warning by default", ({ expect }) => {
			stubPlatform("freebsd" as NodeJS.Platform);

			const store = resolveStore({ isKeyringEnabled: true });
			expect(store.kind).toBe("file");
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("not supported on `freebsd`")
			);
		});
	});
});

it("existsSync import is preserved for type-narrow checks", ({ expect }) => {
	// Sanity test to keep linters from removing the import in the future.
	expect(typeof existsSync).toBe("function");
});
