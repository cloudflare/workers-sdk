import { EventEmitter } from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { CloudflareTunnel } from "../../tunnel/client";

// Mock spawnCloudflared so `tunnel run` tests don't need a real binary.
// The mock emits "exit" on next tick so the handler's Promise resolves.
vi.mock("@cloudflare/workers-utils", async () => {
	const actual = await vi.importActual("@cloudflare/workers-utils");
	return {
		...actual,
		spawnCloudflared: vi.fn(async () => {
			const cp = new EventEmitter() as EventEmitter & {
				stderr: null;
				killed: boolean;
				kill: () => boolean;
			};
			cp.stderr = null;
			cp.killed = false;
			cp.kill = () => {
				cp.killed = true;
				return true;
			};
			process.nextTick(() => cp.emit("exit", 0, null));
			return cp;
		}),
	};
});

// Default tunnel for mocking responses
const defaultTunnel: CloudflareTunnel = {
	id: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
	name: "my-tunnel",
	status: "healthy",
	created_at: "2024-01-15T10:30:00Z",
	tun_type: "cfd_tunnel",
	account_tag: "some-account-id",
};

const secondTunnel: CloudflareTunnel = {
	id: "550e8400-e29b-41d4-a716-446655440000",
	name: "api-tunnel",
	status: "inactive",
	created_at: "2024-01-10T15:45:00Z",
	tun_type: "cfd_tunnel",
	account_tag: "some-account-id",
};

describe("tunnel help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async ({
		expect,
	}) => {
		await runWrangler("tunnel");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler tunnel

			🚇 Manage Cloudflare Tunnels [experimental]

			COMMANDS
			  wrangler tunnel create <name>      Create a new Cloudflare Tunnel [experimental]
			  wrangler tunnel delete <tunnel>    Delete a Cloudflare Tunnel [experimental]
			  wrangler tunnel info <tunnel>      Display details about a Cloudflare Tunnel [experimental]
			  wrangler tunnel list               List all Cloudflare Tunnels in your account [experimental]
			  wrangler tunnel run [tunnel]       Run a Cloudflare Tunnel using cloudflared [experimental]
			  wrangler tunnel quick-start <url>  Start a free, temporary tunnel without an account (https://try.cloudflare.com) [experimental]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when an invalid argument is passed", async ({
		expect,
	}) => {
		await expect(() => runWrangler("tunnel invalid")).rejects.toThrow(
			"Unknown argument: invalid"
		);

		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: invalid[0m

			"
		`);
	});
});

describe("tunnel commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	describe("tunnel create", () => {
		it("should create a tunnel", async ({ expect }) => {
			const reqPromise = mockTunnelCreate();

			await runWrangler("tunnel create my-new-tunnel");

			const req = await reqPromise;
			expect(req.name).toBe("my-new-tunnel");
			expect(req.config_src).toBe("cloudflare");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Creating tunnel "my-new-tunnel"
				Created tunnel.
				ID: f70ff985-a4ef-4643-bbbc-4a0ed4fc8415
				Name: my-new-tunnel

				To run this tunnel, configure its ingress rules in the Cloudflare dashboard, then run:
				   wrangler tunnel run f70ff985-a4ef-4643-bbbc-4a0ed4fc8415"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel name", async ({ expect }) => {
			await expect(() => runWrangler("tunnel create")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	describe("tunnel list", () => {
		it("should list all tunnels", async ({ expect }) => {
			mockTunnelList([defaultTunnel, secondTunnel]);

			await runWrangler("tunnel list");

			expect(std.out).toContain("Listing Cloudflare Tunnels");
			expect(std.out).toContain("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");
			expect(std.out).toContain("my-tunnel");
			expect(std.out).toContain("550e8400-e29b-41d4-a716-446655440000");
			expect(std.out).toContain("api-tunnel");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should show message when no tunnels exist", async ({ expect }) => {
			mockTunnelList([]);

			await runWrangler("tunnel list");

			expect(std.out).toContain("No tunnels found.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("tunnel info", () => {
		it("should get tunnel details", async ({ expect }) => {
			mockTunnelGet(defaultTunnel);

			await runWrangler("tunnel info f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			expect(std.out).toContain("Getting tunnel details");
			expect(std.out).toContain("ID: f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");
			expect(std.out).toContain("Name: my-tunnel");
			expect(std.out).toContain("Status: healthy");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel ID", async ({ expect }) => {
			await expect(() => runWrangler("tunnel info")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});

		it("should handle non-existent tunnel", async ({ expect }) => {
			mockTunnelGetNotFound("f70ff985-a4ef-4643-bbbc-4a0ed4fc0000");

			await expect(
				runWrangler("tunnel info f70ff985-a4ef-4643-bbbc-4a0ed4fc0000")
			).rejects.toThrowError(UserError);

			expect(std.err).toContain("ERROR");
		});
	});

	describe("tunnel delete", () => {
		it("should delete tunnel with confirmation", async ({ expect }) => {
			mockConfirm({
				text: 'Are you sure you want to delete tunnel "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415"? This action cannot be undone.',
				result: true,
			});
			mockTunnelDelete("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			await runWrangler("tunnel delete f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			expect(std.out).toContain("Deleting tunnel");
			expect(std.out).toContain("Tunnel deleted.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should cancel deletion when not confirmed", async ({ expect }) => {
			mockConfirm({
				text: 'Are you sure you want to delete tunnel "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415"? This action cannot be undone.',
				result: false,
			});

			await runWrangler("tunnel delete f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			expect(std.out).toContain("Deletion cancelled.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should skip confirmation with --force", async ({ expect }) => {
			mockTunnelDelete("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			await runWrangler(
				"tunnel delete f70ff985-a4ef-4643-bbbc-4a0ed4fc8415 --force"
			);

			expect(std.out).toContain("Deleting tunnel");
			expect(std.out).toContain("Tunnel deleted.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel ID", async ({ expect }) => {
			await expect(() => runWrangler("tunnel delete")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	describe("tunnel quick-start", () => {
		it("should spawn cloudflared with correct args for quick tunnel", async ({
			expect,
		}) => {
			const { spawnCloudflared } = await import("@cloudflare/workers-utils");

			await runWrangler("tunnel quick-start http://localhost:3000");

			expect(spawnCloudflared).toHaveBeenCalledTimes(1);
			const [calledArgs] = vi.mocked(spawnCloudflared).mock.calls[0] as [
				string[],
			];

			// Verify quick tunnel args: no auth, uses --url
			expect(calledArgs).toContain("tunnel");
			expect(calledArgs).toContain("--url");
			expect(calledArgs).toContain("http://localhost:3000");
			expect(calledArgs).toContain("--no-autoupdate");
		});

		it("should require a URL argument", async ({ expect }) => {
			await expect(() => runWrangler("tunnel quick-start")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	describe("tunnel run", () => {
		it("should pass token via TUNNEL_TOKEN env var, not CLI args", async ({
			expect,
		}) => {
			const { spawnCloudflared } = await import("@cloudflare/workers-utils");

			await runWrangler("tunnel run --token TEST_TOKEN");

			expect(spawnCloudflared).toHaveBeenCalledTimes(1);
			const [calledArgs, calledOpts] = vi.mocked(spawnCloudflared).mock
				.calls[0] as [string[], { env?: Record<string, string> }];

			// Token must NOT appear in CLI args (would leak via `ps`)
			expect(calledArgs).not.toContain("--token");
			expect(calledArgs).not.toContain("TEST_TOKEN");

			// Token must be passed via env var
			expect(calledOpts?.env?.TUNNEL_TOKEN).toBe("TEST_TOKEN");
		});

		it("should require tunnel or token", async ({ expect }) => {
			await expect(runWrangler("tunnel run")).rejects.toThrowError(UserError);
		});
	});
});

// Mock helper functions

function mockTunnelCreate(): Promise<{
	name: string;
	config_src: string;
}> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/cfd_tunnel",
				async ({ request }) => {
					const body = (await request.json()) as {
						name: string;
						config_src: string;
					};
					resolve(body);

					return HttpResponse.json(
						createFetchResult({
							...defaultTunnel,
							name: body.name,
						})
					);
				},
				{ once: true }
			)
		);
	});
}

function mockTunnelList(tunnels: CloudflareTunnel[]) {
	msw.use(
		http.get("*/accounts/:accountId/cfd_tunnel", ({ request }) => {
			const url = new URL(request.url);
			const page = Number(url.searchParams.get("page") || 1);
			const perPage = Number(url.searchParams.get("per_page") || 20);

			// Return tunnels on first page, empty on subsequent pages
			const result = page === 1 ? tunnels : [];

			return HttpResponse.json(
				createFetchResult(result, true, [], [], {
					page,
					per_page: perPage,
					count: result.length,
					total_count: tunnels.length,
				})
			);
		})
	);
}

function mockTunnelGet(tunnel: CloudflareTunnel) {
	msw.use(
		http.get(
			"*/accounts/:accountId/cfd_tunnel/:tunnelId",
			() => {
				return HttpResponse.json(createFetchResult(tunnel));
			},
			{ once: true }
		)
	);
}

function mockTunnelGetNotFound(tunnelId: string) {
	msw.use(
		http.get(
			`*/accounts/:accountId/cfd_tunnel/${tunnelId}`,
			() => {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10000, message: "Tunnel not found" },
					]),
					{ status: 404 }
				);
			},
			{ once: true }
		)
	);
}

function mockTunnelDelete(tunnelId: string) {
	msw.use(
		http.delete(
			`*/accounts/:accountId/cfd_tunnel/${tunnelId}`,
			() => {
				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

function mockTunnelPermissionError() {
	msw.use(
		http.get(
			"*/accounts/:accountId/cfd_tunnel",
			() => {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10000, message: "Authentication error" },
					]),
					{ status: 403 }
				);
			},
			{ once: true }
		)
	);
}

describe("tunnel permission errors", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	it("should show helpful error message when permission is denied", async ({
		expect,
	}) => {
		mockTunnelPermissionError();

		await expect(runWrangler("tunnel list")).rejects.toThrow(
			"Cloudflare Tunnel commands require API token authentication with tunnel permissions."
		);

		expect(std.err).toContain("API token authentication");
		expect(std.err).toContain("CLOUDFLARE_API_TOKEN");
	});
});
