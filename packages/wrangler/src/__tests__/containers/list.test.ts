import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
// eslint-disable-next-line no-restricted-imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as user from "../../user";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DASH_APPLICATIONS } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { DashApplication } from "@cloudflare/containers-shared";

/** Helper: wrap DashApplication[] in V4 envelope for MSW */
function dashAppsResponse(
	apps: DashApplication[],
	nextPageToken?: string
): object {
	return {
		success: true,
		result: apps,
		result_info: {
			per_page: apps.length,
			...(nextPageToken ? { next_page_token: nextPageToken } : {}),
		},
		errors: [],
		messages: [],
	};
}

describe("containers list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("containers list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers list

			List containers [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --per-page  Number of containers per page  [number] [default: 25]
			      --json      Return output as JSON  [boolean] [default: false]"
		`);
	});

	it("should show the correct authentication error", async () => {
		const spy = vi.spyOn(user, "getScopes");
		spy.mockReset();
		spy.mockImplementationOnce(() => []);
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("containers list")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You need 'containers:write', try logging in again or creating an appropiate API token]`
		);
	});

	it("should throw UserError on 400 API response", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications",
				async () => {
					return HttpResponse.json(
						{
							success: false,
							result: null,
							errors: [{ code: 1000, message: "bad request" }],
							messages: [],
							error: "bad request",
						},
						{ status: 400 }
					);
				},
				{ once: true }
			)
		);
		await expect(runWrangler("containers list")).rejects.toThrowError(
			/There has been an error listing containers/
		);
	});

	it("should throw on 500 API response", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications",
				async () => {
					return HttpResponse.json(
						{
							success: false,
							result: null,
							errors: [{ code: 2000, message: "internal" }],
							messages: [],
						},
						{ status: 500 }
					);
				},
				{ once: true }
			)
		);
		await expect(runWrangler("containers list")).rejects.toThrowError(
			/unknown error listing containers/
		);
	});

	it("should render a table (non-TTY)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications",
				async () => {
					return HttpResponse.json(dashAppsResponse(MOCK_DASH_APPLICATIONS));
				},
				{ once: true }
			)
		);
		await runWrangler("containers list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		// Table output contains column headers and data
		expect(std.out).toContain("ID");
		expect(std.out).toContain("NAME");
		expect(std.out).toContain("STATE");
		expect(std.out).toContain("LIVE INSTANCES");
		expect(std.out).toContain("LAST MODIFIED");
		// Verify data appears in the table
		expect(std.out).toContain("my-active-app");
		expect(std.out).toContain("my-degraded-app");
		expect(std.out).toContain("my-provisioning-app");
		expect(std.out).toContain("my-ready-app");
	});

	it("should handle empty results (non-TTY)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications",
				async () => {
					return HttpResponse.json(dashAppsResponse([]));
				},
				{ once: true }
			)
		);
		await runWrangler("containers list");
		// Non-TTY without --json: empty list logs "No containers found." as text
		expect(std.out).toContain("No containers found.");
	});

	it("should fetch all results in a single unpaginated request (non-TTY)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		let requestCount = 0;
		msw.use(
			http.get(
				"*/dash/applications",
				async ({ request }) => {
					requestCount++;
					const url = new URL(request.url);
					// Non-interactive omits per_page so the API returns everything
					expect(url.searchParams.has("per_page")).toBe(false);
					expect(url.searchParams.has("page_token")).toBe(false);
					return HttpResponse.json(dashAppsResponse(MOCK_DASH_APPLICATIONS));
				},
				{ once: true }
			)
		);
		await runWrangler("containers list");
		expect(requestCount).toBe(1);
		// Table output should contain all four apps
		expect(std.out).toContain("my-active-app");
		expect(std.out).toContain("my-degraded-app");
		expect(std.out).toContain("my-provisioning-app");
		expect(std.out).toContain("my-ready-app");
	});

	describe("state derivation", () => {
		it("should derive 'active' when active > 0 and no failures", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			const app: DashApplication = {
				...MOCK_DASH_APPLICATIONS[0],
				health: {
					instances: {
						active: 3,
						healthy: 3,
						failed: 0,
						starting: 0,
						scheduling: 0,
					},
				},
			};
			msw.use(
				http.get(
					"*/dash/applications",
					async () => HttpResponse.json(dashAppsResponse([app])),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			const output = JSON.parse(std.out);
			expect(output[0].state).toBe("active");
		});

		it("should derive 'degraded' when failed > 0 (even with active)", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			const app: DashApplication = {
				...MOCK_DASH_APPLICATIONS[0],
				health: {
					instances: {
						active: 2,
						healthy: 2,
						failed: 1,
						starting: 0,
						scheduling: 0,
					},
				},
			};
			msw.use(
				http.get(
					"*/dash/applications",
					async () => HttpResponse.json(dashAppsResponse([app])),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			const output = JSON.parse(std.out);
			expect(output[0].state).toBe("degraded");
		});

		it("should derive 'provisioning' when starting/scheduling > 0", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			const app: DashApplication = {
				...MOCK_DASH_APPLICATIONS[0],
				health: {
					instances: {
						active: 0,
						healthy: 0,
						failed: 0,
						starting: 1,
						scheduling: 0,
					},
				},
			};
			msw.use(
				http.get(
					"*/dash/applications",
					async () => HttpResponse.json(dashAppsResponse([app])),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			const output = JSON.parse(std.out);
			expect(output[0].state).toBe("provisioning");
		});

		it("should derive 'ready' when all counters are zero", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			const app: DashApplication = {
				...MOCK_DASH_APPLICATIONS[0],
				health: {
					instances: {
						active: 0,
						healthy: 0,
						failed: 0,
						starting: 0,
						scheduling: 0,
					},
				},
			};
			msw.use(
				http.get(
					"*/dash/applications",
					async () => HttpResponse.json(dashAppsResponse([app])),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			const output = JSON.parse(std.out);
			expect(output[0].state).toBe("ready");
		});
	});

	describe("--json", () => {
		it("should output JSON matching expected schema", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications",
					async () =>
						HttpResponse.json(dashAppsResponse(MOCK_DASH_APPLICATIONS)),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			expect(std.err).toMatchInlineSnapshot(`""`);
			const output = JSON.parse(std.out);
			expect(output).toHaveLength(4);
			// Verify shape of each entry
			for (const entry of output) {
				expect(entry).toHaveProperty("id");
				expect(entry).toHaveProperty("name");
				expect(entry).toHaveProperty("state");
				expect(entry).toHaveProperty("instances");
				expect(entry).toHaveProperty("image");
				expect(entry).toHaveProperty("version");
				expect(entry).toHaveProperty("updated_at");
				expect(entry).toHaveProperty("created_at");
			}
		});

		it("should output empty array for no containers", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications",
					async () => HttpResponse.json(dashAppsResponse([])),
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			const output = JSON.parse(std.out);
			expect(output).toEqual([]);
		});

		it("should fetch all results in a single unpaginated request", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			let requestCount = 0;
			msw.use(
				http.get(
					"*/dash/applications",
					async ({ request }) => {
						requestCount++;
						const url = new URL(request.url);
						expect(url.searchParams.has("per_page")).toBe(false);
						expect(url.searchParams.has("page_token")).toBe(false);
						return HttpResponse.json(dashAppsResponse(MOCK_DASH_APPLICATIONS));
					},
					{ once: true }
				)
			);
			await runWrangler("containers list --json");
			expect(requestCount).toBe(1);
			const output = JSON.parse(std.out);
			expect(output).toHaveLength(4);
		});

		it("should throw JsonFriendlyFatalError on unexpected API error", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications",
					async () => {
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 2000, message: "boom" }],
								messages: [],
							},
							{ status: 500 }
						);
					},
					{ once: true }
				)
			);
			await expect(runWrangler("containers list --json")).rejects.toThrowError(
				/unknown error listing containers/
			);
		});

		it("should let UserError propagate through on 400 API response", async () => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications",
					async () => {
						return HttpResponse.json(
							{
								success: false,
								result: null,
								errors: [{ code: 1000, message: "bad" }],
								messages: [],
								error: "bad request",
							},
							{ status: 400 }
						);
					},
					{ once: true }
				)
			);
			await expect(runWrangler("containers list --json")).rejects.toThrowError(
				/There has been an error listing containers/
			);
		});
	});
});
