import fs from "node:fs";
import { thrownIsDoesNotExistError } from "@cloudflare/workers-shared";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
/* eslint-disable workers-sdk/no-vitest-import-expect -- complex deployment logic */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import {
	msw,
	mswListNewDeployments,
	mswSuccessDeploymentDetails,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptMetadata,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// This is testing the old deployments behaviour, which is now deprecated
// and replaced by the versions one - see the new tests in versions/deployments/...
describe("deployments", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	runInTempDir();
	afterAll(() => {
		clearDialogs();
	});

	beforeEach(() => {
		msw.use(
			mswListNewDeployments,
			...mswSuccessDeployments,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers,
			...mswSuccessDeploymentScriptMetadata,
			...mswSuccessDeploymentDetails
		);
	});
	afterEach(() => {
		try {
			fs.unlinkSync("wrangler.toml");
		} catch (e) {
			if (!thrownIsDoesNotExistError(e)) {
				throw e;
			}
		}
	});

	it("should log a help message for deployments command", async () => {
		await runWrangler("deployments --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler deployments

			🚢 List and view the current and past deployments for your Worker

			COMMANDS
			  wrangler deployments list    Displays the 10 most recent deployments of your Worker
			  wrangler deployments status  View the current state of your production

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	describe("deployments subcommands", () => {
		describe("deployment view", () => {
			it("should error with no flag", async () => {
				writeWranglerConfig();

				await expect(
					runWrangler("deployments view 1701-E")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: \`wrangler deployments view <deployment-id>\` has been renamed \`wrangler versions view [version-id]\`. Please use that command instead.]`
				);
			});
		});
	});
});
