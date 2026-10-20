import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { ConcurrencyKey, ConcurrencyKeyDetail } from "../workflows/types";

const KEY: ConcurrencyKey = {
	id: "0dbcdc61-c3d2-4565-9d38-042a8d26e15b",
	name: "smoke-step-concurrency-limit-2",
	limit: 2,
	created_on: "2026-10-12T11:00:00.000Z",
};
const OTHER_KEY: ConcurrencyKey = {
	id: "2b2c3a1e-8f4d-4c39-9a57-0b6f1d2e3c4a",
	name: "payments-api",
	limit: 10,
	created_on: "2026-10-12T12:00:00.000Z",
};
const KEYS_PATH = "*/accounts/:accountId/workflows/concurrency";
const KEY_PATH = `${KEYS_PATH}/:keyId`;

describe("wrangler workflows concurrency", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	function mockList(keys: ConcurrencyKey[]) {
		const requests: URL[] = [];
		msw.use(
			http.get(KEYS_PATH, ({ request }) => {
				requests.push(new URL(request.url));
				return HttpResponse.json({
					...createFetchResult(keys),
					result_info: {
						count: keys.length,
						page: 1,
						per_page: 100,
						total_count: keys.length,
					},
				});
			})
		);
		return requests;
	}

	function mockGet(key: ConcurrencyKeyDetail) {
		msw.use(
			http.get(KEY_PATH, ({ params }) =>
				params.keyId === key.id
					? HttpResponse.json(createFetchResult(key))
					: HttpResponse.json(
							createFetchResult(null, false, [
								{ code: 10700, message: "concurrency_key.not_found" },
							]),
							{ status: 404 }
						)
			)
		);
	}

	describe("list", () => {
		it("shows the keys as a table", async ({ expect }) => {
			const requests = mockList([KEY, OTHER_KEY]);

			await runWrangler("workflows concurrency list --per-page 50");

			expect(requests[0]?.searchParams.get("page")).toBe("1");
			expect(requests[0]?.searchParams.get("per_page")).toBe("50");
			expect(std.out).toContain("smoke-step-concurrency-limit-2");
			expect(std.out).toContain(KEY.id);
			expect(std.out).toContain("payments-api");
		});

		it("prints the raw keys with --json", async ({ expect }) => {
			mockList([KEY]);

			await runWrangler("workflows concurrency list --json");

			expect(JSON.parse(std.out)).toEqual([KEY]);
		});

		it("warns when there are no keys", async ({ expect }) => {
			mockList([]);

			await runWrangler("workflows concurrency list");

			expect(std.warn).toContain(
				"There are no concurrency keys in this account"
			);
		});
	});

	describe("create", () => {
		it("posts the name and limit", async ({ expect }) => {
			let body: unknown;
			msw.use(
				http.post(KEYS_PATH, async ({ request }) => {
					body = await request.json();
					return HttpResponse.json(createFetchResult(KEY));
				})
			);

			await runWrangler(
				"workflows concurrency create smoke-step-concurrency-limit-2 --limit 2"
			);

			expect(body).toEqual({
				name: "smoke-step-concurrency-limit-2",
				limit: 2,
			});
			expect(std.out).toContain(
				`✅ Created concurrency key "smoke-step-concurrency-limit-2" (${KEY.id}) with a limit of 2.`
			);
		});

		it("requires --limit", async ({ expect }) => {
			await expect(
				runWrangler("workflows concurrency create payments-api")
			).rejects.toThrow("Missing required argument: limit");
		});
	});

	describe("get", () => {
		it("resolves a key by name and shows its references", async ({
			expect,
		}) => {
			const requests = mockList([OTHER_KEY, KEY]);
			mockGet({
				...KEY,
				referencing_workflows: [
					{
						workflow_name: "smoke-test",
						version_id: "4b4f2e5c-8f3e-4c1d-9b6a-2f8e1c3d5a7b",
					},
				],
			});

			await runWrangler(
				"workflows concurrency get smoke-step-concurrency-limit-2"
			);

			expect(requests[0]?.searchParams.get("per_page")).toBe("100");
			expect(std.out).toContain(KEY.id);
			expect(std.out).toContain("Declared by:");
			expect(std.out).toContain("smoke-test");
		});

		it("uses an ID directly", async ({ expect }) => {
			const requests = mockList([KEY]);
			mockGet({ ...KEY, referencing_workflows: [] });

			await runWrangler(`workflows concurrency get ${KEY.id} --json`);

			expect(requests).toEqual([]);
			expect(JSON.parse(std.out)).toEqual({
				...KEY,
				referencing_workflows: [],
			});
		});

		it("fails for an unknown name", async ({ expect }) => {
			mockList([KEY]);

			await expect(
				runWrangler("workflows concurrency get paymnets-api")
			).rejects.toThrow(
				'No concurrency key named "paymnets-api" in this account.'
			);
		});
	});

	describe("update", () => {
		it("patches the limit of a key found by name", async ({ expect }) => {
			mockList([KEY]);
			let patched: { keyId: unknown; body: unknown } | undefined;
			msw.use(
				http.patch(KEY_PATH, async ({ params, request }) => {
					patched = { keyId: params.keyId, body: await request.json() };
					return HttpResponse.json(createFetchResult({ ...KEY, limit: 5 }));
				})
			);

			await runWrangler(
				"workflows concurrency update smoke-step-concurrency-limit-2 --limit 5"
			);

			expect(patched).toEqual({ keyId: KEY.id, body: { limit: 5 } });
			expect(std.out).toContain(
				'✅ Updated concurrency key "smoke-step-concurrency-limit-2" to a limit of 5.'
			);
		});
	});

	describe("delete", () => {
		const { setIsTTY } = useMockIsTTY();
		const confirmText = `Are you sure you want to delete the concurrency key "smoke-step-concurrency-limit-2" (${KEY.id})? Steps that reference it will run without its limit.`;

		function mockDelete() {
			const deleted: unknown[] = [];
			msw.use(
				http.delete(KEY_PATH, ({ params }) => {
					deleted.push(params.keyId);
					return HttpResponse.json(createFetchResult({ status: "ok" }));
				})
			);
			return deleted;
		}

		it("deletes after confirmation", async ({ expect }) => {
			mockList([KEY]);
			mockGet({ ...KEY, referencing_workflows: [] });
			const deleted = mockDelete();
			setIsTTY(true);
			mockConfirm({
				text: confirmText,
				options: { defaultValue: false },
				result: true,
			});

			await runWrangler(
				"workflows concurrency delete smoke-step-concurrency-limit-2"
			);

			expect(deleted).toEqual([KEY.id]);
			expect(std.out).toContain(
				`✅ Deleted concurrency key "smoke-step-concurrency-limit-2" (${KEY.id}).`
			);
		});

		it("keeps the key when confirmation is declined", async ({ expect }) => {
			mockGet({ ...KEY, referencing_workflows: [] });
			const deleted = mockDelete();
			setIsTTY(true);
			mockConfirm({ text: confirmText, result: false });

			await runWrangler(`workflows concurrency delete ${KEY.id}`);

			expect(deleted).toEqual([]);
			expect(std.out).toContain("Delete cancelled.");
		});

		it("skips confirmation with --force and prints JSON", async ({
			expect,
		}) => {
			mockGet({ ...KEY, referencing_workflows: [] });
			const deleted = mockDelete();

			await runWrangler(
				`workflows concurrency delete ${KEY.id} --force --json`
			);

			expect(deleted).toEqual([KEY.id]);
			expect(JSON.parse(std.out)).toEqual({
				id: KEY.id,
				name: KEY.name,
				deleted: true,
			});
		});

		it("requires --force with --json", async ({ expect }) => {
			await expect(
				runWrangler(`workflows concurrency delete ${KEY.id} --json`)
			).rejects.toThrow(
				"Deleting a concurrency key with --json requires --force to skip confirmation."
			);
		});
	});

	describe("--local", () => {
		const LOCAL_KEYS =
			"http://localhost:8787/cdn-cgi/local/explorer/api/workflows/concurrency";
		const LOCAL_KEY = {
			...KEY,
			usage: { holding: 1, waiting: 3 },
		};

		function mockLocal() {
			const requests: Array<{ method: string; url: URL; body?: unknown }> = [];
			const record = async (request: Request) => {
				const text = await request.text();
				requests.push({
					method: request.method,
					url: new URL(request.url),
					...(text ? { body: JSON.parse(text) } : {}),
				});
			};
			msw.use(
				http.get(LOCAL_KEYS, async ({ request }) => {
					await record(request);
					return HttpResponse.json(createFetchResult([LOCAL_KEY]));
				}),
				http.post(LOCAL_KEYS, async ({ request }) => {
					await record(request);
					return HttpResponse.json(createFetchResult(LOCAL_KEY));
				}),
				http.get(`${LOCAL_KEYS}/:keyId`, async ({ request, params }) => {
					await record(request);
					return params.keyId === KEY.name || params.keyId === KEY.id
						? HttpResponse.json(
								createFetchResult({ ...LOCAL_KEY, referencing_workflows: [] })
							)
						: HttpResponse.json(
								createFetchResult(null, false, [
									{
										code: 10700,
										message: `concurrency key '${params.keyId}' does not exist`,
									},
								]),
								{ status: 404 }
							);
				}),
				http.patch(`${LOCAL_KEYS}/:keyId`, async ({ request }) => {
					await record(request);
					return HttpResponse.json(
						createFetchResult({ ...LOCAL_KEY, limit: 5 })
					);
				}),
				http.delete(`${LOCAL_KEYS}/:keyId`, async ({ request }) => {
					await record(request);
					return HttpResponse.json(createFetchResult({ status: "ok" }));
				})
			);
			return requests;
		}

		it("lists the local keys with their usage", async ({ expect }) => {
			const requests = mockLocal();

			await runWrangler("workflows concurrency list --local");

			expect(requests[0]?.url.searchParams.get("page")).toBe("1");
			expect(std.out).toContain("Holding");
			expect(std.out).toContain("Waiting");
			expect(std.out).toContain(KEY.name);
		});

		it("creates a key in the local dev session", async ({ expect }) => {
			const requests = mockLocal();

			await runWrangler(
				`workflows concurrency create ${KEY.name} --limit 2 --local`
			);

			expect(requests).toMatchObject([
				{ method: "POST", body: { name: KEY.name, limit: 2 } },
			]);
			expect(std.out).toContain("in the local dev session");
		});

		it("addresses a key by name without listing the keys", async ({
			expect,
		}) => {
			const requests = mockLocal();

			await runWrangler(`workflows concurrency get ${KEY.name} --local`);

			expect(
				requests.map(({ method, url }) => `${method} ${url.pathname}`)
			).toEqual([
				`GET /cdn-cgi/local/explorer/api/workflows/concurrency/${KEY.name}`,
			]);
			expect(std.out).toContain("Waiting:");
			expect(std.out).not.toContain("No Workflow declares this key.");
		});

		it("updates and deletes local keys", async ({ expect }) => {
			const requests = mockLocal();

			await runWrangler(
				`workflows concurrency update ${KEY.name} --limit 5 --local`
			);
			await runWrangler(
				`workflows concurrency delete ${KEY.name} --force --local`
			);

			expect(requests.map(({ method }) => method)).toEqual([
				"PATCH",
				"GET",
				"DELETE",
			]);
			expect(requests[0]?.body).toEqual({ limit: 5 });
			expect(requests[2]?.url.pathname).toBe(
				`/cdn-cgi/local/explorer/api/workflows/concurrency/${KEY.id}`
			);
		});

		it("reports a missing local key", async ({ expect }) => {
			mockLocal();

			await expect(
				runWrangler("workflows concurrency get missing --local")
			).rejects.toThrow(
				"Local API error: concurrency key 'missing' does not exist"
			);
		});

		it("reaches the dev session on --port", async ({ expect }) => {
			const requests: URL[] = [];
			msw.use(
				http.get(
					"http://localhost:8790/cdn-cgi/local/explorer/api/workflows/concurrency",
					({ request }) => {
						requests.push(new URL(request.url));
						return HttpResponse.json(createFetchResult([]));
					}
				)
			);

			await runWrangler("workflows concurrency list --local --port 8790");

			expect(requests).toHaveLength(1);
			expect(std.warn).toContain(
				"There are no concurrency keys in the local dev session"
			);
		});
	});
});
