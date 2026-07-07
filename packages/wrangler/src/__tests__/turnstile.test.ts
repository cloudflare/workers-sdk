import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	CreateWidgetBody,
	UpdateWidgetBody,
	Widget,
} from "../turnstile/client";

const widgetFixture: Widget = {
	sitekey: "0x4AAAAAAAFakeSitekey1",
	secret: "0x4AAAAAAAFakeSecret1",
	name: "Example",
	domains: ["example.com"],
	mode: "managed",
	bot_fight_mode: false,
	clearance_level: "no_clearance",
	ephemeral_id: false,
	offlabel: false,
	region: "world",
	created_on: "2026-06-29T12:00:00.000Z",
	modified_on: "2026-06-29T12:00:00.000Z",
};

describe("turnstile help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("shows top-level help with widget sub-namespace", async ({ expect }) => {
		await runWrangler("turnstile");
		await endEventLoop();

		expect(std.err).toBe("");
		expect(std.out).toContain("wrangler turnstile widget");
	});

	it("shows widget sub-namespace help with all CRUD commands", async ({
		expect,
	}) => {
		await runWrangler("turnstile widget");
		await endEventLoop();

		expect(std.err).toBe("");
		expect(std.out).toContain("wrangler turnstile widget create");
		expect(std.out).toContain("wrangler turnstile widget delete");
		expect(std.out).toContain("wrangler turnstile widget get");
		expect(std.out).toContain("wrangler turnstile widget list");
		expect(std.out).toContain("wrangler turnstile widget update");
	});
});

describe("turnstile widget commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	afterEach(() => {
		clearDialogs();
	});

	it("creates a widget with required args", async ({ expect }) => {
		const reqProm = mockWidgetCreate();
		await runWrangler(
			"turnstile widget create Example --domain example.com --domain www.example.com --mode managed"
		);

		await expect(reqProm).resolves.toEqual({
			name: "Example",
			domains: ["example.com", "www.example.com"],
			mode: "managed",
		});

		expect(std.out).toContain("Created Turnstile widget 'Example'");
		expect(std.out).toContain(widgetFixture.sitekey);
		expect(std.out).toContain(widgetFixture.secret);
		expect(std.out).toContain(
			"challenges.cloudflare.com/turnstile/v0/siteverify"
		);
		// Output is backend-agnostic; should not prescribe Workers.
		expect(std.out).not.toContain("wrangler secret put");
		expect(std.out).not.toContain("wrangler.jsonc");
	});

	it("creates a widget with optional fields", async ({ expect }) => {
		const reqProm = mockWidgetCreate();
		await runWrangler(
			"turnstile widget create Example --domain example.com --mode invisible --clearance-level interactive --bot-fight-mode --region world"
		);

		await expect(reqProm).resolves.toEqual({
			name: "Example",
			domains: ["example.com"],
			mode: "invisible",
			bot_fight_mode: true,
			clearance_level: "interactive",
			region: "world",
		});
	});

	it("prints widget JSON only when --json is set", async ({ expect }) => {
		void mockWidgetCreate();
		await runWrangler(
			"turnstile widget create Example --domain example.com --mode managed --json"
		);

		expect(std.out).not.toContain("Created Turnstile widget");
		expect(std.out).toContain('"sitekey":');
		expect(std.out).toContain('"secret":');
	});

	it("errors when --domain is missing", async ({ expect }) => {
		await expect(
			runWrangler("turnstile widget create Example --mode managed")
		).rejects.toThrow("Missing required argument: domain");
	});

	it("errors when --mode is missing", async ({ expect }) => {
		await expect(
			runWrangler("turnstile widget create Example --domain example.com")
		).rejects.toThrow("Missing required argument: mode");
	});

	it("splits comma-separated values in --domain", async ({ expect }) => {
		const reqProm = mockWidgetCreate();
		await runWrangler(
			"turnstile widget create Example --domain example.com,www.example.com --mode managed"
		);

		const body = await reqProm;
		expect(body.domains).toEqual(["example.com", "www.example.com"]);
	});

	it("lists widgets as a table with count", async ({ expect }) => {
		mockWidgetList([widgetFixture]);
		await runWrangler("turnstile widget list");

		expect(std.out).toContain("Found 1 widget:");
		expect(std.out).toContain(widgetFixture.sitekey);
		expect(std.out).toContain(widgetFixture.name);
		expect(std.out).toContain("example.com");
	});

	it("pluralizes count when multiple widgets are present", async ({
		expect,
	}) => {
		const second: Widget = {
			...widgetFixture,
			sitekey: "0x4AAAAAAAFakeSitekey2",
			name: "Second",
		};
		mockWidgetList([widgetFixture, second]);
		await runWrangler("turnstile widget list");

		expect(std.out).toContain("Found 2 widgets:");
	});

	it("lists widgets as JSON when --json is set", async ({ expect }) => {
		mockWidgetList([widgetFixture]);
		await runWrangler("turnstile widget list --json");

		expect(std.out).toContain('"sitekey":');
		expect(std.out).toContain(widgetFixture.sitekey);
	});

	it("reports an empty list with a friendly message", async ({ expect }) => {
		mockWidgetList([]);
		await runWrangler("turnstile widget list");

		expect(std.out).toContain("No Turnstile widgets found");
	});

	it("paginates through multiple pages of widgets", async ({ expect }) => {
		// The Turnstile list endpoint uses the standard V4 paginated shape
		// (`result_info.page` + `per_page` + `total_count`). `fetchPagedListResult`
		// reads `page` from the query string and keeps requesting until
		// `hasMorePages` returns false. This test exercises that iteration
		// so a future change to cursor-based pagination would break here
		// visibly rather than silently returning only the first page.
		const w = (id: string): Widget => ({
			...widgetFixture,
			sitekey: id,
			name: id,
		});
		const page1 = [w("0x4pg1a"), w("0x4pg1b")];
		const page2 = [w("0x4pg2a"), w("0x4pg2b")];

		msw.use(
			http.get("*/accounts/:accountId/challenges/widgets", ({ request }) => {
				const page = Number(
					new URL(request.url).searchParams.get("page") ?? "1"
				);
				const widgets = page === 1 ? page1 : page2;
				return HttpResponse.json(
					createFetchResult(widgets, true, [], [], {
						page,
						per_page: 2,
						count: 2,
						total_count: 4,
					})
				);
			})
		);

		await runWrangler("turnstile widget list");

		expect(std.out).toContain("Found 4 widgets:");
		for (const entry of [...page1, ...page2]) {
			expect(std.out).toContain(entry.sitekey);
		}
	});

	it("gets a single widget in the default human-readable view", async ({
		expect,
	}) => {
		mockWidgetGet(widgetFixture);
		await runWrangler(`turnstile widget get ${widgetFixture.sitekey}`);

		expect(std.out).toContain(`Sitekey`);
		expect(std.out).toContain(widgetFixture.sitekey);
		expect(std.out).toContain(widgetFixture.name);
		expect(std.out).toContain(widgetFixture.secret);
	});

	it("gets a single widget as JSON when --json is set", async ({ expect }) => {
		mockWidgetGet(widgetFixture);
		await runWrangler(`turnstile widget get ${widgetFixture.sitekey} --json`);

		expect(std.out).toContain(`"sitekey": "${widgetFixture.sitekey}"`);
		expect(std.out).toContain(`"name": "${widgetFixture.name}"`);
	});

	it("errors when update is called with no fields", async ({ expect }) => {
		await expect(
			runWrangler(`turnstile widget update ${widgetFixture.sitekey}`)
		).rejects.toThrow("No fields to update");
	});

	it("updates a widget by merging changes with the current state", async ({
		expect,
	}) => {
		mockWidgetGet(widgetFixture);
		const reqProm = mockWidgetUpdate(widgetFixture.sitekey);

		await runWrangler(
			`turnstile widget update ${widgetFixture.sitekey} --name "Renamed"`
		);

		const body = await reqProm;
		// PUT requires the full body. The CLI must preserve domains+mode
		// from the GET response when only --name is passed.
		expect(body).toEqual({
			name: "Renamed",
			domains: widgetFixture.domains,
			mode: widgetFixture.mode,
			bot_fight_mode: widgetFixture.bot_fight_mode,
			clearance_level: widgetFixture.clearance_level,
			ephemeral_id: widgetFixture.ephemeral_id,
			offlabel: widgetFixture.offlabel,
		});
		expect(std.out).toContain(
			`Updated Turnstile widget ${widgetFixture.sitekey}`
		);
		// PUT response includes the secret, but the CLI strips it from output.
		// Users can re-fetch it via `get` if needed.
		expect(std.out).not.toContain(widgetFixture.secret);
		expect(std.out).not.toContain('"secret":');
	});

	it("deletes a widget after confirmation", async ({ expect }) => {
		setIsTTY(true);
		mockConfirm({
			text: `About to delete Turnstile widget ${widgetFixture.sitekey}. This breaks any deployed Worker still using the widget's sitekey or secret. Continue?`,
			result: true,
		});
		mockWidgetDelete(widgetFixture.sitekey);

		await runWrangler(`turnstile widget delete ${widgetFixture.sitekey}`);

		expect(std.out).toContain(
			`Deleted Turnstile widget ${widgetFixture.sitekey}`
		);
	});

	it("cancels delete if confirmation is declined", async ({ expect }) => {
		setIsTTY(true);
		mockConfirm({
			text: `About to delete Turnstile widget ${widgetFixture.sitekey}. This breaks any deployed Worker still using the widget's sitekey or secret. Continue?`,
			result: false,
		});

		await runWrangler(`turnstile widget delete ${widgetFixture.sitekey}`);

		expect(std.out).toContain("Deletion cancelled.");
		expect(std.out).not.toContain("Deleted Turnstile widget");
	});

	it("skips confirmation with --skip-confirmation", async ({ expect }) => {
		mockWidgetDelete(widgetFixture.sitekey);
		await runWrangler(
			`turnstile widget delete ${widgetFixture.sitekey} --skip-confirmation`
		);

		expect(std.out).toContain(
			`Deleted Turnstile widget ${widgetFixture.sitekey}`
		);
	});

	it("skips confirmation with -y alias", async ({ expect }) => {
		mockWidgetDelete(widgetFixture.sitekey);
		await runWrangler(`turnstile widget delete ${widgetFixture.sitekey} -y`);

		expect(std.out).toContain(
			`Deleted Turnstile widget ${widgetFixture.sitekey}`
		);
	});
});

function mockWidgetCreate(): Promise<CreateWidgetBody> {
	return new Promise((resolve, reject) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/challenges/widgets",
				async ({ request }) => {
					// Turnstile's API rejects anything other than application/json.
					// fetchResult defaults to text/plain for string bodies, so the
					// client must set this header explicitly.
					const ct = request.headers.get("content-type") ?? "";
					if (!ct.includes("application/json")) {
						reject(new Error(`expected application/json, got '${ct}'`));
						return HttpResponse.json(
							{ error: "wrong content-type" },
							{ status: 415 }
						);
					}
					const body = (await request.json()) as CreateWidgetBody;
					// Strip undefined optional fields so equality assertions
					// only see what the CLI actually sent.
					const cleaned = JSON.parse(JSON.stringify(body)) as CreateWidgetBody;
					resolve(cleaned);
					return HttpResponse.json(
						createFetchResult(
							{
								...widgetFixture,
								name: cleaned.name,
								domains: cleaned.domains,
								mode: cleaned.mode,
								bot_fight_mode:
									cleaned.bot_fight_mode ?? widgetFixture.bot_fight_mode,
								clearance_level:
									cleaned.clearance_level ?? widgetFixture.clearance_level,
								ephemeral_id:
									cleaned.ephemeral_id ?? widgetFixture.ephemeral_id,
								offlabel: cleaned.offlabel ?? widgetFixture.offlabel,
								region: cleaned.region ?? widgetFixture.region,
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWidgetList(widgets: Widget[]): void {
	msw.use(
		http.get(
			"*/accounts/:accountId/challenges/widgets",
			() =>
				HttpResponse.json(createFetchResult(widgets, true), {
					headers: { "Content-Type": "application/json" },
				}),
			{ once: true }
		)
	);
}

function mockWidgetGet(widget: Widget): void {
	msw.use(
		http.get(
			`*/accounts/:accountId/challenges/widgets/${widget.sitekey}`,
			() => HttpResponse.json(createFetchResult(widget, true)),
			{ once: true }
		)
	);
}

function mockWidgetUpdate(sitekey: string): Promise<UpdateWidgetBody> {
	return new Promise((resolve, reject) => {
		msw.use(
			http.put(
				`*/accounts/:accountId/challenges/widgets/${sitekey}`,
				async ({ request }) => {
					const ct = request.headers.get("content-type") ?? "";
					if (!ct.includes("application/json")) {
						reject(new Error(`expected application/json, got '${ct}'`));
						return HttpResponse.json(
							{ error: "wrong content-type" },
							{ status: 415 }
						);
					}
					const body = (await request.json()) as UpdateWidgetBody;
					resolve(body);
					return HttpResponse.json(
						createFetchResult({ ...widgetFixture, ...body }, true)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWidgetDelete(sitekey: string): void {
	msw.use(
		http.delete(
			`*/accounts/:accountId/challenges/widgets/${sitekey}`,
			() => HttpResponse.json(createFetchResult(null, true)),
			{ once: true }
		)
	);
}
