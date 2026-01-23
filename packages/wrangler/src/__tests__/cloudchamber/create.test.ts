import * as fs from "node:fs";
import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import * as TOML from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DEPLOYMENTS_COMPLEX } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";
import type { SSHPublicKeyItem } from "@cloudflare/containers-shared";

function mockDeploymentPost() {
	msw.use(
		http.post(
			"*/deployments/v2",
			async ({ request }) => {
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
					memory_mib: 409600,
					network: {
						assign_ipv4: "predefined",
					},
				});
				return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
			},
			{ once: true }
		)
	);
}

function mockGetKey() {
	msw.use(
		http.get(
			"*/ssh-public-keys",
			async () => {
				const keys = [
					{ id: "1", name: "hello", public_key: "hello-world" },
				] as SSHPublicKeyItem[];
				return HttpResponse.json(keys);
			},
			{ once: true }
		)
	);
}

describe("cloudchamber create", () => {
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
		await runWrangler("cloudchamber create --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber create

			Create a new deployment [alpha]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --image          Image to use for your deployment  [string]
			      --location       Location on Cloudflare's network where your deployment will run  [string]
			      --var            Container environment variables  [array]
			      --label          Deployment labels  [array]
			      --all-ssh-keys   To add all SSH keys configured on your account to be added to this deployment, set this option to true  [boolean]
			      --ssh-key-id     ID of the SSH key to add to the deployment  [array]
			      --instance-type  Instance type to allocate to this deployment  [choices: \\"lite\\", \\"basic\\", \\"standard-1\\", \\"standard-2\\", \\"standard-3\\", \\"standard-4\\"]
			      --vcpu           Number of vCPUs to allocate to this deployment.  [number]
			      --memory         Amount of memory (GiB, MiB...) to allocate to this deployment. Ex: 4GiB.  [string]
			      --ipv4           Include an IPv4 in the deployment  [boolean]"
		`);
	});

	it("should fail with a nice message when parameters are missing", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("cloudchamber create --image hello:world")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: location is required but it's not passed as an argument]`
		);
	});

	it("should fail with a nice message when image is invalid", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("cloudchamber create --image hello:latest --location sfo06")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: "latest" tag is not allowed]`
		);

		await expect(
			runWrangler("cloudchamber create --image hello --location sfo06")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST]`
		);
	});

	it("should fail with a nice message when parameters are mistyped", async () => {
		setIsTTY(false);
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				name: "my-container",
				cloudchamber: { image: true },
			}),

			"utf-8"
		);
		await expect(
			runWrangler("cloudchamber create ")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			` [Error: Processing wrangler.toml configuration:
  - "cloudchamber" bindings should, optionally, have a string "image" field but got {"image":true}.]`
		);
	});

	it("should fail with a nice message when instance type is invalid", async () => {
		setIsTTY(false);
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				name: "my-container",
				cloudchamber: {
					image: "hello:world",
					location: "sfo06",
					instance_type: "invalid",
				},
			}),

			"utf-8"
		);
		await expect(
			runWrangler("cloudchamber create ")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Processing wrangler.toml configuration:
  - "instance_type" should be one of 'lite', 'basic', 'standard-1', 'standard-2', 'standard-3', or 'standard-4', but got invalid]`
		);
	});

	it("should fail with a nice message when instance type is set with vcpu", async () => {
		setIsTTY(false);
		fs.writeFileSync(
			"./wrangler.toml",
			TOML.stringify({
				name: "my-container",
				cloudchamber: {
					image: "hello:world",
					location: "sfo06",
					vcpu: 2,
					instance_type: "lite",
				},
			}),

			"utf-8"
		);
		await expect(
			runWrangler("cloudchamber create ")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			` [Error: Processing wrangler.toml configuration:
  - "cloudchamber" configuration should not set either "memory" or "vcpu" with "instance_type"]`
		);
	});

	it("should create deployment (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		mockGetKey();
		mockDeploymentPost();
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler(
			"cloudchamber create --image hello:world --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --vcpu 3 --memory 400GB --ipv4 true"
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
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
			}"
		`);
	});

	it("should create deployment with instance type (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		mockGetKey();
		msw.use(
			http.post(
				"*/deployments/v2",
				async ({ request }) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const r = (await request.json()) as Record<string, any>;
					expect(r.instance_type).toEqual("lite");
					return HttpResponse.json({});
				},
				{ once: true }
			)
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		await runWrangler(
			"cloudchamber create --image hello:world --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --instance-type lite --ipv4 true"
		);
		expect(std.out).toMatchInlineSnapshot(`"{}"`);
	});

	it("properly reads wrangler config", async () => {
		// This is very similar to the previous tests except config
		// is set in wrangler and not overridden by the CLI
		setIsTTY(false);
		setWranglerConfig({
			image: "hello:world",
			ipv4: true,
			vcpu: 3,
			memory: "400GiB",
			location: "sfo06",
		});
		// if values are not read by wrangler, this mock won't work
		// since the wrangler command wont get the right parameters
		mockGetKey();
		mockDeploymentPost();
		await runWrangler(
			"cloudchamber create --var HELLO:WORLD --var YOU:CONQUERED"
		);
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
			}"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("properly reads wrangler config for instance type", async () => {
		// This is very similar to the previous tests except config
		// is set in wrangler and not overridden by the CLI
		setIsTTY(false);
		setWranglerConfig({
			image: "hello:world",
			ipv4: true,
			instance_type: "lite",
			location: "sfo06",
		});
		// if values are not read by wrangler, this mock won't work
		// since the wrangler command wont get the right parameters
		mockGetKey();
		msw.use(
			http.post(
				"*/deployments/v2",
				async ({ request }) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const r = (await request.json()) as Record<string, any>;
					expect(r.instance_type).toEqual("lite");
					return HttpResponse.json({});
				},
				{ once: true }
			)
		);
		await runWrangler(
			"cloudchamber create --var HELLO:WORLD --var YOU:CONQUERED"
		);
		expect(std.out).toMatchInlineSnapshot(`"{}"`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should create deployment indicating ssh keys (detects no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({
			vcpu: 40,
			memory: "300MB",
		});
		mockGetKey();
		msw.use(
			http.post(
				"*/deployments/v2",
				async ({ request }) => {
					expect(await request.json()).toEqual({
						image: "hello:world",
						location: "sfo06",
						ssh_public_key_ids: ["1"],
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
						vcpu: 40,
						memory_mib: 300,
						network: {
							assign_ipv4: "predefined",
						},
					});
					return HttpResponse.json(MOCK_DEPLOYMENTS_COMPLEX[0]);
				},
				{ once: true }
			)
		);
		await runWrangler(
			"cloudchamber create --image hello:world --location sfo06 --var HELLO:WORLD --var YOU:CONQUERED --all-ssh-keys --ipv4"
		);
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
			}"
		`);
	});

	it("can't create deployment due to lack of fields (json)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		expect(std.err).toMatchInlineSnapshot(`""`);
		await expect(
			runWrangler("cloudchamber create")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: image is required but it's not passed as an argument]`
		);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
	});
});
