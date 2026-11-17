import assert from "node:assert";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { Miniflare } from "miniflare";
import { afterEach, describe, it, vi } from "vitest";
import * as remote from "../../api/remoteBindings/start-remote-proxy-session";
import { readConfig } from "../../config";
import { createRemoteMultipartTransport } from "../../r2/helpers/multipart-transport";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { RemoteProxyConnectionString } from "miniflare";

// Miniflare needs undici's real request and response implementations.
vi.unmock("undici");

describe("remote multipart session", () => {
	runInTempDir();
	mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("passes the active credentials, account, jurisdiction and compliance region to the session", async ({
		expect,
	}) => {
		const dispose = vi.fn(async () => {});
		const start = vi
			.spyOn(remote, "startRemoteProxySession")
			.mockResolvedValue({
				ready: Promise.resolve(),
				remoteProxyConnectionString: new URL(
					"http://127.0.0.1:1"
				) as RemoteProxyConnectionString,
				updateBindings: vi.fn(async () => {}),
				dispose,
			});
		const config = readConfig({});
		config.compliance_region = "fedramp_high";
		const transport = await createRemoteMultipartTransport(
			config,
			"bucket",
			"key",
			{},
			"eu"
		);
		try {
			expect(start).toHaveBeenCalledWith(
				{
					BUCKET: {
						type: "r2_bucket",
						bucket_name: "bucket",
						jurisdiction: "eu",
					},
				},
				{ auth: expect.any(Function), complianceRegion: "fedramp_high" }
			);
			const auth = start.mock.calls[0]?.[1]?.auth;
			assert(typeof auth === "function");
			expect(await auth()).toEqual({
				accountId: "some-account-id",
				apiToken: { apiToken: "some-api-token" },
			});
		} finally {
			await transport.dispose();
		}
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("explains the preview permission requirement when session creation fails", async ({
		expect,
	}) => {
		vi.spyOn(remote, "startRemoteProxySession").mockRejectedValue(
			new Error("forbidden")
		);
		await expect(
			createRemoteMultipartTransport(readConfig({}), "bucket", "key", {})
		).rejects.toThrow("Workers preview session");
	});

	it("disposes the session and preserves the startup error if Miniflare startup fails", async ({
		expect,
	}) => {
		const dispose = vi.fn(async () => {
			throw new Error("cleanup failed");
		});
		vi.spyOn(remote, "startRemoteProxySession").mockResolvedValue({
			ready: Promise.resolve(),
			remoteProxyConnectionString: new URL(
				"http://127.0.0.1:1"
			) as RemoteProxyConnectionString,
			updateBindings: vi.fn(async () => {}),
			dispose,
		});
		const error = new Error("runtime startup failed");
		vi.spyOn(Miniflare.prototype, "ready", "get").mockRejectedValue(error);
		await expect(
			createRemoteMultipartTransport(readConfig({}), "bucket", "key", {})
		).rejects.toBe(error);
		expect(dispose).toHaveBeenCalledOnce();
	});
});
