import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount } from "./utils";

describe("cloudchamber delete", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber delete --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber delete [deploymentId]

			Delete an existing deployment that is running in the Cloudflare edge [alpha]

			POSITIONALS
			  deploymentId  Deployment you want to delete  [string]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should delete deployment (detects no interactivity)", async () => {
		setIsTTY(false);
		msw.use(
			http.delete(
				"*/deployments/1234/v2",
				async () => {
					return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
				},
				{ once: true }
			)
		);
		await runWrangler("cloudchamber delete 1234");
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(
			`
			"{
			    \\"id\\": \\"1\\",
			    \\"type\\": \\"default\\",
			    \\"created_at\\": \\"123\\",
			    \\"account_id\\": \\"123\\",
			    \\"vcpu\\": 4,
			    \\"memory\\": \\"400MB\\",
			    \\"memory_mib\\": 400,
			    \\"version\\": 1,
			    \\"image\\": \\"hello\\",
			    \\"location\\": {
			        \\"name\\": \\"sfo06\\",
			        \\"enabled\\": true
			    },
			    \\"network\\": {
			        \\"mode\\": \\"public\\",
			        \\"ipv4\\": \\"1.1.1.1\\"
			    },
			    \\"placements_ref\\": \\"http://ref\\",
			    \\"node_group\\": \\"metal\\"
			}"
		`
		);
	});

	it("can't modify delete due to lack of fields", async () => {
		setIsTTY(false);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await expect(
			runWrangler("cloudchamber delete")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: there needs to be a deploymentId when you can't interact with the wrangler cli]`
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
	});
});
