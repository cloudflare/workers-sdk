import fs from "node:fs/promises";
import path from "node:path";
import { describe, test } from "vitest";
import {
	canonicalisePersistRoot,
	withPersistRootStartupLock,
} from "../../src/shared/persist-root-lock";
import { useTmp } from "../test-shared";

describe("persist root startup lock", () => {
	test("serialises callbacks and removes its lock", async ({ expect }) => {
		const root = await useTmp();
		let running = 0;
		let maximumRunning = 0;
		const run = () =>
			withPersistRootStartupLock(
				root,
				new AbortController().signal,
				async () => {
					running++;
					maximumRunning = Math.max(maximumRunning, running);
					await new Promise((resolve) => setTimeout(resolve, 25));
					running--;
				}
			);

		await Promise.all([run(), run(), run()]);
		expect(maximumRunning).toBe(1);
		await expect(
			fs.stat(path.join(root, ".miniflare-startup.lock"))
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("recovers stale malformed locks and abandoned reclaim claims", async ({
		expect,
	}) => {
		const root = await useTmp();
		const lockPath = path.join(root, ".miniflare-startup.lock");
		const claimPath = `${lockPath}.malformed.reclaim`;
		const stale = new Date(Date.now() - 60_000);
		await fs.writeFile(lockPath, "");
		await fs.utimes(lockPath, stale, stale);
		await fs.writeFile(
			claimPath,
			JSON.stringify({ pid: 2_147_483_647, token: "abandoned" })
		);
		await fs.utimes(claimPath, stale, stale);

		let called = false;
		await withPersistRootStartupLock(
			root,
			new AbortController().signal,
			async () => {
				called = true;
			}
		);

		expect(called).toBe(true);
		await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.stat(claimPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test.runIf(process.platform !== "win32")(
		"canonicalises symlink aliases",
		async ({ expect }) => {
			const parent = await useTmp();
			const root = path.join(parent, "root");
			const alias = path.join(parent, "alias");
			await fs.mkdir(root);
			await fs.symlink(root, alias);
			expect(await canonicalisePersistRoot(alias)).toBe(
				await canonicalisePersistRoot(root)
			);
		}
	);
});
