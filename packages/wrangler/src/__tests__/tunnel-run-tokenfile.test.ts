import { EventEmitter } from "node:events";
import { afterEach, describe, it, vi } from "vitest";
import { spawnCloudflared } from "../tunnel/cloudflared";
import { tunnelRunCommand } from "../tunnel/run";
import type * as CloudflaredModule from "../tunnel/cloudflared";

vi.mock("../tunnel/cloudflared", async () => {
	const actual = await vi.importActual<typeof CloudflaredModule>(
		"../tunnel/cloudflared"
	);
	return {
		...actual,
		spawnCloudflared: vi.fn(async (_args: string[], _opts?: unknown) => {
			const cp = new EventEmitter() as NodeJS.EventEmitter & {
				stderr: null;
				killed: boolean;
				kill: () => void;
			};
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

	it("passes token via TUNNEL_TOKEN env var, not CLI args", async ({
		expect,
	}) => {
		const token = "TEST_TOKEN";

		const logger = {
			log: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (tunnelRunCommand as any).handler(
			{
				tunnel: undefined,
				token,
				tokenFile: undefined,
				url: undefined,
				logLevel: "info",
			},
			{
				config: { send_metrics: false },
				logger,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				sdk: {} as any,
			}
		);

		expect(spawnCloudflared).toHaveBeenCalledTimes(1);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
