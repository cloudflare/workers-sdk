import { readFile, writeFile } from "node:fs/promises";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { K2Stream } from "../k2/client";

const id = "0123456789abcdef0123456789abcdef";
const accountId = "some-account-id";
const collection = `*/accounts/${accountId}/k2/streams`;
const stream: K2Stream = {
	id,
	name: "order_events",
	retention_seconds: 604800,
	endpoint: `https://${id}.k2.cloudflarestorage.com/produce`,
	http: { enabled: true, authentication: true },
	worker_binding: { enabled: true },
	created_at: "2026-09-16T00:00:00Z",
	modified_at: "2026-09-16T00:00:00Z",
};

describe("K2 stream commands", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();
	afterEach(clearOutputFilePath);

	it("creates a binding-only stream by default without editing config", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "producer", main: "index.js" });
		await writeFile("index.js", "export default {};");
		const before = await readFile("wrangler.toml", "utf8");
		const { endpoint: _endpoint, ...bindingOnly } = stream;
		msw.use(
			http.post(collection, async ({ request }) => {
				expect(await request.json()).toEqual({
					name: "order_events",
					http: { enabled: false },
					worker_binding: { enabled: true },
				});
				return HttpResponse.json({
					success: true,
					result: { ...bindingOnly, http: { enabled: false } },
				});
			})
		);
		await runWrangler("k2 streams create order_events");
		expect(std.out).toContain(id);
		expect(std.out).not.toContain("Endpoint:");
		expect(std.out).toContain("k2");
		expect(std.out).toContain('binding = "YOUR_BINDING_NAME"');
		expect(std.out).not.toContain('binding = "order_events"');
		expect(std.out).toContain(`stream = "${id}"`);
		expect(std.out).toContain('Replace "YOUR_BINDING_NAME"');
		expect(std.out).toContain("env.EVENTS");
		expect(std.out).toContain("remote");
		expect(await readFile("wrangler.toml", "utf8")).toBe(before);
	});

	it("prints a binding-name placeholder without editing JSON config", async ({
		expect,
	}) => {
		const config = JSON.stringify({ name: "producer", main: "index.js" });
		await writeFile("wrangler.json", config);
		msw.use(
			http.post(collection, () =>
				HttpResponse.json({ success: true, result: stream })
			)
		);
		await runWrangler("k2 streams create order_events --http-enabled");
		expect(std.out).toContain('"binding": "YOUR_BINDING_NAME"');
		expect(std.out).not.toContain('"binding": "order_events"');
		expect(std.out).toContain(`"stream": "${id}"`);
		expect(std.out).toContain('"remote": true');
		expect(std.out).toContain('Replace "YOUR_BINDING_NAME"');
		expect(std.out).toContain("env.EVENTS");
		expect(await readFile("wrangler.json", "utf8")).toBe(config);
	});

	it("enables authenticated HTTP ingestion when requested", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, async ({ request }) => {
				expect(await request.json()).toEqual({
					name: "order_events",
					http: { enabled: true, authentication: true },
					worker_binding: { enabled: true },
				});
				return HttpResponse.json({ success: true, result: stream });
			})
		);
		await runWrangler("k2 streams create order_events --http-enabled");
		expect(std.out).toContain(stream.endpoint);
	});

	it("supports retention and CORS while keeping JSON output clean", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, async ({ request }) => {
				expect(await request.json()).toEqual({
					name: "order_events",
					retention_seconds: 7200,
					http: {
						enabled: true,
						authentication: false,
						cors: {
							origins: ["https://shop.example", "http://localhost:3000"],
						},
					},
					worker_binding: { enabled: true },
				});
				return HttpResponse.json({ success: true, result: stream });
			})
		);
		await runWrangler(
			"k2 streams create order_events --http-enabled --retention-seconds 7200 --no-http-auth --cors-origin https://shop.example --cors-origin http://localhost:3000 --json"
		);
		expect(JSON.parse(std.out)).toEqual(stream);
	});

	it.for([3600, 2592000])(
		"accepts the retention boundary of %i seconds",
		async (retentionSeconds, { expect }) => {
			msw.use(
				http.post(collection, async ({ request }) => {
					expect(await request.json()).toMatchObject({
						retention_seconds: retentionSeconds,
					});
					return HttpResponse.json({ success: true, result: stream });
				})
			);
			await runWrangler(
				`k2 streams create order_events --retention-seconds ${retentionSeconds} --json`
			);
			expect(JSON.parse(std.out)).toEqual(stream);
		}
	);

	it("creates binding-only streams with the strict disabled-HTTP shape", async ({
		expect,
	}) => {
		const { endpoint: _, ...bindingOnly } = stream;
		msw.use(
			http.post(collection, async ({ request }) => {
				expect(await request.json()).toEqual({
					name: "order_events",
					http: { enabled: false },
					worker_binding: { enabled: true },
				});
				return HttpResponse.json({
					success: true,
					result: { ...bindingOnly, http: { enabled: false } },
				});
			})
		);
		await runWrangler("k2 streams create order_events --no-http-enabled");
		expect(std.out).toContain(id);
		expect(std.out).not.toContain("Endpoint:");
	});

	it("does not suggest a binding when only HTTP is enabled", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, async ({ request }) => {
				expect(await request.json()).toEqual({
					name: "order_events",
					http: { enabled: true, authentication: true },
					worker_binding: { enabled: false },
				});
				return HttpResponse.json({
					success: true,
					result: { ...stream, worker_binding: { enabled: false } },
				});
			})
		);
		await runWrangler(
			"k2 streams create order_events --http-enabled --no-worker-binding-enabled"
		);
		expect(std.out).toContain(stream.endpoint);
		expect(std.out).not.toContain("following snippet");
		expect(std.out).not.toContain("YOUR_BINDING_NAME");
	});

	it.for([
		"orders --retention-seconds 3599",
		"orders --retention-seconds 3600.5",
		"orders --retention-seconds 2592001",
		"orders --retention-seconds 2147483648",
		"orders --no-http-enabled --no-worker-binding-enabled",
		"orders --no-worker-binding-enabled",
		"orders --cors-origin https://shop.example",
		"orders --no-http-enabled --cors-origin https://shop.example",
		"orders --http-enabled --cors-origin https://shop.example/path",
		"orders --http-enabled --cors-origin https://user:password@shop.example",
		"orders --http-enabled --cors-origin https://shop.example?query=1",
		"orders --http-enabled --cors-origin https://shop.example --cors-origin https://shop.example",
		"orders --http-enabled --cors-origin '*' --cors-origin https://shop.example",
	])(
		"rejects invalid create arguments before requesting the API: %s",
		async (args, { expect }) => {
			await expect(runWrangler(`k2 streams create ${args}`)).rejects.toThrow();
		}
	);

	it.for(["order-events.v2", "x".repeat(129)])(
		"lets the API validate stream names: %s",
		async (name, { expect }) => {
			const created = { ...stream, name };
			msw.use(
				http.post(collection, async ({ request }) => {
					expect(await request.json()).toMatchObject({ name });
					return HttpResponse.json({ success: true, result: created });
				})
			);
			await runWrangler(`k2 streams create ${name} --json`);
			expect(JSON.parse(std.out)).toEqual(created);
		}
	);

	it("surfaces stream-name validation errors from the API", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, () =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code: 1001, message: "Invalid stream name" }],
					},
					{ status: 400 }
				)
			)
		);
		await expect(
			runWrangler("k2 streams create invalid-name --json")
		).rejects.toMatchObject({ status: 400 });
		expect(std.err).toContain("Invalid stream name");
		expect(std.out).toBe("");
	});

	it("does not retry an ambiguous create failure", async ({ expect }) => {
		let calls = 0;
		msw.use(
			http.post(collection, () => {
				calls++;
				return HttpResponse.json(
					{ success: false, errors: [{ code: 10000, message: "Unavailable" }] },
					{ status: 503 }
				);
			})
		);
		await expect(
			runWrangler("k2 streams create order_events")
		).rejects.toThrow();
		expect(calls).toBe(1);
		expect(std.out).not.toContain("following snippet");
	});

	it("does not report unsuccessful API envelopes as successful creation", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, () =>
				HttpResponse.json({ success: false, result: null })
			)
		);
		await expect(
			runWrangler("k2 streams create order_events --json")
		).rejects.toThrow("did not return a successful result");
		expect(std.out).toBe("");
	});

	it("preserves SDK rate-limit handling and structured retry guidance", async ({
		expect,
	}) => {
		msw.use(
			http.post(collection, () =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10013, message: "Rate limited" }],
					},
					{ status: 429, headers: { "Retry-After": "42" } }
				)
			)
		);
		await expect(
			runWrangler("k2 streams create order_events --json", {
				WRANGLER_OUTPUT_FILE_PATH: "output.jsonl",
			})
		).rejects.toMatchObject({ status: 429 });
		expect(std.err).toContain("Retry-After");
		expect(std.err).toContain("42 second(s)");
		const entries = (await readFile("output.jsonl", "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(entries).toContainEqual(
			expect.objectContaining({ type: "command-failed", retry_after_ms: 42000 })
		);
	});

	it("gets a stream by ID", async ({ expect }) => {
		msw.use(
			http.get(`${collection}/${id}`, () =>
				HttpResponse.json({ success: true, result: stream })
			)
		);
		await runWrangler(`k2 streams get ${id} --json`);
		expect(JSON.parse(std.out)).toEqual(stream);
	});

	describe("delete", () => {
		const { setIsTTY } = useMockIsTTY();

		function mockExistingStream(details: K2Stream = stream) {
			msw.use(
				http.get(`${collection}/${encodeURIComponent(details.id)}`, () =>
					HttpResponse.json({ success: true, result: details })
				)
			);
		}

		it("confirms deletion with a safe default", async ({ expect }) => {
			mockExistingStream();
			const deletion = vi.fn(() =>
				HttpResponse.json({ success: true, result: {} })
			);
			msw.use(http.delete(`${collection}/${id}`, deletion));
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to delete the K2 stream 'order_events' (${id})?`,
				options: { defaultValue: false },
				result: true,
			});
			await runWrangler(`k2 streams delete ${id}`);
			expect(deletion).toHaveBeenCalledOnce();
			expect(std.out).toContain(
				`Successfully deleted K2 stream 'order_events' (${id}).`
			);
		});

		it("does not delete when confirmation is declined", async ({ expect }) => {
			mockExistingStream();
			const deletion = vi.fn(() =>
				HttpResponse.json({ success: true, result: {} })
			);
			msw.use(http.delete(`${collection}/${id}`, deletion));
			setIsTTY(true);
			mockConfirm({
				text: `Are you sure you want to delete the K2 stream 'order_events' (${id})?`,
				result: false,
			});
			await runWrangler(`k2 streams delete ${id}`);
			expect(deletion).not.toHaveBeenCalled();
			expect(std.out).toContain("Delete cancelled.");
		});

		it("does not delete non-interactively without --force", async ({
			expect,
		}) => {
			mockExistingStream();
			const deletion = vi.fn(() =>
				HttpResponse.json({ success: true, result: {} })
			);
			msw.use(http.delete(`${collection}/${id}`, deletion));
			setIsTTY(false);
			await runWrangler(`k2 streams delete ${id}`);
			expect(deletion).not.toHaveBeenCalled();
			expect(std.out).toContain("Delete cancelled.");
		});

		it.for(["--force", "-y"])(
			"skips confirmation and returns clean JSON with %s",
			async (forceFlag, { expect }) => {
				mockExistingStream();
				const deletion = vi.fn(() =>
					HttpResponse.json({ success: true, result: {} })
				);
				msw.use(http.delete(`${collection}/${id}`, deletion));
				await runWrangler(`k2 streams delete ${id} ${forceFlag} --json`);
				expect(deletion).toHaveBeenCalledOnce();
				expect(JSON.parse(std.out)).toEqual({ id, deleted: true });
			}
		);

		it("requires --force for JSON deletion before making API requests", async ({
			expect,
		}) => {
			await expect(
				runWrangler(`k2 streams delete ${id} --json`)
			).rejects.toThrow("--json requires --force");
		});

		it("requires a stream ID", async ({ expect }) => {
			await expect(runWrangler("k2 streams delete --force")).rejects.toThrow();
		});

		it.for(["", ".", ".."])(
			"rejects IDs that could target the collection or a parent path: %j",
			async (streamId, { expect }) => {
				await expect(
					runWrangler(`k2 streams delete "${streamId}" --force --json`)
				).rejects.toThrow("A non-empty K2 stream ID");
			}
		);

		it("encodes the deletion ID as a single path segment", async ({
			expect,
		}) => {
			const opaqueId = "stream:orders/v2?region=west#part-1";
			mockExistingStream({ ...stream, id: opaqueId });
			msw.use(
				http.delete(
					`${collection}/${encodeURIComponent(opaqueId)}`,
					({ request }) => {
						const url = new URL(request.url);
						expect(url.pathname).toBe(
							`/client/v4/accounts/${accountId}/k2/streams/${encodeURIComponent(opaqueId)}`
						);
						expect(url.search).toBe("");
						return HttpResponse.json({ success: true, result: {} });
					}
				)
			);
			await runWrangler(`k2 streams delete "${opaqueId}" --force --json`);
			expect(JSON.parse(std.out)).toEqual({ id: opaqueId, deleted: true });
		});

		it.for([403, 404])(
			"surfaces deletion failures (%i)",
			async (status, { expect }) => {
				mockExistingStream();
				msw.use(
					http.delete(`${collection}/${id}`, () =>
						HttpResponse.json(
							{
								success: false,
								errors: [{ code: 10000, message: "Deletion rejected" }],
							},
							{ status }
						)
					)
				);
				await expect(
					runWrangler(`k2 streams delete ${id} --force --json`)
				).rejects.toMatchObject({ status });
				expect(std.out).toBe("");
				expect(std.err).toContain("Deletion rejected");
			}
		);

		it.for([
			{ success: false, result: {} },
			{ success: true, result: null },
			{ success: true },
		])(
			"rejects unsuccessful deletion envelopes: %j",
			async (response, { expect }) => {
				mockExistingStream();
				msw.use(
					http.delete(`${collection}/${id}`, () => HttpResponse.json(response))
				);
				await expect(
					runWrangler(`k2 streams delete ${id} --force --json`)
				).rejects.toThrow("did not return a successful result");
				expect(std.out).toBe("");
			}
		);

		it("does not retry an ambiguous deletion failure", async ({ expect }) => {
			mockExistingStream();
			const deletion = vi.fn(() =>
				HttpResponse.json(
					{ success: false, errors: [{ code: 10000, message: "Unavailable" }] },
					{ status: 503 }
				)
			);
			msw.use(http.delete(`${collection}/${id}`, deletion));
			await expect(
				runWrangler(`k2 streams delete ${id} --force --json`)
			).rejects.toMatchObject({ status: 503 });
			expect(deletion).toHaveBeenCalledOnce();
			expect(std.out).toBe("");
		});
	});

	it("encodes opaque stream IDs as a single API path segment", async ({
		expect,
	}) => {
		const opaqueId = "stream:orders/v2?region=west#part-1";
		const details = { ...stream, id: opaqueId };
		msw.use(
			http.get(
				`${collection}/${encodeURIComponent(opaqueId)}`,
				({ request }) => {
					const url = new URL(request.url);
					expect(url.pathname).toBe(
						`/client/v4/accounts/${accountId}/k2/streams/${encodeURIComponent(opaqueId)}`
					);
					expect(url.search).toBe("");
					return HttpResponse.json({ success: true, result: details });
				}
			)
		);
		await runWrangler(`k2 streams get "${opaqueId}" --json`);
		expect(JSON.parse(std.out)).toEqual(details);
	});

	it.for(["order events", "x".repeat(129)])(
		"passes the name filter through to the API: %s",
		async (name, { expect }) => {
			msw.use(
				http.get(collection, ({ request }) => {
					const params = new URL(request.url).searchParams;
					expect(Object.fromEntries(params)).toEqual({
						page: "2",
						per_page: "10",
						name,
					});
					return HttpResponse.json({
						success: true,
						result: [stream],
						result_info: { page: 2, per_page: 10, count: 1, total_count: 11 },
					});
				})
			);
			await runWrangler(
				`k2 streams list --page 2 --per-page 10 --name "${name}" --json`
			);
			expect(JSON.parse(std.out)).toEqual([stream]);
		}
	);

	it("reports an empty page", async ({ expect }) => {
		msw.use(
			http.get(collection, () =>
				HttpResponse.json({ success: true, result: [] })
			)
		);
		await runWrangler("k2 streams list");
		expect(std.out).toContain("No K2 streams found.");
	});

	it.for([
		"--page 0",
		"--page 1.5",
		"--per-page 101",
		"--per-page 0",
		"--page 9007199254740991 --per-page 100",
	])("rejects invalid pagination: %s", async (args, { expect }) => {
		await expect(runWrangler(`k2 streams list ${args}`)).rejects.toThrow(
			"Page must"
		);
	});

	it("uses the selected Cloudflare API environment", async ({ expect }) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		msw.use(
			http.get(
				`https://api.staging.cloudflare.com/client/v4/accounts/${accountId}/k2/streams/${id}`,
				() => HttpResponse.json({ success: true, result: stream })
			)
		);
		await runWrangler(`k2 streams get ${id} --json`);
		expect(JSON.parse(std.out)).toEqual(stream);
	});

	it("surfaces permission errors", async ({ expect }) => {
		msw.use(
			http.get(`${collection}/${id}`, () =>
				HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Not authorized" }],
					},
					{ status: 403 }
				)
			)
		);
		await expect(runWrangler(`k2 streams get ${id}`)).rejects.toThrow();
		expect(std.out).not.toContain(stream.endpoint);
	});
});
