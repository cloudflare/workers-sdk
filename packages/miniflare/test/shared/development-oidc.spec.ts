import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevelopmentOidcTokenCache } from "../../src/shared/development-oidc";
import type {
	DevelopmentOidcIdentity,
	DevelopmentOidcToken,
} from "../../src/shared/development-oidc";

const identity: DevelopmentOidcIdentity = {
	accountId: "account",
	workerId: "worker",
	userId: "user",
	developmentSessionId: "session",
	policy: "policy",
};
const audience = "https://example.com";

function issued(token = "development-token"): DevelopmentOidcToken {
	return { token, expiresAt: Math.floor(Date.now() / 1000) + 300 };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => vi.useRealTimers());

describe("development OIDC token cache", () => {
	it.for(Object.keys(identity) as (keyof DevelopmentOidcIdentity)[])(
		"rejects missing %s before issuance",
		async (field, { expect }) => {
			const cache = new DevelopmentOidcTokenCache();
			const issue = vi.fn(async () => issued());
			await expect(
				cache.getToken({ ...identity, [field]: "" }, audience, issue)
			).rejects.toThrow("complete authorized identity");
			expect(issue).not.toHaveBeenCalled();
		}
	);

	it("coalesces concurrent requests and performs no idle renewal", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		expect(
			await Promise.all(
				Array.from({ length: 20 }, () =>
					cache.getToken(identity, audience, issue)
				)
			)
		).toEqual(Array(20).fill("development-token"));
		expect(issue).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(issue).toHaveBeenCalledOnce();
		expect(await cache.getToken(identity, audience, issue)).toBe(
			"development-token"
		);
		expect(issue).toHaveBeenCalledTimes(2);
	});

	it("reuses at exactly 60 seconds remaining and renews below it", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		await cache.getToken(identity, audience, issue);
		vi.advanceTimersByTime(240_000);
		await cache.getToken(identity, audience, issue);
		expect(issue).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(1);
		await cache.getToken(identity, audience, issue);
		expect(issue).toHaveBeenCalledTimes(2);
	});

	it("does not extend cached lifetime when the wall clock moves backwards", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		await cache.getToken(identity, audience, issue);
		vi.advanceTimersByTime(241_000);
		vi.setSystemTime(1_800_000_000_000);
		await cache.getToken(identity, audience, issue);
		expect(issue).toHaveBeenCalledTimes(2);
	});

	it.for(Object.keys(identity) as (keyof DevelopmentOidcIdentity)[])(
		"separates %s",
		async (field, { expect }) => {
			const cache = new DevelopmentOidcTokenCache();
			const issue = vi.fn(async () => issued());
			await cache.getToken(identity, audience, issue);
			await cache.getToken({ ...identity, [field]: "other" }, audience, issue);
			expect(issue).toHaveBeenCalledTimes(2);
		}
	);

	it("separates audiences and keys containing separators", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		await cache.getToken(identity, audience, issue);
		await cache.getToken(identity, audience + "/other", issue);
		await cache.getToken(
			{ ...identity, userId: "a:b", developmentSessionId: "c" },
			audience,
			issue
		);
		await cache.getToken(
			{ ...identity, userId: "a", developmentSessionId: "b:c" },
			audience,
			issue
		);
		expect(issue).toHaveBeenCalledTimes(4);
	});

	it("propagates renewal failure without returning the old token, then recovers", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi
			.fn(async () => issued())
			.mockResolvedValueOnce(issued("old"));
		await cache.getToken(identity, audience, issue);
		vi.advanceTimersByTime(241_000);
		issue.mockRejectedValueOnce(new Error("Permission denied"));
		await expect(cache.getToken(identity, audience, issue)).rejects.toThrow(
			"Permission denied"
		);
		expect(await cache.getToken(identity, audience, issue)).toBe(
			"development-token"
		);
	});

	it.for([NaN, Infinity, 1.5, -1, 1_800_000_059, 1_800_000_301])(
		"rejects invalid expiry %s",
		async (expiresAt, { expect }) => {
			const cache = new DevelopmentOidcTokenCache();
			await expect(
				cache.getToken(identity, audience, async () => ({
					token: "invalid",
					expiresAt,
				}))
			).rejects.toThrow("invalid token or lifetime");
		}
	);

	it.for(["", "x".repeat(65_537)])(
		"rejects invalid token length (%#)",
		async (token, { expect }) => {
			const cache = new DevelopmentOidcTokenCache();
			await expect(
				cache.getToken(identity, audience, async () => issued(token))
			).rejects.toThrow("invalid token or lifetime");
		}
	);

	it("checks lifetime again after awaiting issuance", async ({ expect }) => {
		const cache = new DevelopmentOidcTokenCache();
		const token = issued();
		await expect(
			cache.getToken(identity, audience, async () => {
				vi.setSystemTime(Date.now() + 241_000);
				return token;
			})
		).rejects.toThrow("invalid token or lifetime");
	});

	it("clears cached tokens and rejects pending results across session changes", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		let complete: ((value: DevelopmentOidcToken) => void) | undefined;
		const issue = vi.fn(
			(signal: AbortSignal) =>
				new Promise<DevelopmentOidcToken>((resolve) => {
					expect(signal.aborted).toBe(false);
					complete = resolve;
				})
		);
		const pending = cache.getToken(identity, audience, issue);
		await Promise.resolve();
		cache.clear();
		expect(issue.mock.calls[0][0].aborted).toBe(true);
		complete?.(issued());
		await expect(pending).rejects.toThrow("session changed");
		const fresh = vi.fn(async () => issued("fresh"));
		expect(await cache.getToken(identity, audience, fresh)).toBe("fresh");
		cache.clear();
		await cache.getToken(identity, audience, fresh);
		expect(fresh).toHaveBeenCalledTimes(2);
	});

	it("does not delete a replacement entry when an invalidated issuance fails", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		let fail: ((reason: Error) => void) | undefined;
		const pending = cache.getToken(
			identity,
			audience,
			() =>
				new Promise((_resolve, reject) => {
					fail = reject;
				})
		);
		await Promise.resolve();
		cache.clear();
		const fresh = vi.fn(async () => issued());
		await cache.getToken(identity, audience, fresh);
		fail?.(new Error("old request failed"));
		await expect(pending).rejects.toThrow("session changed");
		await cache.getToken(identity, audience, fresh);
		expect(fresh).toHaveBeenCalledOnce();
	});

	it("bounds completed entries with LRU eviction", async ({ expect }) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		for (let i = 0; i < 128; i++) {
			await cache.getToken(identity, String(i), issue);
		}
		await cache.getToken(identity, "0", issue);
		await cache.getToken(identity, "128", issue);
		await cache.getToken(identity, "0", issue);
		expect(issue).toHaveBeenCalledTimes(129);
		await cache.getToken(identity, "1", issue);
		expect(issue).toHaveBeenCalledTimes(130);
	});

	it("bounds pending issuance and cancels it on disposal", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const signals: AbortSignal[] = [];
		const completions: ((value: DevelopmentOidcToken) => void)[] = [];
		const requests = Array.from({ length: 128 }, (_, i) =>
			cache.getToken(identity, String(i), (signal) => {
				signals.push(signal);
				return new Promise((resolve) => completions.push(resolve));
			})
		);
		await expect(
			cache.getToken(identity, "overflow", async () => issued())
		).rejects.toThrow("Too many concurrent");
		await Promise.resolve();
		cache.dispose();
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		for (const resolve of completions) {
			resolve(issued());
		}
		const results = await Promise.allSettled(requests);
		expect(results.every((result) => result.status === "rejected")).toBe(true);
		await expect(
			cache.getToken(identity, audience, async () => issued())
		).rejects.toThrow("disposed");
	});
});

describe("development OIDC resource and cancellation boundaries", () => {
	it.for([" ", "x".repeat(2049), "é".repeat(1025), "\ud800"])(
		"rejects malformed or oversized audiences (%#)",
		async (value, { expect }) => {
			const issue = vi.fn(async () => issued());
			await expect(
				new DevelopmentOidcTokenCache().getToken(identity, value, issue)
			).rejects.toThrow("1–2048 UTF-8 bytes");
			expect(issue).not.toHaveBeenCalled();
		}
	);

	it("bounds identity and token bytes, rather than just characters", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued("é".repeat(32_769)));
		await expect(
			cache.getToken({ ...identity, policy: "é".repeat(2049) }, audience, issue)
		).rejects.toThrow("bounded fields");
		expect(issue).not.toHaveBeenCalled();
		await expect(cache.getToken(identity, audience, issue)).rejects.toThrow(
			"invalid token or lifetime"
		);
	});

	it("does not start issuance if disposed before the deferred callback", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(async () => issued());
		const pending = cache.getToken(identity, audience, issue);
		const rejected = expect(pending).rejects.toThrow("session changed");
		cache.dispose();
		await rejected;
		expect(issue).not.toHaveBeenCalled();
	});

	it("rejects immediately on invalidation even when the issuer ignores abort", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const pending = cache.getToken(
			identity,
			audience,
			() => new Promise(() => {})
		);
		const rejected = expect(pending).rejects.toThrow("session changed");
		await Promise.resolve();
		cache.clear();
		await rejected;
	});

	it("times out stalled issuance and still observes a late rejection", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		let fail: ((reason: Error) => void) | undefined;
		let signal: AbortSignal | undefined;
		const pending = cache.getToken(identity, audience, (value) => {
			signal = value;
			return new Promise((_resolve, reject) => {
				fail = reject;
			});
		});
		const rejected = expect(pending).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(30_000);
		await rejected;
		expect(signal?.aborted).toBe(true);
		fail?.(new Error("late network error"));
		await Promise.resolve();
		expect(await cache.getToken(identity, audience, async () => issued())).toBe(
			"development-token"
		);
	});

	it("bounds coalesced waiters as well as distinct issuances", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const issue = vi.fn(() => new Promise<DevelopmentOidcToken>(() => {}));
		const requests = Array.from({ length: 128 }, () =>
			cache.getToken(identity, audience, issue)
		);
		const settled = Promise.allSettled(requests);
		await expect(cache.getToken(identity, audience, issue)).rejects.toThrow(
			"Too many concurrent"
		);
		expect(issue).toHaveBeenCalledOnce();
		cache.dispose();
		expect((await settled).every((value) => value.status === "rejected")).toBe(
			true
		);
	});

	it("keeps physical issuance bounded across repeated cache clears", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		const completions: ((value: DevelopmentOidcToken) => void)[] = [];
		const issue = vi.fn(
			() =>
				new Promise<DevelopmentOidcToken>((resolve) => {
					completions.push(resolve);
				})
		);
		for (let i = 0; i < 128; i++) {
			const pending = cache.getToken(identity, audience, issue);
			const rejected = expect(pending).rejects.toThrow("session changed");
			await Promise.resolve();
			cache.clear();
			await rejected;
		}
		await expect(cache.getToken(identity, audience, issue)).rejects.toThrow(
			"Too many concurrent"
		);
		expect(issue).toHaveBeenCalledTimes(128);
		completions.shift()?.(issued());
		await vi.advanceTimersByTimeAsync(0);
		expect(
			await cache.getToken(identity, audience, async () => issued("fresh"))
		).toBe("fresh");
		for (const complete of completions) {
			complete(issued());
		}
	});

	it("snapshots an issuance response once for every waiter", async ({
		expect,
	}) => {
		const cache = new DevelopmentOidcTokenCache();
		let reads = 0;
		const response = {
			get token() {
				reads++;
				return "token-" + reads;
			},
			expiresAt: issued().expiresAt,
		};
		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				cache.getToken(identity, audience, async () => response)
			)
		);
		expect(results).toEqual(Array(10).fill("token-1"));
		expect(reads).toBe(1);
		response.expiresAt = 0;
		expect(await cache.getToken(identity, audience, async () => issued())).toBe(
			"token-1"
		);
	});
});
