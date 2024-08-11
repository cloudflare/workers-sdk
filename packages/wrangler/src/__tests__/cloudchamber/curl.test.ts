import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber curl", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	runInTempDir();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber curl --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber curl <path>

			perform curl in wrangler

			POSITIONALS
			  path  [string] [required] [default: \\"/\\"]

			GLOBAL FLAGS
			  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			OPTIONS
			      --json                Return output as clean JSON  [boolean] [default: false]
			  -H, --header              Add headers in the form of --header <name>:<value>  [array]
			  -D, --data                Add a JSON body to the request  [string]
			  -X, --method  [string] [default: \\"GET\\"]
			  -s, --silent              Only output response  [boolean]
			  -v, --verbose             Show version number  [boolean]
			      --use-stdin, --stdin  Equivalent of using --data-binary @- in curl  [boolean]"
		`);
	});

	it("should be able to use data flag", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post("*/deployments/v2", async ({ request }) => {
				expect(await request.text()).toMatchInlineSnapshot(
					`"{\\"image\\":\\"hello:world\\",\\"location\\":\\"sfo06\\",\\"ssh_public_key_ids\\":[],\\"environment_variables\\":[{\\"name\\":\\"HELLO\\",\\"value\\":\\"WORLD\\"},{\\"name\\":\\"YOU\\",\\"value\\":\\"CONQUERED\\"}],\\"vcpu\\":3,\\"memory\\":\\"400GB\\",\\"network\\":{\\"assign_ipv4\\":\\"predefined\\"}}"`
				);
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
			})
		);

		await runWrangler(
			`cloudchamber curl /deployments/v2 --json -X POST -D "{\\"image\\":\\"hello:world\\",\\"location\\":\\"sfo06\\",\\"ssh_public_key_ids\\":[],\\"environment_variables\\":[{\\"name\\":\\"HELLO\\",\\"value\\":\\"WORLD\\"},{\\"name\\":\\"YOU\\",\\"value\\":\\"CONQUERED\\"}],\\"vcpu\\":3,\\"memory\\":\\"400GB\\",\\"network\\":{\\"assign_ipv4\\":\\"predefined\\"}}"`
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"{
			    \\"id\\": \\"1\\",
			    \\"type\\": \\"default\\",
			    \\"created_at\\": \\"123\\",
			    \\"account_id\\": \\"123\\",
			    \\"vcpu\\": 4,
			    \\"memory\\": \\"400MB\\",
			    \\"version\\": 1,
			    \\"image\\": \\"hello\\",
			    \\"location\\": {
			        \\"name\\": \\"sfo06\\",
			        \\"enabled\\": true
			    },
			    \\"network\\": {
			        \\"ipv4\\": \\"1.1.1.1\\"
			    },
			    \\"placements_ref\\": \\"http://ref\\",
			    \\"node_group\\": \\"metal\\"
			}"
		`);
	});

	it("should set headers", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get("*/test", async ({ request }) => {
				expect(request.headers.get("something")).toEqual("here");
				expect(request.headers.get("other")).toEqual("thing");
				return HttpResponse.json(`{}`);
			})
		);
		await runWrangler(
			"cloudchamber curl /test --json --header something:here --header other:thing"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`"\\"{}\\""`);
	});
});
