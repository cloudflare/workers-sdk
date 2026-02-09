import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { CloudflareTunnelResource } from "../tunnel/client";

// Default tunnel for mocking responses
const defaultTunnel: CloudflareTunnelResource = {
	id: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
	name: "my-tunnel",
	status: "healthy",
	created_at: "2024-01-15T10:30:00Z",
	tun_type: "cfd_tunnel",
	account_tag: "some-account-id",
};

const secondTunnel: CloudflareTunnelResource = {
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

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("tunnel");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler tunnel

			Manage Cloudflare Tunnels

			COMMANDS
			  wrangler tunnel create <name>        Create a new Cloudflare Tunnel
			  wrangler tunnel delete <tunnel>      Delete a Cloudflare Tunnel
			  wrangler tunnel info <tunnel>        Display details about a Cloudflare Tunnel
			  wrangler tunnel list                 List all Cloudflare Tunnels in your account
			  wrangler tunnel update <tunnel>      Update a Cloudflare Tunnel
			  wrangler tunnel run [tunnel]         Run a Cloudflare Tunnel using cloudflared
			  wrangler tunnel quick-start <url>    Start a free, temporary tunnel without an account (https://try.cloudflare.com)
			  wrangler tunnel route                Configure routing for a Cloudflare Tunnel (DNS hostnames or private IP networks)
			  wrangler tunnel service              Manage cloudflared as a system service
			  wrangler tunnel cleanup <tunnels..>  Remove stale tunnel connections
			  wrangler tunnel token <tunnel>       Fetch the credentials token for an existing tunnel (by name or UUID) that allows to run it

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show help when an invalid argument is passed", async () => {
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
		it("should create a tunnel", async () => {
			const reqPromise = mockTunnelCreate();

			await runWrangler("tunnel create my-new-tunnel");

			const req = await reqPromise;
			expect(req.name).toBe("my-new-tunnel");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Creating tunnel "my-new-tunnel"
				Created tunnel.
				ID: f70ff985-a4ef-4643-bbbc-4a0ed4fc8415
				Name: my-new-tunnel

				To run this tunnel:
				   wrangler tunnel run f70ff985-a4ef-4643-bbbc-4a0ed4fc8415 --url http://localhost:3000"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel name", async () => {
			await expect(() => runWrangler("tunnel create")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	describe("tunnel list", () => {
		it("should list all tunnels", async () => {
			mockTunnelList([defaultTunnel, secondTunnel]);

			await runWrangler("tunnel list");

			expect(std.out).toContain("Listing Cloudflare Tunnels");
			expect(std.out).toContain("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");
			expect(std.out).toContain("my-tunnel");
			expect(std.out).toContain("550e8400-e29b-41d4-a716-446655440000");
			expect(std.out).toContain("api-tunnel");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should show message when no tunnels exist", async () => {
			mockTunnelList([]);

			await runWrangler("tunnel list");

			expect(std.out).toContain("No tunnels found.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("tunnel info", () => {
		it("should get tunnel details", async () => {
			mockTunnelGet(defaultTunnel);

			await runWrangler("tunnel info f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			expect(std.out).toContain("Getting tunnel details");
			expect(std.out).toContain("ID: f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");
			expect(std.out).toContain("Name: my-tunnel");
			expect(std.out).toContain("Status: healthy");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel ID", async () => {
			await expect(() => runWrangler("tunnel info")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});

		it("should handle non-existent tunnel", async () => {
			mockTunnelGetNotFound("nonexistent-id");

			await expect(
				runWrangler("tunnel info nonexistent-id")
			).rejects.toThrowError();

			expect(std.err).toContain("ERROR");
		});
	});

	describe("tunnel update", () => {
		it("should update tunnel name", async () => {
			const reqPromise = mockTunnelUpdate();

			await runWrangler(
				"tunnel update f70ff985-a4ef-4643-bbbc-4a0ed4fc8415 --name new-tunnel-name"
			);

			const req = await reqPromise;
			expect(req.name).toBe("new-tunnel-name");

			expect(std.out).toContain("Updating tunnel");
			expect(std.out).toContain("Updated tunnel.");
			expect(std.out).toContain("Name: new-tunnel-name");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require --name flag", async () => {
			await expect(
				runWrangler("tunnel update f70ff985-a4ef-4643-bbbc-4a0ed4fc8415")
			).rejects.toThrow(
				"Please provide a new name for the tunnel using --name"
			);
		});

		it("should require a tunnel ID", async () => {
			await expect(() => runWrangler("tunnel update")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});

	describe("tunnel delete", () => {
		it("should delete tunnel with confirmation", async () => {
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

		it("should cancel deletion when not confirmed", async () => {
			mockConfirm({
				text: 'Are you sure you want to delete tunnel "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415"? This action cannot be undone.',
				result: false,
			});

			await runWrangler("tunnel delete f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			expect(std.out).toContain("Deletion cancelled.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should skip confirmation with --force", async () => {
			mockTunnelDelete("f70ff985-a4ef-4643-bbbc-4a0ed4fc8415");

			await runWrangler(
				"tunnel delete f70ff985-a4ef-4643-bbbc-4a0ed4fc8415 --force"
			);

			expect(std.out).toContain("Deleting tunnel");
			expect(std.out).toContain("Tunnel deleted.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should require a tunnel ID", async () => {
			await expect(() => runWrangler("tunnel delete")).rejects.toThrow(
				"Not enough non-option arguments"
			);
		});
	});
});

// Mock helper functions

function mockTunnelCreate(): Promise<{ name: string }> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/cfd_tunnel",
				async ({ request }) => {
					const body = (await request.json()) as { name: string };
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

function mockTunnelList(tunnels: CloudflareTunnelResource[]) {
	msw.use(
		http.get("*/accounts/:accountId/cfd_tunnel", ({ request }) => {
			const url = new URL(request.url);
			const page = Number(url.searchParams.get("page") || 1);
			const perPage = Number(url.searchParams.get("per_page") || 20);

			// Return tunnels on first page, empty on subsequent pages
			const result = page === 1 ? tunnels : [];

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result,
				result_info: {
					page,
					per_page: perPage,
					count: result.length,
					total_count: tunnels.length,
				},
			});
		})
	);
}

function mockTunnelGet(tunnel: CloudflareTunnelResource) {
	msw.use(
		http.get(
			"*/accounts/:accountId/cfd_tunnel/:tunnelId",
			() => {
				return HttpResponse.json(createFetchResult(tunnel));
			},
			{ once: true }
		),
		// Also mock connections endpoint
		http.get(
			"*/accounts/:accountId/cfd_tunnel/:tunnelId/connections",
			() => {
				return HttpResponse.json(createFetchResult([]));
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

function mockTunnelUpdate(): Promise<{ name: string }> {
	return new Promise((resolve) => {
		msw.use(
			http.patch(
				"*/accounts/:accountId/cfd_tunnel/:tunnelId",
				async ({ request }) => {
					const body = (await request.json()) as { name: string };
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

	it("should show helpful error message when permission is denied", async () => {
		mockTunnelPermissionError();

		await expect(runWrangler("tunnel list")).rejects.toThrow(
			"Cloudflare Tunnel commands require API token authentication with tunnel permissions."
		);

		expect(std.err).toContain("API token authentication");
		expect(std.err).toContain("CLOUDFLARE_API_TOKEN");
	});
});
