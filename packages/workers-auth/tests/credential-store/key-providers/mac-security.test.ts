import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	MacSecurityKeyProvider,
	setMacSecurityCommandRunner,
} from "../../../src/credential-store/key-providers/mac-security";
import {
	decodeKeyEnvelope,
	encodeKeyEnvelope,
} from "../../../src/credential-store/key-providers/shared";
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

const SAMPLE_KEY = new Uint8Array(32).fill(0xab);

describe("MacSecurityKeyProvider", () => {
	let lastInvocation: { args: string[]; input?: string } | undefined;

	beforeEach(() => {
		lastInvocation = undefined;
	});

	afterEach(() => {
		setMacSecurityCommandRunner(undefined);
	});

	it("getKey invokes find-generic-password with the configured serviceName", ({
		expect,
	}) => {
		setMacSecurityCommandRunner((args, options) => {
			lastInvocation = { args, input: options?.input };
			return mockResult({ stdout: encodeKeyEnvelope(SAMPLE_KEY) });
		});
		const provider = new MacSecurityKeyProvider("wrangler");
		expect(provider.getKey()).toEqual(SAMPLE_KEY);
		expect(lastInvocation?.args).toEqual([
			"find-generic-password",
			"-s",
			"wrangler",
			"-a",
			"default",
			"-w",
		]);
	});

	it("getKey returns undefined when security reports item-not-found (exit 44)", ({
		expect,
	}) => {
		setMacSecurityCommandRunner(() =>
			mockResult({
				status: 44,
				stderr: "The specified item could not be found in the keychain.",
			})
		);
		expect(new MacSecurityKeyProvider("wrangler").getKey()).toBeUndefined();
	});

	it("getKey throws on unexpected non-zero exit codes", ({ expect }) => {
		setMacSecurityCommandRunner(() =>
			mockResult({ status: 1, stderr: "boom" })
		);
		expect(() => new MacSecurityKeyProvider("wrangler").getKey()).toThrow(
			/Failed to read key from macOS Keychain \(exit 1\)/
		);
	});

	it("getKey returns undefined when stdout isn't a valid envelope", ({
		expect,
	}) => {
		setMacSecurityCommandRunner(() =>
			mockResult({ stdout: "not a json envelope" })
		);
		expect(new MacSecurityKeyProvider("wrangler").getKey()).toBeUndefined();
	});

	it("setKey invokes add-generic-password with -U (update-if-exists)", ({
		expect,
	}) => {
		setMacSecurityCommandRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new MacSecurityKeyProvider("wrangler").setKey(SAMPLE_KEY);
		expect(lastInvocation?.args.slice(0, 6)).toEqual([
			"add-generic-password",
			"-s",
			"wrangler",
			"-a",
			"default",
			"-w",
		]);
		expect(lastInvocation?.args).toContain("-U");
		// The envelope stored on argv must decode back to the original key.
		const envelopeArg = lastInvocation?.args[6];
		expect(envelopeArg).toBeDefined();
		expect(decodeKeyEnvelope(envelopeArg as string)).toEqual(SAMPLE_KEY);
	});

	it("setKey throws on non-zero exit", ({ expect }) => {
		setMacSecurityCommandRunner(() =>
			mockResult({ status: 1, stderr: "fail" })
		);
		expect(() =>
			new MacSecurityKeyProvider("wrangler").setKey(SAMPLE_KEY)
		).toThrow(/Failed to write key to macOS Keychain/);
	});

	it("deleteKey invokes delete-generic-password", ({ expect }) => {
		setMacSecurityCommandRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new MacSecurityKeyProvider("wrangler").deleteKey();
		expect(lastInvocation?.args).toEqual([
			"delete-generic-password",
			"-s",
			"wrangler",
			"-a",
			"default",
		]);
	});

	it("deleteKey treats item-not-found (exit 44) as success", ({ expect }) => {
		setMacSecurityCommandRunner(() => mockResult({ status: 44 }));
		expect(() =>
			new MacSecurityKeyProvider("wrangler").deleteKey()
		).not.toThrow();
	});

	it("deleteKey throws on unexpected non-zero exit codes", ({ expect }) => {
		setMacSecurityCommandRunner(() =>
			mockResult({ status: 1, stderr: "fail" })
		);
		expect(() => new MacSecurityKeyProvider("wrangler").deleteKey()).toThrow(
			/Failed to delete key from macOS Keychain/
		);
	});

	it("uses the configured serviceName (other consumers won't collide)", ({
		expect,
	}) => {
		setMacSecurityCommandRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new MacSecurityKeyProvider("future-cf-cli").deleteKey();
		expect(lastInvocation?.args).toContain("future-cf-cli");
	});

	it("WRANGLER_API_ENVIRONMENT changes the account name passed to security", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		setMacSecurityCommandRunner((args) => {
			lastInvocation = { args };
			return mockResult({});
		});
		new MacSecurityKeyProvider("wrangler").setKey(SAMPLE_KEY);
		expect(lastInvocation?.args).toContain("staging");
		expect(lastInvocation?.args).not.toContain("default");
	});

	it("describe() identifies macOS Keychain with service and account", ({
		expect,
	}) => {
		expect(new MacSecurityKeyProvider("wrangler").describe()).toBe(
			"macOS Keychain (service=wrangler, account=default)"
		);
	});
});
