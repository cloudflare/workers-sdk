import {
	getCloudflareContainerRegistry,
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

function mockCreateApplication(
	response?: Partial<Application>,
	expected?: Partial<CreateApplicationRequest>
) {
	msw.use(
		http.post(
			"*/applications",
			async ({ request }) => {
				const body = (await request.json()) as CreateApplicationRequest;
				if (expected !== undefined) {
					expect(body).toMatchObject(expected);
				}
				expect(body).toHaveProperty("instances");
				return HttpResponse.json(response);
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
					image: "docker.io/something:hello",
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([]);
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.constraints]
			│     tier = 2
			│
			│     [containers.configuration]
			│     image = \\"docker.io/something:hello\\"
			│     instance_type = \\"dev\\"
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
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
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"default\\"
			│
			│   ...
			│
			│     instance_type = \\"dev\\"
			│     [containers.constraints]
			│ -   tier = 3
			│ +   tier = 2
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(2);
		expect(app.instances).toEqual(4);
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
					image: "docker.io/beep:boop",
				},
				{
					name: "my-container-app-2",
					max_instances: 3,
					class_name: "DurableObjectClass2",
					image: "docker.io/other-app:boop",
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				max_instances: 4,
				instances: 3,
				created_at: new Date().toString(),
				account_id: "1",
				version: 1,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");
		const body = await res;
		expect(body).not.toHaveProperty("instances");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│   instances = 0
			│ - max_instances = 4
			│ + max_instances = 3
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"default\\"
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   max_instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.configuration]
			│     image = \\"docker.io/other-app:boop\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
					rollout_kind: "none",
				},
				{
					name: "my-container-app-2",
					instances: 1,
					class_name: "DurableObjectClass2",
					image: "docker.io/other-app:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");

		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"default\\"
			│
			│ Skipping application rollout
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   instances = 1
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.configuration]
			│     image = \\"docker.io/other-app:boop\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
				},
				{
					name: "my-container-app-2",
					instances: 1,
					class_name: "DurableObjectClass2",
					image: "docker.io/other-app:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");
		await res;
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"default\\"
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   instances = 1
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.configuration]
			│     image = \\"docker.io/other-app:boop\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
					configuration: {
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
					image: "docker.io/beep:boop",
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
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const res = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		await res;
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"default\\"
			│
			│   ...
			│
			│       value = \\"value\\"
			│       [[containers.configuration.labels]]
			│ +     name = \\"name-1\\"
			│ +     value = \\"value-1\\"
			│ +     [[containers.configuration.labels]]
			│       name = \\"name-2\\"
			│       value = \\"value-2\\"
			│
			│   ...
			│
			│       type = \\"env\\"
			│       [[containers.configuration.secrets]]
			│ -     name = \\"MY_SECRET_1\\"
			│ -     secret = \\"SECRET_NAME_1\\"
			│ -     type = \\"env\\"
			│ -     [[containers.configuration.secrets]]
			│       name = \\"MY_SECRET_2\\"
			│       secret = \\"SECRET_NAME_2\\"
			│       type = \\"env\\"
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
					configuration: {
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
					image: "docker.io/beep:boop",
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
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},

				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
	});

	test("can apply an application, and there is no changes (two applications)", async () => {
		setIsTTY(false);
		const app = {
			name: "my-container-app",
			instances: 3,
			class_name: "DurableObjectClass",
			image: "docker.io/beep:boop",
			configuration: {
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
				image: "docker.io/beep:boop",
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
				disk: {
					size: "2GB",
					size_mb: 2000,
				},
				vcpu: 0.0625,
				memory: "256MB",
				memory_mib: 256,
			},

			constraints: {
				tier: 1,
			},
		};

		mockGetApplications([
			{ ...completeApp, version: 1 },
			{ ...completeApp, version: 1, name: "my-container-app-2", id: "abc2" },
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			├ no changes my-container-app-2
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
					configuration: {
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
					image: "docker.io/beep:boop",
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
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},

				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     image = \\"docker.io/beep:boop\\"
			│     instance_type = \\"dev\\"
			│ + [containers.configuration.observability.logs]
			│ + enabled = true
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     image = \\"docker.io/beep:boop\\"
			│     instance_type = \\"dev\\"
			│ + [containers.configuration.observability.logs]
			│ + enabled = true
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: true,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     instance_type = \\"dev\\"
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: true,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     instance_type = \\"dev\\"
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: true,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     instance_type = \\"dev\\"
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: true,
						},
						logging: {
							enabled: true,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     instance_type = \\"dev\\"
			│   [containers.configuration.observability.logs]
			│ - enabled = true
			│ + enabled = false
			│     [containers.constraints]
			│     tier = 1
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.constraints?.tier).toEqual(1);
		expect(app.instances).toEqual(1);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: true,
						},
						logging: {
							enabled: true,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					observability: {
						logs: {
							enabled: false,
						},
						logging: {
							enabled: false,
						},
					},
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
			},
		]);
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container-app
			│
			╰ No changes to be made

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([]);
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.constraints]
			│     tier = 2
			│
			│     [containers.configuration]
			│     image = \\"docker.io/beep:boop\\"
			│     instance_type = \\"dev\\"
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
	});

	test("can apply a simple application (custom instance type)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 3,
					class_name: "DurableObjectClass",
					instance_type: {
						vcpu: 1,
						memory_mib: 1024,
						disk_mb: 2000,
					},
					image: "docker.io/beep:boop",
					constraints: {
						tier: 2,
					},
				},
			],
		});
		mockGetApplications([]);
		mockCreateApplication({ id: "abc" });
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.constraints]
			│     tier = 2
			│
			│     [containers.configuration]
			│     image = \\"docker.io/beep:boop\\"
			│     vcpu = 1
			│     memory_mib = 1_024
			│
			│       [containers.configuration.disk]
			│       size_mb = 2_000
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
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
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
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
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"regional\\"
			│     [containers.configuration]
			│     image = \\"docker.io/beep:boop\\"
			│ -   instance_type = \\"dev\\"
			│ +   instance_type = \\"standard\\"
			│     [containers.constraints]
			│ -   tier = 3
			│ +   tier = 2
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.configuration?.instance_type).toEqual("standard");
	});

	test("can apply a simple existing application (custom instance type)", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					instance_type: {
						vcpu: 1,
						memory_mib: 1024,
						disk_mb: 6000,
					},
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
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
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"regional\\"
			│     [containers.configuration]
			│     image = \\"docker.io/beep:boop\\"
			│     memory = \\"256MB\\"
			│ -   memory_mib = 256
			│ +   memory_mib = 1_024
			│ -   vcpu = 0.0625
			│ +   vcpu = 1
			│       [containers.configuration.disk]
			│       size = \\"2GB\\"
			│ -     size_mb = 2_000
			│ +     size_mb = 6_000
			│     [containers.constraints]
			│ -   tier = 3
			│ +   tier = 2
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.configuration?.instance_type).toBeUndefined();
	});

	test("falls back on dev instance type when instance type is absent", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 4,
					class_name: "DurableObjectClass",
					image: "docker.io/beep:boop",
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
					image: "docker.io/beep:boop",
					disk: {
						size: "4GB",
						size_mb: 4000,
					},
					vcpu: 0.25,
					memory: "1024MB",
					memory_mib: 1024,
				},
				constraints: {
					tier: 3,
				},
			},
		]);
		const applicationReqBodyPromise = mockModifyApplication();
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│   [[containers]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│   scheduling_policy = \\"regional\\"
			│     [containers.configuration]
			│     image = \\"docker.io/beep:boop\\"
			│ -   instance_type = \\"basic\\"
			│ +   instance_type = \\"dev\\"
			│     [containers.constraints]
			│ -   tier = 3
			│ +   tier = 2
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.configuration?.instance_type).toEqual("dev");
	});

	test("expands image names from managed registry when creating an application", async () => {
		setIsTTY(false);
		const registry = getCloudflareContainerRegistry();
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 3,
					class_name: "DurableObjectClass",
					image: `${registry}/hello:1.0`,
					constraints: {
						tier: 2,
					},
				},
			],
		});

		mockGetApplications([]);
		mockCreateApplication(
			{ id: "abc" },
			{
				configuration: {
					image: `${registry}/some-account-id/hello:1.0`,
				},
			}
		);

		await runWrangler("cloudchamber apply");
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app
			│
			│   [[containers]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"default\\"
			│
			│     [containers.constraints]
			│     tier = 2
			│
			│     [containers.configuration]
			│     image = \\"${registry}/some-account-id/hello:1.0\\"
			│     instance_type = \\"dev\\"
			│
			│
			│  SUCCESS  Created application my-container-app (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
	});

	test("expands image names from managed registry when modifying an application", async () => {
		setIsTTY(false);
		const registry = getCloudflareContainerRegistry();
		writeWranglerConfig({
			name: "my-container",
			containers: [
				{
					name: "my-container-app",
					instances: 3,
					class_name: "DurableObjectClass",
					image: `${registry}/hello:1.0`,
					instance_type: "standard",
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
					image: `${registry}/some-account-id/hello:1.0`,
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
		await runWrangler("cloudchamber apply");
		expect(std.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container-app
			│
			│     [containers.configuration]
			│     image = \\"registry.cloudflare.com/some-account-id/hello:1.0\\"
			│ -   instance_type = \\"dev\\"
			│ +   instance_type = \\"standard\\"
			│     [containers.constraints]
			│ -   tier = 3
			│ +   tier = 2
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		const app = await applicationReqBodyPromise;
		expect(app.configuration?.instance_type).toEqual("standard");
	});
});
