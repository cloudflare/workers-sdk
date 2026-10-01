import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { ServiceReferenceResponse, Tail } from "../delete";
import type { KVNamespaceInfo } from "../kv/helpers";
import type { ExpectStatic } from "vitest";

describe("delete", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
		// Container applications owned by the Worker are discovered through its
		// Durable Object namespaces. A Worker without any owns none, which is the
		// default for the tests that are not about Containers.
		msw.use(
			http.get("*/accounts/:accountId/workers/durable_objects/namespaces", () =>
				HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: [],
				})
			)
		);
	});
	const std = mockConsoleMethods();

	it("should delete an entire service by name", async ({ expect }) => {
		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest(expect);
		mockListReferencesRequest(expect, "my-script");
		mockListTailsByConsumerRequest(expect, "my-script");
		mockDeleteWorkerRequest(expect, { name: "my-script" });
		await runWrangler("delete --name my-script");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it("should delete a service using positional name argument", async ({
		expect,
	}) => {
		mockConfirm({
			text: `Are you sure you want to delete my-positional-worker? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest(expect);
		mockListReferencesRequest(expect, "my-positional-worker");
		mockListTailsByConsumerRequest(expect, "my-positional-worker");
		mockDeleteWorkerRequest(expect, { name: "my-positional-worker" });
		await runWrangler("delete my-positional-worker");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it("should use positional name argument over the name from the Wrangler config file", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "config-provided-name" });
		mockConfirm({
			text: `Are you sure you want to delete cli-provided-name? This action cannot be undone.`,
			result: true,
		});
		mockListKVNamespacesRequest(expect);
		mockListReferencesRequest(expect, "cli-provided-name");
		mockListTailsByConsumerRequest(expect, "cli-provided-name");
		mockDeleteWorkerRequest(expect, { name: "cli-provided-name" });
		await runWrangler("delete cli-provided-name");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it("should delete a script by configuration", async ({ expect }) => {
		mockConfirm({
			text: `Are you sure you want to delete test-name? This action cannot be undone.`,
			result: true,
		});
		writeWranglerConfig();
		mockListKVNamespacesRequest(expect);
		mockListReferencesRequest(expect, "test-name");
		mockListTailsByConsumerRequest(expect, "test-name");
		mockDeleteWorkerRequest(expect);
		await runWrangler("delete");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it("shouldn't delete a service when doing a --dry-run", async ({
		expect,
	}) => {
		await runWrangler("delete --name xyz --dry-run");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it('shouldn\'t delete when the user says "no"', async ({ expect }) => {
		mockConfirm({
			text: `Are you sure you want to delete xyz? This action cannot be undone.`,
			result: false,
		});

		await runWrangler("delete --name xyz");

		expect(std).toMatchInlineSnapshot(`
			{
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

	it("should delete a site namespace associated with a worker", async ({
		expect,
	}) => {
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
		mockListKVNamespacesRequest(expect, ...kvNamespaces);
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

		mockListReferencesRequest(expect, "my-script");
		mockListTailsByConsumerRequest(expect, "my-script");
		mockDeleteWorkerRequest(expect, { name: "my-script" });
		await runWrangler("delete --name my-script");
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Deleted asset namespace for Workers Site "__my-script-workers_sites_assets"
			Successfully deleted my-script",
			  "warn": "",
			}
		`);
	});

	it("should delete a site namespace associated with a worker, including it's preview namespace", async ({
		expect,
	}) => {
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
		mockListKVNamespacesRequest(expect, ...kvNamespaces);
		mockListReferencesRequest(expect, "my-script");
		mockListTailsByConsumerRequest(expect, "my-script");
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

		mockDeleteWorkerRequest(expect, { name: "my-script" });
		await runWrangler("delete --name my-script");
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Deleted asset namespace for Workers Site "__my-script-workers_sites_assets"
			🌀 Deleted asset namespace for Workers Site "__my-script-workers_sites_assets_preview"
			Successfully deleted my-script",
			  "warn": "",
			}
		`);
	});

	it("should skip Workers Sites namespace cleanup when listing KV namespaces is not permitted", async ({
		expect,
	}) => {
		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListReferencesRequest(expect, "my-script");
		mockListTailsByConsumerRequest(expect, "my-script");
		mockDeleteWorkerRequest(expect, { name: "my-script" });
		mockListKVNamespacesPermissionDeniedRequest(expect);

		await runWrangler("delete --name my-script");

		expect(std.out).toContain("Successfully deleted my-script");
		expect(std.warn).toContain(
			'Skipping cleanup of legacy Workers Sites asset namespaces for "my-script" because Wrangler does not have permission to list KV namespaces.'
		);
		expect(std.err).toBe("");
	});

	it("should skip Workers Sites namespace cleanup when deleting a KV namespace is not permitted", async ({
		expect,
	}) => {
		mockConfirm({
			text: `Are you sure you want to delete my-script? This action cannot be undone.`,
			result: true,
		});
		mockListReferencesRequest(expect, "my-script");
		mockListTailsByConsumerRequest(expect, "my-script");
		mockDeleteWorkerRequest(expect, { name: "my-script" });
		mockListKVNamespacesRequest(expect, {
			title: "__my-script-workers_sites_assets",
			id: "id-for-my-script-site-ns",
		});
		mockDeleteKVNamespacePermissionDeniedRequest(
			expect,
			"id-for-my-script-site-ns"
		);

		await runWrangler("delete --name my-script");

		expect(std.out).toContain("Successfully deleted my-script");
		expect(std.warn).toContain(
			'Skipping cleanup of legacy Workers Sites asset namespace "__my-script-workers_sites_assets" because Wrangler does not have permission to delete KV namespaces.'
		);
		expect(std.err).toBe("");
	});

	describe("Container applications", () => {
		const namespaceId = "11111111-2222-3333-4444-555555555555";
		const otherNamespaceId = "66666666-7777-8888-9999-aaaaaaaaaaaa";

		function mockDurableObjectNamespaces(
			expect: ExpectStatic,
			namespaces: unknown[]
		) {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/durable_objects/namespaces",
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: namespaces,
						});
					}
				)
			);
		}

		/**
		 * Mock `GET /applications/:id` for several applications at once. Any
		 * application not listed responds as missing, which is what a Worker with
		 * Durable Objects but no Containers looks like.
		 */
		function mockContainerApplications(
			applications: Record<string, unknown>,
			requestedIds: string[] = []
		) {
			msw.use(
				http.get("*/applications/:id", ({ params }) => {
					const id = String(params.id);
					requestedIds.push(id);
					if (!(id in applications)) {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "not found" }],
								messages: [],
								result: null,
							},
							{ status: 404 }
						);
					}
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: applications[id],
					});
				})
			);
		}

		function durableObjectApplication(name: string, id: string) {
			return {
				id,
				name,
				account_id: "some-account-id",
				created_at: "2026-01-01T00:00:00Z",
				version: 1,
				scheduling_policy: "durable_object",
				instances: 0,
				configuration: { image: "registry.cloudflare.com/example:v1" },
				durable_objects: { namespace_id: id },
			};
		}

		function mockDeleteContainerApplication(
			expect: ExpectStatic,
			applicationId: string
		) {
			msw.use(
				http.delete(
					"*/applications/:id",
					({ params }) => {
						expect(params.id).toEqual(applicationId);
						return HttpResponse.json({ success: true, result: {} });
					},
					{ once: true }
				)
			);
		}

		it("deletes the Worker's Container applications when confirmed", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete my-script? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `my-script also created 1 Cloudflare Container application, which will keep running and billing after the Worker is deleted:
- my-script-container (${namespaceId})

Delete it as well?`,
				options: { defaultValue: false },
				result: true,
			});
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespaces(expect, [
				{
					id: namespaceId,
					class: "MyContainer",
					name: "my-script-container",
					script: "my-script",
					use_sqlite: true,
				},
			]);
			mockContainerApplications({
				[namespaceId]: durableObjectApplication(
					"my-script-container",
					namespaceId
				),
			});
			mockDeleteWorkerRequest(expect, { name: "my-script" });
			mockDeleteContainerApplication(expect, namespaceId);

			await runWrangler("delete --name my-script");

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Successfully deleted my-script
				🗑️ Deleted Container application "my-script-container"
				Deleted 1 Container application. Its instances may take a while to shut down.",
				  "warn": "",
				}
			`);
		});

		it("names the surviving Container applications when deletion is declined", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete my-script? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `my-script also created 1 Cloudflare Container application, which will keep running and billing after the Worker is deleted:
- my-script-container (${namespaceId})

Delete it as well?`,
				options: { defaultValue: false },
				result: false,
			});
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespaces(expect, [
				{
					id: namespaceId,
					class: "MyContainer",
					name: "my-script-container",
					script: "my-script",
					use_sqlite: true,
				},
			]);
			mockContainerApplications({
				[namespaceId]: durableObjectApplication(
					"my-script-container",
					namespaceId
				),
			});
			mockDeleteWorkerRequest(expect, { name: "my-script" });

			await runWrangler("delete --name my-script");

			expect(std.warn).toContain(
				"Left 1 Container application running. Delete it with: wrangler containers delete <id>"
			);
			expect(std.err).toBe("");
		});

		it("warns without prompting in non-interactive contexts", async ({
			expect,
		}) => {
			setIsTTY(false);
			// No `mockConfirm`: in a non-interactive context `confirm()` takes its
			// fallback value instead of prompting, and an unused prompt mock would
			// leak into later tests.
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespaces(expect, [
				{
					id: namespaceId,
					class: "MyContainer",
					name: "my-script-container",
					script: "my-script",
					use_sqlite: true,
				},
			]);
			mockContainerApplications({
				[namespaceId]: durableObjectApplication(
					"my-script-container",
					namespaceId
				),
			});
			mockDeleteWorkerRequest(expect, { name: "my-script" });

			await runWrangler("delete --name my-script");

			expect(std.warn).toContain(
				"my-script owned 1 Cloudflare Container application, which keeps running and billing now that the Worker is gone:"
			);
			expect(std.warn).toContain(`- my-script-container (${namespaceId})`);
			expect(std.err).toBe("");
		});

		it("does not touch applications owned by other Workers", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete my-script? This action cannot be undone.`,
				result: true,
			});
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespaces(expect, [
				// another Worker's namespace
				{
					id: otherNamespaceId,
					class: "MyContainer",
					name: "other-script-container",
					script: "other-script",
					use_sqlite: true,
				},
				// this Worker's Durable Object has no Container application
				{
					id: namespaceId,
					class: "Counter",
					name: "my-script-counter",
					script: "my-script",
					use_sqlite: true,
				},
				// a preview namespace, which is not the deployed Worker
				{
					id: namespaceId,
					class: "MyContainer",
					name: "my-script-container",
					script: "my-script",
					use_sqlite: true,
					preview: { id: "preview", slug: "abc", name: "abc" },
				},
			]);
			const requestedIds: string[] = [];
			mockContainerApplications({}, requestedIds);
			mockDeleteWorkerRequest(expect, { name: "my-script" });

			await runWrangler("delete --name my-script");

			// Only the deployed Worker's namespace is probed, never another
			// Worker's and never a preview's.
			expect(requestedIds).toEqual([namespaceId]);
			expect(std.warn).toBe("");
			expect(std.out).toContain("Successfully deleted my-script");
			expect(std.err).toBe("");
		});

		it("continues deleting the Worker when the Container lookup fails", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete my-script? This action cannot be undone.`,
				result: true,
			});
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespacesPermissionDeniedRequest(expect);
			mockDeleteWorkerRequest(expect, { name: "my-script" });

			await runWrangler("delete --name my-script");

			expect(std.out).toContain("Successfully deleted my-script");
			expect(std.warn).toContain(
				'Could not check whether "my-script" owns any Cloudflare Container applications'
			);
			expect(std.err).toBe("");
		});

		it("reports a failed Container application delete without aborting the rest", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete my-script? This action cannot be undone.`,
				result: true,
			});
			mockConfirm({
				text: `my-script also created 2 Cloudflare Container applications, which will keep running and billing after the Worker is deleted:
- my-script-container (${namespaceId})
- my-script-other (${otherNamespaceId})

Delete them as well?`,
				options: { defaultValue: false },
				result: true,
			});
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "my-script");
			mockListTailsByConsumerRequest(expect, "my-script");
			mockDurableObjectNamespaces(expect, [
				{
					id: namespaceId,
					class: "MyContainer",
					name: "my-script-container",
					script: "my-script",
					use_sqlite: true,
				},
				{
					id: otherNamespaceId,
					class: "MyOtherContainer",
					name: "my-script-other",
					script: "my-script",
					use_sqlite: true,
				},
			]);
			mockContainerApplications({
				[namespaceId]: durableObjectApplication(
					"my-script-container",
					namespaceId
				),
				[otherNamespaceId]: durableObjectApplication(
					"my-script-other",
					otherNamespaceId
				),
			});
			mockDeleteWorkerRequest(expect, { name: "my-script" });
			msw.use(
				http.delete("*/applications/:id", () => {
					return HttpResponse.json(
						{
							success: false,
							errors: [{ code: 1000, message: "something happened" }],
							messages: [],
							result: null,
						},
						{ status: 500 }
					);
				})
			);

			await runWrangler("delete --name my-script");

			expect(std.warn).toContain(
				'Could not delete Container application "my-script-container"'
			);
			expect(std.warn).toContain(
				'Could not delete Container application "my-script-other"'
			);
			expect(std.err).toBe("");
		});
	});

	it("should error helpfully if pages_build_output_dir is set", async ({
		expect,
	}) => {
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
		it("should skip dependency checks when listing Worker references is not permitted", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			writeWranglerConfig();
			mockListReferencesPermissionDeniedRequest(expect, "test-name");
			mockDeleteWorkerRequest(expect);
			mockListKVNamespacesRequest(expect);

			await runWrangler("delete");

			expect(std.out).toContain("Successfully deleted test-name");
			expect(std.warn).toContain(
				'Skipping dependency checks before deleting "test-name" because Wrangler does not have permission to inspect Worker dependencies. The delete will continue, but may fail later if this Worker is still in use.'
			);
			expect(std.err).toBe("");
		});

		it("should skip dependency checks when listing tail consumers is not permitted", async ({
			expect,
		}) => {
			mockConfirm({
				text: `Are you sure you want to delete test-name? This action cannot be undone.`,
				result: true,
			});
			writeWranglerConfig();
			mockListReferencesRequest(expect, "test-name");
			mockListTailsByConsumerPermissionDeniedRequest(expect, "test-name");
			mockDeleteWorkerRequest(expect);
			mockListKVNamespacesRequest(expect);

			await runWrangler("delete");

			expect(std.out).toContain("Successfully deleted test-name");
			expect(std.warn).toContain(
				'Skipping dependency checks before deleting "test-name" because Wrangler does not have permission to inspect Worker dependencies. The delete will continue, but may fail later if this Worker is still in use.'
			);
			expect(std.err).toBe("");
		});

		it("should prompt for extra confirmation when service is depended on and use force", async ({
			expect,
		}) => {
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
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "test-name", {
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
			mockListTailsByConsumerRequest(expect, "test-name", [
				{
					consumer: { script: "test-name" },
					producer: { script: "i-make-logs" },
					tag: "",
					created_on: "",
					modified_on: "",
				},
			]);
			mockDeleteWorkerRequest(expect, { force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				{
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

		it("should not delete when extra confirmation to use force is denied", async ({
			expect,
		}) => {
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
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "test-name", {
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
			mockListTailsByConsumerRequest(expect, "test-name");
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				{
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

		it("should not require confirmation when --force is used", async ({
			expect,
		}) => {
			writeWranglerConfig();
			mockListKVNamespacesRequest(expect);
			mockDeleteWorkerRequest(expect, { force: true });
			await runWrangler("delete --force");

			expect(std).toMatchInlineSnapshot(`
				{
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

		it("should prompt for extra confirmation when worker is used by a Pages function", async ({
			expect,
		}) => {
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
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "test-name", {
				services: {
					incoming: [],
					outgoing: [],
					pages_function: true,
				},
			});
			mockListTailsByConsumerRequest(expect, "test-name");
			mockDeleteWorkerRequest(expect, { force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				{
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

		it("should include Pages function in confirmation when combined with other dependencies", async ({
			expect,
		}) => {
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
			mockListKVNamespacesRequest(expect);
			mockListReferencesRequest(expect, "test-name", {
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
			mockListTailsByConsumerRequest(expect, "test-name");
			mockDeleteWorkerRequest(expect, { force: true });
			await runWrangler("delete");

			expect(std).toMatchInlineSnapshot(`
				{
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
	expect: ExpectStatic,
	options: {
		name?: string;
		env?: string;
		force?: boolean;
	} = {}
) {
	const { env, name } = options;
	msw.use(
		http.delete(
			"*/accounts/:accountId/workers/services/:scriptName",
			({ request, params }) => {
				const url = new URL(request.url);

				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					env ? `${name ?? "test-name"}-${env}` : `${name ?? "test-name"}`
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
function mockListKVNamespacesRequest(
	expect: ExpectStatic,
	...namespaces: KVNamespaceInfo[]
) {
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

function mockListKVNamespacesPermissionDeniedRequest(expect: ExpectStatic) {
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				);
			},
			{ once: true }
		)
	);
}

function mockDeleteKVNamespacePermissionDeniedRequest(
	expect: ExpectStatic,
	namespaceId: string
) {
	msw.use(
		http.delete(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(namespaceId);
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				);
			},
			{ once: true }
		)
	);
}

function mockListReferencesRequest(
	expect: ExpectStatic,
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

function mockDurableObjectNamespacesPermissionDeniedRequest(
	expect: ExpectStatic
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/durable_objects/namespaces",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				);
			}
		)
	);
}

function mockListReferencesPermissionDeniedRequest(
	expect: ExpectStatic,
	forScript: string
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts/:scriptName/references",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(forScript);
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				);
			},
			{ once: true }
		)
	);
}

function mockListTailsByConsumerRequest(
	expect: ExpectStatic,
	forScript: string,
	tails: Tail[] = []
) {
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

function mockListTailsByConsumerPermissionDeniedRequest(
	expect: ExpectStatic,
	forScript: string
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/tails/by-consumer/:scriptName",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(forScript);
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
						messages: [],
						result: null,
					},
					{ status: 403 }
				);
			},
			{ once: true }
		)
	);
}
