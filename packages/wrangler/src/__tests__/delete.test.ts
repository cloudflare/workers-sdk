import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { ServiceReferenceResponse, Tail } from "../delete";
import type { KVNamespaceInfo } from "../kv/helpers";

describe("delete", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});
	const std = mockConsoleMethods();

	it("should delete an entire service by name", async () => {
		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest();
		mockListReferencesRequest("my-script");
		mockListTailsByConsumerRequest("my-script");
		mockDeleteWorkerRequest({ name: "my-script" });
		await runWrangler("delete --name my-script");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully deleted my-script",
			  "warn": "",
			}
		`);
	});

	it("should delete a service using positional name argument", async () => {
		mockConfirm({
			text: `Are you sure you want to delete my-positional-worker? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest();
		mockListReferencesRequest("my-positional-worker");
		mockListTailsByConsumerRequest("my-positional-worker");
		mockDeleteWorkerRequest({ name: "my-positional-worker" });
		await runWrangler("delete my-positional-worker");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully deleted my-positional-worker",
			  "warn": "",
			}
		`);
	});

	it("should use positional name argument over the name from the Wrangler config file", async () => {
		writeWranglerConfig({ name: "config-provided-name" });
		mockConfirm({
			text: `Are you sure you want to delete cli-provided-name? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest();
		mockListReferencesRequest("cli-provided-name");
		mockListTailsByConsumerRequest("cli-provided-name");
		mockDeleteWorkerRequest({ name: "cli-provided-name" });
		await runWrangler("delete cli-provided-name");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully deleted cli-provided-name",
			  "warn": "",
			}
		`);
	});

	it("should delete a script by configuration", async () => {
		mockConfirm({
			text: `Are you sure you want to delete test-name? This action cannot be undone.`,
			result: true,
		});
		writeWranglerConfig();
		mockListKVNamespacesRequest();
		mockListReferencesRequest("test-name");
		mockListTailsByConsumerRequest("test-name");
		mockDeleteWorkerRequest();
		await runWrangler("delete");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully deleted test-name",
			  "warn": "",
			}
		`);
	});

	it("shouldn't delete a service when doing a --dry-run", async () => {
		await runWrangler("delete --name xyz --dry-run");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			--dry-run: exiting now.",
			  "warn": "",
			}
		`);
	});

	it('shouldn\'t delete when the user says "no"', async () => {
		mockConfirm({
			text: `Are you sure you want to delete xyz? This action cannot be undone.`,
			result: false,
		});

		await runWrangler("delete --name xyz");

		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────",
			  "warn": "",
			}
		`);
	});

	it("should delete a site namespace associated with a worker", async () => {
		const kvNamespaces = [
			{
				title: "__my-script-workers_sites_assets",
				id: "id-for-my-script-site-ns",
			},
			// this one isn't associated with the worker
			{
				title: "__test-name-workers_sites_assets",
				id: "id-for-another-site-ns",
			},
		];

		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest(...kvNamespaces);
		// it should only try to delete the site namespace associated with this worker
		msw.use(
			http.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-ns",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					return HttpResponse.json(
						{ success: true, errors: [], messages: [], result: null },
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		mockListReferencesRequest("my-script");
		mockListTailsByConsumerRequest("my-script");
		mockDeleteWorkerRequest({ name: "my-script" });
		await runWrangler("delete --name my-script");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets\\"
			Successfully deleted my-script",
			  "warn": "",
			}
		`);
	});

	it("should delete a site namespace associated with a worker, including it's preview namespace", async () => {
		// This is the same test as the previous one, but it includes a preview namespace
		const kvNamespaces = [
			{
				title: "__my-script-workers_sites_assets",
				id: "id-for-my-script-site-ns",
			},
			// this is the preview namespace
			{
				title: "__my-script-workers_sites_assets_preview",
				id: "id-for-my-script-site-preview-ns",
			},

			// this one isn't associated with the worker
			{
				title: "__test-name-workers_sites_assets",
				id: "id-for-another-site-ns",
			},
		];

		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest(...kvNamespaces);
		mockListReferencesRequest("my-script");
		mockListTailsByConsumerRequest("my-script");
		// it should only try to delete the site namespace associated with this worker

		msw.use(
			http.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-ns",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		msw.use(
			http.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-preview-ns",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);

		mockDeleteWorkerRequest({ name: "my-script" });
		await runWrangler("delete --name my-script");
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets\\"
			🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets_preview\\"
			Successfully deleted my-script",
			  "warn": "",
			}
		`);
	});

	it("should error helpfully if pages_build_output_dir is set", async () => {
		writeWranglerConfig({ pages_build_output_dir: "dist", name: "test" });
		await expect(
			runWrangler("delete")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: It looks like you've run a Workers-specific command in a Pages project.
			For Pages, please run \`wrangler pages project delete\` instead.]
		`
		);
	});
	describe("force deletes", () => {
		it("should prompt for extra confirmation when service is depended on and use force", async () => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `test-name is currently in use by other Workers:

- Worker existing-worker (production) uses this Worker as a Service Binding
- Worker other-worker (production) uses this Worker as a Service Binding
- Worker do-binder (production) has a binding to the Durable Object Namespace "actor_ns" implemented by this Worker
- Worker dispatcher (production) uses this Worker as an Outbound Worker for the Dynamic Dispatch Namespace "user-workers"
- Worker i-make-logs uses this Worker as a Tail Worker

You can still delete this Worker, but doing so WILL BREAK the Workers that depend on it. This will cause unexpected failures, and cannot be undone.
Are you sure you want to continue?`,
				result: true,
			});
			writeWranglerConfig();
			mockListKVNamespacesRequest();
			mockListReferencesRequest("test-name", {
				services: {
					incoming: [
						{
							service: "existing-worker",
							environment: "production",
							name: "BINDING",
						},
						{
							service: "other-worker",
							environment: "production",
							name: "BINDING_TWO",
						},
					],
					outgoing: [],
				},
				durable_objects: [
					{
						service: "do-binder",
						environment: "production",
						name: "ACTOR",
						durable_object_namespace_id: "123",
						durable_object_namespace_name: "actor_ns",
					},
					{
						service: "test-name",
						environment: "production",
						name: "ACTOR",
						durable_object_namespace_id: "123",
						durable_object_namespace_name: "actor_ns",
					},
				],
				dispatch_outbounds: [
					{
						service: "dispatcher",
						environment: "production",
						name: "DISPATCH",
						namespace: "user-workers",
						params: [],
					},
				],
			});
			mockListTailsByConsumerRequest("test-name", [
				{
					consumer: { script: "test-name" },
					producer: { script: "i-make-logs" },
					tag: "",
					created_on: "",
					modified_on: "",
				},
			]);
			mockDeleteWorkerRequest({ force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully deleted test-name",
				  "warn": "",
				}
			`);
		});

		it("should not delete when extra confirmation to use force is denied", async () => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `test-name is currently in use by other Workers:

- Worker existing-worker (production) uses this Worker as a Service Binding

You can still delete this Worker, but doing so WILL BREAK the Workers that depend on it. This will cause unexpected failures, and cannot be undone.
Are you sure you want to continue?`,
				result: false,
			});
			writeWranglerConfig();
			mockListKVNamespacesRequest();
			mockListReferencesRequest("test-name", {
				services: {
					incoming: [
						{
							service: "existing-worker",
							environment: "production",
							name: "BINDING",
						},
					],
					outgoing: [],
				},
			});
			mockListTailsByConsumerRequest("test-name");
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────",
				  "warn": "",
				}
			`);
		});

		it("should not require confirmation when --force is used", async () => {
			writeWranglerConfig();
			mockListKVNamespacesRequest();
			mockDeleteWorkerRequest({ force: true });
			await runWrangler("delete --force");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully deleted test-name",
				  "warn": "",
				}
			`);
		});

		it("should prompt for extra confirmation when worker is used by a Pages function", async () => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `test-name is currently in use by other Workers:

- A Pages project has a Service Binding to this Worker

You can still delete this Worker, but doing so WILL BREAK the Workers that depend on it. This will cause unexpected failures, and cannot be undone.
Are you sure you want to continue?`,
				result: true,
			});
			writeWranglerConfig();
			mockListKVNamespacesRequest();
			mockListReferencesRequest("test-name", {
				services: {
					incoming: [],
					outgoing: [],
					pages_function: true,
				},
			});
			mockListTailsByConsumerRequest("test-name");
			mockDeleteWorkerRequest({ force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully deleted test-name",
				  "warn": "",
				}
			`);
		});

		it("should include Pages function in confirmation when combined with other dependencies", async () => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `test-name is currently in use by other Workers:

- Worker existing-worker (production) uses this Worker as a Service Binding
- A Pages project has a Service Binding to this Worker
- Worker do-binder (production) has a binding to the Durable Object Namespace "actor_ns" implemented by this Worker

You can still delete this Worker, but doing so WILL BREAK the Workers that depend on it. This will cause unexpected failures, and cannot be undone.
Are you sure you want to continue?`,
				result: true,
			});
			writeWranglerConfig();
			mockListKVNamespacesRequest();
			mockListReferencesRequest("test-name", {
				services: {
					incoming: [
						{
							service: "existing-worker",
							environment: "production",
							name: "BINDING",
						},
					],
					outgoing: [],
					pages_function: true,
				},
				durable_objects: [
					{
						service: "do-binder",
						environment: "production",
						name: "ACTOR",
						durable_object_namespace_id: "123",
						durable_object_namespace_name: "actor_ns",
					},
				],
			});
			mockListTailsByConsumerRequest("test-name");
			mockDeleteWorkerRequest({ force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully deleted test-name",
				  "warn": "",
				}
			`);
		});
	});
});

/** Create a mock handler for the request to upload a worker script. */
function mockDeleteWorkerRequest(
	options: {
		name?: string;
		env?: string;
		useServiceEnvironments?: boolean;
		force?: boolean;
	} = {}
) {
	const { env, useServiceEnvironments, name } = options;
	msw.use(
		http.delete(
			"*/accounts/:accountId/workers/services/:scriptName",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					!useServiceEnvironments && env
						? `${name ?? "test-name"}-${env}`
						: `${name ?? "test-name"}`
				);

				expect(url.searchParams.get("force")).toEqual(
					options.force ? "true" : "false"
				);

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: null,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for the request to get a list of all KV namespaces. */
function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: namespaces,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
}

function mockListReferencesRequest(
	forScript: string,
	references: ServiceReferenceResponse = {}
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts/:scriptName/references",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(forScript);
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: references,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
}

function mockListTailsByConsumerRequest(forScript: string, tails: Tail[] = []) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/tails/by-consumer/:scriptName",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(forScript);
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: tails,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
}
