import { describe, test, vi } from "vitest";
import { resolveLocalBindings } from "../../src/config/local-bindings";

describe("resolveLocalBindings", () => {
	const env = {
		SECRET: { type: "secret" as const },
		MISSING: { type: "secret" as const },
		TEXT: { type: "text" as const, value: "configured" },
		HYPERDRIVE: { type: "hyperdrive" as const, id: "hyperdrive-id" },
	};

	function options(
		overrides: Partial<Parameters<typeof resolveLocalBindings>[1]> = {}
	) {
		return {
			workerName: "worker",
			localEnv: {},
			mode: "test",
			logger: { warn: vi.fn() },
			...overrides,
		};
	}

	test("replaces only declared secrets and warns about missing ones", ({
		expect,
	}) => {
		const resolveOptions = options({
			localEnv: {
				SECRET: "local",
				TEXT: "not-used",
				UNDECLARED: "ignored",
				CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
					"postgres://localhost/database",
			},
		});

		expect(resolveLocalBindings(env, resolveOptions)).toEqual({
			SECRET: { type: "text", value: "local" },
			TEXT: { type: "text", value: "configured" },
			HYPERDRIVE: {
				type: "hyperdrive",
				id: "hyperdrive-id",
				dev: { connectionString: "postgres://localhost/database" },
			},
		});
		expect(resolveOptions.logger.warn).toHaveBeenCalledWith(
			'Missing required secrets for Worker "worker": MISSING. Add them to one of `.dev.vars.test`, `.dev.vars`, `.env.test.local`, `.env.test`, `.env.local`, or `.env`. Alternatively, set them as environment variables.'
		);
	});

	test("requires a local Hyperdrive connection string", ({ expect }) => {
		expect(() =>
			resolveLocalBindings({ HYPERDRIVE: env.HYPERDRIVE }, options())
		).toThrow(
			'Hyperdrive binding "HYPERDRIVE" must define dev.connectionString for local development.'
		);
		expect(() =>
			resolveLocalBindings(
				{ HYPERDRIVE: { ...env.HYPERDRIVE, dev: { remote: true } } },
				options({ remoteBindings: false })
			)
		).toThrow(
			'Hyperdrive binding "HYPERDRIVE" must define dev.connectionString'
		);
	});

	test("does not require local credentials for remote Hyperdrive", ({
		expect,
	}) => {
		const binding = { ...env.HYPERDRIVE, dev: { remote: true } };
		expect(resolveLocalBindings({ HYPERDRIVE: binding }, options())).toEqual({
			HYPERDRIVE: binding,
		});
	});

	test.for([
		{ remote: undefined, remoteBindings: true, resolved: true },
		{ remote: undefined, remoteBindings: false, resolved: false },
		{ remote: false, remoteBindings: true, resolved: false },
		{ remote: true, remoteBindings: true, resolved: true },
		// Miniflare uses the simulator without a remote proxy connection.
		{ remote: true, remoteBindings: false, resolved: true },
	])(
		"resolves Artifacts dev.remote=$remote with remoteBindings=$remoteBindings",
		({ remote, remoteBindings, resolved }, { expect }) => {
			const binding = {
				type: "artifacts" as const,
				namespace: "examples",
				...(remote === undefined ? {} : { dev: { remote } }),
			};
			expect(
				resolveLocalBindings({ REPOS: binding }, options({ remoteBindings }))
			).toEqual({
				REPOS: { ...binding, dev: { remote: resolved } },
			});
		}
	);
});
