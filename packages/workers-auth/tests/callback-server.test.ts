import assert from "node:assert";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import { fetch } from "undici";
import { describe, it, vi } from "vitest";
import { getOauthToken } from "../src/callback-server";
import {
	ErrorAccessDenied,
	ErrorInvalidReturnedStateParam,
	toErrorClass,
} from "../src/errors";
import { generateAuthUrl } from "../src/generate-auth-url";
import {
	exchangeAuthCodeForAccessToken,
	isReturningFromAuthServer,
} from "../src/token-exchange";
import type { OAuthFlowContext } from "../src/context";
import type { OAuthFlowState } from "../src/state";
import type { ParsedUrlQuery } from "node:querystring";

vi.mock("../src/token-exchange", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/token-exchange")>()),
	exchangeAuthCodeForAccessToken: vi.fn(),
}));

function createLogger(): OAuthFlowContext["logger"] {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

describe("OAuth callback state", () => {
	it.for<ParsedUrlQuery>([
		{},
		{ state: "other-state" },
		{ state: ["expected-state", "other-state"] },
		{ code: "" },
		{ error: "" },
		{ error: "invalid_scope" },
		{ error: "access_denied", state: "other-state" },
		{ error: "invalid_scope", state: ["expected-state", "other-state"] },
		{ code: "example-code" },
		{ code: "example-code", state: "other-state" },
		{ code: "example-code", state: ["expected-state", "other-state"] },
	])("rejects unrelated callback parameters %j", (query, { expect }) => {
		const state: OAuthFlowState = { stateQueryParam: "expected-state" };
		expect(() =>
			isReturningFromAuthServer(query, state, createLogger())
		).toThrow(ErrorInvalidReturnedStateParam);
		expect(state.authorizationCode).toBeUndefined();
	});

	it.for<ParsedUrlQuery>([{}, { error: "invalid_scope" }])(
		"requires an initialized login state for %j",
		(query, { expect }) => {
			expect(() =>
				isReturningFromAuthServer(query, {}, createLogger())
			).toThrow(ErrorInvalidReturnedStateParam);
		}
	);

	it("returns false for a matching callback without a code or error", ({
		expect,
	}) => {
		const state: OAuthFlowState = { stateQueryParam: "expected-state" };
		expect(
			isReturningFromAuthServer(
				{ state: "expected-state" },
				state,
				createLogger()
			)
		).toBe(false);
		expect(state.authorizationCode).toBeUndefined();
	});

	it("handles a matching provider error", ({ expect }) => {
		expect(() =>
			isReturningFromAuthServer(
				{ error: "access_denied", state: "expected-state" },
				{ stateQueryParam: "expected-state" },
				createLogger()
			)
		).toThrow(ErrorAccessDenied);
	});

	it("records a matching authorization code", ({ expect }) => {
		const state: OAuthFlowState = { stateQueryParam: "expected-state" };
		expect(
			isReturningFromAuthServer(
				{ code: "example-code", state: "expected-state" },
				state,
				createLogger()
			)
		).toBe(true);
		expect(state.authorizationCode).toBe("example-code");
	});

	it("escapes control characters in displayed provider fields", ({
		expect,
	}) => {
		const error = toErrorClass(
			"example\u001b",
			"Description\r\n\u009b",
			"https://example.com/help\u0007"
		);
		expect(error.message).toBe(
			"OAuth error: example\\u001b\n  Description\\u000d\\u000a\\u009b\n  See: https://example.com/help\\u0007"
		);
		expect(error.description).toBe("Description\r\n\u009b");
	});
});

it("keeps the callback server available after unrelated callbacks", async ({
	expect,
	onTestFinished,
}) => {
	const serverSpy = vi.spyOn(http, "createServer");
	onTestFinished(() => serverSpy.mockRestore());
	const opened = Promise.withResolvers<void>();
	const consent = {
		granted: { url: "https://example.com/granted" },
		denied: { url: "https://example.com/denied", error: "Consent denied" },
	};
	const ctx: OAuthFlowContext = {
		logger: createLogger(),
		isNonInteractiveOrCI: () => false,
		openInBrowser: async () => opened.resolve(),
		hasEnvCredentials: () => false,
		clientId: "example-client",
		consent,
		cliDisplayName: "Test CLI",
		deviceLoginCommand: "test login --device",
		redirectUri: "http://127.0.0.1/custom/callback",
		storageFactory: () => ({
			read: () => undefined,
			write: () => {},
			clear: () => true,
			path: () => "<in-memory>",
		}),
		allowGlobalAuthKey: false,
		temporary: undefined,
	};
	const token = { token: { value: "example-token", expiry: "2099-01-01" } };
	vi.mocked(exchangeAuthCodeForAccessToken).mockResolvedValueOnce(token);
	const state: OAuthFlowState = {};
	const finished = vi.fn();
	const result = getOauthToken(
		{
			browser: true,
			scopes: [],
			clientId: ctx.clientId as string,
			redirectUri: ctx.redirectUri,
			...consent,
			callbackHost: "127.0.0.1",
			callbackPort: 0,
		},
		state,
		ctx,
		{ generateAuthUrl, generateRandomState: () => "expected-state" }
	).then(
		(value) => {
			finished();
			return value;
		},
		(error: unknown) => {
			finished();
			return error;
		}
	);
	await opened.promise;
	const server = serverSpy.mock.results[0]?.value;
	assert(server);
	if (!server.listening) {
		await once(server, "listening");
	}
	const address = server.address();
	assert(address && typeof address !== "string");
	const callback = `http://127.0.0.1:${address.port}/custom/callback`;
	onTestFinished(async () => {
		if (server.listening) {
			const response = await fetch(
				`${callback}?error=access_denied&state=expected-state`,
				{ redirect: "manual" }
			);
			await response.text();
		}
	});

	for (const query of [
		"",
		"state=other-state",
		"state=expected-state&state=other-state",
		"code=&error=",
		"error=invalid_scope",
		"error=access_denied&state=other-state",
		"code=example-code&state=other-state",
	]) {
		const response = await fetch(`${callback}?${query}`, {
			redirect: "manual",
		});
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("does not match the pending login");
		expect(finished).not.toHaveBeenCalled();
		expect(exchangeAuthCodeForAccessToken).not.toHaveBeenCalled();
	}

	const response = await fetch(
		`${callback}?code=example-code&state=expected-state`,
		{ redirect: "manual" }
	);
	expect(response.status).toBe(307);
	expect(response.headers.get("location")).toBe(consent.granted.url);
	await response.text();
	expect(await result).toEqual(token);
	expect(exchangeAuthCodeForAccessToken).toHaveBeenCalledOnce();
});

it(
	"completes the login even if a connection to the login server never completes",
	async ({ expect, onTestFinished }) => {
		// https://github.com/cloudflare/workers-sdk/issues/13258 — running
		// `wrangler login` inside a container/devcontainer, the browser
		// completes OAuth (the granted page is shown), but the CLI hangs
		// forever: the login promise only settles from `server.close()`'s
		// callback, which Node fires once every connection has ended. A
		// port-forwarding proxy (or any other client) can leave a connection
		// open that the login server never answers — the request handler has
		// no default case, so any request other than the callback path gets
		// no response — and the login then never settles, since the
		// 120-second timeout was already cleared.
		const serverSpy = vi.spyOn(http, "createServer");
		onTestFinished(() => serverSpy.mockRestore());
		const opened = Promise.withResolvers<void>();
		const consent = {
			granted: { url: "https://example.com/granted" },
			denied: { url: "https://example.com/denied", error: "Consent denied" },
		};
		const ctx: OAuthFlowContext = {
			logger: createLogger(),
			isNonInteractiveOrCI: () => false,
			openInBrowser: async () => opened.resolve(),
			hasEnvCredentials: () => false,
			clientId: "example-client",
			consent,
			cliDisplayName: "Test CLI",
			deviceLoginCommand: "test login --device",
			redirectUri: "http://127.0.0.1/custom/callback",
			storageFactory: () => ({
				read: () => undefined,
				write: () => {},
				clear: () => true,
				path: () => "<in-memory>",
			}),
			allowGlobalAuthKey: false,
			temporary: undefined,
		};
		const token = { token: { value: "example-token", expiry: "2099-01-01" } };
		vi.mocked(exchangeAuthCodeForAccessToken).mockResolvedValueOnce(token);
		const state: OAuthFlowState = {};
		const result = getOauthToken(
			{
				browser: true,
				scopes: [],
				clientId: ctx.clientId as string,
				redirectUri: ctx.redirectUri,
				...consent,
				callbackHost: "127.0.0.1",
				callbackPort: 0,
			},
			state,
			ctx,
			{ generateAuthUrl, generateRandomState: () => "expected-state" }
		);
		await opened.promise;
		const server = serverSpy.mock.results[0]?.value;
		assert(server);
		if (!server.listening) {
			await once(server, "listening");
		}
		const address = server.address();
		assert(address && typeof address !== "string");
		onTestFinished(async () => {
			lingerSocket.destroy();
			server.closeAllConnections?.();
			await new Promise<void>((resolve) =>
				server.close(() => resolve())
			);
		});

		// A connection like a port-forwarding proxy's: a request to an
		// unrelated path that the login server never answers, left open.
		const lingerSocket = net.connect(address.port, "127.0.0.1");
		await once(lingerSocket, "connect");
		lingerSocket.write(
			"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
		);

		// The browser completes the OAuth flow; the granted page is served.
		const callback = `http://127.0.0.1:${address.port}/custom/callback`;
		const response = await fetch(
			`${callback}?code=example-code&state=expected-state`,
			{ redirect: "manual" }
		);
		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(consent.granted.url);
		await response.text();

		// The login must settle promptly even though the unrelated connection
		// is still open, rather than hanging forever.
		const outcome = await Promise.race([
			result,
			new Promise<string>((resolve) =>
				setTimeout(() => resolve("login still pending"), 8_000)
			),
		]);
		expect(outcome).toEqual(token);
	},
	20_000
);
