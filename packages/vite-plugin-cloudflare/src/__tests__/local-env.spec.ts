import { describe, test } from "vitest";
import { resolveLocalBindings } from "../local-env";

const workerConfig = {
	env: {
		SECRET: { type: "secret" as const },
		MISSING: { type: "secret" as const },
		TEXT: { type: "text" as const, value: "configured" },
		HYPERDRIVE: {
			type: "hyperdrive" as const,
			id: "hyperdrive-id",
		},
	},
};

describe("local bindings", () => {
	test("replaces only declared secrets and reports missing ones", ({
		expect,
	}) => {
		const result = resolveLocalBindings(workerConfig.env, {
			SECRET: "local",
			TEXT: "not-used",
			UNDECLARED: "ignored",
			CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
				"postgres://localhost/database",
		});

		expect(result).toEqual({
			bindings: {
				SECRET: { type: "text", value: "local" },
				TEXT: { type: "text", value: "configured" },
				HYPERDRIVE: {
					type: "hyperdrive",
					id: "hyperdrive-id",
					dev: { connectionString: "postgres://localhost/database" },
				},
			},
			missingSecrets: ["MISSING"],
		});
	});
});
