import fs from "node:fs";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { withRefreshLock, _TEST_CONSTANTS } from "../src/refresh-lock";

const FAST_RETRIES = { maxRetries: 3, retryDelayMs: 10 };

describe("withRefreshLock", () => {
	runInTempDir();

	function lockDir(): string {
		return path.join(process.cwd(), "test.lock");
	}

	it("acquires and releases the lock around fn", async ({ expect }) => {
		const result = await withRefreshLock(lockDir(), async () => {
			expect(existsSync(lockDir())).toBe(true);
			return 42;
		});
		expect(result).toBe(42);
		expect(existsSync(lockDir())).toBe(false);
	});

	it("releases the lock when fn throws", async ({ expect }) => {
		await expect(
			withRefreshLock(lockDir(), async () => {
				throw new Error("boom");
			})
		).rejects.toThrow("boom");
		expect(existsSync(lockDir())).toBe(false);
	});

	it("breaks a lock held by a dead process", async ({ expect }) => {
		const dir = lockDir();
		mkdirSync(dir);
		writeFileSync(
			path.join(dir, _TEST_CONSTANTS.LOCK_INFO_FILE),
			JSON.stringify({ pid: 999999999 }),
			"utf-8"
		);

		const result = await withRefreshLock(dir, async () => "acquired");
		expect(result).toBe("acquired");
		expect(existsSync(dir)).toBe(false);
	});

	it("does not evict an alive process", async ({ expect }) => {
		const dir = lockDir();
		mkdirSync(dir);
		writeFileSync(
			path.join(dir, _TEST_CONSTANTS.LOCK_INFO_FILE),
			JSON.stringify({ pid: process.pid }),
			"utf-8"
		);

		// Lock held by a live process — should NOT be broken, so fn runs
		// without the lock after retries exhaust.
		const result = await withRefreshLock(
			dir,
			async () => "ran-unlocked",
			FAST_RETRIES
		);
		expect(result).toBe("ran-unlocked");
	});

	it("proceeds without the lock when acquisition fails after retries", async ({
		expect,
	}) => {
		const dir = lockDir();
		mkdirSync(dir);
		// Lock held by the current process — not stale, so all retry
		// attempts will fail.
		writeFileSync(
			path.join(dir, _TEST_CONSTANTS.LOCK_INFO_FILE),
			JSON.stringify({ pid: process.pid }),
			"utf-8"
		);

		const result = await withRefreshLock(
			dir,
			async () => "ran-unlocked",
			FAST_RETRIES
		);
		expect(result).toBe("ran-unlocked");
	});

	it("serializes two sequential callers on the same lock", async ({
		expect,
	}) => {
		const order: string[] = [];
		await withRefreshLock(lockDir(), async () => {
			order.push("first");
		});
		await withRefreshLock(lockDir(), async () => {
			order.push("second");
		});
		expect(order).toEqual(["first", "second"]);
	});

	it("breaks a lock directory with no info file after grace period", async ({
		expect,
	}) => {
		const dir = lockDir();
		mkdirSync(dir);
		// Backdate the directory mtime past the grace period so it's treated
		// as stale (the acquirer had enough time to write info.json but didn't).
		const past = new Date(Date.now() - _TEST_CONSTANTS.LOCK_GRACE_MS - 1000);
		utimesSync(dir, past, past);

		const result = await withRefreshLock(dir, async () => "acquired");
		expect(result).toBe("acquired");
	});

	it("proceeds without the lock on non-EEXIST filesystem errors", async ({
		expect,
	}) => {
		// Use a lock path under a non-existent parent to trigger ENOENT from
		// mkdirSync. The function should degrade gracefully (run fn without
		// the lock) rather than propagating the error, and should return
		// immediately without burning through the full retry budget.
		const badLockDir = path.join(
			process.cwd(),
			"non-existent-parent",
			"test.lock"
		);

		const start = Date.now();
		const result = await withRefreshLock(
			badLockDir,
			async () => "ran-unlocked"
		);
		const elapsed = Date.now() - start;

		expect(result).toBe("ran-unlocked");
		// Should complete nearly instantly — well under the default 2s retry delay.
		expect(elapsed).toBeLessThan(1_000);
	});

	it("does not break a fresh lock directory with no info file", async ({
		expect,
	}) => {
		const dir = lockDir();
		mkdirSync(dir);
		// No info file and the directory was just created — within the grace
		// period, so the lock is treated as held by a sibling mid-acquisition.

		const result = await withRefreshLock(
			dir,
			async () => "ran-unlocked",
			FAST_RETRIES
		);
		expect(result).toBe("ran-unlocked");
	});

	it("cleans up the lock directory when writeLockInfo fails after mkdirSync succeeds", async ({
		expect,
	}) => {
		const dir = lockDir();
		// Make writeFileSync throw only for the lock info file, simulating
		// a disk-full or permission error after the directory was created.
		const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((p) => {
			if (typeof p === "string" && p.includes(_TEST_CONSTANTS.LOCK_INFO_FILE)) {
				throw Object.assign(new Error("ENOSPC: no space left"), {
					code: "ENOSPC",
				});
			}
		});

		try {
			const result = await withRefreshLock(dir, async () => "ran-unlocked");
			expect(result).toBe("ran-unlocked");
			// The lock directory should have been cleaned up, not left behind.
			expect(existsSync(dir)).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});
