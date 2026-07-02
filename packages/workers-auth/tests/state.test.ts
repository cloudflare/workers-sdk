import { describe, it } from "vitest";
import { readStoredAuthState } from "../src/state";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/auth-config-file";

function memoryStorage(initial?: UserAuthConfig): AuthConfigStorage {
	let value = initial;
	return {
		// Per the `ConfigStorage<T>.read()` contract, "no usable config
		// stored yet" is represented as `undefined`, not a thrown
		// exception. Throws are reserved for genuine errors (filesystem
		// permission failures, etc.).
		read() {
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
		expect(readStoredAuthState({ storage })).toEqual({
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
		expect(readStoredAuthState({ storage: memoryStorage() })).toEqual({});
	});
});
