import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import {
	getRefreshLockPath,
	tryWithRefreshLock,
	withRefreshLock,
} from "../src/refresh-lock";

const FAST_RETRIES = { maxRetries: 3, retryDelayMs: 10 };

describe("withRefreshLock", () => {
	runInTempDir();
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	function lockDir(): string {
		return path.join(process.cwd(), "test.lock");
	}

	function seedOwner(pid: number): string {
		mkdirSync(lockDir(), { recursive: true });
		const owner = `owner-${pid}-${randomUUID()}`;
		writeFileSync(path.join(lockDir(), owner), "");
		return owner;
	}

	it("publishes complete ownership and releases the lock around fn", async ({
		expect,
	}) => {
		const result = await withRefreshLock(lockDir(), async () => {
			expect(readdirSync(lockDir())).toEqual([
				expect.stringMatching(new RegExp(`^owner-${process.pid}-`)),
			]);
			return 42;
		});
		expect(result).toBe(42);
		expect(existsSync(lockDir())).toBe(false);
		expect(
			readdirSync(process.cwd()).filter((entry) =>
				entry.startsWith("test.lock")
			)
		).toEqual([]);
	});

	it("releases the lock when fn throws", async ({ expect }) => {
		await expect(
			withRefreshLock(lockDir(), async () => {
				throw new Error("boom");
			})
		).rejects.toThrow("boom");
		expect(existsSync(lockDir())).toBe(false);
	});

	it("waits beyond two request timeouts with short initial retries", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const owner = seedOwner(process.pid);
		const callback = vi.fn(async () => 42);
		const result = withRefreshLock(lockDir(), callback);
		await vi.advanceTimersByTimeAsync(59_000);
		expect(callback).not.toHaveBeenCalled();
		expect(readdirSync(lockDir())).toEqual([owner]);
		removeDirSync(lockDir());
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(result).resolves.toBe(42);
	});

	it("retries promptly when a short-lived holder releases", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		seedOwner(process.pid);
		const result = withRefreshLock(lockDir(), async () => 42);
		removeDirSync(lockDir());
		await vi.advanceTimersByTimeAsync(100);
		await expect(result).resolves.toBe(42);
	});

	it.for(["unlinkSync", "rmdirSync"] as const)(
		"does not mask async results or errors when %s fails during release",
		async (operation, { expect }) => {
			const logger = { debug: vi.fn() };
			const failure = new Error("transaction failed");
			for (const throws of [false, true]) {
				removeDirSync(lockDir());
				const result = withRefreshLock(
					lockDir(),
					async () => {
						vi.spyOn(fs, operation).mockImplementation(() => {
							throw Object.assign(new Error("cleanup denied"), {
								code: "EACCES",
							});
						});
						syncBuiltinESMExports();
						if (throws) {
							throw failure;
						}
						return 42;
					},
					{ logger }
				);
				if (throws) {
					await expect(result).rejects.toBe(failure);
				} else {
					await expect(result).resolves.toBe(42);
				}
				vi.restoreAllMocks();
				syncBuiltinESMExports();
			}
			expect(logger.debug).toHaveBeenCalledTimes(2);
		}
	);

	it("does not mask synchronous migration results or errors during release", ({
		expect,
	}) => {
		const failure = new Error("migration failed");
		for (const throws of [false, true]) {
			removeDirSync(lockDir());
			const run = () =>
				tryWithRefreshLock(lockDir(), () => {
					vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
						throw new Error("cleanup denied");
					});
					syncBuiltinESMExports();
					if (throws) {
						throw failure;
					}
					return 42;
				});
			if (throws) {
				expect(run).toThrow(failure);
			} else {
				expect(run()).toEqual({ acquired: true, value: 42 });
			}
			vi.restoreAllMocks();
			syncBuiltinESMExports();
		}
	});

	it("recovers a lock held by a dead process", async ({ expect }) => {
		seedOwner(999999999);
		expect(await withRefreshLock(lockDir(), async () => "acquired")).toBe(
			"acquired"
		);
		expect(existsSync(lockDir())).toBe(false);
	});

	it("fails closed for a live owner even when the lock is old", async ({
		expect,
	}) => {
		const owner = seedOwner(process.pid);
		const past = new Date(0);
		utimesSync(lockDir(), past, past);
		const callback = vi.fn();
		await expect(
			withRefreshLock(lockDir(), callback, FAST_RETRIES)
		).rejects.toThrow("Another process");
		expect(callback).not.toHaveBeenCalled();
		expect(readdirSync(lockDir())).toEqual([owner]);
	});

	it("does not mistake an unprobeable PID for a dead owner", async ({
		expect,
	}) => {
		const owner = seedOwner(process.pid);
		vi.spyOn(process, "kill").mockImplementation(() => {
			throw Object.assign(new Error("denied"), { code: "EPERM" });
		});
		const callback = vi.fn();
		await expect(
			withRefreshLock(lockDir(), callback, FAST_RETRIES)
		).rejects.toThrow("Another process");
		expect(callback).not.toHaveBeenCalled();
		expect(readdirSync(lockDir())).toEqual([owner]);
	});

	it("does not delete a new owner when a stale reaper is delayed", async ({
		expect,
	}) => {
		seedOwner(999999999);
		const kill = process.kill.bind(process);
		let replacement: string | undefined;
		vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
			if (pid === 999999999) {
				removeDirSync(lockDir());
				replacement = seedOwner(process.pid);
				throw Object.assign(new Error("dead"), { code: "ESRCH" });
			}
			return kill(pid, signal);
		});
		const callback = vi.fn();
		await expect(
			withRefreshLock(lockDir(), callback, FAST_RETRIES)
		).rejects.toThrow("Another process");
		expect(callback).not.toHaveBeenCalled();
		expect(readdirSync(lockDir())).toEqual([replacement]);
	});

	it("fails closed for malformed ownership metadata", async ({ expect }) => {
		mkdirSync(lockDir());
		writeFileSync(path.join(lockDir(), "info.json"), '{"pid":');
		const callback = vi.fn();
		await expect(
			withRefreshLock(lockDir(), callback, FAST_RETRIES)
		).rejects.toThrow("Another process");
		expect(callback).not.toHaveBeenCalled();
	});

	it("recovers an empty directory left during release", async ({ expect }) => {
		mkdirSync(lockDir());
		expect(await withRefreshLock(lockDir(), async () => 42)).toBe(42);
	});

	it("fails closed on filesystem errors without retrying", async ({
		expect,
	}) => {
		writeFileSync(lockDir(), "not a directory");
		const callback = vi.fn();
		await expect(
			withRefreshLock(path.join(lockDir(), "nested"), callback)
		).rejects.toThrow();
		expect(callback).not.toHaveBeenCalled();
	});

	it("cleans up a candidate when metadata preparation fails", async ({
		expect,
	}) => {
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
			throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
		});
		syncBuiltinESMExports();
		const callback = vi.fn();
		await expect(withRefreshLock(lockDir(), callback)).rejects.toThrow(
			"disk full"
		);
		expect(callback).not.toHaveBeenCalled();
		expect(
			readdirSync(process.cwd()).filter((entry) =>
				entry.startsWith("test.lock")
			)
		).toEqual([]);
	});

	it("never publishes an owner when rename fails", async ({ expect }) => {
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw Object.assign(new Error("read only"), { code: "EROFS" });
		});
		syncBuiltinESMExports();
		const callback = vi.fn();
		await expect(withRefreshLock(lockDir(), callback)).rejects.toThrow(
			"read only"
		);
		expect(callback).not.toHaveBeenCalled();
		expect(
			readdirSync(process.cwd()).filter((entry) =>
				entry.startsWith("test.lock")
			)
		).toEqual([]);
	});

	it("defers synchronous migration when a transaction holds the lock", async ({
		expect,
	}) => {
		await withRefreshLock(lockDir(), async () => {
			const callback = vi.fn();
			expect(tryWithRefreshLock(lockDir(), callback)).toEqual({
				acquired: false,
			});
			expect(callback).not.toHaveBeenCalled();
		});
		expect(tryWithRefreshLock(lockDir(), () => 42)).toEqual({
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
