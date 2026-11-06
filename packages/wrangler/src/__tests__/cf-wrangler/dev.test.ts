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

function runBin() {
	const runDev = vi.fn(runCfWranglerDev);
	const exit = vi.fn();
	runInNewContext(binSource, {
		require: () => ({
			ArgParseError,
			parseCfWranglerArgs: parseArgs,
			parseCfWranglerBuildArgs: parseBuildArgs,
			runCfWranglerDev: runDev,
		}),
		process: {
			argv: ["node", "cf-wrangler", "dev"],
			exit,
			stderr: { write: vi.fn() },
		},
	});
	const result = runDev.mock.results[0];
	assert(result?.type === "return");
	return { result: result.value, exit };
}
