import { rest } from "msw";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import writeWranglerToml from "./helpers/write-wrangler-toml";
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
		  "out": "Successfully deleted my-script",
		  "warn": "",
		}
	`);
	});

	it("should delete a script by configuration", async () => {
		mockConfirm({
			text: `Are you sure you want to delete test-name? This action cannot be undone.`,
			result: true,
		});
		writeWranglerToml();
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
		  "out": "Successfully deleted test-name",
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
		  "out": "--dry-run: exiting now.",
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
		  "out": "",
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
			rest.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-ns",
				(req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					return res.once(
						ctx.status(200),
						ctx.json({ success: true, errors: [], messages: [], result: null })
					);
				}
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
		  "out": "🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets\\"
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
			rest.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-ns",
				(req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: {},
						})
					);
				}
			)
		);

		msw.use(
			rest.delete(
				"*/accounts/:accountId/storage/kv/namespaces/id-for-my-script-site-preview-ns",
				(req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: {},
						})
					);
				}
			)
		);

		mockDeleteWorkerRequest({ name: "my-script" });
		await runWrangler("delete --name my-script");
		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "info": "",
		  "out": "🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets\\"
		🌀 Deleted asset namespace for Workers Site \\"__my-script-workers_sites_assets_preview\\"
		Successfully deleted my-script",
		  "warn": "",
		}
	`);
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
			writeWranglerToml();
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
			        "out": "Successfully deleted test-name",
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
			writeWranglerToml();
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
			        "out": "",
			        "warn": "",
			      }
		    `);
		});

		it("should not require confirmation when --force is used", async () => {
			writeWranglerToml();
			mockListKVNamespacesRequest();
			mockDeleteWorkerRequest({ force: true });
			await runWrangler("delete --force");

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Successfully deleted test-name",
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
		legacyEnv?: boolean;
		force?: boolean;
	} = {}
) {
	const { env, legacyEnv, name } = options;
	msw.use(
		rest.delete(
			"*/accounts/:accountId/workers/services/:scriptName",
			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(
					legacyEnv && env
						? `${name ?? "test-name"}-${env}`
						: `${name ?? "test-name"}`
				);

				expect(req.url.searchParams.get("force")).toEqual(
					options.force ? "true" : "false"
				);

				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			}
		)
	);
}

/** Create a mock handler for the request to get a list of all KV namespaces. */
function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
	msw.use(
		rest.get("*/accounts/:accountId/storage/kv/namespaces", (req, res, ctx) => {
			expect(req.params.accountId).toEqual("some-account-id");
			return res.once(
				ctx.status(200),
				ctx.json({
					success: true,
					errors: [],
					messages: [],
					result: namespaces,
				})
			);
		})
	);
}

function mockListReferencesRequest(
	forScript: string,
	references: ServiceReferenceResponse = {}
) {
	msw.use(
		rest.get(
			"*/accounts/:accountId/workers/scripts/:scriptName/references",
			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(forScript);
				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: references,
					})
				);
			}
		)
	);
}

function mockListTailsByConsumerRequest(forScript: string, tails: Tail[] = []) {
	msw.use(
		rest.get(
			"*/accounts/:accountId/workers/tails/by-consumer/:scriptName",
			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(forScript);
				return res.once(
					ctx.status(200),
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: tails,
					})
				);
			}
		)
	);
}
