import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber curl", () => {
	const std = collectCLIOutput();
	const helpStd = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	runInTempDir();
	const baseRequestUrl: string =
		"https://api.cloudflare.com/client/v4/accounts/some-account-id/cloudchamber/";
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber curl --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(helpStd.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber curl <path>

			Send a request to an arbitrary Cloudchamber endpoint [alpha]

			POSITIONALS
			  path  [string] [required] [default: \\"/\\"]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			  -H, --header              Add headers in the form of --header <name>:<value>  [array]
			  -d, --data                Add a JSON body to the request  [string]
			  -X, --method  [string] [default: \\"GET\\"]
			  -s, --silent              Only output response  [boolean]
			  -v, --verbose             Show version number  [boolean]
			      --use-stdin, --stdin  Equivalent of using --data-binary @- in curl  [boolean]"
		`);
	});

	it("can send data with -d/--data", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post("*/deployments/v2", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "deployments/v2");
				// and that the request has the expected content
				expect(await request.json()).toEqual({
					image: "hello:world",
					location: "sfo06",
					ssh_public_key_ids: [],
					environment_variables: [
						{
							name: "HELLO",
							value: "WORLD",
						},
						{
							name: "YOU",
							value: "CONQUERED",
						},
					],
					vcpu: 3,
					memory_mib: 400,
					network: {
						assign_ipv4: "predefined",
					},
				});
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
			})
		);

		// We need to stringify this for cross-platform compatibility
		const deployment = JSON.stringify({
			image: "hello:world",
			location: "sfo06",
			ssh_public_key_ids: [],
			environment_variables: [
				{ name: "HELLO", value: "WORLD" },
				{ name: "YOU", value: "CONQUERED" },
			],
			vcpu: 3,
			memory_mib: 400,
			network: { assign_ipv4: "predefined" },
		});

		await runWrangler(
			"cloudchamber curl /deployments/v2 -X POST -d '" + deployment + "'"
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
			}
			"
		`);
	});

	it("supports deprecated -D flag", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post("*/deployments/v2", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "deployments/v2");
				// and that the request has the expected content
				expect(await request.json()).toEqual({
					image: "hello:world",
					location: "sfo06",
					ssh_public_key_ids: [],
					environment_variables: [
						{
							name: "HELLO",
							value: "WORLD",
						},
						{
							name: "YOU",
							value: "CONQUERED",
						},
					],
					vcpu: 3,
					memory_mib: 400,
					network: {
						assign_ipv4: "predefined",
					},
				});
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
			})
		);

		// We need to stringify this for cross-platform compatibility
		const deployment = JSON.stringify({
			image: "hello:world",
			location: "sfo06",
			ssh_public_key_ids: [],
			environment_variables: [
				{ name: "HELLO", value: "WORLD" },
				{ name: "YOU", value: "CONQUERED" },
			],
			vcpu: 3,
			memory_mib: 400,
			network: { assign_ipv4: "predefined" },
		});

		await runWrangler(
			"cloudchamber curl /deployments/v2 -X POST -D '" + deployment + "'"
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
			}
			"
		`);
	});

	it("should set headers", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get("*/test", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "test");
				// and that we set the expected headers
				expect(request.headers.get("something")).toEqual("here");
				expect(request.headers.get("other")).toEqual("thing");
				return HttpResponse.json(`{}`);
			})
		);
		await runWrangler(
			"cloudchamber curl /test --header something:here --header other:thing"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"\\"{}\\"
			"
		`);
	});

	it("works", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get("*/deployments/v2", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "deployments/v2");
				// and that the request has the expected content
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX);
			})
		);

		await runWrangler(
			"cloudchamber curl /deployments/v2 --header something:here"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(JSON.parse(std.out)).toEqual([
			{
				id: "1",
				type: "default",
				created_at: "123",
				account_id: "123",
				vcpu: 4,
				memory: "400MB",
				memory_mib: 400,
				version: 1,
				image: "hello",
				location: {
					name: "sfo06",
					enabled: true,
				},
				network: {
					mode: "public",
					ipv4: "1.1.1.1",
				},
				placements_ref: "http://ref",
				node_group: "metal",
			},
			{
				id: "2",
				type: "default",
				created_at: "1234",
				account_id: "123",
				vcpu: 4,
				memory: "400MB",
				memory_mib: 400,
				version: 2,
				image: "hello",
				location: {
					name: "sfo06",
					enabled: true,
				},
				network: {
					mode: "public",
					ipv4: "1.1.1.2",
				},
				current_placement: {
					deployment_version: 2,
					status: {
						health: "running",
					},
					deployment_id: "2",
					terminate: false,
					created_at: "123",
					id: "1",
				},
				placements_ref: "http://ref",
				node_group: "metal",
			},
			{
				id: "3",
				type: "default",
				created_at: "123",
				account_id: "123",
				vcpu: 4,
				memory: "400MB",
				memory_mib: 400,
				version: 1,
				image: "hello",
				location: {
					name: "sfo06",
					enabled: true,
				},
				network: {
					mode: "public",
					ipv4: "1.1.1.1",
				},
				placements_ref: "http://ref",
				node_group: "metal",
			},
			{
				id: "4",
				type: "default",
				created_at: "1234",
				account_id: "123",
				vcpu: 4,
				memory: "400MB",
				memory_mib: 400,
				version: 2,
				image: "hello",
				location: {
					name: "sfo06",
					enabled: true,
				},
				network: {
					mode: "public",
					ipv4: "1.1.1.2",
				},
				current_placement: {
					deployment_version: 2,
					status: {
						health: "running",
					},
					deployment_id: "2",
					terminate: false,
					created_at: "123",
					id: "1",
				},
				placements_ref: "http://ref",
				node_group: "metal",
			},
		]);
	});

	it("should give a response with headers and request-id when verbose flag is set", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get("*/deployments/v2", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "deployments/v2");
				// and that the request has the expected content
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX);
			})
		);

		await runWrangler(
			"cloudchamber curl -v /deployments/v2 --header something:here"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		const text = std.out;
		// verify we have all the parts of the expected response
		expect(text).toContain("Headers");
		expect(text).toContain("Body");
		expect(text).toContain("coordinator-request-id");
	});

	it("includes headers and request-id in JSON when used with --silent and --verbose", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get("*/deployments/v2", async ({ request }) => {
				// verify we are hitting the expected url
				expect(request.url).toEqual(baseRequestUrl + "deployments/v2");
				// and that the request has the expected content
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX);
			})
		);

		await runWrangler(
			"cloudchamber curl -v /deployments/v2 --silent --header something:here"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		const response = JSON.parse(std.out);
		expect(response.headers).toHaveProperty("coordinator-request-id");
		expect(response.headers).toHaveProperty("something");
		expect(response.request_id.length).toBeGreaterThan(0);
	});

	it("should catch and report errors", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		await runWrangler(
			"cloudchamber curl /deployments/v2 --header something:here"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		const response = JSON.parse(std.out);
		expect(response.status).toEqual(500);
		expect(response.statusText).toEqual("Unhandled Exception");
	});
});
