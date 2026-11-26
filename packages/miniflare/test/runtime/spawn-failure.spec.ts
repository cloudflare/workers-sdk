import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { Miniflare } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest } from "../test-shared";

for (const code of ["ENOENT", "EACCES", "ENAMETOOLONG"]) {
	test.skipIf(code !== "ENOENT" && process.platform === "win32")(
		`Miniflare: ${code} spawning workerd rejects readiness and permits cleanup`,
		async ({ expect, onTestFinished }) => {
			const directory = await fs.mkdtemp(
				path.join(os.tmpdir(), "miniflare-spawn-refusal-")
			);
			onTestFinished(() => removeDir(directory));
			const executable = path.join(
				directory,
				code === "ENAMETOOLONG" ? "x".repeat(4096) : "workerd"
			);
			if (code === "EACCES") {
				await fs.writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o600 });
				await fs.chmod(executable, 0o600);
			}
			vi.stubEnv("MINIFLARE_WORKERD_PATH", executable);
			onTestFinished(() => {
				vi.unstubAllEnvs();
			});
			const spawn = vi.spyOn(childProcess, "spawn");
			const createServer = vi.spyOn(http, "createServer");
			onTestFinished(() => {
				spawn.mockRestore();
				createServer.mockRestore();
			});
			const mf = new Miniflare({
				enableDevRegistry: false,
				workers: [
					{
						config: {
							name: "spawn-refusal",
							compatibilityDate: "2026-10-01",
							manifest: singleModuleManifest(
								'export default { fetch() { return new Response("unused"); } };'
							),
						},
					},
				],
			});
			onTestFinished(() => mf.dispose().catch(() => {}));
			const startupError = await mf.ready.catch((error: unknown) => error);
			expect(startupError).toMatchObject({
				code: "ERR_RUNTIME_SPAWN_FAILED",
				message: `Failed to start workerd at ${executable} (${code})`,
				cause: { code },
			});
			expect(spawn).toHaveBeenCalledOnce();
			const result = spawn.mock.results[0];
			if (code === "ENAMETOOLONG") {
				expect(result.type).toBe("throw");
				expect(startupError).toHaveProperty("cause", result.value);
			} else {
				const child = result.value;
				assert(child instanceof childProcess.ChildProcess);
				expect(child.pid).toBeUndefined();
				expect(child.stdio.every((stream) => stream?.destroyed ?? true)).toBe(
					true
				);
			}
			await expect(mf.dispose()).rejects.toBe(startupError);
			expect(createServer).toHaveBeenCalled();
			for (const result of createServer.mock.results) {
				assert(result.value instanceof http.Server);
				expect(result.value.listening).toBe(false);
			}
		}
	);
}
