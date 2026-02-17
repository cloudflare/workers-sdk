import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnCloudflared } from "../tunnel/cloudflared";
import { tunnelRunCommand } from "../tunnel/run";

vi.mock("../tunnel/cloudflared", async () => {
	const actual = await vi.importActual<typeof import("../tunnel/cloudflared")>(
		"../tunnel/cloudflared"
	);
	return {
		...actual,
		spawnCloudflared: vi.fn(async (_args: string[], _opts?: unknown) => {
			const cp = new EventEmitter() as any;
			cp.stderr = null;
			cp.killed = false;
			cp.kill = () => {
				cp.killed = true;
			};
			return cp;
		}),
	};
});

describe("tunnel run", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("passes token via TUNNEL_TOKEN env var, not CLI args", async () => {
		const token = "TEST_TOKEN";

		const logger = {
			log: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		await tunnelRunCommand.handler(
			{
				tunnel: undefined,
				token,
				tokenFile: undefined,
				url: undefined,
				logLevel: "info",
			} as any,
			{ config: { send_metrics: false } as any, logger, sdk: {} as any } as any
		);

		expect(spawnCloudflared).toHaveBeenCalledTimes(1);
		const [calledArgs, calledOpts] = (spawnCloudflared as any).mock
			.calls[0] as [string[], { env?: Record<string, string> }];

		// Token must NOT appear in CLI args (would leak via `ps`)
		expect(calledArgs).not.toContain("--token");
		expect(calledArgs).not.toContain("--token-file");
		expect(calledArgs).not.toContain(token);

		// Token must be passed via env var
		expect(calledOpts?.env?.TUNNEL_TOKEN).toBe(token);
	});
});
