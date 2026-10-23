import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevelopmentOidcProvider } from "./development-oidc";
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

	it("reports fresh issuance failures without stale-token fallback", async ({
		expect,
	}) => {
		const { provider, issueToken } = setup();
		await provider.getToken();
		vi.advanceTimersByTime(241_000);
		issueToken.mockRejectedValueOnce(new Error("Cloudflare is unreachable"));
		await expect(provider.getToken()).rejects.toThrow(
			"Cloudflare is unreachable"
		);
		expect(await provider.getToken()).toBe("development-token");
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
