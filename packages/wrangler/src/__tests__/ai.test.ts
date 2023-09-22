import { rest } from "msw";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("ai help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("ai");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler ai

		🤖 Interact with AI models

		Commands:
		  wrangler ai models  List catalog models

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("ai asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler ai

		🤖 Interact with AI models

		Commands:
		  wrangler ai models  List catalog models

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});
});

describe("ai commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle model list", async () => {
		mockAIRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
		"┌──────────────────────────────────────┬─────────────────────────────────────┬─────────────┬──────────────────────┐
		│ model                                │ name                                │ description │ task                 │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		└──────────────────────────────────────┴─────────────────────────────────────┴─────────────┴──────────────────────┘"
	`);
	});

	it("should truncate model description", async () => {
		mockAIOverflowRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
		"┌──────────────────────────────────────┬─────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────┐
		│ model                                │ name                                │ description                                                                                             │ task                 │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │                                                                                                         │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │ overflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowover... │ Image Classification │
		└──────────────────────────────────────┴─────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────┘"
	`);
	});

	it("should paginate results", async () => {
		mockAIPaginatedRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
		"┌──────────────────────────────────────┬─────────────────────────────────────┬─────────────┬──────────────────────┐
		│ model                                │ name                                │ description │ task                 │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │             │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │             │ Image Classification │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ second page │                      │
		├──────────────────────────────────────┼─────────────────────────────────────┼─────────────┼──────────────────────┤
		│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50                │ second page │ Image Classification │
		└──────────────────────────────────────┴─────────────────────────────────────┴─────────────┴──────────────────────┘"
	`);
	});
});

/** Create a mock handler for AI API */
function mockAIRequest() {
	msw.use(
		rest.get("*/accounts/:accountId/ai/models/search", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								id: "429b9e8b-d99e-44de-91ad-706cf8183658",
								source: 1,
								task: null,
								tags: [],
								name: "@cloudflare/embeddings_bge_large_en",
								description: null,
							},
							{
								id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
								source: 1,
								task: {
									id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
									name: "Image Classification",
									description: null,
								},
								tags: [],
								name: "@cloudflare/resnet50",
								description: null,
							},
						],
						true
					)
				)
			);
		})
	);
}

function mockAIOverflowRequest() {
	msw.use(
		rest.get("*/accounts/:accountId/ai/models/search", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								id: "429b9e8b-d99e-44de-91ad-706cf8183658",
								source: 1,
								task: null,
								tags: [],
								name: "@cloudflare/embeddings_bge_large_en",
								description: null,
							},
							{
								id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
								source: 1,
								task: {
									id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
									name: "Image Classification",
									description: null,
								},
								tags: [],
								name: "@cloudflare/resnet50",
								description:
									"overflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflow",
							},
						],
						true
					)
				)
			);
		})
	);
}

function mockAIPaginatedRequest() {
	msw.use(
		rest.get("*/accounts/:accountId/ai/models/search", (req, res, ctx) => {
			const json = ctx.json(
				createFetchResult(
					[
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
						{
							id: "429b9e8b-d99e-44de-91ad-706cf8183658",
							source: 1,
							task: null,
							tags: [],
							name: "@cloudflare/embeddings_bge_large_en",
							description: null,
						},
						{
							id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
							source: 1,
							task: {
								id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
								name: "Image Classification",
								description: null,
							},
							tags: [],
							name: "@cloudflare/resnet50",
							description: null,
						},
					],
					true
				)
			);
			return res.once(json);
		}),
		rest.get(
			"*/accounts/:accountId/ai/models/search?per_page=50&page=2",
			(req, res, ctx) => {
				const json = ctx.json(
					createFetchResult(
						[
							{
								id: "429b9e8b-d99e-44de-91ad-706cf8183658",
								source: 1,
								task: null,
								tags: [],
								name: "@cloudflare/embeddings_bge_large_en",
								description: "second page",
							},
							{
								id: "7f9a76e1-d120-48dd-a565-101d328bbb02",
								source: 1,
								task: {
									id: "00cd182b-bf30-4fc4-8481-84a3ab349657",
									name: "Image Classification",
									description: null,
								},
								tags: [],
								name: "@cloudflare/resnet50",
								description: "second page",
							},
						],
						true
					)
				);
				return res.once(json);
			}
		)
	);
}
