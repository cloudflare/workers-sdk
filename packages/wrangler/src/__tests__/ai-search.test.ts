import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// ── Shared test data ──────────────────────────────────────────────────────────

const MOCK_INSTANCE = {
	id: "my-instance",
	created_at: "2025-01-01T00:00:00Z",
	modified_at: "2025-01-02T00:00:00Z",
	source: "my-bucket",
	type: "r2",
	status: "active",
	ai_search_model: "@cf/meta/llama-3-8b",
	embedding_model: "@cf/bge-base-en-v1.5",
};

const MOCK_INSTANCE_2 = {
	id: "other-instance",
	created_at: "2025-02-01T00:00:00Z",
	modified_at: "2025-02-02T00:00:00Z",
	source: "https://example.com",
	type: "web-crawler",
	status: "active",
};

const MOCK_CHUNK = {
	id: "chunk-001",
	score: 0.9512,
	text: "This is a relevant text chunk from the indexed document.",
	type: "text",
	item: {
		key: "docs/readme.md",
		metadata: {},
		timestamp: 1700000000,
	},
};

const MOCK_CHUNK_LONG_TEXT = {
	id: "chunk-002",
	score: 0.8234,
	text: "This is a very long text chunk that exceeds eighty characters and should be truncated in the table output display.",
	type: "text",
	item: {
		key: "docs/guide.md",
	},
};

const MOCK_CHUNK_NO_ITEM = {
	id: "chunk-003",
	score: 0.7001,
	text: "Orphan chunk with no item reference.",
	type: "text",
};

const MOCK_ITEM = {
	id: "item-001",
	checksum: "abc123def456",
	chunks_count: 5,
	created_at: "2025-01-10T00:00:00Z",
	key: "docs/readme.md",
	modified_at: "2025-01-11T00:00:00Z",
	size: 2048,
	status: "completed",
	type: "text/markdown",
};

const MOCK_ITEM_2 = {
	id: "item-002",
	checksum: "789ghi012jkl",
	chunks_count: 3,
	created_at: "2025-01-12T00:00:00Z",
	key: "docs/guide.md",
	modified_at: "2025-01-13T00:00:00Z",
	size: 1024,
	status: "completed",
	type: "text/markdown",
};

const MOCK_JOB = {
	id: "job-001",
	source: "my-bucket",
	created_at: "2025-01-15T00:00:00Z",
	modified_at: "2025-01-15T01:00:00Z",
	status: "completed",
	end_reason: "success",
};

const MOCK_JOB_2 = {
	id: "job-002",
	source: "my-bucket",
	created_at: "2025-01-16T00:00:00Z",
	modified_at: "2025-01-16T01:00:00Z",
	status: "running",
};

const MOCK_STATS = {
	completed: 42,
	error: 2,
	file_embed_errors: 1,
	in_progress: 3,
	pending: 5,
	total: 53,
	failed: 2,
	processing: 3,
};

const MOCK_ITEM_LOG = {
	timestamp: "2025-01-10T00:00:00Z",
	action: "index",
	message: "Successfully indexed",
	fileKey: "docs/readme.md",
	chunkCount: 5,
	processingTimeMs: 120,
	errorType: null,
};

const MOCK_ITEM_LOG_ERROR = {
	timestamp: "2025-01-10T00:01:00Z",
	action: "index",
	message: "Failed to parse",
	fileKey: "docs/broken.md",
	chunkCount: null,
	processingTimeMs: null,
	errorType: "parse_error",
};

const MOCK_JOB_LOG = {
	id: "log-001",
	created_at: "2025-01-15T00:00:00Z",
	message: "Job started",
	level: "info",
};

const MOCK_JOB_LOG_2 = {
	id: "log-002",
	created_at: "2025-01-15T00:30:00Z",
	message: "Job completed",
	level: "info",
};

const MOCK_ITEM_CHUNK = {
	id: "ichunk-001",
	text: "This is a text chunk belonging to a specific item.",
	start_byte: 0,
	end_byte: 50,
	item: {
		key: "docs/readme.md",
	},
};

const MOCK_ITEM_CHUNK_2 = {
	id: "ichunk-002",
	text: "This is a very long item chunk text that exceeds eighty characters and should be truncated in the table output.",
	start_byte: 51,
	end_byte: 160,
	item: {
		key: "docs/readme.md",
	},
};

// ── Help / Namespace ──────────────────────────────────────────────────────────

describe("ai-search help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async ({ expect }) => {
		await runWrangler("ai-search");
		await endEventLoop();

		expect(std.out).toContain("wrangler ai-search");
		expect(std.out).toContain("Manage AI Search instances");
		expect(std.out).toContain("wrangler ai-search list");
		expect(std.out).toContain("wrangler ai-search create");
		expect(std.out).toContain("wrangler ai-search get");
		expect(std.out).toContain("wrangler ai-search update");
		expect(std.out).toContain("wrangler ai-search delete");
		expect(std.out).toContain("wrangler ai-search stats");
		expect(std.out).toContain("wrangler ai-search search");
		expect(std.out).toContain("wrangler ai-search chat");
		expect(std.out).toContain("wrangler ai-search playground");
		expect(std.out).toContain("wrangler ai-search items");
		expect(std.out).toContain("wrangler ai-search jobs");
	});

	it("should show help when an invalid argument is passed", async ({
		expect,
	}) => {
		await expect(() => runWrangler("ai-search foobar")).rejects.toThrow(
			"Unknown argument: foobar"
		);

		expect(std.err).toContain("Unknown argument: foobar");
		expect(std.out).toContain("wrangler ai-search");
		expect(std.out).toContain("Manage AI Search instances");
	});
});

// ── Command tests ─────────────────────────────────────────────────────────────

describe("ai-search commands", () => {
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

	// ── list ────────────────────────────────────────────────────────────────────

	describe("list", () => {
		it("should list instances", async ({ expect }) => {
			mockListInstances([MOCK_INSTANCE, MOCK_INSTANCE_2]);
			await runWrangler("ai-search list");
			expect(std.out).toContain("my-instance");
			expect(std.out).toContain("other-instance");
			expect(std.out).toContain("r2");
			expect(std.out).toContain("web-crawler");
		});

		it("should list instances as JSON", async ({ expect }) => {
			mockListInstances([MOCK_INSTANCE]);
			await runWrangler("ai-search list --json");
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_INSTANCE]);
		});

		it("should warn when no instances exist", async ({ expect }) => {
			mockListInstances([]);
			await runWrangler("ai-search list");
			expect(std.warn).toContain(
				"You haven't created any AI Search instances on this account."
			);
		});

		it("should warn when page is out of range", async ({ expect }) => {
			mockListInstances([]);
			await runWrangler("ai-search list --page 99");
			expect(std.warn).toContain(
				"No instances found on page 99. Please try a smaller page number."
			);
		});

		it("should pass pagination params", async ({ expect }) => {
			let capturedUrl: URL | undefined;
			msw.use(
				http.get(
					"*/accounts/:accountId/ai-search/instances",
					({ request }) => {
						capturedUrl = new URL(request.url);
						return HttpResponse.json(
							createFetchResult([], true, [], [], {
								page: 2,
								per_page: 5,
								count: 0,
								total_count: 0,
							})
						);
					},
					{ once: true }
				)
			);
			await runWrangler("ai-search list --page 2 --per-page 5");
			expect(capturedUrl?.searchParams.get("page")).toBe("2");
			expect(capturedUrl?.searchParams.get("per_page")).toBe("5");
		});
	});

	// ── create ──────────────────────────────────────────────────────────────────

	describe("create", () => {
		it("should create an R2 instance with all flags", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			mockListTokens([
				{
					id: "tok-1",
					name: "test",
					status: "active",
					created_at: "2025-01-01T00:00:00Z",
					modified_at: "2025-01-01T00:00:00Z",
				},
			]);
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(createFetchResult(MOCK_INSTANCE, true));
					},
					{ once: true }
				)
			);
			await runWrangler(
				"ai-search create my-instance --type r2 --source my-bucket --embedding-model @cf/bge-base-en-v1.5 --ai-search-model @cf/meta/llama-3-8b --chunk-size 512 --chunk-overlap 64 --max-num-results 10 --reranking --hybrid-search --cache --score-threshold 0.5"
			);
			expect(capturedBody).toMatchObject({
				id: "my-instance",
				source: "my-bucket",
				type: "r2",
				embedding_model: "@cf/bge-base-en-v1.5",
				ai_search_model: "@cf/meta/llama-3-8b",
				chunk_size: 512,
				chunk_overlap: 64,
				max_num_results: 10,
				reranking: true,
				hybrid_search_enabled: true,
				cache: true,
				score_threshold: 0.5,
			});
		});

		it("should create instance and print details", async ({ expect }) => {
			mockListTokens([
				{
					id: "tok-1",
					name: "test",
					status: "active",
					created_at: "2025-01-01T00:00:00Z",
					modified_at: "2025-01-01T00:00:00Z",
				},
			]);
			mockCreateInstance(MOCK_INSTANCE);
			await runWrangler(
				"ai-search create my-instance --type r2 --source my-bucket"
			);
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
			expect(std.out).toContain("Type:       r2");
			expect(std.out).toContain("Source:     my-bucket");
		});

		it("should create instance as JSON", async ({ expect }) => {
			mockListTokens([
				{
					id: "tok-1",
					name: "test",
					status: "active",
					created_at: "2025-01-01T00:00:00Z",
					modified_at: "2025-01-01T00:00:00Z",
				},
			]);
			mockCreateInstance(MOCK_INSTANCE);
			await runWrangler(
				"ai-search create my-instance --type r2 --source my-bucket --json"
			);
			// The create command logs a progress message then JSON;
			// extract the JSON object from the output
			const jsonMatch = std.out.match(/\{[\s\S]*\}/);
			expect(jsonMatch).not.toBeNull();
			const parsed = JSON.parse(jsonMatch![0]);
			expect(parsed.id).toBe("my-instance");
			expect(parsed.type).toBe("r2");
		});

		it("should send source_params with prefix and include/exclude items", async ({
			expect,
		}) => {
			let capturedBody: Record<string, unknown> | undefined;
			mockListTokens([
				{
					id: "tok-1",
					name: "test",
					status: "active",
					created_at: "2025-01-01T00:00:00Z",
					modified_at: "2025-01-01T00:00:00Z",
				},
			]);
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(createFetchResult(MOCK_INSTANCE, true));
					},
					{ once: true }
				)
			);
			await runWrangler(
				'ai-search create my-instance --type r2 --source my-bucket --prefix docs/ --include-items "*.md" --exclude-items "*.tmp"'
			);
			expect(capturedBody).toMatchObject({
				source_params: {
					prefix: "docs/",
					include_items: ["*.md"],
					exclude_items: ["*.tmp"],
				},
			});
		});
	});

	// ── get ──────────────────────────────────────────────────────────────────────

	describe("get", () => {
		it("should get instance details", async ({ expect }) => {
			mockGetInstance(MOCK_INSTANCE);
			await runWrangler("ai-search get my-instance");
			expect(std.out).toContain("my-instance");
			expect(std.out).toContain("r2");
			expect(std.out).toContain("active");
			expect(std.out).toContain("my-bucket");
		});

		it("should get instance as JSON", async ({ expect }) => {
			mockGetInstance(MOCK_INSTANCE);
			await runWrangler("ai-search get my-instance --json");
			const parsed = JSON.parse(std.out);
			expect(parsed.id).toBe("my-instance");
			expect(parsed.type).toBe("r2");
			expect(parsed.source).toBe("my-bucket");
		});

		it("should error when name is missing", async ({ expect }) => {
			await expect(() => runWrangler("ai-search get")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	// ── update ──────────────────────────────────────────────────────────────────

	describe("update", () => {
		it("should update instance with flags", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.put(
					"*/accounts/:accountId/ai-search/instances/:name",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(createFetchResult(MOCK_INSTANCE, true));
					},
					{ once: true }
				)
			);
			await runWrangler(
				"ai-search update my-instance --embedding-model @cf/bge-base-en-v1.5 --chunk-size 256 --reranking --paused"
			);
			expect(capturedBody).toMatchObject({
				embedding_model: "@cf/bge-base-en-v1.5",
				chunk_size: 256,
				reranking: true,
				paused: true,
			});
			expect(std.out).toContain(
				'Successfully updated AI Search instance "my-instance"'
			);
		});

		it("should update instance as JSON", async ({ expect }) => {
			mockUpdateInstance(MOCK_INSTANCE);
			await runWrangler("ai-search update my-instance --paused --json");
			// The update command logs a progress message then JSON;
			// extract the JSON object from the output
			const jsonMatch = std.out.match(/\{[\s\S]*\}/);
			expect(jsonMatch).not.toBeNull();
			const parsed = JSON.parse(jsonMatch![0]);
			expect(parsed.id).toBe("my-instance");
		});

		it("should only send provided fields", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.put(
					"*/accounts/:accountId/ai-search/instances/:name",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(createFetchResult(MOCK_INSTANCE, true));
					},
					{ once: true }
				)
			);
			await runWrangler("ai-search update my-instance --cache");
			expect(capturedBody).toEqual({ cache: true });
		});
	});

	// ── delete ──────────────────────────────────────────────────────────────────

	describe("delete", () => {
		it("should delete with confirmation", async ({ expect }) => {
			mockConfirm({
				text: "OK to delete the AI Search instance 'my-instance'?",
				result: true,
			});
			mockDeleteInstance();
			await runWrangler("ai-search delete my-instance");
			expect(std.out).toContain(
				'Successfully deleted AI Search instance "my-instance"'
			);
		});

		it("should cancel deletion when not confirmed", async ({ expect }) => {
			mockConfirm({
				text: "OK to delete the AI Search instance 'my-instance'?",
				result: false,
			});
			await runWrangler("ai-search delete my-instance");
			expect(std.out).toContain("Deletion cancelled.");
		});

		it("should delete with --force flag", async ({ expect }) => {
			mockDeleteInstance();
			await runWrangler("ai-search delete my-instance --force");
			expect(std.out).toContain(
				'Successfully deleted AI Search instance "my-instance"'
			);
		});
	});

	// ── stats ───────────────────────────────────────────────────────────────────

	describe("stats", () => {
		it("should display stats in table", async ({ expect }) => {
			mockGetStats(MOCK_STATS);
			await runWrangler("ai-search stats my-instance");
			expect(std.out).toContain("42");
			expect(std.out).toContain("2");
			expect(std.out).toContain("1");
			expect(std.out).toContain("3");
			expect(std.out).toContain("5");
			expect(std.out).toContain("53");
		});

		it("should display stats as JSON", async ({ expect }) => {
			mockGetStats(MOCK_STATS);
			await runWrangler("ai-search stats my-instance --json");
			const parsed = JSON.parse(std.out);
			expect(parsed.completed).toBe(42);
			expect(parsed.error).toBe(2);
			expect(parsed.total).toBe(53);
		});
	});

	// ── search ──────────────────────────────────────────────────────────────────

	describe("search", () => {
		it("should perform a search query", async ({ expect }) => {
			mockSearchInstance({
				chunks: [MOCK_CHUNK],
				search_query: "test query",
			});
			await runWrangler('ai-search search my-instance --query "test query"');
			expect(std.out).toContain('Search query: "test query"  (1 results)');
			expect(std.out).toContain("0.9512");
			expect(std.out).toContain("docs/readme.md");
		});

		it("should output search results as JSON", async ({ expect }) => {
			const response = {
				chunks: [MOCK_CHUNK],
				search_query: "test query",
			};
			mockSearchInstance(response);
			await runWrangler(
				'ai-search search my-instance --query "test query" --json'
			);
			const parsed = JSON.parse(std.out);
			expect(parsed.search_query).toBe("test query");
			expect(parsed.chunks).toHaveLength(1);
			expect(parsed.chunks[0].score).toBe(0.9512);
		});

		it("should handle empty results", async ({ expect }) => {
			mockSearchInstance({
				chunks: [],
				search_query: "no matches",
			});
			await runWrangler('ai-search search my-instance --query "no matches"');
			expect(std.out).toContain('Search query: "no matches"  (0 results)');
			expect(std.out).toContain("No results found.");
		});

		it("should truncate long text at 80 chars", async ({ expect }) => {
			mockSearchInstance({
				chunks: [MOCK_CHUNK_LONG_TEXT],
				search_query: "test",
			});
			await runWrangler('ai-search search my-instance --query "test"');
			// The original text is > 80 chars, so it should be truncated with "..."
			expect(std.out).toContain("...");
			// Should NOT contain the full text
			expect(std.out).not.toContain(MOCK_CHUNK_LONG_TEXT.text);
		});

		it("should parse --filter flags", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances/:name/search",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(
							createFetchResult({ chunks: [], search_query: "test" }, true)
						);
					},
					{ once: true }
				)
			);
			await runWrangler(
				'ai-search search my-instance --query "test" --filter type=docs --filter lang=en'
			);
			expect(capturedBody).toMatchObject({
				messages: [{ role: "user", content: "test" }],
				filters: { type: "docs", lang: "en" },
			});
		});

		it("should warn on malformed filters", async ({ expect }) => {
			mockSearchInstance({
				chunks: [],
				search_query: "test",
			});
			await runWrangler(
				'ai-search search my-instance --query "test" --filter badformat'
			);
			expect(std.warn).toContain(
				'Ignoring malformed filter "badformat" (expected key=value)'
			);
		});

		it("should handle chunk with missing item key", async ({ expect }) => {
			mockSearchInstance({
				chunks: [MOCK_CHUNK_NO_ITEM],
				search_query: "test",
			});
			await runWrangler('ai-search search my-instance --query "test"');
			expect(std.out).toContain("0.7001");
			expect(std.out).toContain("Orphan chunk with no item reference.");
		});

		it("should send messages in correct format", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances/:name/search",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json(
							createFetchResult(
								{ chunks: [], search_query: "hello world" },
								true
							)
						);
					},
					{ once: true }
				)
			);
			await runWrangler('ai-search search my-instance --query "hello world"');
			expect(capturedBody).toEqual({
				messages: [{ role: "user", content: "hello world" }],
			});
		});
	});

	// ── chat ────────────────────────────────────────────────────────────────────

	describe("chat", () => {
		it("should perform a chat completion", async ({ expect }) => {
			mockChatCompletions({
				choices: [
					{
						message: { content: "Here is your answer.", role: "assistant" },
						index: 0,
					},
				],
				chunks: [MOCK_CHUNK],
			});
			await runWrangler(
				'ai-search chat my-instance --query "What is Workers?"'
			);
			expect(std.out).toContain("Here is your answer.");
		});

		it("should output chat as JSON", async ({ expect }) => {
			const response = {
				choices: [
					{ message: { content: "Answer.", role: "assistant" }, index: 0 },
				],
				chunks: [MOCK_CHUNK],
				id: "chat-001",
				model: "@cf/meta/llama-3-8b",
			};
			mockChatCompletions(response);
			await runWrangler('ai-search chat my-instance --query "test" --json');
			const parsed = JSON.parse(std.out);
			expect(parsed.choices[0].message.content).toBe("Answer.");
			expect(parsed.chunks).toHaveLength(1);
		});

		it("should include system prompt", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances/:name/chat/completions",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json({
							choices: [
								{ message: { content: "Ok.", role: "assistant" }, index: 0 },
							],
							chunks: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(
				'ai-search chat my-instance --query "test" --system-prompt "You are helpful"'
			);
			const messages = capturedBody?.messages as Array<{
				role: string;
				content: string;
			}>;
			expect(messages[0]).toEqual({
				role: "system",
				content: "You are helpful",
			});
			expect(messages[1]).toEqual({ role: "user", content: "test" });
		});

		it("should include model override", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances/:name/chat/completions",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json({
							choices: [
								{ message: { content: "Ok.", role: "assistant" }, index: 0 },
							],
							chunks: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(
				'ai-search chat my-instance --query "test" --model @cf/meta/llama-3-8b'
			);
			expect(capturedBody?.model).toBe("@cf/meta/llama-3-8b");
		});

		it("should print sources footer", async ({ expect }) => {
			mockChatCompletions({
				choices: [
					{ message: { content: "Answer.", role: "assistant" }, index: 0 },
				],
				chunks: [MOCK_CHUNK, MOCK_CHUNK_LONG_TEXT],
			});
			await runWrangler('ai-search chat my-instance --query "test"');
			expect(std.out).toContain("-- Sources");
			expect(std.out).toContain("1. docs/readme.md (score: 0.95)");
			expect(std.out).toContain("2. docs/guide.md (score: 0.82)");
		});

		it("should handle no response", async ({ expect }) => {
			mockChatCompletions({
				choices: [{ message: { content: "", role: "assistant" }, index: 0 }],
				chunks: [],
			});
			await runWrangler('ai-search chat my-instance --query "test"');
			expect(std.out).toContain("(No response generated)");
		});

		it("should parse --filter flags", async ({ expect }) => {
			let capturedBody: Record<string, unknown> | undefined;
			msw.use(
				http.post(
					"*/accounts/:accountId/ai-search/instances/:name/chat/completions",
					async ({ request }) => {
						capturedBody = (await request.json()) as Record<string, unknown>;
						return HttpResponse.json({
							choices: [
								{ message: { content: "Ok.", role: "assistant" }, index: 0 },
							],
							chunks: [],
						});
					},
					{ once: true }
				)
			);
			await runWrangler(
				'ai-search chat my-instance --query "test" --filter type=docs --filter lang=en'
			);
			expect(capturedBody?.filters).toEqual({ type: "docs", lang: "en" });
		});
	});

	// ── playground ──────────────────────────────────────────────────────────────

	describe("playground", () => {
		it("should error in non-interactive mode", async ({ expect }) => {
			setIsTTY(false);
			mockGetInstance(MOCK_INSTANCE);
			await expect(() =>
				runWrangler("ai-search playground my-instance")
			).rejects.toThrow(
				"The playground command requires an interactive terminal."
			);
		});
	});

	// ── items list ──────────────────────────────────────────────────────────────

	describe("items list", () => {
		it("should list items", async ({ expect }) => {
			mockListItems([MOCK_ITEM, MOCK_ITEM_2]);
			await runWrangler("ai-search items list my-instance");
			expect(std.out).toContain("item-001");
			expect(std.out).toContain("docs/readme.md");
			expect(std.out).toContain("item-002");
			expect(std.out).toContain("docs/guide.md");
		});

		it("should list items as JSON", async ({ expect }) => {
			mockListItems([MOCK_ITEM]);
			await runWrangler("ai-search items list my-instance --json");
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_ITEM]);
		});

		it("should warn when no items exist", async ({ expect }) => {
			mockListItems([]);
			await runWrangler("ai-search items list my-instance");
			expect(std.warn).toContain("No indexed items found for this instance.");
		});

		it("should pass pagination params", async ({ expect }) => {
			let capturedUrl: URL | undefined;
			msw.use(
				http.get(
					"*/accounts/:accountId/ai-search/instances/:name/items",
					({ request }) => {
						capturedUrl = new URL(request.url);
						return HttpResponse.json(
							createFetchResult([], true, [], [], {
								page: 2,
								per_page: 5,
								count: 0,
								total_count: 0,
							})
						);
					},
					{ once: true }
				)
			);
			await runWrangler(
				"ai-search items list my-instance --page 2 --per-page 5"
			);
			expect(capturedUrl?.searchParams.get("page")).toBe("2");
			expect(capturedUrl?.searchParams.get("per_page")).toBe("5");
		});
	});

	// ── items get ───────────────────────────────────────────────────────────────

	describe("items get", () => {
		it("should get item details", async ({ expect }) => {
			mockGetItem(MOCK_ITEM);
			await runWrangler("ai-search items get my-instance --item-id item-001");
			expect(std.out).toContain("item-001");
			expect(std.out).toContain("docs/readme.md");
			expect(std.out).toContain("completed");
			expect(std.out).toContain("abc123def456");
		});

		it("should get item as JSON", async ({ expect }) => {
			mockGetItem(MOCK_ITEM);
			await runWrangler(
				"ai-search items get my-instance --item-id item-001 --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed.id).toBe("item-001");
			expect(parsed.key).toBe("docs/readme.md");
		});

		it("should require --item-id flag", async ({ expect }) => {
			await expect(() =>
				runWrangler("ai-search items get my-instance")
			).rejects.toThrow("Missing required argument: item-id");
		});
	});

	// ── items logs ──────────────────────────────────────────────────────────────

	describe("items logs", () => {
		it("should list item logs", async ({ expect }) => {
			mockGetItemLogs([MOCK_ITEM_LOG, MOCK_ITEM_LOG_ERROR]);
			await runWrangler("ai-search items logs my-instance --item-id item-001");
			expect(std.out).toContain("index");
			expect(std.out).toContain("Successfully indexed");
			expect(std.out).toContain("parse_error");
		});

		it("should list item logs as JSON", async ({ expect }) => {
			mockGetItemLogs([MOCK_ITEM_LOG]);
			await runWrangler(
				"ai-search items logs my-instance --item-id item-001 --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_ITEM_LOG]);
		});

		it("should warn when no logs exist", async ({ expect }) => {
			mockGetItemLogs([]);
			await runWrangler("ai-search items logs my-instance --item-id item-001");
			expect(std.warn).toContain("No log entries found for this item.");
		});

		it("should pass limit and cursor params", async ({ expect }) => {
			let capturedUrl: URL | undefined;
			msw.use(
				http.get(
					"*/accounts/:accountId/ai-search/instances/:name/items/:itemId/logs",
					({ request }) => {
						capturedUrl = new URL(request.url);
						return HttpResponse.json(createFetchResult([], true));
					},
					{ once: true }
				)
			);
			await runWrangler(
				"ai-search items logs my-instance --item-id item-001 --limit 10 --cursor abc123"
			);
			expect(capturedUrl?.searchParams.get("limit")).toBe("10");
			expect(capturedUrl?.searchParams.get("cursor")).toBe("abc123");
		});
	});

	// ── items chunks ────────────────────────────────────────────────────────────

	describe("items chunks", () => {
		it("should list item chunks", async ({ expect }) => {
			mockListItemChunks([MOCK_ITEM_CHUNK]);
			await runWrangler(
				"ai-search items chunks my-instance --item-id item-001"
			);
			expect(std.out).toContain("ichunk-001");
			expect(std.out).toContain("docs/readme.md");
		});

		it("should list chunks as JSON", async ({ expect }) => {
			mockListItemChunks([MOCK_ITEM_CHUNK]);
			await runWrangler(
				"ai-search items chunks my-instance --item-id item-001 --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_ITEM_CHUNK]);
		});

		it("should truncate text at 80 chars", async ({ expect }) => {
			mockListItemChunks([MOCK_ITEM_CHUNK_2]);
			await runWrangler(
				"ai-search items chunks my-instance --item-id item-001"
			);
			expect(std.out).toContain("...");
			expect(std.out).not.toContain(MOCK_ITEM_CHUNK_2.text);
		});

		it("should warn when no chunks exist", async ({ expect }) => {
			mockListItemChunks([]);
			await runWrangler(
				"ai-search items chunks my-instance --item-id item-001"
			);
			expect(std.warn).toContain("No chunks found for this item.");
		});
	});

	// ── jobs list ───────────────────────────────────────────────────────────────

	describe("jobs list", () => {
		it("should list jobs", async ({ expect }) => {
			mockListJobs([MOCK_JOB, MOCK_JOB_2]);
			await runWrangler("ai-search jobs list my-instance");
			expect(std.out).toContain("job-001");
			expect(std.out).toContain("completed");
			expect(std.out).toContain("job-002");
			expect(std.out).toContain("running");
		});

		it("should list jobs as JSON", async ({ expect }) => {
			mockListJobs([MOCK_JOB]);
			await runWrangler("ai-search jobs list my-instance --json");
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_JOB]);
		});

		it("should warn when no jobs exist", async ({ expect }) => {
			mockListJobs([]);
			await runWrangler("ai-search jobs list my-instance");
			expect(std.warn).toContain("No indexing jobs found for this instance.");
		});
	});

	// ── jobs create ─────────────────────────────────────────────────────────────

	describe("jobs create", () => {
		it("should trigger an indexing job", async ({ expect }) => {
			mockCreateJob(MOCK_JOB);
			await runWrangler("ai-search jobs create my-instance");
			expect(std.out).toContain("Successfully triggered indexing job");
			expect(std.out).toContain("Job ID:  job-001");
			expect(std.out).toContain("Source:  my-bucket");
			expect(std.out).toContain("Status:  completed");
		});

		it("should output created job as JSON", async ({ expect }) => {
			mockCreateJob(MOCK_JOB);
			await runWrangler("ai-search jobs create my-instance --json");
			// The jobs create command logs a progress message then JSON;
			// extract the JSON object from the output
			const jsonMatch = std.out.match(/\{[\s\S]*\}/);
			expect(jsonMatch).not.toBeNull();
			const parsed = JSON.parse(jsonMatch![0]);
			expect(parsed.id).toBe("job-001");
			expect(parsed.source).toBe("my-bucket");
		});
	});

	// ── jobs get ────────────────────────────────────────────────────────────────

	describe("jobs get", () => {
		it("should get job details", async ({ expect }) => {
			mockGetJob(MOCK_JOB);
			await runWrangler("ai-search jobs get my-instance --job-id job-001");
			expect(std.out).toContain("job-001");
			expect(std.out).toContain("completed");
			expect(std.out).toContain("success");
		});

		it("should get job as JSON", async ({ expect }) => {
			mockGetJob(MOCK_JOB);
			await runWrangler(
				"ai-search jobs get my-instance --job-id job-001 --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed.id).toBe("job-001");
			expect(parsed.status).toBe("completed");
		});

		it("should require --job-id flag", async ({ expect }) => {
			await expect(() =>
				runWrangler("ai-search jobs get my-instance")
			).rejects.toThrow("Missing required argument: job-id");
		});
	});

	// ── jobs logs ───────────────────────────────────────────────────────────────

	describe("jobs logs", () => {
		it("should list job logs", async ({ expect }) => {
			mockGetJobLogs([MOCK_JOB_LOG, MOCK_JOB_LOG_2]);
			await runWrangler("ai-search jobs logs my-instance --job-id job-001");
			expect(std.out).toContain("Job started");
			expect(std.out).toContain("Job completed");
		});

		it("should list job logs as JSON", async ({ expect }) => {
			mockGetJobLogs([MOCK_JOB_LOG]);
			await runWrangler(
				"ai-search jobs logs my-instance --job-id job-001 --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_JOB_LOG]);
		});

		it("should warn when no logs exist", async ({ expect }) => {
			mockGetJobLogs([]);
			await runWrangler("ai-search jobs logs my-instance --job-id job-001");
			expect(std.warn).toContain("No log entries found for this job.");
		});
	});
});

// ── MSW Mock Handlers ─────────────────────────────────────────────────────────

function mockListInstances(instances: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances",
			() => {
				return HttpResponse.json(
					createFetchResult(instances, true, [], [], {
						page: 1,
						per_page: 20,
						count: instances.length,
						total_count: instances.length,
					})
				);
			},
			{ once: true }
		)
	);
}

function mockCreateInstance(instance: unknown) {
	msw.use(
		http.post(
			"*/accounts/:accountId/ai-search/instances",
			() => {
				return HttpResponse.json(createFetchResult(instance, true));
			},
			{ once: true }
		)
	);
}

function mockGetInstance(instance: unknown) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name",
			() => {
				return HttpResponse.json(createFetchResult(instance, true));
			},
			{ once: true }
		)
	);
}

function mockUpdateInstance(instance: unknown) {
	msw.use(
		http.put(
			"*/accounts/:accountId/ai-search/instances/:name",
			() => {
				return HttpResponse.json(createFetchResult(instance, true));
			},
			{ once: true }
		)
	);
}

function mockDeleteInstance() {
	msw.use(
		http.delete(
			"*/accounts/:accountId/ai-search/instances/:name",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		)
	);
}

function mockGetStats(stats: unknown) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/stats",
			() => {
				return HttpResponse.json(createFetchResult(stats, true));
			},
			{ once: true }
		)
	);
}

function mockSearchInstance(response: unknown) {
	msw.use(
		http.post(
			"*/accounts/:accountId/ai-search/instances/:name/search",
			() => {
				return HttpResponse.json(createFetchResult(response, true));
			},
			{ once: true }
		)
	);
}

function mockChatCompletions(response: Record<string, unknown>) {
	// Chat completions returns raw JSON, NOT wrapped in V4 API envelope
	msw.use(
		http.post(
			"*/accounts/:accountId/ai-search/instances/:name/chat/completions",
			() => {
				return HttpResponse.json(response);
			},
			{ once: true }
		)
	);
}

function mockListItems(items: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/items",
			() => {
				return HttpResponse.json(
					createFetchResult(items, true, [], [], {
						page: 1,
						per_page: 20,
						count: items.length,
						total_count: items.length,
					})
				);
			},
			{ once: true }
		)
	);
}

function mockGetItem(item: unknown) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/items/:itemId",
			() => {
				return HttpResponse.json(createFetchResult(item, true));
			},
			{ once: true }
		)
	);
}

function mockGetItemLogs(logs: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/items/:itemId/logs",
			() => {
				return HttpResponse.json(createFetchResult(logs, true));
			},
			{ once: true }
		)
	);
}

function mockListItemChunks(chunks: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/items/:itemId/chunks",
			() => {
				return HttpResponse.json(
					createFetchResult(chunks, true, [], [], {
						page: 1,
						per_page: 20,
						count: chunks.length,
						total_count: chunks.length,
					})
				);
			},
			{ once: true }
		)
	);
}

function mockListJobs(jobs: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/jobs",
			() => {
				return HttpResponse.json(
					createFetchResult(jobs, true, [], [], {
						page: 1,
						per_page: 20,
						count: jobs.length,
						total_count: jobs.length,
					})
				);
			},
			{ once: true }
		)
	);
}

function mockCreateJob(job: unknown) {
	msw.use(
		http.post(
			"*/accounts/:accountId/ai-search/instances/:name/jobs",
			() => {
				return HttpResponse.json(createFetchResult(job, true));
			},
			{ once: true }
		)
	);
}

function mockGetJob(job: unknown) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/jobs/:jobId",
			() => {
				return HttpResponse.json(createFetchResult(job, true));
			},
			{ once: true }
		)
	);
}

function mockGetJobLogs(logs: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/instances/:name/jobs/:jobId/logs",
			() => {
				return HttpResponse.json(createFetchResult(logs, true));
			},
			{ once: true }
		)
	);
}

function mockListTokens(tokens: unknown[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai-search/tokens",
			() => {
				return HttpResponse.json(
					createFetchResult(tokens, true, [], [], {
						page: 1,
						per_page: 20,
						count: tokens.length,
						total_count: tokens.length,
					})
				);
			},
			{ once: true }
		)
	);
}
