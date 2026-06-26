import { describe, it } from "vitest";
import { readStoredAuthStateFromStorage } from "../src/state";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/config-file/auth";

function memoryStorage(initial?: UserAuthConfig): AuthConfigStorage {
	let value = initial;
	return {
		read() {
			if (value === undefined) {
				throw new Error("not logged in");
			}
			return value;
		},
		write(config) {
			value = config;
		},
		clear() {
			value = undefined;
		},
		path() {
			return "<memory>";
		},
	};
}

describe("readStoredAuthState storage injection", () => {
	it("reads OAuth tokens from an injected storage backend", ({ expect }) => {
		const storage = memoryStorage({
			oauth_token: "oauth-xyz",
			refresh_token: "refresh-xyz",
			expiration_time: "2099-01-01T00:00:00.000Z",
			scopes: ["account:read"],
		});
		expect(readStoredAuthStateFromStorage({ storage })).toEqual({
			accessToken: {
				value: "oauth-xyz",
				expiry: "2099-01-01T00:00:00.000Z",
			},
			refreshToken: { value: "refresh-xyz" },
			scopes: ["account:read"],
		});
	});

	it("returns an empty object when the injected storage is empty", ({
		expect,
	}) => {
		expect(
			readStoredAuthStateFromStorage({ storage: memoryStorage() })
		).toEqual({});
	});
});
