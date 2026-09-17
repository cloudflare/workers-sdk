import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as user from "../../user";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { MOCK_DASH_APPLICATIONS } from "../helpers/mock-cloudchamber";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";
import type { DashApplication } from "@cloudflare/containers-shared";

type DashApplicationWithAssigned = Omit<DashApplication, "health"> & {
	health: Omit<DashApplication["health"], "instances"> & {
		instances: DashApplication["health"]["instances"] & {
			assigned?: number;
		};
	};
};

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

const NAMESPACE_APPLICATION: DashApplicationWithAssigned = {
	...MOCK_DASH_APPLICATIONS[0],
	id: "7d88cd87be4b402387fd3aafa1d461af",
	name: "chess-match",
	instances: 0,
	health: {
		instances: {
			active: 0,
			assigned: 2,
			healthy: 0,
			failed: 0,
			starting: 0,
			scheduling: 0,
		},
	},
};

describe("containers list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		msw.resetHandlers();
	});

	it("should help", async ({ expect }) => {
		await runWrangler("containers list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers list

			List container applications

			GLOBAL FLAGS
			  -c, --config          Path to Wrangler configuration file  [string]
			      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help            Show help  [boolean]
			      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
			      --profile         Use a specific auth profile  [string]
			  -v, --version         Show version number  [boolean]

			OPTIONS
			      --per-page  Number of container applications per page  [number] [default: 25]
			      --json      Return output as JSON  [boolean] [default: false]"
		`);
	});

	it("should reject --per-page 0", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(runWrangler("containers list --per-page 0")).rejects.toThrow(
			/--per-page must be an integer between 1 and 1000/
		);
	});

	it("should reject --per-page with negative value", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(runWrangler("containers list --per-page -1")).rejects.toThrow(
			/--per-page must be an integer between 1 and 1000/
		);
	});

	it("should reject a fractional --per-page value", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(runWrangler("containers list --per-page 1.5")).rejects.toThrow(
			/--per-page must be an integer between 1 and 1000/
		);
	});

	it("should reject --per-page above the API limit", async ({ expect }) => {
		setIsTTY(false);
		setWranglerConfig({});
		await expect(
			runWrangler("containers list --per-page 1001")
		).rejects.toThrow(/--per-page must be an integer between 1 and 1000/);
	});

	it("should show the correct authentication error", async ({ expect }) => {
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

	it("should throw UserError on 400 API response", async ({ expect }) => {
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
		await expect(runWrangler("containers list")).rejects.toThrow(
			/There has been an error listing container applications/
		);
	});

	it("should throw on 500 API response", async ({ expect }) => {
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
		await expect(runWrangler("containers list")).rejects.toThrow(
			/unknown error listing container applications/
		);
	});

	it("should render a table (non-TTY)", async ({ expect }) => {
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
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┐
			│ APPLICATION ID │ NAME │ STATE │ LIVE INSTANCES │ LAST MODIFIED │
			├─┼─┼─┼─┼─┤
			│ aaaaaaaa-1111-1111-1111-111111111111 │ my-active-app │ active │ 2 │ 2025-06-10T12:00:00Z │
			├─┼─┼─┼─┼─┤
			│ bbbbbbbb-2222-2222-2222-222222222222 │ my-degraded-app │ degraded │ 1 │ 2025-06-11T09:30:00Z │
			├─┼─┼─┼─┼─┤
			│ cccccccc-3333-3333-3333-333333333333 │ my-provisioning-app │ provisioning │ 0 │ 2025-06-12T16:45:00Z │
			├─┼─┼─┼─┼─┤
			│ dddddddd-4444-4444-4444-444444444444 │ my-ready-app │ ready │ 0 │ 2025-06-13T07:15:00Z │
			└─┴─┴─┴─┴─┘"
		`);
	});

	it("should show active namespace instances in the table", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/dash/applications",
				async () =>
					HttpResponse.json(dashAppsResponse([NAMESPACE_APPLICATION])),
				{ once: true }
			)
		);

		await runWrangler("containers list");

		expect(std.out).toContain("LIVE INSTANCES");
		expect(std.out).toContain(
			"│ 7d88cd87be4b402387fd3aafa1d461af │ chess-match │ active │ 2 │"
		);
	});

	it("should handle empty results (non-TTY)", async ({ expect }) => {
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
		// Non-TTY without --json: empty list logs the empty application state as text
		expect(std.out).toContain("No container applications found.");
	});

	it("should fetch all results from a single page (non-TTY)", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		let requestCount = 0;
		msw.use(
			http.get(
				"*/dash/applications",
				async ({ request }) => {
					requestCount++;
					const url = new URL(request.url);
					expect(url.searchParams.get("per_page")).toBe("25");
					expect(url.searchParams.has("page_token")).toBe(false);
					return HttpResponse.json(dashAppsResponse(MOCK_DASH_APPLICATIONS));
				},
				{ once: true }
			)
		);
		await runWrangler("containers list");
		expect(requestCount).toBe(1);
		expect(std.out).toMatchInlineSnapshot(`
			"┌─┬─┬─┬─┬─┐
			│ APPLICATION ID │ NAME │ STATE │ LIVE INSTANCES │ LAST MODIFIED │
			├─┼─┼─┼─┼─┤
			│ aaaaaaaa-1111-1111-1111-111111111111 │ my-active-app │ active │ 2 │ 2025-06-10T12:00:00Z │
			├─┼─┼─┼─┼─┤
			│ bbbbbbbb-2222-2222-2222-222222222222 │ my-degraded-app │ degraded │ 1 │ 2025-06-11T09:30:00Z │
			├─┼─┼─┼─┼─┤
			│ cccccccc-3333-3333-3333-333333333333 │ my-provisioning-app │ provisioning │ 0 │ 2025-06-12T16:45:00Z │
			├─┼─┼─┼─┼─┤
			│ dddddddd-4444-4444-4444-444444444444 │ my-ready-app │ ready │ 0 │ 2025-06-13T07:15:00Z │
			└─┴─┴─┴─┴─┘"
		`);
	});

	it("should follow every application page in non-interactive output", async ({
		expect,
	}) => {
		setIsTTY(false);
		setWranglerConfig({});
		let requestCount = 0;
		msw.use(
			http.get("*/dash/applications", async ({ request }) => {
				requestCount++;
				const pageToken = new URL(request.url).searchParams.get("page_token");
				if (pageToken === null) {
					return HttpResponse.json(
						dashAppsResponse(MOCK_DASH_APPLICATIONS.slice(0, 2), "next-page")
					);
				}

				expect(pageToken).toBe("next-page");
				return HttpResponse.json(
					dashAppsResponse(MOCK_DASH_APPLICATIONS.slice(2))
				);
			})
		);

		await runWrangler("containers list");

		expect(requestCount).toBe(2);
		expect(std.out).toContain("my-active-app");
		expect(std.out).toContain("my-ready-app");
	});

	describe("state derivation", () => {
		it("should derive 'active' when active > 0 and no failures", async ({
			expect,
		}) => {
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

		it("should derive 'degraded' when failed > 0 (even with active)", async ({
			expect,
		}) => {
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

		it("should derive 'provisioning' when starting > 0", async ({ expect }) => {
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

		it("should derive 'provisioning' when scheduling > 0", async ({
			expect,
		}) => {
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
						scheduling: 1,
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

		it("should derive 'ready' when all counters are zero", async ({
			expect,
		}) => {
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
		it("should expose active namespace instances without losing the configured count", async ({
			expect,
		}) => {
			setIsTTY(false);
			setWranglerConfig({});
			msw.use(
				http.get(
					"*/dash/applications",
					async () =>
						HttpResponse.json(dashAppsResponse([NAMESPACE_APPLICATION])),
					{ once: true }
				)
			);

			await runWrangler("containers list --json");

			expect(JSON.parse(std.out)[0]).toMatchObject({
				id: "7d88cd87be4b402387fd3aafa1d461af",
				state: "active",
				instances: 0,
				live_instances: 2,
			});
		});

		it("should output JSON matching expected schema", async ({ expect }) => {
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
			for (const entry of output) {
				expect(entry).toEqual({
					id: expect.any(String),
					name: expect.any(String),
					state: expect.any(String),
					instances: expect.any(Number),
					live_instances: expect.any(Number),
					image: expect.any(String),
					version: expect.any(Number),
					updated_at: expect.any(String),
					created_at: expect.any(String),
				});
			}
		});

		it("should output empty array for no containers", async ({ expect }) => {
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

		it("should fetch all results from a single page", async ({ expect }) => {
			setIsTTY(false);
			setWranglerConfig({});
			let requestCount = 0;
			msw.use(
				http.get(
					"*/dash/applications",
					async ({ request }) => {
						requestCount++;
						const url = new URL(request.url);
						expect(url.searchParams.get("per_page")).toBe("25");
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

		it("should follow every application page in JSON output", async ({
			expect,
		}) => {
			setIsTTY(false);
			setWranglerConfig({});
			let requestCount = 0;
			msw.use(
				http.get("*/dash/applications", async ({ request }) => {
					requestCount++;
					const pageToken = new URL(request.url).searchParams.get("page_token");
					return HttpResponse.json(
						pageToken === null
							? dashAppsResponse(
									MOCK_DASH_APPLICATIONS.slice(0, 2),
									"next-page"
								)
							: dashAppsResponse(MOCK_DASH_APPLICATIONS.slice(2))
					);
				})
			);

			await runWrangler("containers list --json");

			expect(requestCount).toBe(2);
			expect(JSON.parse(std.out)).toHaveLength(4);
		});

		it("should throw JsonFriendlyFatalError on unexpected API error", async ({
			expect,
		}) => {
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
			await expect(runWrangler("containers list --json")).rejects.toThrow(
				/unknown error listing container applications/
			);
		});

		it("should let UserError propagate through on 400 API response", async ({
			expect,
		}) => {
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
			await expect(runWrangler("containers list --json")).rejects.toThrow(
				/There has been an error listing container applications/
			);
		});
	});
});
