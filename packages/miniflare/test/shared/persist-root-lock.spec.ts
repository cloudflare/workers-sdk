import childProcess from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { describe, onTestFinished, test } from "vitest";
import {
	canonicalisePersistRoot,
	withPersistRootStartupLock,
} from "../../src/shared/persist-root-lock";
import { useTmp } from "../test-shared";

const LOCK_CHILD_SCRIPT = String.raw`
	const fs = require("node:fs/promises");
	const path = require("node:path");
	const { withPersistRootStartupLock } = require(process.env.LOCK_MODULE);

	(async () => {
		const root = process.env.LOCK_ROOT;
		const id = process.env.LOCK_CHILD_ID;
		await fs.writeFile(path.join(root, "ready-" + id), "");
		while (true) {
			try {
				await fs.access(path.join(root, "go"));
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		}
		await withPersistRootStartupLock(root, async () => {
			const eventsPath = path.join(root, "events");
			await fs.appendFile(eventsPath, "start:" + id + "\n");
			await new Promise((resolve) => setTimeout(resolve, 75));
			await fs.appendFile(eventsPath, "end:" + id + "\n");
		});
	})().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
`;

describe("persist root startup lock", () => {
	test("serialises callbacks across processes and removes its lock", async ({
		expect,
	}) => {
		const root = await useTmp();
		const modulePath = path.join(root, "persist-root-lock.cjs");
		await build({
			entryPoints: [
				path.resolve(
					import.meta.dirname,
					"../../src/shared/persist-root-lock.ts"
				),
			],
			outfile: modulePath,
			bundle: true,
			platform: "node",
			format: "cjs",
		});
		const childCount = 5;
		const children = Array.from({ length: childCount }, (_, i) =>
			childProcess.spawn(process.execPath, ["-e", LOCK_CHILD_SCRIPT], {
				stdio: ["ignore", "ignore", "inherit"],
				env: {
					...process.env,
					LOCK_MODULE: modulePath,
					LOCK_ROOT: root,
					LOCK_CHILD_ID: String(i),
				},
			})
		);
		onTestFinished(() => {
			for (const child of children) {
				child.kill();
			}
		});
		const exits = children.map((child) => once(child, "exit"));

		while (
			(await fs.readdir(root)).filter((entry) => entry.startsWith("ready-"))
				.length < childCount
		) {
			expect(children.every((child) => child.exitCode === null)).toBe(true);
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		await fs.writeFile(path.join(root, "go"), "");

		for (const [code] of await Promise.all(exits)) {
			expect(code).toBe(0);
		}
		const events = (await fs.readFile(path.join(root, "events"), "utf8"))
			.trim()
			.split("\n");
		expect(events).toHaveLength(childCount * 2);
		for (let i = 0; i < events.length; i += 2) {
			expect(events[i]).toMatch(/^start:/);
			expect(events[i + 1]).toBe(events[i].replace("start:", "end:"));
		}
		await expect(
			fs.stat(path.join(root, ".miniflare-startup.lock"))
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("recovers stale locks", async ({ expect }) => {
		const root = await useTmp();
		const lockPath = path.join(root, ".miniflare-startup.lock");
		const stale = new Date(Date.now() - 60_000);
		await fs.writeFile(lockPath, "");
		await fs.utimes(lockPath, stale, stale);

		let called = false;
		await withPersistRootStartupLock(root, async () => {
			called = true;
		});

		expect(called).toBe(true);
		await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("recovers a process-owned lock after its owner exits", async ({
		expect,
	}) => {
		const root = await useTmp();
		const lockPath = path.join(root, ".miniflare-startup.lock");
		await fs.mkdir(lockPath);
		await fs.writeFile(
			path.join(
				lockPath,
				"owner-999999999-00000000-0000-0000-0000-000000000000"
			),
			""
		);
		await expect(
			withPersistRootStartupLock(root, async () => 42)
		).resolves.toBe(42);
		await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("does not expire a live owner when its lock is older than the legacy stale window", async ({
		expect,
	}) => {
		const root = await useTmp();
		const acquired = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const first = withPersistRootStartupLock(root, async () => {
			acquired.resolve();
			await release.promise;
		});
		await acquired.promise;
		const stale = new Date(Date.now() - 60_000);
		await fs.utimes(path.join(root, ".miniflare-startup.lock"), stale, stale);
		let called = false;
		const second = withPersistRootStartupLock(root, async () => {
			called = true;
		});
		try {
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(called).toBe(false);
		} finally {
			release.resolve();
			await Promise.all([first, second]);
		}
		expect(called).toBe(true);
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
