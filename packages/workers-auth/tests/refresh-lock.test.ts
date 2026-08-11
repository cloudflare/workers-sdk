import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import {
	getRefreshLockPath,
	tryWithRefreshLock,
	withRefreshLock,
} from "../src/refresh-lock";

describe("credential lock policy", () => {
	runInTempDir();
	afterEach(() => vi.useRealTimers());

	it("waits beyond two request timeouts without evicting the live owner", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const lockPath = path.join(process.cwd(), "test.lock");
		mkdirSync(lockPath);
		const owner = `owner-${process.pid}-${randomUUID()}`;
		writeFileSync(path.join(lockPath, owner), "");
		const callback = vi.fn(async () => 42);
		const result = withRefreshLock(lockPath, callback);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(callback).not.toHaveBeenCalled();
		expect(readdirSync(lockPath)).toEqual([owner]);
		removeDirSync(lockPath);
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(result).resolves.toBe(42);
	});

	it("preserves the credential timeout error and defers synchronous migration", async ({
		expect,
	}) => {
		const lockPath = path.join(process.cwd(), "test.lock");
		await withRefreshLock(lockPath, async () => {
			const callback = vi.fn();
			expect(tryWithRefreshLock(lockPath, callback)).toEqual({
				acquired: false,
			});
			await expect(
				withRefreshLock(lockPath, callback, { timeoutMs: 0 })
			).rejects.toThrow("Another process is updating the saved credentials");
			expect(callback).not.toHaveBeenCalled();
		});
		expect(tryWithRefreshLock(lockPath, () => 42)).toEqual({
			acquired: true,
			value: 42,
		});
	});

	it("uses one canonical lock for every backend of a profile", ({ expect }) => {
		const profilePath = path.join(process.cwd(), "config", "team");
		for (const extension of ["toml", "json", "enc"]) {
			expect(getRefreshLockPath(`${profilePath}.${extension}`)).toBe(
				`${profilePath}.refresh-lock`
			);
		}
		expect(
			getRefreshLockPath(path.join(process.cwd(), "config", "other.toml"))
		).not.toBe(getRefreshLockPath(`${profilePath}.enc`));
	});
});
