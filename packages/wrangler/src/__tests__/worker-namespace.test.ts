import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- helper functions with expect */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { printWranglerBanner } from "../wrangler-banner";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	createFetchResult,
	msw,
	mswSuccessNamespacesHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Mock } from "vitest";

vi.mock("../wrangler-banner");

describe("dispatch-namespace", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswSuccessNamespacesHandlers));

	runInTempDir();
	mockAccountId();
	mockApiToken();

	it("should display a list of available subcommands, for dispatch-namespace with no subcommand", async () => {
		await runWrangler("dispatch-namespace");

		// wait a tick for the help menu to be printed
		await new Promise((resolve) => setImmediate(resolve));

		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "wrangler dispatch-namespace

			🏗️ Manage dispatch namespaces

			COMMANDS
			  wrangler dispatch-namespace list                        List all dispatch namespaces
			  wrangler dispatch-namespace get <name>                  Get information about a dispatch namespace
			  wrangler dispatch-namespace create <name>               Create a dispatch namespace
			  wrangler dispatch-namespace delete <name>               Delete a dispatch namespace
			  wrangler dispatch-namespace rename <oldName> <newName>  Rename a dispatch namespace

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]",
			  "warn": "",
			}
		`);
	});

	describe("create namespace", () => {
		const namespaceName = "my-namespace";
		let counter = 0;
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceNameParam",
				({ params }) => {
					counter++;
					const { namespaceNameParam } = params;
					expect(counter).toBe(1);
					expect(namespaceNameParam).toBe(namespaceName);
					return HttpResponse.json(
						createFetchResult({
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						})
					);
				},
				{ once: true }
			)
		);

		it("should display help for create", async () => {
			await expect(
				runWrangler("dispatch-namespace create")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler dispatch-namespace create <name>

				Create a dispatch namespace

				POSITIONALS
				  name  Name of the dispatch namespace  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should attempt to create the given namespace", async () => {
			await runWrangler(`dispatch-namespace create ${namespaceName}`);

			expect(std.out).toMatchInlineSnapshot(
				`"Created dispatch namespace "my-namespace" with ID "some-namespace-id""`
			);
		});
	});

	describe("delete namespace", () => {
		const namespaceName = "my-namespace";
		let counter = 0;
		msw.use(
			http.delete(
				"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceNameParam",
				({ params }) => {
					counter++;
					const { namespaceNameParam } = params;
					expect(counter).toBe(1);
					expect(namespaceNameParam).toBe(namespaceName);
					return HttpResponse.json(null);
				},
				{ once: true }
			)
		);

		it("should display help for delete", async () => {
			await expect(
				runWrangler("dispatch-namespace create")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler dispatch-namespace create <name>

				Create a dispatch namespace

				POSITIONALS
				  name  Name of the dispatch namespace  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should try to delete the given namespace", async () => {
			await runWrangler(`dispatch-namespace delete ${namespaceName}`);

			expect(std.out).toMatchInlineSnapshot(
				`"Deleted dispatch namespace "my-namespace""`
			);
		});
	});

	describe("get namespace", () => {
		const namespaceName = "my-namespace";
		let counter = 0;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceNameParam",
				({ params }) => {
					counter++;
					const { namespaceNameParam } = params;
					expect(counter).toBe(1);
					expect(namespaceNameParam).toBe(namespaceName);
					return HttpResponse.json(
						createFetchResult({
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						})
					);
				},
				{ once: true }
			)
		);

		it("should display help for get", async () => {
			await expect(
				runWrangler("dispatch-namespace get")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler dispatch-namespace get <name>

				Get information about a dispatch namespace

				POSITIONALS
				  name  Name of the dispatch namespace  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should attempt to get info for the given namespace", async () => {
			await runWrangler(`dispatch-namespace get ${namespaceName}`);

			expect(std.out).toMatchInlineSnapshot(`
				"{
				  namespace_id: 'some-namespace-id',
				  namespace_name: 'namespace-name',
				  created_on: '2022-06-29T14:30:08.16152Z',
				  created_by: '1fc1df98cc4420fe00367c3ab68c1639',
				  modified_on: '2022-06-29T14:30:08.16152Z',
				  modified_by: '1fc1df98cc4420fe00367c3ab68c1639'
				}"
			`);
		});
	});

	describe("list namespaces", () => {
		const namespaceName = "my-namespace";
		let counter = 0;
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceNameParam",
				({ params }) => {
					counter++;
					const { namespaceNameParam } = params;
					expect(counter).toBe(1);
					expect(namespaceNameParam).toBe(namespaceName);
					return HttpResponse.json(
						createFetchResult({
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						})
					);
				},
				{ once: true }
			)
		);

		it("should list all namespaces", async () => {
			await runWrangler("dispatch-namespace list");
			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    namespace_id: 'some-namespace-id',
				    namespace_name: 'namespace-name',
				    created_on: '2022-06-29T14:30:08.16152Z',
				    created_by: '1fc1df98cc4420fe00367c3ab68c1639',
				    modified_on: '2022-06-29T14:30:08.16152Z',
				    modified_by: '1fc1df98cc4420fe00367c3ab68c1639'
				  }
				]"
			`);
		});
	});

	describe("rename namespace", () => {
		const namespaceName = "my-namespace";
		let counter = 0;
		msw.use(
			http.put(
				"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceNameParam",
				({ params }) => {
					counter++;
					const { namespaceNameParam } = params;
					expect(counter).toBe(1);
					expect(namespaceNameParam).toBe(namespaceName);
					return HttpResponse.json(
						createFetchResult({
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						})
					);
				},
				{ once: true }
			)
		);

		it("should display help for rename", async () => {
			await expect(
				runWrangler("dispatch-namespace rename")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 2]`
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler dispatch-namespace rename <oldName> <newName>

				Rename a dispatch namespace

				POSITIONALS
				  oldName  Name of the dispatch namespace  [string] [required]
				  newName  New name of the dispatch namespace  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should attempt to rename the given namespace", async () => {
			const newName = "new-namespace";
			await runWrangler(
				`dispatch-namespace rename ${namespaceName} ${newName}`
			);

			expect(std.out).toMatchInlineSnapshot(
				`"Renamed dispatch namespace "my-namespace" to "new-namespace""`
			);
			expect((printWranglerBanner as Mock).mock.calls.length).toEqual(1);
		});
	});
});
