import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("containers delete", () => {
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
		await runWrangler("containers delete --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers delete [ID]

			delete a container

			POSITIONALS
			  ID  id of the containers to delete  [string]

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			      --cwd      Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --json  Return output as clean JSON  [boolean] [default: false]"
		`);
	});

	it("should delete container (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/:id",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return new HttpResponse("{}");
				},
				{ once: true }
			)
		);
		await runWrangler("containers delete --json asdf");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`"\\"{}\\""`);
	});

	it("should error when trying to delete a non-existant container (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/applications/*",
				async ({ request }) => {
					expect(await request.text()).toEqual("");
					return new HttpResponse(JSON.stringify({ error: "Not Found" }), {
						status: 404,
					});
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler("containers delete --json nope");
		expect(std.out).toMatchInlineSnapshot(
			`"\\"{/\\"error/\\":/\\"Not Found/\\"}\\""`
		);
	});
});
