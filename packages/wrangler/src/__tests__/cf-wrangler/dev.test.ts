import assert from "node:assert";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import {
	createCfProfileStore,
	writeAuthConfigFile,
} from "@cloudflare/workers-auth/cf";
import { writeAuthConfigFile as writeWranglerAuthConfigFile } from "@cloudflare/workers-auth/wrangler";
import { UserError } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	ArgParseError,
	parseArgs,
	parseBuildArgs,
} from "../../cf-wrangler/args";
import { runCfWranglerDev } from "../../cf-wrangler/dev";
import { logger } from "../../logger";
import { getActiveProfile, readAuthCredentials, setProfile } from "../../user";
import { mockConsoleMethods } from "../helpers/mock-console";

const mocks = vi.hoisted(() => ({ startDev: vi.fn() }));

vi.mock("../../dev/start-dev", () => ({ startDev: mocks.startDev }));

const binSource = readFileSync(
	path.resolve(import.meta.dirname, "../../../bin/cf-wrangler.js"),
	"utf8"
);

describe("cf-wrangler dev", () => {
	runInTempDir();
	mockConsoleMethods();

	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", undefined);
		writeWranglerAuthConfigFile(
			{ oauth_token: "personal-wrangler-token" },
			"personal"
		);
		setProfile("personal");
		for (const profile of ["personal", "work", "default"]) {
			writeAuthConfigFile({ oauth_token: `${profile}-cf-token` }, profile);
		}
		createCfProfileStore({ logger }).bindings.activate(
			"personal",
			process.cwd()
		);
	});

	it.for([
		{ envProfile: "work", profile: "work" },
		{ envProfile: "default", profile: "default" },
		{ envProfile: undefined, profile: "personal" },
	])(
		"should use cf profile $profile with CLOUDFLARE_AUTH_PROFILE=$envProfile",
		async ({ envProfile, profile }, { expect }) => {
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", envProfile);
			const devEnv = new EventEmitter();
			mocks.startDev.mockImplementation(async () => {
				expect(getActiveProfile()).toBe(profile);
				expect(readAuthCredentials()?.oauth_token).toBe(`${profile}-cf-token`);
				return { devEnv, secondary: [] };
			});
			const { result, exit } = runBin();
			await vi.waitFor(() => expect(devEnv.listenerCount("teardown")).toBe(1));
			expect(getActiveProfile()).toBe("personal");
			expect(readAuthCredentials()?.oauth_token).toBe(
				"personal-wrangler-token"
			);
			devEnv.emit("teardown");

			await expect(result).resolves.toBe(0);
			expect(exit).toHaveBeenCalledWith(0);
			expect(getActiveProfile()).toBe("personal");
			expect(readAuthCredentials()?.oauth_token).toBe(
				"personal-wrangler-token"
			);
		}
	);

	it.for([
		["--inspector-port", "9229", "--port", "0", "--mode", "001", "--local"],
		["--inspector-port=9229", "--port=0", "--mode=001", "--local"],
	])(
		"passes forwarded options from the binary to startDev: %j",
		async (argv, { expect }) => {
			const devEnv = new EventEmitter();
			const teardownSecondary = vi.fn();
			const unregisterHotKeys = vi.fn();
			mocks.startDev.mockResolvedValue({
				devEnv,
				secondary: [{ teardown: teardownSecondary }],
				unregisterHotKeys,
			});
			const { result, exit } = runBin([
				...argv,
				"--ip",
				"0.0.0.0",
				"--inspector-ip=127.0.0.1",
				"--var",
				"ID:000123",
				"--var=TEXT:hello world",
				"--define",
				'TEXT:"a=b c"',
				"--tsconfig",
				"path with spaces/tsconfig.json",
				"--assets=public assets",
				"--persist-to",
				"custom state",
				"--no-live-reload",
				"--test-scheduled",
				"--local-protocol=https",
				"--https-key-path",
				"certs/my key.pem",
				"--https-cert-path=certs/my cert.pem",
			]);
			await vi.waitFor(() => expect(devEnv.listenerCount("teardown")).toBe(1));
			expect(mocks.startDev).toHaveBeenCalledWith(
				expect.objectContaining({
					inspectorPort: 9229,
					port: 0,
					env: "001",
					local: true,
					remote: false,
					experimentalNewConfig: true,
					experimentalAutoCreate: false,
					ip: "0.0.0.0",
					inspectorIp: "127.0.0.1",
					var: ["ID:000123", "TEXT:hello world"],
					define: ['TEXT:"a=b c"'],
					tsconfig: "path with spaces/tsconfig.json",
					assets: "public assets",
					persistTo: "custom state",
					liveReload: false,
					testScheduled: true,
					localProtocol: "https",
					httpsKeyPath: "certs/my key.pem",
					httpsCertPath: "certs/my cert.pem",
				})
			);
			devEnv.emit("teardown");
			await expect(result).resolves.toBe(0);
			await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
			expect(teardownSecondary).toHaveBeenCalledOnce();
			expect(unregisterHotKeys).toHaveBeenCalledOnce();
		}
	);

	it.for([
		{
			options: { nodeCompat: true },
			message: "--node-compat flag is no longer supported",
		},
		{
			options: { tunnelName: "named", tunnelAllowedMail: ["user@example.com"] },
			message: "cannot be used with --tunnel-name",
		},
		{
			options: { liveReload: true, remote: true },
			message: "--live-reload is only supported in local mode",
		},
		{
			options: { tunnel: true, remote: true },
			message: "--tunnel cannot be used with --remote",
		},
	])(
		"validates direct runner calls before starting the runtime: $options",
		async ({ options, message }, { expect }) => {
			mocks.startDev.mockRejectedValue(new Error("Unexpected runtime startup"));
			const result = runCfWranglerDev({ ...parseArgs([]), ...options });
			await expect(result).rejects.toThrow(UserError);
			await expect(result).rejects.toThrow(message);
			expect(mocks.startDev).not.toHaveBeenCalled();
		}
	);

	it("should preserve Wrangler authentication when startup fails", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");
		const error = new Error("Dev startup failed");
		mocks.startDev.mockImplementation(async () => {
			expect(getActiveProfile()).toBe("work");
			expect(readAuthCredentials()?.oauth_token).toBe("work-cf-token");
			throw error;
		});

		const { result } = runBin();
		await expect(result).rejects.toBe(error);
		expect(getActiveProfile()).toBe("personal");
		expect(readAuthCredentials()?.oauth_token).toBe("personal-wrangler-token");
	});
});

describe("cf-wrangler binary dispatch", () => {
	it.for([
		{
			argv: ["--node-compat"],
			message: "--node-compat flag is no longer supported",
		},
		{
			argv: [
				"--tunnel-name",
				"named",
				"--tunnel-allowed-mail",
				"user@example.com",
			],
			message: "cannot be used with --tunnel-name",
		},
		{
			argv: ["--tunnel-name=named", "--tunnel-allowed-mail=user@example.com"],
			message: "cannot be used with --tunnel-name",
		},
	])(
		"reports usage errors without a stack trace: $argv",
		({ argv, message }, { expect }) => {
			const runDev = vi.fn(runCfWranglerDev);
			const { exit, stderr } = invokeBin(["dev", ...argv], runDev);
			expect(exit).toHaveBeenCalledExactlyOnceWith(2);
			expect(stderr).toHaveBeenCalledExactlyOnceWith(
				expect.stringContaining(message)
			);
			expect(stderr.mock.calls[0]?.[0]).toMatch(/^Error: [^\n]+\n$/);
			expect(runDev).not.toHaveBeenCalled();
			expect(mocks.startDev).not.toHaveBeenCalled();
		}
	);

	it.for([
		["dev", "--inspector-port=65536"],
		["dev", "--inspector-port"],
		["dev", "--unknown-option"],
		["dev", "--local-protocol=ftp"],
		["unknown"],
		[],
	])("reports argument errors with exit code 2: %j", (argv, { expect }) => {
		const runDev = vi.fn(runCfWranglerDev);
		const { exit, stderr } = invokeBin(argv, runDev);
		expect(exit).toHaveBeenCalledExactlyOnceWith(2);
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Error:"));
		expect(runDev).not.toHaveBeenCalled();
	});

	it("reports startup failures with exit code 1", async ({ expect }) => {
		const runDev = vi
			.fn<typeof runCfWranglerDev>()
			.mockRejectedValue(new Error("Startup failed"));
		const { exit, stderr } = invokeBin(["dev"], runDev);
		await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(1));
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Startup failed")
		);
	});
});

function runBin(argv: string[] = []) {
	const runDev = vi.fn(runCfWranglerDev);
	const { exit } = invokeBin(["dev", ...argv], runDev);
	const result = runDev.mock.results[0];
	assert(result?.type === "return");
	return { result: result.value, exit };
}

function invokeBin(argv: string[], runDev: typeof runCfWranglerDev) {
	const earlyExit = new Error("process.exit");
	const exit = vi.fn((code: number) => {
		if (code === 2) {
			throw earlyExit;
		}
	});
	const stderr = vi.fn();
	try {
		runInNewContext(binSource, {
			require: () => ({
				ArgParseError,
				parseCfWranglerArgs: parseArgs,
				parseCfWranglerBuildArgs: parseBuildArgs,
				runCfWranglerDev: runDev,
			}),
			process: {
				argv: ["node", "cf-wrangler", ...argv],
				exit,
				stderr: { write: stderr },
			},
		});
	} catch (error) {
		if (error !== earlyExit) {
			throw error;
		}
	}
	return { exit, stderr };
}
