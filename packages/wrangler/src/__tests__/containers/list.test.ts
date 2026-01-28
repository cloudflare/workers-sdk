import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_APPLICATIONS } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("containers list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("containers list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers list

			List containers [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should list containers (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/applications",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return HttpResponse.json(
						`{"success": true, "result": ${JSON.stringify(MOCK_APPLICATIONS, null, 4)}}`
					);
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("containers list");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        \\"id\\": \\"asdf-2\\",
			        \\"created_at\\": \\"123\\",
			        \\"account_id\\": \\"test-account\\",
			        \\"name\\": \\"Test-app\\",
			        \\"version\\": 1,
			        \\"configuration\\": {
			            \\"image\\": \\"test-registry.cfdata.org/test-app:v1\\",
			            \\"network\\": {
			                \\"mode\\": \\"private\\"
			            }
			        },
			        \\"scheduling_policy\\": \\"regional\\",
			        \\"instances\\": 2,
			        \\"jobs\\": false,
			        \\"constraints\\": {
			            \\"region\\": \\"WNAM\\"
			        }
			    },
			    {
			        \\"id\\": \\"asdf-1\\",
			        \\"created_at\\": \\"123\\",
			        \\"account_id\\": \\"test-account\\",
			        \\"name\\": \\"Test-app\\",
			        \\"version\\": 1,
			        \\"configuration\\": {
			            \\"image\\": \\"test-registry.cfdata.org/test-app:v10\\",
			            \\"network\\": {
			                \\"mode\\": \\"private\\"
			            }
			        },
			        \\"scheduling_policy\\": \\"regional\\",
			        \\"instances\\": 10,
			        \\"jobs\\": false,
			        \\"constraints\\": {
			            \\"region\\": \\"WNAM\\"
			        }
			    },
			    {
			        \\"id\\": \\"asdf-3\\",
			        \\"created_at\\": \\"123\\",
			        \\"account_id\\": \\"test-account\\",
			        \\"name\\": \\"Test-app\\",
			        \\"version\\": 1,
			        \\"configuration\\": {
			            \\"image\\": \\"test-registry.cfdata.org/test-app:v2\\",
			            \\"network\\": {
			                \\"mode\\": \\"private\\"
			            }
			        },
			        \\"scheduling_policy\\": \\"regional\\",
			        \\"instances\\": 2,
			        \\"jobs\\": false,
			        \\"constraints\\": {
			            \\"region\\": \\"WNAM\\"
			        }
			    }
			]"
		`);
	});
});
