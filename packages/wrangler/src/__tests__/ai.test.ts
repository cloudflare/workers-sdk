import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
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

	it("should show help when no argument is passed", async ({ expect }) => {
		await runWrangler("ai");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler ai

			🤖 Manage AI models

			COMMANDS
			  wrangler ai models    List catalog models
			  wrangler ai finetune  Interact with finetune files

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when an invalid argument is passed", async ({
		expect,
	}) => {
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

			🤖 Manage AI models

			COMMANDS
			  wrangler ai models    List catalog models
			  wrangler ai finetune  Interact with finetune files

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			      --profile   Authentication profile to use for this command (allows multiple Cloudflare accounts)  [string]
			  -v, --version   Show version number  [boolean]"
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

	it("should handle finetune list", async ({ expect }) => {
		mockAIListFinetuneRequest();
		await runWrangler("ai finetune list");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┐
			│ finetune_id │ name │ description │
			├─┼─┼─┤
			│ 4d73459a-0000-4688-0000-b19fbb0e0fa5 │ instruct-demo1 │ │
			├─┼─┼─┤
			│ 55fc22b4-0000-4420-0000-25263a283b6a │ instruct-demo2 │ │
			├─┼─┼─┤
			│ 8901ff50-0000-408f-0000-8e9ea1d4eb39 │ instruct-demo3 │ │
			├─┼─┼─┤
			│ a18b81d0-0000-4891-0000-6fb8c8268142 │ instruct-demo4 │ │
			├─┼─┼─┤
			│ c4651c92-0000-49a4-0000-e26e57d108ca │ instruct-demo5 │ │
			├─┼─┼─┤
			│ f70cece8-0000-40e6-0000-81b97273d745 │ instruct-demo6 │ │
			└─┴─┴─┘"
		`);
	});

	it("should handle model list", async ({ expect }) => {
		mockAISearchRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┐
			│ model │ name │ description │ task │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			└─┴─┴─┴─┘"
		`);
	});

	it("should truncate model description", async ({ expect }) => {
		const original = process.stdout.columns;
		// Arbitrary fixed value for testing
		process.stdout.columns = 186;

		mockAIOverflowRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┐
			│ model │ name │ description │ task │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ overflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowoverflowover... │ Image Classification │
			└─┴─┴─┴─┘"
		`);
		process.stdout.columns = original;
	});

	it("should paginate results", async ({ expect }) => {
		const original = process.stdout.columns;
		// Arbitrary fixed value for testing
		process.stdout.columns = 186;
		mockAIPaginatedRequest();
		await runWrangler("ai models");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┐
			│ model │ name │ description │ task │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ │ Image Classification │
			├─┼─┼─┼─┤
			│ 429b9e8b-d99e-44de-91ad-706cf8183658 │ @cloudflare/embeddings_bge_large_en │ second page │ │
			├─┼─┼─┼─┤
			│ 7f9a76e1-d120-48dd-a565-101d328bbb02 │ @cloudflare/resnet50 │ second page │ Image Classification │
			└─┴─┴─┴─┘"
		`);
		process.stdout.columns = original;
	});
});

/** Create a mock handler for AI API */
function mockAIListFinetuneRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai/finetunes",
			() => {
				return HttpResponse.json(
					createFetchResult(
						[
							{
								id: "4d73459a-0000-4688-0000-b19fbb0e0fa5",
								name: "instruct-demo1",
								description: "",
							},
							{
								id: "55fc22b4-0000-4420-0000-25263a283b6a",
								name: "instruct-demo2",
								description: "",
							},
							{
								id: "8901ff50-0000-408f-0000-8e9ea1d4eb39",
								name: "instruct-demo3",
								description: "",
							},
							{
								id: "a18b81d0-0000-4891-0000-6fb8c8268142",
								name: "instruct-demo4",
								description: "",
							},
							{
								id: "c4651c92-0000-49a4-0000-e26e57d108ca",
								name: "instruct-demo5",
								description: "",
							},
							{
								id: "f70cece8-0000-40e6-0000-81b97273d745",
								name: "instruct-demo6",
								description: "",
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

function mockAISearchRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai/models/search",
			() => {
				return HttpResponse.json(
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
				);
			},
			{ once: true }
		)
	);
}

function mockAIOverflowRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai/models/search",
			() => {
				return HttpResponse.json(
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
				);
			},
			{ once: true }
		)
	);
}

function mockAIPaginatedRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai/models/search",
			() => {
				return HttpResponse.json(
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
			},
			{ once: true }
		),
		http.get(
			"*/accounts/:accountId/ai/models/search?per_page=50&page=2",
			() => {
				return HttpResponse.json(
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
			},
			{ once: true }
		)
	);
}
