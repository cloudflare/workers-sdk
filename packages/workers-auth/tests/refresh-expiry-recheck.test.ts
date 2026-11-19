import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, it, vi } from "vitest";
import { clearAccessCaches } from "../src/access";
import { createOAuthFlow } from "../src/flow";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/config-file/auth";
import type { OAuthFlowContext } from "../src/context";

const now = new Date("2026-11-12T12:00:00.000Z");
const expired: UserAuthConfig = {
	oauth_token: "expired-access",
	refresh_token: "RT_A",
	expiration_time: "2000-01-01T00:00:00.000Z",
};
const fresh: UserAuthConfig = {
	oauth_token: "sibling-access",
	refresh_token: "RT_B",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};
const msw = setupServer();
const refreshes: string[] = [];

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now);
	refreshes.length = 0;
	msw.use(
		http.get("https://dash.cloudflare.com/", () => HttpResponse.text("")),
		http.post(
			"https://dash.cloudflare.com/oauth2/token",
			async ({ request }) => {
				const body = new URLSearchParams(await request.text());
				refreshes.push(body.get("refresh_token") ?? "");
				return HttpResponse.json({
					access_token: "refreshed-access",
					refresh_token: "RT_C",
					expires_in: 3600,
					scope: "account:read",
				});
			}
		)
	);
});
afterEach(() => {
	msw.resetHandlers();
	clearAccessCaches();
	vi.useRealTimers();
});
afterAll(() => msw.close());

/** Inject a sibling's write between the caller's expiry check and its refresh snapshot. */
function storageWithSibling(sibling: UserAuthConfig, onRead: number) {
	let stored = expired;
	let reads = 0;
	const write = vi.fn((config: UserAuthConfig) => {
		stored = config;
	});
	const storage: AuthConfigStorage = {
		read() {
			if (++reads === onRead) {
				stored = sibling;
			}
			return stored;
		},
		write,
		clear() {
			throw new Error("Unexpected credential deletion");
		},
		path: () => "<memory>",
	};
	return { storage, write };
}

function flowWithStorage(storage: AuthConfigStorage) {
	const ignore = () => {};
	const context: OAuthFlowContext = {
		logger: {
			debug: ignore,
			info: ignore,
			log: ignore,
			warn: ignore,
			error: ignore,
		},
		isNonInteractiveOrCI: () => true,
		openInBrowser: async () => {
			throw new Error("Unexpected interactive login");
		},
		hasEnvCredentials: () => false,
		clientId: "test-client-id",
		consent: {
			granted: { url: "https://example.com/granted" },
			denied: { url: "https://example.com/denied", error: "denied" },
		},
		cliDisplayName: "TestCLI",
		deviceLoginCommand: "testcli login --device",
		redirectUri: "http://localhost:8976/oauth/callback",
		storageFactory: () => storage,
		allowGlobalAuthKey: false,
		temporary: undefined,
	};
	return createOAuthFlow(context);
}

it("reuses a sibling's valid credentials without refreshing or writing when resolving the access token", async ({
	expect,
}) => {
	const { storage, write } = storageWithSibling(fresh, 2);
	await expect(
		flowWithStorage(storage).getOAuthTokenFromLocalState()
	).resolves.toBe("sibling-access");
	expect(refreshes).toEqual([]);
	expect(write).not.toHaveBeenCalled();
	expect(storage.read()).toEqual(fresh);
});

it("reuses a sibling's valid credentials without refreshing or writing during login-or-refresh", async ({
	expect,
}) => {
	const { storage, write } = storageWithSibling(fresh, 3);
	await expect(
		flowWithStorage(storage).loginOrRefreshIfRequired({
			complianceConfig: {},
			scopes: ["account:read"],
		})
	).resolves.toEqual({ loggedIn: true });
	expect(refreshes).toEqual([]);
	expect(write).not.toHaveBeenCalled();
	expect(storage.read()).toEqual(fresh);
});

it.for([
	{ name: "already expired", expiry: "2000-01-01T00:00:00.000Z" },
	{ name: "expires exactly now", expiry: now.toISOString() },
	{ name: "has no expiry", expiry: undefined },
])(
	"still refreshes the latest token when the sibling's access token $name",
	async ({ expiry }, { expect }) => {
		const { storage, write } = storageWithSibling(
			{ ...fresh, expiration_time: expiry },
			2
		);
		await expect(
			flowWithStorage(storage).getOAuthTokenFromLocalState()
		).resolves.toBe("refreshed-access");
		expect(refreshes).toEqual(["RT_B"]);
		expect(write).toHaveBeenCalledOnce();
		expect(storage.read()).toEqual({
			oauth_token: "refreshed-access",
			refresh_token: "RT_C",
			expiration_time: new Date(now.getTime() + 3_600_000).toISOString(),
			scopes: ["account:read"],
		});
	}
);
