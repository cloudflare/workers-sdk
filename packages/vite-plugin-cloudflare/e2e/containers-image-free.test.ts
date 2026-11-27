import { execFileSync, spawnSync } from "node:child_process";
import { getEgressInterceptorImage } from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
import { runLongLived, seed } from "./helpers";

describe.skipIf(
	process.env.CI !== "true" ||
		process.platform !== "linux" ||
		Boolean(process.env.LOCAL_TESTS_WITHOUT_DOCKER)
)("image-free Containers with an uncached sidecar", () => {
	const projectPath = seed("containers-image-free", { pm: "pnpm" });
	const dockerPath = getDockerPath();
	const sidecar = getEgressInterceptorImage();
	let preExistingSidecars: Set<string> | undefined;

	function listSidecars() {
		return execFileSync(
			dockerPath,
			["ps", "-aq", "--filter", `ancestor=${sidecar}`],
			{
				encoding: "utf8",
				timeout: 10_000,
			}
		)
			.trim()
			.split(/\s+/)
			.filter(Boolean);
	}

	function cleanupTestSidecars() {
		if (!preExistingSidecars) {
			return;
		}
		const ids = listSidecars().filter((id) => !preExistingSidecars?.has(id));
		if (ids.length) {
			execFileSync(dockerPath, ["rm", "--force", ...ids], { timeout: 30_000 });
		}
	}

	beforeAll(() => {
		preExistingSidecars = new Set(listSidecars());
		execFileSync(dockerPath, ["pull", "docker.io/library/alpine:3.19"], {
			timeout: 120_000,
		});
	}, 130_000);

	afterAll(cleanupTestSidecars, 40_000);

	test.for(["dev", "buildAndPreview"] as const)(
		"%s prepares the sidecar and preserves start-time image selection",
		{ timeout: 300_000 },
		async (command, { expect }) => {
			cleanupTestSidecars();
			const inspect = () =>
				spawnSync(dockerPath, ["image", "inspect", sidecar], {
					timeout: 10_000,
				});
			if (inspect().status === 0) {
				execFileSync(dockerPath, ["image", "rm", sidecar], {
					timeout: 30_000,
				});
			}
			expect(inspect().status).toBe(1);

			const proc = await runLongLived("pnpm", command, projectPath, {
				CLOUDFLARE_API_TOKEN: undefined,
				CLOUDFLARE_ACCOUNT_ID: undefined,
			});
			const match = await vi.waitUntil(
				() =>
					proc.stdout.match(
						/(?:Local:|Ready on:?)\s+(http:\/\/(?:localhost|127\.0\.0\.1):\d+)/
					),
				{ timeout: 120_000, interval: 250 }
			);
			const url = match[1];
			await vi.waitFor(() => expect(inspect().status).toBe(0), {
				timeout: 120_000,
				interval: 500,
			});
			expect(await (await fetch(url)).json()).toEqual([]);

			try {
				expect(await (await fetch(`${url}/start`)).text()).toBe("started");
				await vi.waitFor(
					async () => {
						const response = await fetch(`${url}/exec`, {
							signal: AbortSignal.timeout(5_000),
						});
						expect(response.status).toBe(200);
						expect(await response.json()).toEqual({
							stdout: "Linux\n",
							exitCode: 0,
						});
					},
					{ timeout: 30_000, interval: 500 }
				);
			} finally {
				await fetch(`${url}/destroy`, {
					signal: AbortSignal.timeout(10_000),
				});
			}
		}
	);
});
