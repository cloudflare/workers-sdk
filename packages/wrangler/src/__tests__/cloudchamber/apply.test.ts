import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { SchedulingPolicy, SecretAccessType } from "../../cloudchamber/client";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount } from "./utils";
import type {
	Application,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
} from "../../cloudchamber/client";
import type { ContainerApp } from "../../../../wrangler-shared/src/config/environment";

function writeAppConfiguration(...app: ContainerApp[]) {
	fs.writeFileSync(
		"./wrangler.toml",
		TOML.stringify({
			name: "my-container",
			containers: { app },
		}),

		"utf-8"
	);
}

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
				const json = (await request.json()) as ModifyApplicationRequestBody;
				if (expected !== undefined) {
					expect(json).toEqual(expected);
				}
				return HttpResponse.json(json);
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
				console.log(json);
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
		writeAppConfiguration({
			name: "my-container-app",
			instances: 3,
			configuration: {
				image: "./Dockerfile",
			},
			constraints: {
				tier: 2,
			},
		});
		mockGetApplications([]);
		mockCreateApplication();
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
			│   [[containers.app]]
			│   name = \\"my-container-app\\"
			│   instances = 3
			│   scheduling_policy = \\"regional\\"
			│
			│   [containers.app.configuration]
			│   image = \\"./Dockerfile\\"
			│
			│   [containers.app.constraints]
			│   tier = 2
			│
			├ Do you want to apply these changes?
			│ yes
			│
			│
			│  SUCCESS  Created application my-container-app
			│
			╰ Applied changes

			"
		`);
		/* eslint-enable */
	});

	test("can apply a simple existing application", async () => {
		setIsTTY(false);
		writeAppConfiguration({
			name: "my-container-app",
			instances: 4,
			configuration: {
				image: "./Dockerfile",
			},
			constraints: {
				tier: 2,
			},
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
				account_id: "1",
				scheduling_policy: SchedulingPolicy.REGIONAL,
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
			│   [[containers.app]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			│   [containers.app.constraints]
			│ - tier = 3
			│ + tier = 2
			│
			├ Do you want to apply these changes?
			│ yes
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

	test("can apply a simple existing application and create other", async () => {
		setIsTTY(false);
		writeAppConfiguration(
			{
				name: "my-container-app",
				instances: 4,
				configuration: {
					image: "./Dockerfile",
				},
			},
			{
				name: "my-container-app-2",
				instances: 1,
				configuration: {
					image: "other-app/Dockerfile",
				},
			}
		);
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
				created_at: new Date().toString(),
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
		const res = mockModifyApplication();
		mockCreateApplication();
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
			│   [[containers.app]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			├ NEW my-container-app-2
			│
			│   [[containers.app]]
			│   name = \\"my-container-app-2\\"
			│   instances = 1
			│   scheduling_policy = \\"regional\\"
			│
			│   [containers.app.configuration]
			│   image = \\"other-app/Dockerfile\\"
			│
			│   [containers.app.constraints]
			│   tier = 1
			│
			├ Do you want to apply these changes?
			│ yes
			│
			│
			│  SUCCESS  Modified application my-container-app
			│
			│
			│  SUCCESS  Created application my-container-app-2
			│
			╰ Applied changes

			"
		`);
		expect(std.stderr).toMatchInlineSnapshot(`""`);
		/* eslint-enable */
	});

	test("can apply a simple existing application (labels)", async () => {
		setIsTTY(false);
		writeAppConfiguration({
			name: "my-container-app",
			instances: 4,
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
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
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
			│   [[containers.app]]
			│ - instances = 3
			│ + instances = 4
			│   name = \\"my-container-app\\"
			│
			│   [[containers.app.configuration.labels]]
			│ + name = \\"name-1\\"
			│ + value = \\"value-1\\"
			│
			│ + [[containers.app.configuration.labels]]
			│   name = \\"name-2\\"
			│
			│   [[containers.app.configuration.secrets]]
			│ - name = \\"MY_SECRET_1\\"
			│ - secret = \\"SECRET_NAME_1\\"
			│ - type = \\"env\\"
			│
			│ - [[containers.app.configuration.secrets]]
			│   name = \\"MY_SECRET_2\\"
			│
			├ Do you want to apply these changes?
			│ yes
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

	test("can apply an application, and there is no changes", async () => {
		setIsTTY(false);
		writeAppConfiguration({
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
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container-app",
				instances: 3,
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
		writeAppConfiguration(app, { ...app, name: "my-container-app-2" });

		const completeApp = {
			id: "abc",
			name: "my-container-app",
			instances: 3,
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
		};

		mockGetApplications([
			completeApp,
			{ ...completeApp, name: "my-container-app-2", id: "abc2" },
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
});
