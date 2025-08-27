import { http, HttpResponse } from "msw";
import { validateQueryFilter } from "../../vectorize/query";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { VectorizeQueryOptions } from "../../vectorize/types";

describe("vectorize help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("vectorize");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vectorize

			🧮 Manage Vectorize indexes

			COMMANDS
			  wrangler vectorize create <name>                 Create a Vectorize index
			  wrangler vectorize delete <name>                 Delete a Vectorize index
			  wrangler vectorize get <name>                    Get a Vectorize index by name
			  wrangler vectorize list                          List your Vectorize indexes
			  wrangler vectorize list-vectors <name>           List vector identifiers in a Vectorize index
			  wrangler vectorize query <name>                  Query a Vectorize index
			  wrangler vectorize insert <name>                 Insert vectors into a Vectorize index
			  wrangler vectorize upsert <name>                 Upsert vectors into a Vectorize index
			  wrangler vectorize get-vectors <name>            Get vectors from a Vectorize index
			  wrangler vectorize delete-vectors <name>         Delete vectors in a Vectorize index
			  wrangler vectorize info <name>                   Get additional details about the index
			  wrangler vectorize create-metadata-index <name>  Enable metadata filtering on the specified property
			  wrangler vectorize list-metadata-index <name>    List metadata properties on which metadata filtering is enabled
			  wrangler vectorize delete-metadata-index <name>  Delete metadata indexes

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
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

			🧮 Manage Vectorize indexes

			COMMANDS
			  wrangler vectorize create <name>                 Create a Vectorize index
			  wrangler vectorize delete <name>                 Delete a Vectorize index
			  wrangler vectorize get <name>                    Get a Vectorize index by name
			  wrangler vectorize list                          List your Vectorize indexes
			  wrangler vectorize list-vectors <name>           List vector identifiers in a Vectorize index
			  wrangler vectorize query <name>                  Query a Vectorize index
			  wrangler vectorize insert <name>                 Insert vectors into a Vectorize index
			  wrangler vectorize upsert <name>                 Upsert vectors into a Vectorize index
			  wrangler vectorize get-vectors <name>            Get vectors from a Vectorize index
			  wrangler vectorize delete-vectors <name>         Delete vectors in a Vectorize index
			  wrangler vectorize info <name>                   Get additional details about the index
			  wrangler vectorize create-metadata-index <name>  Enable metadata filtering on the specified property
			  wrangler vectorize list-metadata-index <name>    List metadata properties on which metadata filtering is enabled
			  wrangler vectorize delete-metadata-index <name>  Delete metadata indexes

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
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

			Get a Vectorize index by name

			POSITIONALS
			  name  The name of the Vectorize index.  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --json           Return output as clean JSON  [boolean] [default: false]
			      --deprecated-v1  Fetch a deprecated V1 Vectorize index. This must be enabled if the index was created with V1 option.  [boolean] [default: false]"
		`);
	});

	it("should show help when the query command is passed without an argument", async () => {
		await expect(() => runWrangler("vectorize query")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler vectorize query <name>

			Query a Vectorize index

			POSITIONALS
			  name  The name of the Vectorize index  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --vector           Vector to query the Vectorize Index  [number]
			      --vector-id        Identifier for a vector in the index against which the index should be queried  [string]
			      --top-k            The number of results (nearest neighbors) to return  [number] [default: 5]
			      --return-values    Specify if the vector values should be included in the results  [boolean] [default: false]
			      --return-metadata  Specify if the vector metadata should be included in the results  [string] [choices: \\"all\\", \\"indexed\\", \\"none\\"] [default: \\"none\\"]
			      --namespace        Filter the query results based on this namespace  [string]
			      --filter           Filter the query results based on this metadata filter.  [string]

			EXAMPLES
			  wrangler vectorize query --vector 1 2 3 0.5 1.25 6                                                                      Query the Vectorize Index by vector
			  wrangler vectorize query --vector $(jq -r '.[]' data.json | xargs)                                                      Query the Vectorize Index by vector from a json file that contains data in the format [1, 2, 3].
			  wrangler vectorize query --filter '{ 'p1': 'abc', 'p2': { '$ne': true }, 'p3': 10, 'p4': false, 'nested.p5': 'abcd' }'  Filter the query results."
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
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle creating a vectorize V1 index", async () => {
		mockVectorizeRequest();
		await runWrangler(
			"vectorize create some-index --dimensions=768 --metric=cosine --deprecated-v1=true"
		);
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCreation of legacy Vectorize indexes will be blocked by December 2024[0m

"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating index: 'some-index'
			✅ Successfully created a new Vectorize index: 'test-index'
			To access your new Vectorize Index in your Worker, add the following snippet to your configuration file:
			{
			  \\"vectorize\\": [
			    {
			      \\"binding\\": \\"VECTORIZE_INDEX\\",
			      \\"index_name\\": \\"test-index\\"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			"vectorize create test-index --dimensions=1536 --metric=euclidean"
		);
		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating index: 'test-index'
			✅ Successfully created a new Vectorize index: 'test-index'
			To access your new Vectorize Index in your Worker, add the following snippet to your configuration file:
			{
			  \\"vectorize\\": [
			    {
			      \\"binding\\": \\"VECTORIZE\\",
			      \\"index_name\\": \\"test-index\\"
			    }
			  ]
			}"
		`);
	});

	it("should handle creating a vectorize index with preset", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			"vectorize create test-index --preset=openai/text-embedding-ada-002"
		);
		expect(std.out).toMatchInlineSnapshot(`
			"Configuring index based for the embedding model openai/text-embedding-ada-002.
			🚧 Creating index: 'test-index'
			✅ Successfully created a new Vectorize index: 'test-index'
			To access your new Vectorize Index in your Worker, add the following snippet to your configuration file:
			{
			  \\"vectorize\\": [
			    {
			      \\"binding\\": \\"VECTORIZE\\",
			      \\"index_name\\": \\"test-index\\"
			    }
			  ]
			}"
		`);
	});

	it("should fail index creation with invalid metric", async () => {
		mockVectorizeV2Request();

		await expect(() =>
			runWrangler(
				"vectorize create test-index --dimensions=1536 --metric=pythagorian"
			)
		).rejects.toThrow(
			`Invalid values:
  Argument: metric, Given: "pythagorian", Choices: "euclidean", "cosine", "dot-product"`
		);

		expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

				    Argument: metric, Given: \\"pythagorian\\", Choices: \\"euclidean\\", \\"cosine\\", \\"dot-product\\"

				"
			`);
	});

	it("should fail index creation with invalid preset", async () => {
		mockVectorizeV2Request();

		await expect(() =>
			runWrangler(
				"vectorize create test-index --preset=openai/gpt-400-pro-max-ultra"
			)
		).rejects.toThrow(
			`Invalid values:
  Argument: preset, Given: "openai/gpt-400-pro-max-ultra", Choices: "@cf/baai/bge-small-en-v1.5", "@cf/baai/bge-base-en-v1.5", "@cf/baai/bge-large-en-v1.5", "openai/text-embedding-ada-002", "cohere/embed-multilingual-v2.0"`
		);

		expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

    Argument: preset, Given: \\"openai/gpt-400-pro-max-ultra\\", Choices: \\"@cf/baai/bge-small-en-v1.5\\",
  \\"@cf/baai/bge-base-en-v1.5\\", \\"@cf/baai/bge-large-en-v1.5\\", \\"openai/text-embedding-ada-002\\",
  \\"cohere/embed-multilingual-v2.0\\"

"
			`);
	});

	it("should fail index creation with invalid config", async () => {
		mockVectorizeV2Request();

		await expect(
			runWrangler("vectorize create test-index --dimensions=1536")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 You must provide both dimensions and a metric, or a known model preset when creating an index.]`
		);
	});

	it("should handle listing vectorize V1 indexes", async () => {
		mockVectorizeRequest();
		await runWrangler("vectorize list --deprecated-v1=true");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing Vectorize indexes...
			┌─┬─┬─┬─┬─┬─┐
			│ name │ dimensions │ metric │ description │ created │ modified │
			├─┼─┼─┼─┼─┼─┤
			│ test-index │ 768 │ cosine │ │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
			├─┼─┼─┼─┼─┼─┤
			│ another-index │ 3 │ euclidean │ │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle listing vectorize indexes", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize list");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing Vectorize indexes...
			┌─┬─┬─┬─┬─┬─┐
			│ name │ dimensions │ metric │ description │ created │ modified │
			├─┼─┼─┼─┼─┼─┤
			│ test-index │ 1536 │ euclidean │ test-desc │ 2024-07-11T13:02:18.00268Z │ 2024-07-11T13:02:18.00268Z │
			├─┼─┼─┼─┼─┼─┤
			│ another-index │ 32 │ dot-product │ another-desc │ 2024-07-11T13:02:18.00268Z │ 2024-07-11T13:02:18.00268Z │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should warn when there are no vectorize indexes", async () => {
		mockVectorizeV2RequestError();
		await runWrangler("vectorize list");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing Vectorize indexes..."
		`);

		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m[0m

  You haven't created any indexes on this account.

  Use 'wrangler vectorize create <name>' to create one, or visit
  [4mhttps://developers.cloudflare.com/vectorize/[0m to get started.


"
		`);
	});

	it("should handle a get on a vectorize V1 index", async () => {
		mockVectorizeRequest();
		await runWrangler("vectorize get test-index --deprecated-v1=true");
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┬─┐
			│ name │ dimensions │ metric │ description │ created │ modified │
			├─┼─┼─┼─┼─┼─┤
			│ test-index │ 768 │ cosine │ │ 2023-09-25T13:02:18.00268Z │ 2023-09-25T13:02:18.00268Z │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle a get on a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize get test-index");
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┬─┐
			│ name │ dimensions │ metric │ description │ created │ modified │
			├─┼─┼─┼─┼─┼─┤
			│ test-index │ 1536 │ euclidean │ test-desc │ 2024-07-11T13:02:18.00268Z │ 2024-07-11T13:02:18.00268Z │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle a delete on a vectorize V1 index", async () => {
		mockVectorizeRequest();
		mockConfirm({
			text: "OK to delete the index 'test-index'?",
			result: true,
		});
		await runWrangler("vectorize delete test-index --deprecated-v1=true");
		expect(std.out).toMatchInlineSnapshot(`
		"Deleting Vectorize index test-index
		✅ Deleted index test-index"
	`);
	});

	it("should handle a delete on a vectorize index", async () => {
		mockVectorizeV2Request();
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

	it("should handle a getByIds on a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize get-vectors test-index --ids a 'b'");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Fetching vectors...
[
  {
    \\"id\\": \\"a\\",
    \\"values\\": [
      1,
      2,
      3,
      4
    ],
    \\"namespace\\": \\"abcd\\",
    \\"metadata\\": {
      \\"a\\": true,
      \\"b\\": 123
    }
  },
  {
    \\"id\\": \\"b\\",
    \\"values\\": [
      5,
      6,
      7,
      8
    ],
    \\"metadata\\": {
      \\"c\\": false,
      \\"b\\": \\"123\\"
    }
  }
]"
		`);
	});

	it("should warn when there are no vectors matching the getByIds identifiers", async () => {
		mockVectorizeV2RequestError();
		await runWrangler("vectorize get-vectors test-index --ids a 'b'");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Fetching vectors..."
		`);

		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe index does not contain vectors corresponding to the provided identifiers[0m

"
		`);
	});

	it("should log error when getByIds does not receive ids", async () => {
		mockVectorizeV2Request();

		await expect(
			runWrangler("vectorize get-vectors test-index --ids")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Please provide valid vector identifiers.]`
		);
	});

	it("should handle a deleteByIds on a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize delete-vectors test-index --ids a 'b'");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Deleting vectors...
			✅ Successfully enqueued 2 vectors into index 'test-index' for deletion. Mutation changeset identifier: xxxxxx-xxxx-xxxx-xxxx-xxxxxx."
		`);
	});

	it("should log error when deleteByIds does not receive ids", async () => {
		mockVectorizeV2Request();

		await expect(
			runWrangler("vectorize delete-vectors test-index --ids")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Please provide valid vector identifiers for deletion.]`
		);
	});

	it("should handle a query on a vectorize index", async () => {
		mockVectorizeV2Request();
		// Parses the vector as [1, 2, 3, 4, 1.5, 2.6, 7, 8]
		await runWrangler(
			"vectorize query test-index --vector 1 2 3 '4' 1.5 '2.6' a 'b' null 7 abc 8 undefined"
		);
		expect(std.out).toMatchInlineSnapshot(querySnapshot);
	});

	it("should handle a query with a vector-id", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize query test-index --vector-id some-vector-id");
		expect(std.out).toMatchInlineSnapshot(querySnapshot);

		// No warning or error
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should handle a query on a vectorize index with all options", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			`vectorize query test-index --vector 1 2 3 '4' --top-k=2 --return-values=true --return-metadata=indexed --namespace=abc --filter '{ "p1": "abc", "p2": { "$ne": true }, "p3": 10, "p4": false, "nested.p5": "abcd" }'`
		);
		expect(std.out).toMatchInlineSnapshot(querySnapshot);

		// No warning > Valid filter
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	it("should proceed with querying and log warning if the filter is invalid", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			"vectorize query test-index --vector 1 2 3 '4' --filter='{ 'p1': [1,2,3] }'"
		);
		expect(std.out).toMatchInlineSnapshot(querySnapshot);

		expect(std.warn).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚨 Invalid query filter. Please use the recommended format.[0m

"
		`);
	});

	it("should warn when query returns no vectors", async () => {
		mockVectorizeV2RequestError();
		await runWrangler("vectorize query test-index --vector 1 2 3 '4'");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Searching for relevant vectors..."
		`);

		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCould not find any relevant vectors[0m

"
		`);
	});

	it("should fail query when neither vector nor vector-id is provided", async () => {
		mockVectorizeV2RequestError();
		await expect(
			runWrangler("vectorize query test-index --top-k=2 --return-values=true")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Either vector or vector-id parameter must be provided, but not both.]`
		);
	});

	it("should fail query when both vector and vector-id are provided", async () => {
		mockVectorizeV2RequestError();
		await expect(
			runWrangler(
				"vectorize query test-index --vector 1 2 3 '4' --vector-id some-vector-id"
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Either vector or vector-id parameter must be provided, but not both.]`
		);
	});

	it("should fail query with invalid return-metadata flag", async () => {
		mockVectorizeV2Request();

		await expect(() =>
			runWrangler(
				"vectorize query test-index --vector 1 2 3 '4' --return-metadata=truncated"
			)
		).rejects.toThrow(
			`Invalid values:
  Argument: return-metadata, Given: "truncated", Choices: "all", "indexed", "none"`
		);

		expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

				    Argument: return-metadata, Given: \\"truncated\\", Choices: \\"all\\", \\"indexed\\", \\"none\\"

				"
			`);
	});

	it("should handle info on a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize info test-index");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Fetching index info...
			┌─┬─┬─┬─┐
			│ dimensions │ vectorCount │ processedUpToMutation │ processedUpToDatetime │
			├─┼─┼─┼─┤
			│ 1024 │ 1000 │ 7f11d6e5-d126-4f76-936e-fbfec079e0be │ 2024-07-19T13:11:44.064Z │
			└─┴─┴─┴─┘"
		`);
	});

	it("should handle create metadata index", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			`vectorize create-metadata-index test-index --property-name='some-prop' --type='string'`
		);
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Creating metadata index...
			✅ Successfully enqueued metadata index creation request. Mutation changeset identifier: xxxxxx-xxxx-xxxx-xxxx-xxxxxx."
		`);
	});

	it("should error if create metadata index type is invalid", async () => {
		mockVectorizeV2Request();
		await expect(() =>
			runWrangler(
				`vectorize create-metadata-index test-index --property-name='some-prop' --type='array'`
			)
		).rejects.toThrow(`Invalid values:
  Argument: type, Given: "array", Choices: "string", "number", "boolean"`);

		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid values:[0m

			    Argument: type, Given: \\"array\\", Choices: \\"string\\", \\"number\\", \\"boolean\\"

			"
		`);
	});

	it("should handle list metadata index", async () => {
		mockVectorizeV2Request();
		await runWrangler(`vectorize list-metadata-index test-index`);
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Fetching metadata indexes...
			┌─┬─┐
			│ propertyName │ type │
			├─┼─┤
			│ string-prop │ string │
			├─┼─┤
			│ num-prop │ number │
			├─┼─┤
			│ bool-prop │ boolean │
			└─┴─┘"
		`);
	});

	it("should warn when list metadata indexes returns empty", async () => {
		mockVectorizeV2RequestError();
		await runWrangler("vectorize list-metadata-index test-index");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Fetching metadata indexes..."
		`);

		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m[0m

  You haven't created any metadata indexes on this account.

  Use 'wrangler vectorize create-metadata-index <name>' to create one, or visit
  [4mhttps://developers.cloudflare.com/vectorize/[0m to get started.


"
		`);
	});

	it("should handle delete metadata index", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			`vectorize delete-metadata-index test-index --property-name='some-prop'`
		);
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Deleting metadata index...
			✅ Successfully enqueued metadata index deletion request. Mutation changeset identifier: xxxxxx-xxxx-xxxx-xxxx-xxxxxx."
		`);
	});

	it("should show help when the list-vectors command is passed without an index", async () => {
		await expect(() => runWrangler("vectorize list-vectors")).rejects.toThrow(
			"Not enough non-option arguments: got 0, need at least 1"
		);

		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler vectorize list-vectors <name>

			List vector identifiers in a Vectorize index

			POSITIONALS
			  name  The name of the Vectorize index  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --count   Maximum number of vectors to return (1-1000)  [number]
			      --cursor  Cursor for pagination to get the next page of results  [string]
			      --json    Return output as clean JSON  [boolean] [default: false]

			EXAMPLES
			  wrangler vectorize list-vectors my-index                  List vector identifiers in the index 'my-index'
			  wrangler vectorize list-vectors my-index --count 50       List up to 50 vector identifiers
			  wrangler vectorize list-vectors my-index --cursor abc123  Continue listing from a specific cursor position"
		`);
	});

	it("should handle list-vectors on a vectorize index", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize list-vectors test-index");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing vectors in index 'test-index'...
			┌─┬─┐
			│ # │ Vector ID │
			├─┼─┤
			│ 1 │ vector-1 │
			├─┼─┤
			│ 2 │ vector-2 │
			├─┼─┤
			│ 3 │ vector-3 │
			└─┴─┘

			Showing 3 of 5 total vectors

			💡 To get the next page, run:
			   wrangler vectorize list-vectors test-index --cursor next-page-cursor"
		`);
	});

	it("should handle list-vectors with custom count parameter", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize list-vectors test-index --count 2");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing vectors in index 'test-index'...
			┌─┬─┐
			│ # │ Vector ID │
			├─┼─┤
			│ 1 │ vector-1 │
			├─┼─┤
			│ 2 │ vector-2 │
			└─┴─┘

			Showing 2 of 5 total vectors

			💡 To get the next page, run:
			   wrangler vectorize list-vectors test-index --cursor next-page-cursor"
		`);
	});

	it("should handle list-vectors with cursor pagination", async () => {
		mockVectorizeV2Request();
		await runWrangler(
			"vectorize list-vectors test-index --cursor next-page-cursor"
		);
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing vectors in index 'test-index'...
			┌─┬─┐
			│ # │ Vector ID │
			├─┼─┤
			│ 1 │ vector-4 │
			├─┼─┤
			│ 2 │ vector-5 │
			└─┴─┘

			Showing 2 of 5 total vectors"
		`);
	});

	it("should handle list-vectors with JSON output", async () => {
		mockVectorizeV2Request();
		await runWrangler("vectorize list-vectors test-index --json");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing vectors in index 'test-index'...
			{
			  \\"count\\": 3,
			  \\"totalCount\\": 5,
			  \\"isTruncated\\": true,
			  \\"nextCursor\\": \\"next-page-cursor\\",
			  \\"cursorExpirationTimestamp\\": \\"2025-08-13T20:32:52.469144957+00:00\\",
			  \\"vectors\\": [
			    {
			      \\"id\\": \\"vector-1\\"
			    },
			    {
			      \\"id\\": \\"vector-2\\"
			    },
			    {
			      \\"id\\": \\"vector-3\\"
			    }
			  ]
			}"
		`);
	});

	it("should warn when list-vectors returns no vectors", async () => {
		mockVectorizeV2RequestError();
		await runWrangler("vectorize list-vectors test-index");
		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing vectors in index 'test-index'..."
		`);

		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo vectors found in this index.[0m

"
		`);
	});
});

describe("vectorize query filter", () => {
	it("should parse correctly", async () => {
		let jsonString =
			'{ "p1": "abc", "p2": { "$ne": true }, "p3": 10, "p4": false, "nested.p5": "abcd", "p6": { "$in": ["a", 3, 4] }, "p7": {"$gt": 4, "$lte": "aaa"} }'; // Successful parse
		expect(
			JSON.stringify(validateQueryFilter(JSON.parse(jsonString)))
		).toMatchInlineSnapshot(
			`"{\\"p1\\":\\"abc\\",\\"p2\\":{\\"$ne\\":true},\\"p3\\":10,\\"p4\\":false,\\"nested.p5\\":\\"abcd\\",\\"p6\\":{\\"$in\\":[\\"a\\",3,4]},\\"p7\\":{\\"$gt\\":4,\\"$lte\\":\\"aaa\\"}}"`
		);

		jsonString =
			'{ "streaming_platform": "netflix", "has_viewed": { "$ne": true }, "prop_2": [1,2] }'; // Successful parse, with skipped prop
		expect(
			JSON.stringify(validateQueryFilter(JSON.parse(jsonString)))
		).toMatchInlineSnapshot(
			`"{\\"streaming_platform\\":\\"netflix\\",\\"has_viewed\\":{\\"$ne\\":true}}"`
		);

		jsonString = '{ "prop_5": "" }'; // Successful parse
		expect(
			JSON.stringify(validateQueryFilter(JSON.parse(jsonString)))
		).toMatchInlineSnapshot(`"{\\"prop_5\\":\\"\\"}"`);

		const jsonStrings = new Map<number, string>([
			[0, ""], // Does not get parsed as JSON Object
			[1, '{ "abc" }'], // Does not get parsed as JSON Object
			[2, '{ "abc": }'], // Does not get parsed as JSON Object
			[3, "abc"], // Does not get parsed as JSON Object
			[4, "100"], // Invalid json
			[5, "true"], // Invalid json
			[6, "null"], // Invalid json
			[7, '["abc","def"]'], // Invalid json
			[8, "{}"], // Empty result
			[9, '{ "prop_1": ["a", "b"] }'], // Skip field with array
			[10, '{ "prop_2": {} }'], // Skipping because inner is empty
			[11, '{ "prop_3": { "abc" } }'], // Does not get parsed as JSON Object
			[12, '{ "prop_4": { "abc": } }'], // Does not get parsed as JSON Object
			[13, '{ "prop_5": { ["abc","d"] } }'], // Does not get parsed as JSON Object
			[14, '{ "prop_6": { "abc": "def" } }'], // Invalid operator
			[15, '{ "prop_7": { "$ne": ["a", "b"] } }'], // Skipping because inner is array
			[16, '{ "prop_8": { "$ne" } }'], // Does not get parsed as JSON Object
			[17, '{ "prop_9": { "" } }'], // Does not get parsed as JSON Object
			[18, '{ "prop_10": { 100 } }'], // Does not get parsed as JSON Object
			[19, '{ "prop_11": { true } }'], // Does not get parsed as JSON Object
			[20, '{ "prop_12": { {} } }'], // Does not get parsed as JSON Object
			[21, '{ "prop_13": { "$ne": {} } }'], // Skipping operation because empty
			[22, '{"prop_14": {"address": {"$eq": "123 Main St"}}}'], // Invalid operator
		]);

		const parseFailureCases = new Set<number>();
		const validationFailureCases = new Set<number>();
		for (const [i, js] of [...jsonStrings]) {
			let jsObj: VectorizeQueryOptions["filter"];
			try {
				// This mimics the coerce behavior in the query options.
				jsObj = JSON.parse(js);
			} catch {
				parseFailureCases.add(i);
				continue;
			}
			// parse func should return null
			if (jsObj) {
				expect(validateQueryFilter(jsObj)).toBe(null);
			}
			validationFailureCases.add(i);
		}

		const expectedParseFailures = new Set<number>([
			0, 1, 2, 3, 11, 12, 13, 16, 17, 18, 19, 20,
		]);
		expect([...parseFailureCases]).toEqual([...expectedParseFailures]);

		const expectedvalidationFailures = new Set<number>([
			4, 5, 6, 7, 8, 9, 10, 14, 15, 21, 22,
		]);
		expect([...validationFailureCases]).toEqual([
			...expectedvalidationFailures,
		]);
	});
});

const querySnapshot = `
			"📋 Searching for relevant vectors...
{
  \\"count\\": 2,
  \\"matches\\": [
    {
      \\"id\\": \\"a\\",
      \\"score\\": 0.5,
      \\"values\\": [
        1,
        2,
        3,
        4
      ],
      \\"namespace\\": \\"abcd\\",
      \\"metadata\\": {
        \\"a\\": true,
        \\"b\\": 123
      }
    },
    {
      \\"id\\": \\"b\\",
      \\"score\\": 0.75,
      \\"values\\": [
        5,
        6,
        7,
        8
      ],
      \\"metadata\\": {
        \\"c\\": false,
        \\"b\\": \\"123\\"
      }
    }
  ]
}"`;

/** Create a mock handler for the Vectorize API */
function mockVectorizeRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/vectorize/indexes/test-index",
			() => {
				return HttpResponse.json(
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
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/indexes",
			() => {
				return HttpResponse.json(
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
				);
			},
			{ once: true }
		),
		http.delete(
			"*/accounts/:accountId/vectorize/indexes/test-index",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/indexes",
			() => {
				return HttpResponse.json(
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
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for the Vectorize V2 API */
function mockVectorizeV2Request() {
	msw.use(
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							created_on: "2024-07-11T13:02:18.00268Z",
							modified_on: "2024-07-11T13:02:18.00268Z",
							name: "test-index",
							description: "test-desc",
							config: {
								dimensions: 1536,
								metric: "euclidean",
							},
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							created_on: "2024-07-11T13:02:18.00268Z",
							modified_on: "2024-07-11T13:02:18.00268Z",
							name: "test-index",
							description: "test-desc",
							config: {
								dimensions: 1536,
								metric: "euclidean",
							},
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.delete(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/query",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							count: 2,
							matches: [
								{
									id: "a",
									score: 0.5,
									values: [1, 2, 3, 4],
									namespace: "abcd",
									metadata: {
										a: true,
										b: 123,
									},
								},
								{
									id: "b",
									score: 0.75,
									values: [5, 6, 7, 8],
									metadata: {
										c: false,
										b: "123",
									},
								},
							],
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/get_by_ids",
			() => {
				return HttpResponse.json(
					createFetchResult(
						[
							{
								id: "a",
								values: [1, 2, 3, 4],
								namespace: "abcd",
								metadata: {
									a: true,
									b: 123,
								},
							},
							{
								id: "b",
								values: [5, 6, 7, 8],
								metadata: {
									c: false,
									b: "123",
								},
							},
						],
						true
					)
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/delete_by_ids",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							mutationId: "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes",
			() => {
				return HttpResponse.json(
					createFetchResult(
						[
							{
								created_on: "2024-07-11T13:02:18.00268Z",
								modified_on: "2024-07-11T13:02:18.00268Z",
								name: "test-index",
								description: "test-desc",
								config: {
									dimensions: 1536,
									metric: "euclidean",
								},
							},
							{
								created_on: "2024-07-11T13:02:18.00268Z",
								modified_on: "2024-07-11T13:02:18.00268Z",
								name: "another-index",
								description: "another-desc",
								config: {
									dimensions: 32,
									metric: "dot-product",
								},
							},
						],
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/info",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							vectorCount: 1000,
							dimensions: 1024,
							processedUpToDatetime: "2024-07-19T13:11:44.064Z",
							processedUpToMutation: "7f11d6e5-d126-4f76-936e-fbfec079e0be",
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/metadata_index/create",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							mutationId: "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/metadata_index/list",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							metadataIndexes: [
								{
									propertyName: "string-prop",
									indexType: "string",
								},
								{
									propertyName: "num-prop",
									indexType: "number",
								},
								{
									propertyName: "bool-prop",
									indexType: "boolean",
								},
							],
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/metadata_index/delete",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							mutationId: "xxxxxx-xxxx-xxxx-xxxx-xxxxxx",
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/list",
			({ request }) => {
				const url = new URL(request.url);
				const count = url.searchParams.get("count");
				const cursor = url.searchParams.get("cursor");

				// Mock pagination logic
				if (cursor === "next-page-cursor") {
					const vectors = [{ id: "vector-4" }, { id: "vector-5" }];
					return HttpResponse.json(
						createFetchResult(
							{
								count: vectors.length,
								totalCount: 5,
								isTruncated: false,
								nextCursor: null,
								cursorExpirationTimestamp: null,
								vectors,
							},
							true
						)
					);
				}

				// Default first page response
				const pageSize = count ? parseInt(count) : 3;
				const mockVectors = [
					{ id: "vector-1" },
					{ id: "vector-2" },
					{ id: "vector-3" },
				];

				const returnedVectors = mockVectors.slice(0, pageSize);

				return HttpResponse.json(
					createFetchResult(
						{
							count: returnedVectors.length,
							totalCount: 5,
							isTruncated: returnedVectors.length < 5,
							nextCursor:
								returnedVectors.length < 5 ? "next-page-cursor" : null,
							cursorExpirationTimestamp: "2025-08-13T20:32:52.469144957+00:00",
							vectors: returnedVectors,
						},
						true
					)
				);
			},
			{ once: true }
		)
	);
}

function mockVectorizeV2RequestError() {
	msw.use(
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/query",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							count: 0,
							matches: [],
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes",
			() => {
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		),
		http.post(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/get_by_ids",
			() => {
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/metadata_index/list",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							metadataIndexes: [],
						},
						true
					)
				);
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/vectorize/v2/indexes/test-index/list",
			() => {
				return HttpResponse.json(
					createFetchResult(
						{
							count: 0,
							totalCount: 0,
							isTruncated: false,
							nextCursor: null,
							cursorExpirationTimestamp: null,
							vectors: [],
						},
						true
					)
				);
			},
			{ once: true }
		)
	);
}
