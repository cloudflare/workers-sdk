import { inspect } from "node:util";
import { DevelopmentOidcRequestPool } from "miniflare";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevelopmentOidcProvider } from "./development-oidc";
import type {
	DevelopmentOidcSession,
	DevelopmentOidcTransport,
} from "./development-oidc";
import type { CfAccount } from "@cloudflare/workers-utils";

const binding = { binding: "IDENTITY", audience: "urn:inventory" };
const auth: CfAccount = {
	accountId: "a".repeat(32),
	apiToken: { apiToken: "human-oauth" },
};
const session: DevelopmentOidcSession = {
	binding: binding.binding,
	defaultAudience: binding.audience,
	expiresAt: 1800028800,
	identity: {
		accountId: auth.accountId,
		workerId: "b".repeat(32),
		userId: "c".repeat(32),
		developmentSessionId: "aaaabbbb-cccc-4ddd-8eee-ffff00001111",
	},
};
function setup() {
	let serial = 0;
	const getAuth = vi.fn(async () => structuredClone(auth));
	const createSession = vi.fn<DevelopmentOidcTransport["createSession"]>(
		async () => structuredClone(session)
	);
	const issueToken = vi.fn<DevelopmentOidcTransport["issueToken"]>(
		async () => ({
			token: `token-${++serial}`,
			expiresAt: Math.floor(Date.now() / 1000) + 300,
		})
	);
	const issueGrant = vi.fn<DevelopmentOidcTransport["issueGrant"]>(
		async () => ({
			token: `grant-${++serial}`,
			expiresAt: Math.floor(Date.now() / 1000) + 300,
		})
	);
	const dispatch = vi.fn<DevelopmentOidcTransport["dispatch"]>(
		async () => new Response("receiver denied", { status: 403 })
	);
	const provider = new DevelopmentOidcProvider(
		"linked-worker",
		getAuth,
		{ createSession, issueToken, issueGrant, dispatch },
		binding
	);
	return { provider, getAuth, createSession, issueToken, issueGrant, dispatch };
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1800000000000);
});
afterEach(() => vi.useRealTimers());
describe("development OIDC capabilities", () => {
	it("reads current auth per call, shares only the session and never coalesces assertions", async ({
		expect,
	}) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		expect(getAuth).not.toHaveBeenCalled();
		const tokens = await Promise.all(
			Array.from({ length: 10 }, () => provider.getToken())
		);
		expect(new Set(tokens).size).toBe(10);
		expect(getAuth).toHaveBeenCalledTimes(10);
		expect(createSession).toHaveBeenCalledOnce();
		expect(issueToken).toHaveBeenCalledTimes(10);
		await provider.getToken();
		expect(issueToken).toHaveBeenCalledTimes(11);
		provider.dispose();
	});
	it.for([undefined, {}, { fresh: true }, { audience: "other" }, null])(
		"rejects every getToken argument (%j) before auth",
		async (value, { expect }) => {
			const { provider, getAuth } = setup();
			await expect(provider.getToken(value)).rejects.toThrow("no arguments");
			expect(getAuth).not.toHaveBeenCalled();
			provider.dispose();
		}
	);
	it("routes WAG and signed fetch through their own operations", async ({
		expect,
	}) => {
		const { provider, issueToken, issueGrant, dispatch, getAuth } = setup();
		const grant = {
			authorization_server: "https://auth.example",
			scope: ["read"],
		};
		expect(
			await (
				await provider.invoke({
					binding: "IDENTITY",
					operation: "grant",
					grant,
				})
			).text()
		).toBe("grant-1");
		const request = {
			url: "https://api.example",
			method: "GET",
			headers: [] as [string, string][],
		};
		const response = await provider.invoke({
			binding: "IDENTITY",
			operation: "fetch",
			request,
		});
		expect(response.status).toBe(403);
		expect(await response.text()).toBe("receiver denied");
		expect(issueToken).not.toHaveBeenCalled();
		expect(issueGrant).toHaveBeenCalledOnce();
		expect(dispatch).toHaveBeenCalledOnce();
		expect(getAuth).toHaveBeenCalledTimes(2);
		provider.dispose();
	});
	it("snapshots operation data before authentication", async ({ expect }) => {
		const { provider, getAuth, issueGrant } = setup();
		let release!: (v: CfAccount) => void;
		getAuth.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		const grant = {
			authorization_server: "https://auth.example",
			scope: ["read"],
		};
		const pending = provider.invoke({
			binding: "IDENTITY",
			operation: "grant",
			grant,
		});
		await vi.waitFor(() => expect(release).toBeTypeOf("function"));
		grant.scope.push("admin");
		release(auth);
		await pending;
		expect(issueGrant.mock.calls[0]?.[2]).toEqual({
			authorization_server: "https://auth.example",
			scope: ["read"],
		});
		provider.dispose();
	});
	it("recreates the session when credentials change", async ({ expect }) => {
		const { provider, getAuth, createSession } = setup();
		await provider.getToken();
		getAuth.mockResolvedValue({ ...auth, apiToken: { apiToken: "new-oauth" } });
		await provider.getToken();
		expect(createSession).toHaveBeenCalledTimes(2);
		provider.dispose();
	});
	it("invalidates the session after logout", async ({ expect }) => {
		const { provider, getAuth, createSession, issueToken } = setup();
		await provider.getToken();
		getAuth.mockRejectedValueOnce(new Error("logged out"));
		await expect(provider.getToken()).rejects.toThrow("logged out");
		expect(issueToken).toHaveBeenCalledOnce();
		await provider.getToken();
		expect(createSession).toHaveBeenCalledTimes(2);
		provider.dispose();
	});
	it("keeps credentials outside inspection and JSON", async ({ expect }) => {
		const { provider } = setup();
		await provider.getToken();
		expect(inspect(provider)).not.toContain("human-oauth");
		expect(JSON.stringify(provider)).not.toContain("human-oauth");
		provider.dispose();
	});
	it("cancels pending issuance and discards late results on disposal", async ({
		expect,
	}) => {
		const { provider, issueToken } = setup();
		let finish!: (v: { token: string; expiresAt: number }) => void;
		issueToken.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		const pending = provider.getToken();
		const assertion = expect(pending).rejects.toThrow();
		await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
		provider.dispose();
		await assertion;
		finish({ token: "late", expiresAt: 1800000300 });
		await expect(provider.getToken()).rejects.toThrow("disposed");
	});
	it("refuses API keys, namespace subjects and a missing Worker name", async ({
		expect,
	}) => {
		const { provider, getAuth } = setup();
		getAuth.mockResolvedValue({
			...auth,
			apiToken: { authKey: "key", authEmail: "dev@example.com" },
		});
		await expect(provider.getToken()).rejects.toThrow("human OAuth");
		provider.dispose();
		const transport = {
			createSession: vi.fn(),
			issueToken: vi.fn(),
			issueGrant: vi.fn(),
			dispatch: vi.fn(),
		};
		expect(
			() => new DevelopmentOidcProvider("", getAuth, transport, binding)
		).toThrow();
		expect(
			() =>
				new DevelopmentOidcProvider("worker", getAuth, transport, {
					...binding,
					subject: "durable-object-namespace",
					namespace_id: "ns",
				})
		).toThrow();
	});
	it("bounds pending requests even when an adapter ignores abort", async ({
		expect,
	}) => {
		const pool = new DevelopmentOidcRequestPool();
		const controller = new AbortController();
		const releases: ((v: number) => void)[] = [];
		const pending = Array.from({ length: 128 }, () =>
			pool
				.run(
					() => new Promise<number>((resolve) => releases.push(resolve)),
					controller.signal
				)
				.catch(() => undefined)
		);
		await vi.waitFor(() => expect(releases).toHaveLength(128));
		controller.abort();
		await Promise.all(pending);
		await expect(
			pool.run(async () => 1, new AbortController().signal)
		).rejects.toThrow("Too many");
		releases.forEach((resolve) => resolve(1));
		await Promise.resolve();
		await Promise.resolve();
		expect(await pool.run(async () => 2, new AbortController().signal)).toBe(2);
	});
});
