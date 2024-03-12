import { rest } from "msw";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("vectorize help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("vectorize");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler vectorize

		🔹Manage Vectorize indexes open beta

		Commands:
		  wrangler vectorize create <name>  🔹Create a Vectorize index
		  wrangler vectorize delete <name>  🔹Delete a Vectorize index
		  wrangler vectorize get <name>     🔹Get a Vectorize index by name
		  wrangler vectorize list           🔹List your Vectorize indexes
		  wrangler vectorize insert <name>  🔹Insert vectors into a Vectorize index

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		--------------------"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("vectorize foobarfofum")).rejects.toThrow(
			"Unknown argument: foobarfofum"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foobarfofum[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler vectorize

		🔹Manage Vectorize indexes open beta

		Commands:
		  wrangler vectorize create <name>  🔹Create a Vectorize index
		  wrangler vectorize delete <name>  🔹Delete a Vectorize index
		  wrangler vectorize get <name>     🔹Get a Vectorize index by name
		  wrangler vectorize list           🔹List your Vectorize indexes
		  wrangler vectorize insert <name>  🔹Insert vectors into a Vectorize index

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		--------------------"
	`);
	});

	it("should show help when the get command is passed without an index", async () => {
		await expect(() => runWrangler("vectorize get")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler vectorize get <name>

		🔹Get a Vectorize index by name

		Positionals:
		  name  The name of the Vectorize index.  [string] [required]

		Global Flags:
		  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
		  -c, --config                    ⚑Path to .toml configuration file  [string]
		  -e, --env                       ⚑Environment to use for operations and .env files  [string]
		  -h, --help                      ⚑Show help  [boolean]
		  -v, --version                   ⚑Show version number  [boolean]

		Options:
		      --json  return output as clean JSON  [boolean] [default: false]

		--------------------
		📣 Vectorize is currently in open beta
		📣 See the Vectorize docs for how to get started and known issues: https://developers.cloudflare.com/vectorize
		📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		📣 To give feedback, visit https://discord.cloudflare.com/
		--------------------"
	`);
	});
});

describe("vectorize commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle creating a vectorize index", async () => {
		mockVectorizeRequest();
		await runWrangler(
			"vectorize create some-index --dimensions=768 --metric=cosine"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"🚧 Creating index: 'some-index'
		✅ Successfully created a new Vectorize index: 'test-index'
		📋 To start querying from a Worker, add the following binding configuration into
		 'wrangler.toml':

		[[vectorize]]
		binding = \\"VECTORIZE_INDEX\\" # available within your Worker on
		env.VECTORIZE_INDEX
		index_name = \\"test-index\\""
	`);
	});

	it("should handle listing vectorize indexes", async () => {
		mockVectorizeRequest();
		await runWrangler("vectorize list");
		expect(std.out).toMatchInlineSnapshot(`
		"📋 Listing Vectorize indexes...
		┌───────────────┬────────────┬───────────┬─────────────┬────────────────────────────┬────────────────────────────┐
		│ name          │ dimensions │ metric    │ description │ created                    │ modified                   │
		├───────────────┼────────────┼───────────┼─────────────┼────────────────────────────┼────────────────────────────┤
		│ test-index    │ 768        │ cosine    │             │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
		├───────────────┼────────────┼───────────┼─────────────┼────────────────────────────┼────────────────────────────┤
		│ another-index │ 3          │ euclidean │             │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
		└───────────────┴────────────┴───────────┴─────────────┴────────────────────────────┴────────────────────────────┘"
	`);
	});

	it("should handle a get on a vectorize index", async () => {
		mockVectorizeRequest();
		await runWrangler("vectorize get test-index");
		expect(std.out).toMatchInlineSnapshot(`
		"┌────────────┬────────────┬────────┬─────────────┬────────────────────────────┬────────────────────────────┐
		│ name       │ dimensions │ metric │ description │ created                    │ modified                   │
		├────────────┼────────────┼────────┼─────────────┼────────────────────────────┼────────────────────────────┤
		│ test-index │ 768        │ cosine │             │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
		└────────────┴────────────┴────────┴─────────────┴────────────────────────────┴────────────────────────────┘"
	`);
	});

	it("should handle a delete on a vectorize index", async () => {
		mockVectorizeRequest();
		mockConfirm({
			text: "OK to delete the index 'test-index'?",
			result: true,
		});
		await runWrangler("vectorize delete test-index");
		expect(std.out).toMatchInlineSnapshot(`
		"Deleting Vectorize index test-index
		✅ Deleted index test-index"
	`);
	});
});

/** Create a mock handler for the Vectorize API */
function mockVectorizeRequest() {
	msw.use(
		rest.get(
			"*/accounts/:accountId/vectorize/indexes/test-index",
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(
							{
								created_on: "2023-09-25T13:02:18.00268Z",
								modified_on: "2023-09-25T13:02:18.00268Z",
								name: "test-index",
								description: "",
								config: {
									dimensions: 768,
									metric: "cosine",
								},
							},
							true
						)
					)
				);
			}
		),
		rest.post("*/accounts/:accountId/vectorize/indexes", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						{
							created_on: "2023-09-25T13:02:18.00268Z",
							modified_on: "2023-09-25T13:02:18.00268Z",
							name: "test-index",
							description: "",
							config: {
								dimensions: 768,
								metric: "cosine",
							},
						},
						true
					)
				)
			);
		}),
		rest.delete(
			"*/accounts/:accountId/vectorize/indexes/test-index",
			(req, res, ctx) => {
				return res.once(ctx.json(createFetchResult(null, true)));
			}
		),
		rest.get("*/accounts/:accountId/vectorize/indexes", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								created_on: "2023-09-25T13:02:18.00268Z",
								modified_on: "2023-09-25T13:02:18.00268Z",
								name: "test-index",
								description: "",
								config: {
									dimensions: 768,
									metric: "cosine",
								},
							},
							{
								created_on: "2023-09-25T13:02:18.00268Z",
								modified_on: "2023-09-25T13:02:18.00268Z",
								name: "another-index",
								description: "",
								config: {
									dimensions: 3,
									metric: "euclidean",
								},
							},
						],
						true
					)
				)
			);
		})
	);
}
