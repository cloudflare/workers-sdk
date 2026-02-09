import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../user", () => ({
	requireAuth: vi.fn(async () => "account-id"),
}));

vi.mock("../tunnel/client", () => ({
	resolveTunnelId: vi.fn(async () => "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415"),
	getTunnelToken: vi.fn(async () => {
		const payload = {
			a: "account-tag",
			s: "base64-secret",
			t: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
		};
		return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
	}),
}));

import { tunnelTokenCommand } from "../tunnel/token";

describe("tunnel token --cred-file", () => {
	let tempDir: string | undefined;

	afterEach(() => {
		if (tempDir) {
			fs.rmSync(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
		vi.clearAllMocks();
	});

	it("writes credentials JSON file with restrictive permissions", async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-test-"));
		const credFile = path.join(tempDir, "creds.json");
		const logger = { log: vi.fn() };

		await tunnelTokenCommand.handler(
			{
				tunnel: "my-tunnel",
				credFile,
			} as any,
			{ config: { send_metrics: false } as any, logger, sdk: {} as any } as any
		);

		const contents = JSON.parse(fs.readFileSync(credFile, "utf8")) as any;
		expect(contents).toEqual({
			AccountTag: "account-tag",
			TunnelSecret: "base64-secret",
			TunnelID: "f70ff985-a4ef-4643-bbbc-4a0ed4fc8415",
		});

		if (process.platform !== "win32") {
			const mode = fs.statSync(credFile).mode & 0o777;
			expect(mode).toBe(0o400);
		}
	});

	it("refuses to overwrite existing file", async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-test-"));
		const credFile = path.join(tempDir, "creds.json");
		fs.writeFileSync(credFile, "{}", { mode: 0o600 });

		await expect(
			tunnelTokenCommand.handler(
				{ tunnel: "my-tunnel", credFile } as any,
				{ config: { send_metrics: false } as any, logger: { log: vi.fn() }, sdk: {} as any } as any
			)
		).rejects.toThrow(/already exists/);
	});
});
