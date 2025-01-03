import { cloudflare, defineEnv } from "unenv";

describe("unenv", () => {
	test("module resolution does not throw", async () => {
		const env = {
			alias: {},
			...cloudflare,
		};

		env.alias["should/no/throw"] = "if/this/is/not/valid";

		// Throws "Error: ENOTDIR: not a directory, open '.../node_modules/.pnpm/unenv-nightly@2.0.0-20241216-144314-7e05819/node_modules/unenv-nightly/dist/index.mjs/package.json'"
		// before https://github.com/unjs/unenv/pull/378 is integrated via 2.0.0-20241218-183400-5d6aec3
		expect(() => {
			defineEnv({
				nodeCompat: true,
				presets: [env],
				resolve: true,
			});
		}).not.toThrow();
	});
});
