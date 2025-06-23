import {
	SchedulingPolicy,
	SecretAccessType,
} from "@cloudflare/containers-shared";
import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import { mockAccount } from "./utils";
import type {
	Application,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
} from "@cloudflare/containers-shared";

function mockGetApplications(applications: Application[]) {
	msw.use(
		http.get(
			"*/applications",
			async () => {
				return HttpResponse.json(applications);
			},
			{ once: true }
		)
	);
}

function mockCreateApplication(expected?: Application) {
	msw.use(
		http.post(
			"*/applications",
			async ({ request }) => {
				const body = await request.json();
				expect(body).toHaveProperty("instances");
				return HttpResponse.json(expected);
			},
			{ once: true }
		)
	);
}

function mockModifyApplication(
	expected?: Application
): Promise<ModifyApplicationRequestBody> {
	let response: (value: ModifyApplicationRequestBody) => void;
	const promise = new Promise<ModifyApplicationRequestBody>((res) => {
		response = res;
	});

	msw.use(
		http.patch(
			"*/applications/:id",
			async ({ request }) => {
				const json = await request.json();
				if (expected !== undefined) {
					expect(json).toEqual(expected);
				}

				expect((json as CreateApplicationRequest).name).toBeUndefined();
				response(json as ModifyApplicationRequestBody);
				return HttpResponse.json(json);
			},
			{ once: true }
		)
	);

	return promise;
}

describe("cloudchamber apply", () => {
	const { setIsTTY } = useMockIsTTY();
	const std = mockCLIOutput();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	test("can apply a simple application", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 3,
					class_name: "DurableObjectClass",
					configuration: {
						image: "./Dockerfile",
					},
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([]);
		mockCreateApplication({ id: "abc" } as Application);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│   [containers.configuration]
			│   image = \\"./Dockerfile\\"
			│
			│   [containers.constraints]
			│   tier = 2
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		/* eslint-enable */
	});

	test("can apply a simple existing application", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 4,
					configuration: {
						image: "./Dockerfile",
					},
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 3,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			│   [containers.constraints]
			│ - tier = 3
			│ + tier = 2
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(2);
		expect(app.instances).toEqual(4);
		/* eslint-enable */
	});

	test("can apply a simple existing application and create other (max_instances)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					max_instances: 3,
					configuration: {
						image: "./Dockerfile",
					},
				},
				{
					name: "my-container-app-2",
					max_instances: 3,
					class_name: "DurableObjectClass2",
					configuration: {
						image: "other-app/Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				max_instances: 3,
				instances: 3,
				created_at: new Date().toString(),
				account_id: "1",
				version: 1,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile2",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		mockCreateApplication({ id: "abc" } as Application);
		await runWrangler("cloudchamber apply --json");
		const body = await res;
		expect(body).not.toHaveProperty("instances");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration]
			│ - image = \\"./Dockerfile2\\"
			│ + image = \\"./Dockerfile\\"
			│
			│   [containers.constraints]
			│   ...
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   max_instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│   [containers.configuration]
			│   image = \\"other-app/Dockerfile\\"
			│
			│   [containers.constraints]
			│   tier = 1
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can skip a simple existing application and create other", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					configuration: {
						image: "./Dockerfile",
					},
					rollout_kind: "none",
				},
				{
					name: "my-container-app-2",
					instances: 1,
					class_name: "DurableObjectClass2",
					configuration: {
						image: "other-app/Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
				account_id: "1",
				version: 1,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		mockCreateApplication({ id: "abc" } as Application);
		await runWrangler("cloudchamber apply --json");

		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│ Skipping application rollout
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   instances = 1
			│   scheduling_policy = \\"default\\"
			│
			│   [containers.configuration]
			│   image = \\"other-app/Dockerfile\\"
			│
			│   [containers.constraints]
			│   tier = 1
			│
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply a simple existing application and create other", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					configuration: {
						image: "./Dockerfile",
					},
				},
				{
					name: "my-container-app-2",
					instances: 1,
					class_name: "DurableObjectClass2",
					configuration: {
						image: "other-app/Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
				account_id: "1",
				version: 1,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		mockCreateApplication({ id: "abc" } as Application);
		await runWrangler("cloudchamber apply --json");
		await res;
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   instances = 1
			│   scheduling_policy = \\"default\\"
			│
			│   [containers.configuration]
			│   image = \\"other-app/Dockerfile\\"
			│
			│   [containers.constraints]
			│   tier = 1
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply a simple existing application (labels)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					configuration: {
						image: "./Dockerfile",
						labels: [
							{
								name: "name",
								value: "value",
							},
							{
								name: "name-1",
								value: "value-1",
							},
							{
								name: "name-2",
								value: "value-2",
							},
						],
						secrets: [
							{
								name: "MY_SECRET",
								type: "env",
								secret: "SECRET_NAME",
							},
							{
								name: "MY_SECRET_2",
								type: "env",
								secret: "SECRET_NAME_2",
							},
						],
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				version: 1,
				created_at: new Date().toString(),
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile",
					labels: [
						{
							name: "name",
							value: "value",
						},
						{
							name: "name-2",
							value: "value-2",
						},
					],
					secrets: [
						{
							name: "MY_SECRET",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME",
						},
						{
							name: "MY_SECRET_1",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_1",
						},
						{
							name: "MY_SECRET_2",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_2",
						},
					],
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		await res;
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			│   [[containers.configuration.labels]]
			│ + name = \\"name-1\\"
			│ + value = \\"value-1\\"
			│
			│ + [[containers.configuration.labels]]
			│   name = \\"name-2\\"
			│
			│   [[containers.configuration.secrets]]
			│ - name = \\"MY_SECRET_1\\"
			│ - secret = \\"SECRET_NAME_1\\"
			│ - type = \\"env\\"
			│
			│ - [[containers.configuration.secrets]]
			│   name = \\"MY_SECRET_2\\"
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply an application, and there is no changes (retrocompatibility with regional scheduling policy)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					class_name: "DurableObjectClass",
					name: "my-container-app",
					instances: 3,
					configuration: {
						image: "./Dockerfile",
						labels: [
							{
								name: "name",
								value: "value",
							},
							{
								name: "name-2",
								value: "value-2",
							},
						],
						secrets: [
							{
								name: "MY_SECRET",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME",
							},
							{
								name: "MY_SECRET_1",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME_1",
							},
							{
								name: "MY_SECRET_2",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME_2",
							},
						],
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				version: 1,
				created_at: new Date().toString(),
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "./Dockerfile",
					labels: [
						{
							name: "name",
							value: "value",
						},
						{
							name: "name-2",
							value: "value-2",
						},
					],
					secrets: [
						{
							name: "MY_SECRET",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME",
						},
						{
							name: "MY_SECRET_1",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_1",
						},
						{
							name: "MY_SECRET_2",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_2",
						},
					],
				},

				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply an application, and there is no changes (two applications)", async () => {
		setIsTTY(false);
		const app = {
			name: "my-container-app",
			instances: 3,
			class_name: "DurableObjectClass",
			configuration: {
				image: "./Dockerfile",
				labels: [
					{
						name: "name",
						value: "value",
					},
					{
						name: "name-2",
						value: "value-2",
					},
				],
				secrets: [
					{
						name: "MY_SECRET",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME",
					},
					{
						name: "MY_SECRET_1",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_1",
					},
					{
						name: "MY_SECRET_2",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_2",
					},
				],
			},
		};
		writeWranglerConfig({
			name: "my-container",
			containers: [app, { ...app, name: "my-container-app-2" }],
		});

		const completeApp = {
			id: "abc",
			name: "my-container-app",
			instances: 3,
			created_at: new Date().toString(),
			class_name: "DurableObjectClass",
			account_id: "1",
			scheduling_policy: SchedulingPolicy.DEFAULT,
			configuration: {
				image: "./Dockerfile",
				labels: [
					{
						name: "name",
						value: "value",
					},
					{
						name: "name-2",
						value: "value-2",
					},
				],
				secrets: [
					{
						name: "MY_SECRET",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME",
					},
					{
						name: "MY_SECRET_1",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_1",
					},
					{
						name: "MY_SECRET_2",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_2",
					},
				],
			},

			constraints: {
				tier: 1,
			},
		};

		mockGetApplications([
			{ ...completeApp, version: 1 },
			{ ...completeApp, version: 1, name: "my-container-app-2", id: "abc2" },
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			├ no changes my-container-app-2
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply an application, and there is no changes", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					class_name: "DurableObjectClass",
					name: "my-container-app",
					instances: 3,
					configuration: {
						image: "./Dockerfile",
						labels: [
							{
								name: "name",
								value: "value",
							},
							{
								name: "name-2",
								value: "value-2",
							},
						],
						secrets: [
							{
								name: "MY_SECRET",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME",
							},
							{
								name: "MY_SECRET_1",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME_1",
							},
							{
								name: "MY_SECRET_2",
								type: SecretAccessType.ENV,
								secret: "SECRET_NAME_2",
							},
						],
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				version: 1,
				created_at: new Date().toString(),
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					labels: [
						{
							name: "name",
							value: "value",
						},
						{
							name: "name-2",
							value: "value-2",
						},
					],
					secrets: [
						{
							name: "MY_SECRET",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME",
						},
						{
							name: "MY_SECRET_1",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_1",
						},
						{
							name: "MY_SECRET_2",
							type: SecretAccessType.ENV,
							secret: "SECRET_NAME_2",
						},
					],
				},

				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply an application, and there is no changes (two applications)", async () => {
		setIsTTY(false);
		const app = {
			name: "my-container-app",
			instances: 3,
			class_name: "DurableObjectClass",
			configuration: {
				image: "./Dockerfile",
				labels: [
					{
						name: "name",
						value: "value",
					},
					{
						name: "name-2",
						value: "value-2",
					},
				],
				secrets: [
					{
						name: "MY_SECRET",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME",
					},
					{
						name: "MY_SECRET_1",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_1",
					},
					{
						name: "MY_SECRET_2",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_2",
					},
				],
			},
		};
		writeWranglerConfig({
			name: "my-container",
			containers: [app, { ...app, name: "my-container-app-2" }],
		});

		const completeApp = {
			id: "abc",
			name: "my-container-app",
			instances: 3,
			created_at: new Date().toString(),
			class_name: "DurableObjectClass",
			account_id: "1",
			scheduling_policy: SchedulingPolicy.REGIONAL,
			configuration: {
				image: "./Dockerfile",
				labels: [
					{
						name: "name",
						value: "value",
					},
					{
						name: "name-2",
						value: "value-2",
					},
				],
				secrets: [
					{
						name: "MY_SECRET",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME",
					},
					{
						name: "MY_SECRET_1",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_1",
					},
					{
						name: "MY_SECRET_2",
						type: SecretAccessType.ENV,
						secret: "SECRET_NAME_2",
					},
				],
			},

			constraints: {
				tier: 1,
			},
		};

		mockGetApplications([
			{ ...completeApp, version: 1 },
			{ ...completeApp, version: 1, name: "my-container-app-2", id: "abc2" },
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			├ no changes my-container-app-2
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can enable observability logs (top-level field)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			observability: { enabled: true },
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration]
			│   image = \\"./Dockerfile\\"
			│
			│ + [containers.configuration.observability.logs]
			│ + enabled = true
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("can enable observability logs (logs field)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			observability: { logs: { enabled: true } },
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration]
			│   image = \\"./Dockerfile\\"
			│
			│ + [containers.configuration.observability.logs]
			│ + enabled = true
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("can disable observability logs (top-level field)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			observability: { enabled: false },
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: true,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("can disable observability logs (logs field)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			observability: { logs: { enabled: false } },
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: true,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("can disable observability logs (absent field)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: true,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("ignores deprecated observability.logging", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: true,
						},
						logging: {
							enabled: true,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│
			│   [containers.constraints]
			│   ...
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
		/* eslint-enable */
	});

	test("keeps observability logs enabled", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			observability: { enabled: true },
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: true,
						},
						logging: {
							enabled: true,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("keeps observability logs disabled (undefined in the app)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("keeps observability logs disabled (false in the app)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					class_name: "DurableObjectClass",
					instances: 1,
					configuration: {
						image: "./Dockerfile",
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 1,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					observability: {
						logs: {
							enabled: false,
						},
						logging: {
							enabled: false,
						},
					},
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply a simple application (instance type)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 3,
					class_name: "DurableObjectClass",
					instance_type: "dev",
					configuration: {
						image: "./Dockerfile",
					},
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([]);
		mockCreateApplication({ id: "abc" } as Application);
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│   [containers.configuration]
			│   image = \\"./Dockerfile\\"
			│   instance_type = \\"dev\\"
			│
			│   [containers.constraints]
			│   tier = 2
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply a simple existing application (instance type)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					instance_type: "standard",
					configuration: {
						image: "./Dockerfile",
					},
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
				configuration: {
					image: "./Dockerfile",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 3,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply --json");
		/* eslint-disable */
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			│   [containers.configuration]
			│   image = \\"./Dockerfile\\"
			│ - instance_type = \\"dev\\"
			│ + instance_type = \\"standard\\"
			│
			│   [containers.constraints]
			│   ...
			│ - tier = 3
			│ + tier = 2
			│
			├ Loading
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.configuration?.instance_type).toEqual("standard");
		/* eslint-enable */
	});
});
