import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	clearDialogs,
	mockConfirm,
	mockPrompt,
	mockSelect,
} from "./helpers/mock-dialogs";
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

const MOCK_TOKEN = {
	id: "tok-1",
	name: "test",
	status: "active",
	created_at: "2025-01-01T00:00:00Z",
	modified_at: "2025-01-01T00:00:00Z",
};

const MOCK_STATS = {
	queued: 0,
	running: 0,
	completed: 3464,
	skipped: 1744,
	outdated: 1,
	error: 2,
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
			expect(std.out).toContain(MOCK_INSTANCE.id);
			expect(std.out).toContain(MOCK_INSTANCE_2.id);
			expect(std.out).toContain(MOCK_INSTANCE.type);
			expect(std.out).toContain(MOCK_INSTANCE_2.type);
		});

		it("should list instances as JSON", async ({ expect }) => {
			mockListInstances([MOCK_INSTANCE]);
			await runWrangler("ai-search list --json");
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([MOCK_INSTANCE]);
		});

		it("should output empty JSON array when no instances exist with --json", async ({
			expect,
		}) => {
			mockListInstances([]);
			await runWrangler("ai-search list --json");
			const parsed = JSON.parse(std.out);
			expect(parsed).toEqual([]);
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
			mockListTokens([MOCK_TOKEN]);
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
				"ai-search create my-instance --type r2 --source my-bucket --embedding-model @cf/bge-base-en-v1.5 --generation-model @cf/meta/llama-3-8b --chunk-size 512 --chunk-overlap 64 --max-num-results 10 --reranking --hybrid-search --cache --score-threshold 0.5"
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
			mockListTokens([MOCK_TOKEN]);
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
			mockListTokens([MOCK_TOKEN]);
			mockCreateInstance(MOCK_INSTANCE);
			await runWrangler(
				"ai-search create my-instance --type r2 --source my-bucket --json"
			);
			const parsed = JSON.parse(std.out);
			expect(parsed.id).toBe("my-instance");
			expect(parsed.type).toBe("r2");
		});

		it("should send source_params with prefix and include/exclude items", async ({
			expect,
		}) => {
			let capturedBody: Record<string, unknown> | undefined;
			mockListTokens([MOCK_TOKEN]);
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

		it("should error in non-interactive mode when no tokens exist", async ({
			expect,
		}) => {
			setIsTTY(false);
			mockListTokens([]);
			await expect(
				runWrangler("ai-search create my-instance --type r2 --source my-bucket")
			).rejects.toThrowError(/No AI Search API token found/);
		});

		it("should abort when user declines to create a token", async ({
			expect,
		}) => {
			mockListTokens([]);
			mockConfirm({
				text: "Have you created a token?",
				result: false,
			});
			await expect(
				runWrangler("ai-search create my-instance --type r2 --source my-bucket")
			).rejects.toThrowError(/AI Search instance creation cancelled/);
		});

		it("should proceed after user creates a token on retry", async ({
			expect,
		}) => {
			// MSW prepends once-handlers (LIFO), so register in reverse order:
			// second call (with token) first, then first call (empty) on top.
			mockListTokens([MOCK_TOKEN]);
			mockListTokens([]);
			mockConfirm({
				text: "Have you created a token?",
				result: true,
			});
			mockCreateInstance(MOCK_INSTANCE);
			await runWrangler(
				"ai-search create my-instance --type r2 --source my-bucket"
			);
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
		});

		it("should interactively select r2 type and existing bucket", async ({
			expect,
		}) => {
			mockListTokens([MOCK_TOKEN]);
			// 1. Select source type
			mockSelect({
				text: "Select the source type:",
				result: "r2",
			});
			// 2. Select an existing R2 bucket from the list
			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets",
					() =>
						HttpResponse.json(
							createFetchResult({
								buckets: [{ name: "my-bucket", creation_date: "01-01-2001" }],
							})
						),
					{ once: true }
				)
			);
			mockSelect({
				text: "Select an R2 bucket:",
				result: "my-bucket",
			});
			mockCreateInstance(MOCK_INSTANCE);
			await runWrangler("ai-search create my-instance");
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
			expect(std.out).toContain("Source:     my-bucket");
		});

		it("should interactively create a new r2 bucket when selected", async ({
			expect,
		}) => {
			mockListTokens([MOCK_TOKEN]);
			mockSelect({ text: "Select the source type:", result: "r2" });
			msw.use(
				http.get(
					"*/accounts/:accountId/r2/buckets",
					() => HttpResponse.json(createFetchResult({ buckets: [] })),
					{ once: true }
				)
			);
			mockSelect({
				text: "Select an R2 bucket:",
				result: "__create_new__",
			});
			mockPrompt({
				text: "Enter a name for the new R2 bucket:",
				result: "new-bucket",
			});
			// POST to create the R2 bucket
			msw.use(
				http.post(
					"*/accounts/:accountId/r2/buckets",
					() => HttpResponse.json(createFetchResult({})),
					{ once: true }
				)
			);
			mockCreateInstance({
				...MOCK_INSTANCE,
				source: "new-bucket",
			});
			await runWrangler("ai-search create my-instance");
			expect(std.out).toContain('Creating R2 bucket "new-bucket"...');
			expect(std.out).toContain('Successfully created R2 bucket "new-bucket".');
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
		});

		it("should interactively select web-crawler type and zone", async ({
			expect,
		}) => {
			mockListTokens([MOCK_TOKEN]);
			mockSelect({ text: "Select the source type:", result: "web-crawler" });
			// Select sitemap parse type
			mockSelect({
				text: "Select the web source type:",
				result: "sitemap",
			});
			// Return a zone list for the account
			msw.use(
				http.get(
					"*/zones",
					() =>
						HttpResponse.json(
							createFetchResult([{ id: "zone-1", name: "example.com" }])
						),
					{ once: true }
				)
			);
			mockSelect({
				text: "Select a zone:",
				result: "example.com",
			});
			mockCreateInstance({
				...MOCK_INSTANCE,
				type: "web-crawler",
				source: "https://example.com",
			});
			await runWrangler("ai-search create my-instance");
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
		});

		it("should prompt for URL when no zones exist in web-crawler interactive mode", async ({
			expect,
		}) => {
			mockListTokens([MOCK_TOKEN]);
			mockSelect({ text: "Select the source type:", result: "web-crawler" });
			mockSelect({
				text: "Select the web source type:",
				result: "sitemap",
			});
			// No zones found
			msw.use(
				http.get("*/zones", () => HttpResponse.json(createFetchResult([])), {
					once: true,
				})
			);
			mockPrompt({
				text: "Enter the website URL to index:",
				result: "https://my-site.com",
			});
			mockCreateInstance({
				...MOCK_INSTANCE,
				type: "web-crawler",
				source: "https://my-site.com",
			});
			await runWrangler("ai-search create my-instance");
			expect(std.out).toContain(
				'Successfully created AI Search instance "my-instance"'
			);
		});

		it("should error when name is missing", async ({ expect }) => {
			await expect(() => runWrangler("ai-search create")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});

		it("should error in non-interactive mode when --type is missing", async ({
			expect,
		}) => {
			setIsTTY(false);
			mockListTokens([MOCK_TOKEN]);
			await expect(
				runWrangler("ai-search create my-instance --source my-bucket")
			).rejects.toThrowError(/Missing required flag.*--type/);
		});

		it("should error in non-interactive mode when --source is missing for r2", async ({
			expect,
		}) => {
			setIsTTY(false);
			mockListTokens([MOCK_TOKEN]);
			await expect(
				runWrangler("ai-search create my-instance --type r2")
			).rejects.toThrowError(/Missing required flag.*--source/);
		});

		it("should error in non-interactive mode when --source is missing for web-crawler", async ({
			expect,
		}) => {
			setIsTTY(false);
			mockListTokens([MOCK_TOKEN]);
			await expect(
				runWrangler("ai-search create my-instance --type web-crawler")
			).rejects.toThrowError(/Missing required flag.*--source/);
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
			const parsed = JSON.parse(std.out);
			expect(parsed.id).toBe("my-instance");
		});

		it("should error when no fields are provided", async ({ expect }) => {
			await expect(() =>
				runWrangler("ai-search update my-instance")
			).rejects.toThrow(
				"No fields to update. Provide at least one flag (e.g. --paused, --cache)."
			);
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
				text: 'OK to delete the AI Search instance "my-instance"?',
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
				text: 'OK to delete the AI Search instance "my-instance"?',
				result: false,
			});
			const requests = mockDeleteInstance();
			await runWrangler("ai-search delete my-instance");
			expect(std.out).toContain("Deletion cancelled.");
			expect(requests.count).toBe(0);
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
			expect(std.out).toContain("Queued");
			expect(std.out).toContain("Processing");
			expect(std.out).toContain("Indexed");
			expect(std.out).toContain("Skipped");
			expect(std.out).toContain("Outdated");
			expect(std.out).toContain("Errors");
			expect(std.out).toContain("3464");
			expect(std.out).toContain("1744");
		});

		it("should display stats as JSON", async ({ expect }) => {
			mockGetStats(MOCK_STATS);
			await runWrangler("ai-search stats my-instance --json");
			const parsed = JSON.parse(std.out);
			expect(parsed.queued).toBe(0);
			expect(parsed.running).toBe(0);
			expect(parsed.completed).toBe(3464);
			expect(parsed.skipped).toBe(1744);
			expect(parsed.outdated).toBe(1);
			expect(parsed.error).toBe(2);
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
	const requests = { count: 0 };
	msw.use(
		http.delete(
			"*/accounts/:accountId/ai-search/instances/:name",
			() => {
				requests.count++;
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		)
	);
	return requests;
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
