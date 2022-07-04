import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("worker-namespace", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	afterEach(() => {
		unsetAllMocks();
	});

	it("should should display a list of available subcommands, for worker-namespace with no subcommand", async () => {
		await runWrangler("worker-namespace");

		// wait a tick for the help menu to be printed
		await new Promise((resolve) => setImmediate(resolve));

		expect(std).toMatchInlineSnapshot(`
		Object {
		  "debug": "",
		  "err": "",
		  "out": "wrangler worker-namespace

		📦 Interact with a worker namespace

		Commands:
		  wrangler worker-namespace list                          List all Worker namespaces
		  wrangler worker-namespace get <name>                    Get information about a Worker namespace
		  wrangler worker-namespace create <name>                 Create a Worker namespace
		  wrangler worker-namespace delete <name>                 Delete a Worker namespace
		  wrangler worker-namespace rename <old-name> <new-name>  Rename a Worker namespace

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]",
		  "warn": "",
		}
	`);
	});

	describe("create namespace", () => {
		function mockCreateRequest(expectedName: string) {
			const requests = { count: 0 };
			setMockResponse(
				"/accounts/:accountId/workers/dispatch/namespaces",
				([_url], init) => {
					requests.count += 1;

					const incomingText = init.body?.toString() || "";
					const { name: namespace_name } = JSON.parse(incomingText);

					expect(init.method).toBe("POST");
					expect(namespace_name).toEqual(expectedName);

					return {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					};
				}
			);
			return requests;
		}

		it("should display help for create", async () => {
			await expect(
				runWrangler("worker-namespace create")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Not enough non-option arguments: got 0, need at least 1"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler worker-namespace create <name>

			Create a Worker namespace

			Positionals:
			  name  Name of the Worker namespace  [string] [required]

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
		});

		it("should attempt to create the given namespace", async () => {
			const namespaceName = "my-namespace";
			const requests = mockCreateRequest(namespaceName);
			await runWrangler(`worker-namespace create ${namespaceName}`);
			expect(requests.count).toEqual(1);

			expect(std.out).toMatchInlineSnapshot(
				`"Created Worker namespace \\"my-namespace\\" with ID \\"some-namespace-id\\""`
			);
		});
	});

	describe("delete namespace", () => {
		function mockDeleteRequest(expectedName: string) {
			const requests = { count: 0 };
			setMockResponse(
				"/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
				([_url, _, namespaceName], init) => {
					requests.count += 1;

					expect(init.method).toBe("DELETE");
					expect(namespaceName).toEqual(expectedName);

					return null;
				}
			);
			return requests;
		}

		it("should display help for delete", async () => {
			await expect(
				runWrangler("worker-namespace create")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Not enough non-option arguments: got 0, need at least 1"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler worker-namespace create <name>

			Create a Worker namespace

			Positionals:
			  name  Name of the Worker namespace  [string] [required]

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
		});

		it("should try to delete the given namespace", async () => {
			const namespaceName = "my-namespace";
			const requests = mockDeleteRequest(namespaceName);
			await runWrangler(`worker-namespace delete ${namespaceName}`);
			expect(requests.count).toBe(1);

			expect(std.out).toMatchInlineSnapshot(
				`"Deleted Worker namespace \\"my-namespace\\""`
			);
		});
	});

	describe("get namespace", () => {
		function mockInfoRequest(expectedName: string) {
			const requests = { count: 0 };
			setMockResponse(
				"/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
				([_url, _, namespaceName], _init) => {
					requests.count += 1;

					expect(namespaceName).toEqual(expectedName);

					return {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					};
				}
			);
			return requests;
		}

		it("should display help for get", async () => {
			await expect(
				runWrangler("worker-namespace get")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Not enough non-option arguments: got 0, need at least 1"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			        "
			        wrangler worker-namespace get <name>

			        Get information about a Worker namespace

			        Positionals:
			          name  Name of the Worker namespace  [string] [required]

			        Flags:
			          -c, --config   Path to .toml configuration file  [string]
			          -h, --help     Show help  [boolean]
			          -v, --version  Show version number  [boolean]"
		      `);
		});

		it("should attempt to get info for the given namespace", async () => {
			const namespaceName = "my-namespace";
			const requests = mockInfoRequest(namespaceName);
			await runWrangler(`worker-namespace get ${namespaceName}`);
			expect(requests.count).toBe(1);

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
		function mockListRequest() {
			const requests = { count: 0 };
			setMockResponse(
				"/accounts/:accountId/workers/dispatch/namespaces",
				([_url, _, _page, _perPage], _init) => {
					requests.count += 1;

					return [
						{
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						},
					];
				}
			);
			return requests;
		}

		it("should list all namespaces", async () => {
			const requests = mockListRequest();
			await runWrangler("worker-namespace list");
			expect(requests.count).toBe(1);
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
		function mockRenameRequest(expectedName: string) {
			const requests = { count: 0 };
			setMockResponse(
				"/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
				([_url, _, namespaceName], init) => {
					requests.count += 1;

					expect(init.method).toEqual("PUT");
					expect(namespaceName).toEqual(expectedName);

					return {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					};
				}
			);
			return requests;
		}

		it("should display help for rename", async () => {
			await expect(
				runWrangler("worker-namespace rename")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Not enough non-option arguments: got 0, need at least 2"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler worker-namespace rename <old-name> <new-name>

			Rename a Worker namespace

			Positionals:
			  old-name  Name of the Worker namespace  [string] [required]
			  new-name  New name of the Worker namespace  [string] [required]

			Flags:
			  -c, --config   Path to .toml configuration file  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
		});

		it("should attempt to rename the given namespace", async () => {
			const namespaceName = "my-namespace";
			const newName = "new-namespace";
			const requests = mockRenameRequest(namespaceName);
			await runWrangler(`worker-namespace rename ${namespaceName} ${newName}`);
			expect(requests.count).toBe(1);
			expect(std.out).toMatchInlineSnapshot(
				`"Renamed Worker namespace \\"my-namespace\\" to \\"new-namespace\\""`
			);
		});
	});
});
