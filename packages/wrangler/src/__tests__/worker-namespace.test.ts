import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("worker-namespace", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

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
			await runWrangler(`worker-namespace create ${namespaceName}`);

			expect(std.out).toMatchInlineSnapshot(
				`"Created Worker namespace \\"my-namespace\\" with ID \\"some-namespace-id\\""`
			);
		});
	});

	describe("delete namespace", () => {
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
			await runWrangler(`worker-namespace delete ${namespaceName}`);

			expect(std.out).toMatchInlineSnapshot(
				`"Deleted Worker namespace \\"my-namespace\\""`
			);
		});
	});

	describe("get namespace", () => {
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
			await runWrangler(`worker-namespace get ${namespaceName}`);

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
		it("should list all namespaces", async () => {
			await runWrangler("worker-namespace list");

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
			await runWrangler(`worker-namespace rename ${namespaceName} ${newName}`);

			expect(std.out).toMatchInlineSnapshot(
				`"Renamed Worker namespace \\"my-namespace\\" to \\"new-namespace\\""`
			);
		});
	});
});
