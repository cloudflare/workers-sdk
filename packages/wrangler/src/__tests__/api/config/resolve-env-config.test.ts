import { resolveEnvConfig } from "../../../api/config";

describe("resolveEnvConfig", () => {
	test("resolves the top level environment", () => {
		expect(
			resolveEnvConfig(
				{
					$schema: "node_modules/wrangler/config-schema.json",
					name: "hello-worker",
					main: "src/index.js",
					compatibility_date: "2025-07-31",
					vars: {
						MY_VAR: "my top level var",
					},
					observability: {
						enabled: true,
					},
					env: {
						staging: {
							vars: {
								MY_VAR: "my staging var",
							},
						},
					},
				},
				null
			)
		).toEqual({
			envConfig: {
				// The $schema field is simply ignored
				name: "hello-worker",
				main: "src/index.js",
				compatibility_date: "2025-07-31",
				observability: { enabled: true },
				vars: {
					MY_VAR: "my top level var",
				},
			},
			errors: [],
		});
	});

	test("resolves the staging level environment", () => {
		expect(
			resolveEnvConfig(
				{
					$schema: "node_modules/wrangler/config-schema.json",
					name: "hello-worker",
					main: "src/index.js",
					compatibility_date: "2025-07-31",
					vars: {
						MY_VAR: "my top level var",
					},
					observability: {
						enabled: true,
					},
					env: {
						staging: {
							vars: {
								MY_VAR: "my staging var",
							},
						},
					},
				},
				"staging"
			)
		).toEqual({
			envConfig: {
				// The $schema field is simply ignored
				name: "hello-worker",
				main: "src/index.js",
				compatibility_date: "2025-07-31",
				observability: { enabled: true },
				vars: {
					MY_VAR: "my staging var",
				},
			},
			errors: [],
		});
	});
});
