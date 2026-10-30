import assert from "node:assert";
import { once } from "node:events";
import http from "node:http";
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
