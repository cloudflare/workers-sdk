import { Buffer } from "node:buffer";
import { performApiFetchBase } from "@cloudflare/workers-utils";
import { Response } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	createDevelopmentOidcApiTransport,
	DevelopmentOidcApiError,
	validateDevelopmentOidcApiAudience,
	validateDevelopmentOidcApiToken,
} from "./development-oidc-api";
import type { DevelopmentOidcSession } from "./development-oidc";
import type { Logger } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/workers-utils", async (original) => ({
	...(await original<typeof import("@cloudflare/workers-utils")>()),
	performApiFetchBase: vi.fn(),
}));
const now = 1800000000;
const accountId = "a".repeat(32),
	workerId = "b".repeat(32),
	userId = "c".repeat(32);
const sessionId = "aaaabbbb-cccc-4ddd-8eee-ffff00001111";
const auth = { accountId, apiToken: { apiToken: "human-oauth" } };
const audience = `https://workers.cloudflare.com/accounts/${accountId}`;
const binding = { binding: "IDENTITY", audience };
const session: DevelopmentOidcSession = {
	binding: binding.binding,

	identity: {
		accountId,
		workerId,
		userId,
		developmentSessionId: sessionId,
	},
	defaultAudience: audience,
	expiresAt: now + 28800,
};
const logger = { debug: vi.fn(), info: vi.fn() } as unknown as Logger;
const rawSession = {
	binding: binding.binding,

	account_id: accountId,
	worker_id: workerId,
	user_id: userId,
	development_session_id: sessionId,

	default_audience: audience,
	expires_at: session.expiresAt,
};
const claims = {
	iss: `https://oidc.cloudflare.app/accounts/${accountId}`,
	sub: `worker:${workerId}:development:local`,
	account_id: accountId,
	product: "workers",
	jti: "1".repeat(32),
	aud: audience,
	execution: "local",
	worker_id: workerId,
	user_id: userId,
	development_session_id: sessionId,
	iat: now,
	exp: now + 300,
};
function token(
	overrides: Record<string, unknown> = {},
	header: Record<string, unknown> = {}
) {
	return [
		Buffer.from(
			JSON.stringify({
				alg: "RS256",
				typ: "cf-workload+jwt",
				kid: "current",
				...header,
			})
		).toString("base64url"),
		Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString(
			"base64url"
		),
		"c2ln",
	].join(".");
}
function response(result: unknown) {
	return Response.json({ success: true, result });
}
const signal = new AbortController().signal;
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now * 1000);
	vi.mocked(performApiFetchBase).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("development issuance API transport", () => {
	it("uses explicit OAuth, existing Worker selection, fixed API routes and redirect refusal", async ({
		expect,
	}) => {
		vi.mocked(performApiFetchBase)
			.mockResolvedValueOnce(response(rawSession))
			.mockResolvedValueOnce(
				response({ token: token(), expires_at: now + 300 })
			);
		const transport = createDevelopmentOidcApiTransport({}, logger);
		expect(
			await transport.createSession(auth, "linked-worker", binding, signal)
		).toEqual(session);
		expect(await transport.issueToken(auth, session, signal)).toEqual({
			token: token(),
			expiresAt: now + 300,
		});
		const calls = vi.mocked(performApiFetchBase).mock.calls;
		expect(calls[0]?.[1]).toBe(
			`/accounts/${accountId}/workers/scripts/linked-worker/oidc/development-sessions`
		);
		expect(calls[0]?.[2]).toMatchObject({
			method: "POST",
			body: JSON.stringify(binding),
			redirect: "error",
		});
		expect(calls[1]?.[1]).toBe(
			`/accounts/${accountId}/workers/oidc/development-sessions/${sessionId}/tokens`
		);
		expect(calls[1]?.[2]?.body).toBe(JSON.stringify({ operation: "token" }));
		expect(calls[1]?.[7]).toEqual(auth.apiToken);
		expect(calls[1]?.[6]).toBe(signal);
	});
	it.for([
		[401, "login_required"],
		[403, "access_denied"],
		[404, "invalid"],
		[409, "session_renewal"],
		[429, "rate_limited"],
		[500, "unavailable"],
		[503, "unavailable"],
		[400, "invalid"],
	] as const)(
		"classifies status %i without reading its error body",
		async ([status, kind], { expect }) => {
			const cancel = vi.fn();
			const body = new ReadableStream({ cancel });
			vi.mocked(performApiFetchBase).mockResolvedValue(
				new Response(body, { status })
			);
			const pending = createDevelopmentOidcApiTransport(
				{},
				logger
			).createSession(auth, "linked-worker", binding, signal);
			await expect(pending).rejects.toMatchObject({
				message: expect.stringMatching(/^Development OIDC/),
				kind,
			});
			expect(cancel).toHaveBeenCalledOnce();
		}
	);
	it.for([
		["60", 60_000],
		[new Date((now + 60) * 1000).toUTCString(), 60_000],
		["garbage", undefined],
		["999999999999999999999", undefined],
		["-1", undefined],
	] as const)(
		"reads bounded Retry-After metadata (%s)",
		async ([value, delay], { expect }) => {
			vi.mocked(performApiFetchBase).mockResolvedValue(
				new Response(null, {
					status: 429,
					headers: { "Retry-After": value },
				})
			);
			await expect(
				createDevelopmentOidcApiTransport({}, logger).issueToken(
					auth,
					session,
					signal
				)
			).rejects.toMatchObject({ kind: "rate_limited", retryAfterMs: delay });
		}
	);
	it("cancels oversized streaming bodies before JSON decoding", async ({
		expect,
	}) => {
		const cancel = vi.fn();
		vi.mocked(performApiFetchBase).mockResolvedValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array(131073));
					},
					cancel,
				}),
				{ headers: { "Content-Type": "application/json" } }
			)
		);
		await expect(
			createDevelopmentOidcApiTransport({}, logger).createSession(
				auth,
				"linked-worker",
				binding,
				signal
			)
		).rejects.toThrow("invalid development OIDC response");
		expect(cancel).toHaveBeenCalledOnce();
	});
	it("does not include malformed JSON content or network exception secrets in errors", async ({
		expect,
	}) => {
		const transport = createDevelopmentOidcApiTransport({}, logger);
		vi.mocked(performApiFetchBase)
			.mockResolvedValueOnce(
				new Response("bearer-secret", {
					headers: { "Content-Type": "application/json" },
				})
			)
			.mockRejectedValueOnce(new Error("oauth-secret"));
		await expect(
			transport.createSession(auth, "linked-worker", binding, signal)
		).rejects.toThrow("invalid development OIDC response");
		await expect(
			transport.createSession(auth, "linked-worker", binding, signal)
		).rejects.toMatchObject({
			message: expect.stringContaining("could not reach Cloudflare"),
			kind: "unavailable",
		});
	});
	it("preserves cancellation reasons instead of treating shutdown as a network failure", async ({
		expect,
	}) => {
		const controller = new AbortController();
		const reason = new Error("Provider disposed");
		controller.abort(reason);
		vi.mocked(performApiFetchBase).mockRejectedValueOnce(new Error("aborted"));
		await expect(
			createDevelopmentOidcApiTransport({}, logger).createSession(
				auth,
				"linked-worker",
				binding,
				controller.signal
			)
		).rejects.toBe(reason);
		expect(reason).not.toBeInstanceOf(DevelopmentOidcApiError);
	});
	it("rejects invalid UTF-8 even in otherwise unused response fields", async ({
		expect,
	}) => {
		vi.mocked(performApiFetchBase).mockResolvedValue(
			new Response(
				Buffer.concat([
					Buffer.from(
						`{"success":true,"result":${JSON.stringify(rawSession)},"ignored":"`
					),
					Buffer.from([255]),
					Buffer.from('"}'),
				]),
				{ headers: { "Content-Type": "application/json" } }
			)
		);
		await expect(
			createDevelopmentOidcApiTransport({}, logger).createSession(
				auth,
				"linked-worker",
				binding,
				signal
			)
		).rejects.toThrow("invalid development OIDC response");
	});
	it.for([
		{ account_id: "d".repeat(32) },
		{ worker_id: "bad" },
		{ user_id: "bad" },
		{ development_session_id: "../tokens" },
		{ default_audience: "attacker" },
		{ expires_at: now + 299 },
		{ expires_at: now + 28801 },
	])(
		"rejects mismatched or malformed session authority",
		async (overrides, { expect }) => {
			vi.mocked(performApiFetchBase).mockResolvedValue(
				response({ ...rawSession, ...overrides })
			);
			await expect(
				createDevelopmentOidcApiTransport({}, logger).createSession(
					auth,
					"linked-worker",
					binding,
					signal
				)
			).rejects.toThrow("invalid development OIDC response");
		}
	);
	it.for(["../worker", "x".repeat(64), "worker\n"])(
		"rejects invalid Worker names before requesting",
		async (name, { expect }) => {
			await expect(
				createDevelopmentOidcApiTransport({}, logger).createSession(
					auth,
					name,
					binding,
					signal
				)
			).rejects.toThrow();
			expect(performApiFetchBase).not.toHaveBeenCalled();
		}
	);
});
describe("local token profile", () => {
	it("accepts exact development claims and preserves the JWT", ({ expect }) => {
		expect(
			validateDevelopmentOidcApiToken(
				{ token: token(), expires_at: now + 300 },
				session,
				audience
			)
		).toEqual({ token: token(), expiresAt: now + 300 });
	});
	it.for([120, 240])(
		"validates a received assertion within its original lifetime (age %i)",
		(age, { expect }) => {
			const expiresAt = now + 300 - age;
			const cached = token({ iat: now - age, exp: expiresAt });
			expect(
				validateDevelopmentOidcApiToken(
					{ token: cached, expires_at: expiresAt },
					session,
					audience
				)
			).toEqual({ token: cached, expiresAt });
		}
	);
	it.for([
		{ iss: "attacker" },
		{ sub: "worker:cloud" },
		{ aud: [audience] },
		{ execution: "deployed" },
		{ worker_id: "wrong" },
		{ user_id: "wrong" },
		{ development_session_id: "wrong" },
		{ version_id: "cloud" },
		{ preview_id: "cloud" },
		{ namespace_id: "object" },
		{ object_id: "object" },
		{ iat: now - 31 },
		{ iat: now + 6 },
		{ exp: now + 301 },
	])(
		"rejects token confusion and invalid lifetime",
		(overrides, { expect }) => {
			expect(() =>
				validateDevelopmentOidcApiToken(
					{ token: token(overrides), expires_at: now + 300 },
					session,
					audience
				)
			).toThrow();
		}
	);
	it.for([
		{ alg: "none" },
		{ typ: "JWT" },
		{ kid: "" },
		{ crit: ["unknown"] },
		{ b64: false },
	])("rejects unsupported JOSE profiles", (header, { expect }) => {
		expect(() =>
			validateDevelopmentOidcApiToken(
				{ token: token({}, header), expires_at: now + 300 },
				session,
				audience
			)
		).toThrow();
	});
	it.for([
		"plain",
		'quoted"雪',
		"https://api.example/%22exact",
		"urn:example:aud",
	])("accepts audiences without normalization", (value, { expect }) => {
		expect(() => validateDevelopmentOidcApiAudience(value)).not.toThrow();
	});
	it.for([
		"",
		"  ",
		"x".repeat(2049),
		"with spaces:bad",
		"1invalid:scheme",
		"https://host/\\path",
		"https://host/[]",
		"\u0085",
		"https://example/%xx",
		"urn:雪",
	])("rejects invalid StringOrURI audiences", (value, { expect }) => {
		expect(() => validateDevelopmentOidcApiAudience(value)).toThrow();
	});
});
