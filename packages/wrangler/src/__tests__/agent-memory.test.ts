import { http, HttpResponse } from "msw";
import { afterEach, describe, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { AgentMemoryNamespace } from "../agent-memory/client";

const TEST_NAMESPACE: AgentMemoryNamespace = {
	id: "01HNXYZ1234567890ABCDEFGH",
	name: "my-namespace",
	account_id: "some-account-id",
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-02T00:00:00Z",
};

describe("agent-memory help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async ({
		expect,
	}) => {
		await runWrangler("agent-memory");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler agent-memory

			🧠 Manage Agent Memory namespaces [open beta]

			COMMANDS
			  wrangler agent-memory namespace  Manage Agent Memory namespaces [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help text for the namespace subcommand", async ({
		expect,
	}) => {
		await runWrangler("agent-memory namespace");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler agent-memory namespace

			Manage Agent Memory namespaces [open beta]

			COMMANDS
			  wrangler agent-memory namespace create <namespace>     Create a new Agent Memory namespace [open beta]
			  wrangler agent-memory namespace list                   List all Agent Memory namespaces associated with your account [open beta]
			  wrangler agent-memory namespace get <namespace_id>     Get details for a given Agent Memory namespace [open beta]
			  wrangler agent-memory namespace delete <namespace_id>  Delete a given Agent Memory namespace [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});
});

describe("agent-memory namespace commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	afterEach(() => {
		clearDialogs();
	});

	// ── create ────────────────────────────────────────────────────────────────

	it("should create a namespace", async ({ expect }) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/agentmemory/namespaces",
				async ({ request }) => {
					const body = (await request.json()) as { name: string };
					expect(body.name).toBe("my-namespace");
					return HttpResponse.json(createFetchResult(TEST_NAMESPACE, true));
				},
				{ once: true }
			)
		);

		await runWrangler("agent-memory namespace create my-namespace");

		expect(std.out).toContain("✅ Created Agent Memory namespace");
		expect(std.out).toContain(TEST_NAMESPACE.id);
		expect(std.out).toContain(TEST_NAMESPACE.name);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	// ── list ──────────────────────────────────────────────────────────────────

	it("should list namespaces in a table", async ({ expect }) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/agentmemory/namespaces",
				() => {
					return HttpResponse.json(
						createFetchResult([TEST_NAMESPACE], true, [], [], {
							cursor: "",
							per_page: 20,
							total_count: 1,
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler("agent-memory namespace list");

		expect(std.out).toContain(TEST_NAMESPACE.id);
		expect(std.out).toContain(TEST_NAMESPACE.name);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should list namespaces as JSON with --json", async ({ expect }) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/agentmemory/namespaces",
				() => {
					return HttpResponse.json(
						createFetchResult([TEST_NAMESPACE], true, [], [], {
							cursor: "",
							per_page: 20,
							total_count: 1,
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler("agent-memory namespace list --json");

		const parsed = JSON.parse(std.out);
		expect(parsed).toEqual([TEST_NAMESPACE]);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should print a message when no namespaces exist", async ({ expect }) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/agentmemory/namespaces",
				() => {
					return HttpResponse.json(
						createFetchResult([], true, [], [], {
							cursor: "",
							per_page: 20,
							total_count: 0,
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler("agent-memory namespace list");

		expect(std.out).toContain("No Agent Memory namespaces found");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	// ── get ───────────────────────────────────────────────────────────────────

	it("should get a namespace in a table", async ({ expect }) => {
		msw.use(
			http.get(
				`*/accounts/:accountId/agentmemory/namespaces/${TEST_NAMESPACE.id}`,
				() => {
					return HttpResponse.json(createFetchResult(TEST_NAMESPACE, true));
				},
				{ once: true }
			)
		);

		await runWrangler(`agent-memory namespace get ${TEST_NAMESPACE.id}`);

		expect(std.out).toContain(TEST_NAMESPACE.id);
		expect(std.out).toContain(TEST_NAMESPACE.name);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should get a namespace as JSON with --json", async ({ expect }) => {
		msw.use(
			http.get(
				`*/accounts/:accountId/agentmemory/namespaces/${TEST_NAMESPACE.id}`,
				() => {
					return HttpResponse.json(createFetchResult(TEST_NAMESPACE, true));
				},
				{ once: true }
			)
		);

		await runWrangler(`agent-memory namespace get ${TEST_NAMESPACE.id} --json`);

		const parsed = JSON.parse(std.out);
		expect(parsed).toEqual(TEST_NAMESPACE);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	// ── delete ────────────────────────────────────────────────────────────────

	it("should delete a namespace after confirmation", async ({ expect }) => {
		setIsTTY(true);
		mockConfirm({
			text: `OK to delete the namespace '${TEST_NAMESPACE.id}'?`,
			result: true,
		});

		msw.use(
			http.delete(
				`*/accounts/:accountId/agentmemory/namespaces/${TEST_NAMESPACE.id}`,
				() => {
					return HttpResponse.json(createFetchResult(null, true));
				},
				{ once: true }
			)
		);

		await runWrangler(`agent-memory namespace delete ${TEST_NAMESPACE.id}`);

		expect(std.out).toContain(`✅ Deleted Agent Memory namespace`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should cancel deletion when confirmation is declined", async ({
		expect,
	}) => {
		setIsTTY(true);
		mockConfirm({
			text: `OK to delete the namespace '${TEST_NAMESPACE.id}'?`,
			result: false,
		});

		await runWrangler(`agent-memory namespace delete ${TEST_NAMESPACE.id}`);

		expect(std.out).toContain("Deletion cancelled.");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should delete a namespace without confirmation when --force is passed", async ({
		expect,
	}) => {
		msw.use(
			http.delete(
				`*/accounts/:accountId/agentmemory/namespaces/${TEST_NAMESPACE.id}`,
				() => {
					return HttpResponse.json(createFetchResult(null, true));
				},
				{ once: true }
			)
		);

		await runWrangler(
			`agent-memory namespace delete ${TEST_NAMESPACE.id} --force`
		);

		expect(std.out).toContain(`✅ Deleted Agent Memory namespace`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
