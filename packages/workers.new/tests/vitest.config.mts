import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

class FilteredPushArray<T> extends Array<T> {
	constructor(private readonly predicate: (item: T) => boolean) {
		super();
	}

	push(...items: T[]) {
		return super.push(...items.filter(this.predicate));
	}
}

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					// Required to use `SELF.scheduled()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					compatibilityFlags: ["service_binding_extra_handlers"],
				},
				wrangler: {
					configPath: "../wrangler.toml",
				},
			},
		},
		// Configure the `vite-node` server used by Vitest code to import configs,
		// custom pools and tests. By default, Vitest effectively applies Vite
		// transforms to all files outside `node_modules`. This means by default,
		// our custom pool code is transformed by Vite during development, but not
		// when published, leading to possible behaviour mismatches. To fix this,
		// we ensure file paths containing `packages/vitest-pool-workers/dist` are
		// always "externalised", meaning they're imported directly by Node.
		server: {
			deps: {
				// Vitest automatically adds `/^(?!.*(?:node_modules)).*\.mjs$/` as an
				// `inline` RegExp: https://github.com/vitest-dev/vitest/blob/v1.5.0/packages/vitest/src/node/config.ts#L236
				// We'd like `packages/vitest-pool-workers/dist/pool/index.mjs` to be
				// externalised though. Unfortunately, `inline`s are checked before
				// `external`s, so there's no nice way we can override this. Instead,
				// we prevent the extra `inline` being added in the first place.
				inline: new FilteredPushArray((item) => {
					const str = `${item}`;
					return str !== "/^(?!.*(?:node_modules)).*\\.mjs$/";
				}),
				external: [
					/packages\/vitest-pool-workers\/dist/,
					/packages\/wrangler\//,
				],
			},
		},
	},
});
