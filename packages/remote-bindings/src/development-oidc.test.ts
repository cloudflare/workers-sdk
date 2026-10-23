import { inspect } from "node:util";
import { DevelopmentOidcTokenCache } from "miniflare";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevelopmentOidcProvider } from "./development-oidc";
import { DevelopmentOidcApiError } from "./development-oidc-errors";
import type { DevelopmentOidcSession } from "./development-oidc";
import type { CfAccount } from "@cloudflare/workers-utils";
import type { DevelopmentOidcToken } from "miniflare";

const session: DevelopmentOidcSession = {
	identity: {
		accountId: "account",
		workerId: "worker",
		userId: "user",
		developmentSessionId: "session",
		policy: "policy",
	},
	defaultAudience: "https://workers.cloudflare.com/accounts/account",
	expiresAt: 1800000000 + 28800,
};

function token(value = "development-token"): DevelopmentOidcToken {
	return { token: value, expiresAt: Math.floor(Date.now() / 1000) + 300 };
}

function setup(workerName = "linked-worker") {
	const getAuth = vi.fn<() => Promise<CfAccount>>().mockResolvedValue({
		accountId: "account",
		apiToken: { apiToken: "human-oauth" },
	});
	const createSession = vi.fn(
		async (_auth: CfAccount, _name: string, _signal: AbortSignal) => session
	);
	const issueToken = vi.fn(
		async (
			_auth: CfAccount,
			_session: DevelopmentOidcSession,
			_audience: string,
			_signal: AbortSignal
		) => token()
	);
	const provider = new DevelopmentOidcProvider(workerName, getAuth, {
		createSession,
		issueToken,
	});
	return { provider, getAuth, createSession, issueToken };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => vi.useRealTimers());

describe("development OIDC provider", () => {
	it("does nothing until the getter, then shares auth, session, and issuance", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		expect(getAuth).not.toHaveBeenCalled();
		expect(createSession).not.toHaveBeenCalled();
		expect(issueToken).not.toHaveBeenCalled();
		expect(
			await Promise.all(Array.from({ length: 10 }, () => provider.getToken()))
		).toEqual(Array(10).fill("development-token"));
		expect(getAuth).toHaveBeenCalledOnce();
		expect(createSession).toHaveBeenCalledOnce();
		expect(createSession).toHaveBeenCalledWith(
			{ accountId: "account", apiToken: { apiToken: "human-oauth" } },
			"linked-worker",
			expect.any(AbortSignal)
		);
		expect(issueToken).toHaveBeenCalledOnce();
		expect(issueToken.mock.calls[0]?.[2]).toBe(session.defaultAudience);
		await provider.getToken();
		expect(getAuth).toHaveBeenCalledTimes(2);
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken).toHaveBeenCalledOnce();
	});

	it("keeps audiences separate and preserves overrides exactly", async ({
		expect,
	}) => {
		const { provider, issueToken } = setup();
		await provider.getToken();
		await provider.getToken({ audience: "https://EXAMPLE.com/" });
		await provider.getToken({ audience: "https://example.com/" });
		await provider.getToken({ audience: "https://EXAMPLE.com/" });
		expect(issueToken.mock.calls.map((call) => call[2])).toEqual([
			session.defaultAudience,
			"https://EXAMPLE.com/",
			"https://example.com/",
		]);
	});

	it("renews on demand without rebuilding the server-side session", async ({
		expect,
	}) => {
		const { provider, createSession, issueToken } = setup();
		await provider.getToken();
		vi.advanceTimersByTime(301_000);
		expect(issueToken).toHaveBeenCalledOnce();
		await provider.getToken();
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken).toHaveBeenCalledTimes(2);
	});

	it("invalidates cached tokens after logout, and recovers after login", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		await provider.getToken();
		getAuth.mockRejectedValueOnce(new Error("Sign in again"));
		await expect(provider.getToken()).rejects.toThrow("Sign in again");
		await provider.getToken();
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(issueToken).toHaveBeenCalledTimes(2);
	});

	it("invalidates cache and sessions when OAuth credentials change", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		await provider.getToken();
		getAuth.mockResolvedValue({
			accountId: "account",
			apiToken: { apiToken: "new-human-oauth" },
		});
		await provider.getToken();
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(issueToken).toHaveBeenCalledTimes(2);
		expect(createSession.mock.calls[0]?.[2].aborted).toBe(true);
	});

	it("isolates account changes and refuses mismatched server identities", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession } = setup();
		await provider.getToken();
		getAuth.mockResolvedValue({
			accountId: "other-account",
			apiToken: { apiToken: "human-oauth" },
		});
		await expect(provider.getToken()).rejects.toThrow("different account");
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("retries failed session establishment without restarting", async ({
		expect,
	}) => {
		const { provider, createSession, issueToken } = setup();
		createSession.mockRejectedValueOnce(
			new Error("Worker edit permission required")
		);
		await expect(provider.getToken()).rejects.toThrow(
			"Worker edit permission required"
		);
		expect(issueToken).not.toHaveBeenCalled();
		expect(await provider.getToken()).toBe("development-token");
	});

	it.for(["unavailable", "rate_limited"] as const)(
		"retains the session after %s without stale-token fallback",
		async (kind, { expect }) => {
			const { provider, createSession, issueToken } = setup();
			await provider.getToken();
			vi.advanceTimersByTime(241_000);
			const error = new DevelopmentOidcApiError("Retry issuance", kind);
			issueToken.mockRejectedValueOnce(error);
			await expect(provider.getToken()).rejects.toBe(error);
			expect(await provider.getToken()).toBe("development-token");
			expect(createSession).toHaveBeenCalledOnce();
			expect(issueToken).toHaveBeenCalledTimes(3);
			expect(createSession.mock.calls[0]?.[2].aborted).toBe(false);
		}
	);

	it("retains the session after the issuance deadline, then retries on demand", async ({
		expect,
	}) => {
		const { provider, createSession, issueToken } = setup();
		await provider.getToken();
		vi.advanceTimersByTime(241_000);
		issueToken.mockImplementationOnce(() => new Promise(() => {}));
		const rejected = expect(provider.getToken()).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(30_000);
		await rejected;
		expect(issueToken.mock.calls[1]?.[3].aborted).toBe(true);
		expect(await provider.getToken()).toBe("development-token");
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken).toHaveBeenCalledTimes(3);
	});

	it.for([
		new DevelopmentOidcApiError("Sign in again", "login_required"),
		new DevelopmentOidcApiError("Access denied", "access_denied"),
		new DevelopmentOidcApiError("Renew session", "session_renewal"),
		new DevelopmentOidcApiError("Invalid response"),
		new Error("Unknown failure"),
	])(
		"clears the session and all cached audiences after %s",
		async (error, { expect }) => {
			const { provider, createSession, issueToken } = setup();
			await provider.getToken();
			issueToken.mockRejectedValueOnce(error);
			await expect(provider.getToken({ audience: "other-api" })).rejects.toBe(
				error
			);
			expect(createSession.mock.calls[0]?.[2].aborted).toBe(true);
			expect(await provider.getToken()).toBe("development-token");
			expect(createSession).toHaveBeenCalledTimes(2);
			expect(issueToken).toHaveBeenCalledTimes(3);
		}
	);

	it("honors Retry-After across audiences without delaying cached reads or extending backoff", async ({
		expect,
	}) => {
		const { provider, createSession, issueToken } = setup();
		await provider.getToken();
		const error = new DevelopmentOidcApiError(
			"Rate limited",
			"rate_limited",
			60_000
		);
		issueToken.mockRejectedValueOnce(error);
		await expect(provider.getToken({ audience: "other-api" })).rejects.toBe(
			error
		);
		expect(await provider.getToken()).toBe("development-token");
		await vi.advanceTimersByTimeAsync(30_000);
		await expect(provider.getToken({ audience: "third-api" })).rejects.toBe(
			error
		);
		expect(issueToken).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await provider.getToken({ audience: "other-api" })).toBe(
			"development-token"
		);
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken).toHaveBeenCalledTimes(3);
	});

	it("backs off failed session creation and releases its rejected promise", async ({
		expect,
	}) => {
		const { provider, createSession } = setup();
		const error = new DevelopmentOidcApiError(
			"Rate limited",
			"rate_limited",
			60_000
		);
		createSession.mockRejectedValueOnce(error);
		await expect(provider.getToken()).rejects.toBe(error);
		await vi.advanceTimersByTimeAsync(30_000);
		await expect(provider.getToken()).rejects.toBe(error);
		expect(createSession).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await provider.getToken()).toBe("development-token");
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("clears backoff when credentials change", async ({ expect }) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		const error = new DevelopmentOidcApiError(
			"Rate limited",
			"rate_limited",
			60_000
		);
		issueToken.mockRejectedValueOnce(error);
		await expect(provider.getToken()).rejects.toBe(error);
		getAuth.mockResolvedValue({
			accountId: "account",
			apiToken: { apiToken: "new-oauth" },
		});
		expect(await provider.getToken()).toBe("development-token");
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("requires a linked Worker and rejects explicit local DO identities", async ({
		expect,
	}) => {
		const { provider, getAuth } = setup("");
		await expect(provider.getToken()).rejects.toThrow("existing Worker name");
		expect(getAuth).not.toHaveBeenCalled();
		const configured = setup();
		for (const subject of ["object", "namespace"]) {
			await expect(
				configured.provider.getToken({ subject } as { audience?: string })
			).rejects.toThrow("cloud Preview");
		}
		expect(configured.getAuth).not.toHaveBeenCalled();
	});

	it("refuses global-key credentials", async ({ expect }) => {
		const { provider, getAuth, createSession } = setup();
		getAuth.mockResolvedValue({
			accountId: "account",
			apiToken: { authKey: "key", authEmail: "person@example.com" },
		});
		await expect(provider.getToken()).rejects.toThrow("human OAuth");
		expect(createSession).not.toHaveBeenCalled();
	});

	it("cancels pending issuance on shutdown and rejects its eventual result", async ({
		expect,
	}) => {
		const { provider, issueToken } = setup();
		let complete: ((value: DevelopmentOidcToken) => void) | undefined;
		issueToken.mockImplementationOnce(
			async () =>
				new Promise((resolve) => {
					complete = resolve;
				})
		);
		const pending = provider.getToken();
		await vi.waitFor(() => expect(issueToken).toHaveBeenCalledOnce());
		provider.dispose();
		expect(issueToken.mock.calls[0]?.[3].aborted).toBe(true);
		complete?.(token());
		await expect(pending).rejects.toThrow("session changed");
		await expect(provider.getToken()).rejects.toThrow("disposed");
	});
});

describe("development OIDC provider security boundaries", () => {
	it("snapshots the requested audience before authentication", async ({
		expect,
	}) => {
		const { provider, issueToken } = setup();
		const options = { audience: "https://requested.example/" };
		const pending = provider.getToken(options);
		options.audience = "https://changed.example/";
		await pending;
		expect(issueToken.mock.calls[0]?.[2]).toBe("https://requested.example/");
	});

	it("snapshots credentials and session metadata instead of retaining mutable responses", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		const auth = {
			accountId: "account",
			apiToken: { apiToken: "original-oauth" },
		};
		const response = {
			identity: { ...session.identity },
			defaultAudience: session.defaultAudience,
			expiresAt: session.expiresAt,
		};
		getAuth.mockResolvedValue(auth);
		createSession.mockResolvedValue(response);
		await provider.getToken();
		const capturedAuth = createSession.mock.calls[0]?.[0];
		auth.apiToken.apiToken = "mutated-secret";
		expect(capturedAuth).toEqual({
			accountId: "account",
			apiToken: { apiToken: "original-oauth" },
		});
		// Restore auth so the second getter keeps the same authorized session.
		auth.apiToken.apiToken = "original-oauth";
		response.identity.workerId = "different-worker";
		response.defaultAudience = "https://different.example/";
		await provider.getToken({ audience: "another-audience" });
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken.mock.calls[1]?.[1]).toEqual(session);
		expect(Object.isFrozen(issueToken.mock.calls[1]?.[1].identity)).toBe(true);
		expect(Object.isFrozen(capturedAuth?.apiToken)).toBe(true);
	});

	it("keeps credential-bearing state out of inspection and serialization", async ({
		expect,
	}) => {
		const { provider } = setup();
		await provider.getToken();
		expect(Object.keys(provider)).toEqual([]);
		expect(JSON.stringify(provider)).toBe("{}");
		expect(inspect(provider, { showHidden: true })).not.toContain(
			"human-oauth"
		);
	});

	it.for([
		null,
		"secret-credential",
		{ apiToken: "" },
		{ apiToken: "human-oauth\n" },
		{ apiToken: "é" },
	])(
		"rejects malformed credentials without echoing them (%#)",
		async (apiToken, { expect }) => {
			const { provider, getAuth, createSession } = setup();
			getAuth.mockResolvedValue({
				accountId: "account",
				apiToken,
			} as unknown as CfAccount);
			await expect(provider.getToken()).rejects.toThrow(
				/^Development OIDC requires human OAuth credentials and a valid account\.$/
			);
			expect(createSession).not.toHaveBeenCalled();
		}
	);

	it("does not start authentication after immediate disposal", async ({
		expect,
	}) => {
		const { provider, getAuth } = setup();
		const pending = provider.getToken();
		const rejected = expect(pending).rejects.toThrow("disposed");
		provider.dispose();
		await rejected;
		expect(getAuth).not.toHaveBeenCalled();
	});

	it.for(["auth", "session"])(
		"cancels a stalled %s immediately on shutdown",
		async (stage, { expect }) => {
			const { provider, getAuth, createSession } = setup();
			if (stage === "auth") {
				getAuth.mockImplementationOnce(() => new Promise(() => {}));
			} else {
				createSession.mockImplementationOnce(() => new Promise(() => {}));
			}
			const pending = provider.getToken();
			const rejected = expect(pending).rejects.toThrow(
				stage === "auth" ? "disposed" : "credentials changed"
			);
			await vi.waitFor(() =>
				expect(
					stage === "auth" ? getAuth : createSession
				).toHaveBeenCalledOnce()
			);
			provider.dispose();
			await rejected;
		}
	);

	it.for(["auth", "session"])(
		"times out a stalled %s",
		async (stage, { expect }) => {
			const { provider, getAuth, createSession } = setup();
			if (stage === "auth") {
				getAuth.mockImplementationOnce(() => new Promise(() => {}));
			} else {
				createSession.mockImplementationOnce(() => new Promise(() => {}));
			}
			const rejected = expect(provider.getToken()).rejects.toThrow("timed out");
			await vi.waitFor(() =>
				expect(
					stage === "auth" ? getAuth : createSession
				).toHaveBeenCalledOnce()
			);
			await vi.advanceTimersByTimeAsync(30_000);
			await rejected;
			expect(await provider.getToken()).toBe("development-token");
		}
	);

	it("bounds callers waiting for the same authentication request", async ({
		expect,
	}) => {
		const { provider, getAuth } = setup();
		getAuth.mockImplementationOnce(() => new Promise(() => {}));
		const pending = Promise.allSettled(
			Array.from({ length: 128 }, () => provider.getToken())
		);
		await expect(provider.getToken()).rejects.toThrow("Too many concurrent");
		expect(getAuth).toHaveBeenCalledOnce();
		provider.dispose();
		expect(
			(await pending).every((result) => result.status === "rejected")
		).toBe(true);
	});

	it("rechecks shutdown after awaiting a cache hit", async ({ expect }) => {
		const { provider } = setup();
		await provider.getToken();
		const spy = vi
			.spyOn(DevelopmentOidcTokenCache.prototype, "getToken")
			.mockImplementationOnce(async () => {
				queueMicrotask(() => provider.dispose());
				return "cached-token";
			});
		try {
			await expect(provider.getToken()).rejects.toThrow("disposed");
		} finally {
			spy.mockRestore();
		}
	});

	it("cancels a pending session when credentials change and ignores its late failure", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession } = setup();
		let fail: ((reason: Error) => void) | undefined;
		createSession.mockImplementationOnce(
			() =>
				new Promise((_resolve, reject) => {
					fail = reject;
				})
		);
		const rejected = expect(provider.getToken()).rejects.toThrow(
			"credentials changed"
		);
		await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
		getAuth.mockResolvedValue({
			accountId: "account",
			apiToken: { apiToken: "new-oauth" },
		});
		expect(await provider.getToken()).toBe("development-token");
		await rejected;
		fail?.(new Error("late session failure"));
		await provider.getToken();
		expect(createSession).toHaveBeenCalledTimes(2);
	});
});

it("rejects line terminators in account metadata before transport", async ({
	expect,
}) => {
	const { provider, getAuth, createSession } = setup();
	getAuth.mockResolvedValue({
		accountId: "account\n",
		apiToken: { apiToken: "human-oauth" },
	});
	await expect(provider.getToken()).rejects.toThrow("valid account");
	expect(createSession).not.toHaveBeenCalled();
});

it("recreates an expiring server session only when the getter runs", async ({
	expect,
}) => {
	const { provider, createSession, issueToken } = setup();
	await provider.getToken();
	await vi.advanceTimersByTimeAsync((28800 - 299) * 1000);
	expect(createSession).toHaveBeenCalledOnce();
	createSession.mockResolvedValueOnce({
		...session,
		expiresAt: Math.floor(Date.now() / 1000) + 28800,
	});
	await provider.getToken();
	expect(createSession).toHaveBeenCalledTimes(2);
	expect(issueToken).toHaveBeenCalledTimes(2);
	provider.dispose();
});
