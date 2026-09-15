import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	LinuxSecretToolKeyProvider,
	probeSecretTool,
	setLinuxSecretToolRunner,
} from "../../../src/credential-store/key-providers/linux-secret-tool";
import {
	decodeKeyEnvelope,
	encodeKeyEnvelope,
} from "../../../src/credential-store/key-providers/shared";
import type { SpawnSyncReturns } from "node:child_process";

function mockResult({
	status = 0,
	stdout = "",
	stderr = "",
	error,
}: {
	status?: number | null;
	stdout?: string;
	stderr?: string;
	error?: Error;
} = {}): SpawnSyncReturns<string> {
	return {
		status,
		stdout,
		stderr,
		signal: null,
		output: [null, stdout, stderr],
		pid: 1,
		error,
	} as SpawnSyncReturns<string>;
}

/**
 * What `spawnSync` returns when `secret-tool` cannot be spawned at all (for
 * example because it is not on `PATH`): it does not throw, it reports the
 * failure via `error` and leaves `status` as `null`.
 */
function spawnErrorResult(code = "ENOENT"): SpawnSyncReturns<string> {
	return mockResult({
		status: null,
		error: Object.assign(new Error(`spawn secret-tool ${code}`), { code }),
	});
}

const SAMPLE_KEY = new Uint8Array(32).fill(0xab);

describe("LinuxSecretToolKeyProvider", () => {
	let lastInvocation: { args: string[]; input?: string } | undefined;

	beforeEach(() => {
		lastInvocation = undefined;
	});

	afterEach(() => {
		setLinuxSecretToolRunner(undefined);
	});

	describe("probeSecretTool", () => {
		it("returns true when secret-tool --version exits 0", ({ expect }) => {
			setLinuxSecretToolRunner((args) => {
				lastInvocation = { args };
				return mockResult({ stdout: "secret-tool 0.21.7" });
			});
			expect(probeSecretTool()).toBe(true);
			expect(lastInvocation?.args).toEqual(["--version"]);
		});

		it("returns false when the runner throws (no such file)", ({ expect }) => {
			setLinuxSecretToolRunner(() => {
				throw new Error("ENOENT");
			});
			expect(probeSecretTool()).toBe(false);
		});

		it("returns true when secret-tool prints its usage and exits 2 (libsecret has no --version flag)", ({
			expect,
		}) => {
			setLinuxSecretToolRunner(() =>
				mockResult({
					status: 2,
					stderr:
						"usage: secret-tool store --label='label' attribute value ...",
				})
			);
			expect(probeSecretTool()).toBe(true);
		});

		it("returns true on any other non-zero exit status, since the process ran", ({
			expect,
		}) => {
			setLinuxSecretToolRunner(() => mockResult({ status: 127 }));
			expect(probeSecretTool()).toBe(true);
		});

		it("returns true when secret-tool was launched but terminated by a signal", ({
			expect,
		}) => {
			setLinuxSecretToolRunner(() => ({
				...mockResult({ status: null }),
				signal: "SIGTERM",
			}));
			expect(probeSecretTool()).toBe(true);
		});

		it("returns false when spawnSync reports ENOENT instead of throwing", ({
			expect,
		}) => {
			setLinuxSecretToolRunner(() => spawnErrorResult());
			expect(probeSecretTool()).toBe(false);
		});

		it("memoizes the result so repeated calls do not re-spawn secret-tool", ({
			expect,
		}) => {
			// Without memoization the resolver's per-credential-op resolution
			// would spawn `secret-tool --version` on every read/write. We
			// probe at most once per process.
			let spawnCount = 0;
			setLinuxSecretToolRunner(() => {
				spawnCount += 1;
				return mockResult({ stdout: "secret-tool 0.21.7" });
			});
			expect(probeSecretTool()).toBe(true);
			expect(probeSecretTool()).toBe(true);
			expect(probeSecretTool()).toBe(true);
			expect(spawnCount).toBe(1);
		});

		it("setLinuxSecretToolRunner invalidates the memoized probe result", ({
			expect,
		}) => {
			// Test seam: swapping the runner mid-suite must re-probe so the
			// new fake's verdict is observable on the next call.
			setLinuxSecretToolRunner(() => mockResult({ status: 0 }));
			expect(probeSecretTool()).toBe(true);

			setLinuxSecretToolRunner(() => spawnErrorResult());
			expect(probeSecretTool()).toBe(false);
		});
	});

	it("getKey invokes lookup with the configured serviceName", ({ expect }) => {
		setLinuxSecretToolRunner((args) => {
			lastInvocation = { args };
			return mockResult({ stdout: encodeKeyEnvelope(SAMPLE_KEY) });
		});
		expect(new LinuxSecretToolKeyProvider("wrangler").getKey()).toEqual(
			SAMPLE_KEY
		);
		expect(lastInvocation?.args).toEqual([
			"lookup",
			"service",
			"wrangler",
			"account",
			"default",
		]);
	});

	it("getKey returns undefined when secret-tool exits 1 (no matching item)", ({
		expect,
	}) => {
		setLinuxSecretToolRunner(() => mockResult({ status: 1 }));
		expect(new LinuxSecretToolKeyProvider("wrangler").getKey()).toBeUndefined();
	});

	it("getKey throws on other non-zero exits", ({ expect }) => {
		setLinuxSecretToolRunner(() =>
			mockResult({ status: 2, stderr: "no D-Bus" })
		);
		expect(() => new LinuxSecretToolKeyProvider("wrangler").getKey()).toThrow(
			/Failed to read key via secret-tool/
		);
	});

	it("setKey passes the envelope via stdin and uses a label", ({ expect }) => {
		setLinuxSecretToolRunner((args, options) => {
			lastInvocation = { args, input: options?.input };
			return mockResult({});
		});
		new LinuxSecretToolKeyProvider("wrangler").setKey(SAMPLE_KEY);
		expect(lastInvocation?.args.slice(0, 1)).toEqual(["store"]);
		expect(lastInvocation?.args).toContain(
			"--label=Cloudflare credentials key"
		);
		expect(lastInvocation?.args).toContain("wrangler");
		expect(lastInvocation?.args).toContain("default");
		expect(lastInvocation?.input).toBeDefined();
		expect(decodeKeyEnvelope(lastInvocation?.input as string)).toEqual(
			SAMPLE_KEY
		);
	});

	it("setKey throws on non-zero exit", ({ expect }) => {
		setLinuxSecretToolRunner(() =>
			mockResult({ status: 1, stderr: "no dbus" })
		);
		expect(() =>
			new LinuxSecretToolKeyProvider("wrangler").setKey(SAMPLE_KEY)
		).toThrow(/Failed to write key via secret-tool/);
	});

	it("deleteKey invokes clear", ({ expect }) => {
		setLinuxSecretToolRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new LinuxSecretToolKeyProvider("wrangler").deleteKey();
		expect(lastInvocation?.args).toEqual([
			"clear",
			"service",
			"wrangler",
			"account",
			"default",
		]);
	});

	it("deleteKey throws on non-zero exit", ({ expect }) => {
		setLinuxSecretToolRunner(() =>
			mockResult({ status: 1, stderr: "no dbus" })
		);
		expect(() =>
			new LinuxSecretToolKeyProvider("wrangler").deleteKey()
		).toThrow(/Failed to delete key via secret-tool/);
	});

	it("uses the configured serviceName", ({ expect }) => {
		setLinuxSecretToolRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new LinuxSecretToolKeyProvider("future-cf-cli").deleteKey();
		expect(lastInvocation?.args).toContain("future-cf-cli");
	});

	it("WRANGLER_API_ENVIRONMENT changes the account name", ({ expect }) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		setLinuxSecretToolRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new LinuxSecretToolKeyProvider("wrangler").setKey(SAMPLE_KEY);
		expect(lastInvocation?.args).toContain("staging");
		expect(lastInvocation?.args).not.toContain("default");
	});

	it("describe() identifies secret-tool with service and account", ({
		expect,
	}) => {
		expect(new LinuxSecretToolKeyProvider("wrangler").describe()).toBe(
			"Linux secret-tool (service=wrangler, account=default)"
		);
	});
});
