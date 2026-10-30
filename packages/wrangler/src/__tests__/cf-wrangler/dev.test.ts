import assert from "node:assert";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import {
	createCfProfileStore,
	writeAuthConfigFile,
} from "@cloudflare/workers-auth/cf";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	ArgParseError,
	parseArgs,
	parseBuildArgs,
} from "../../cf-wrangler/args";
import { runCfWranglerDev } from "../../cf-wrangler/dev";
import { logger } from "../../logger";
import { getActiveProfile, readAuthCredentials } from "../../user";
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
		for (const profile of ["personal", "work", "default"]) {
			writeAuthConfigFile({ oauth_token: `${profile}-cf-token` }, profile);
		}
		createCfProfileStore({ logger }).bindings.activate(
			"personal",
			process.cwd()
		);
	});

	it.for([
		{ argv: ["--profile", "work"], profile: "work" },
		{ argv: ["--profile=work"], profile: "work" },
		{ argv: ["--profile", "default"], profile: "default" },
		{ argv: [], profile: "personal" },
	])(
		"uses cf profile $profile for $argv",
		async ({ argv, profile }, { expect }) => {
			const devEnv = new EventEmitter();
			mocks.startDev.mockImplementation(async () => {
				expect(getActiveProfile()).toBe(profile);
				expect(readAuthCredentials()?.oauth_token).toBe(`${profile}-cf-token`);
				return { devEnv, secondary: [] };
			});
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
					argv: ["node", "cf-wrangler", "dev", ...argv],
					exit,
					stderr: { write: vi.fn() },
				},
			});
			const result = runDev.mock.results[0];
			assert(result?.type === "return");
			await vi.waitFor(() => expect(devEnv.listenerCount("teardown")).toBe(1));
			devEnv.emit("teardown");

			await expect(result.value).resolves.toBe(0);
			expect(exit).toHaveBeenCalledWith(0);
		}
	);
});
