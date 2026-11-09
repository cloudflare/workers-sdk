import { describe, it } from "vitest";
import { addRequiredSecretsInheritBindings } from "../src/deploy/helpers/secrets-validation";
import type { Binding, Config } from "@cloudflare/workers-utils";

const config = {
	secrets: { required: ["API_TOKEN", "DB_PASSWORD"] },
} as Config;

const deployOptions = {
	type: "deploy",
	workerExists: true,
	secretPutCommand: "test-cli secret put",
	uploadCommand: "test-cli deploy",
} as const;

describe("addRequiredSecretsInheritBindings", () => {
	describe.each([
		["deploy", deployOptions],
		["upload", { type: "upload" } as const],
	])("%s", (_, options) => {
		it("throws when required secrets have empty values", ({ expect }) => {
			const bindings: Record<string, Binding> = {
				API_TOKEN: { type: "secret_text", value: "" },
				DB_PASSWORD: { type: "secret_text", value: "" },
			};

			expect(() => addRequiredSecretsInheritBindings(config, bindings, options))
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The following required secrets have empty values in the secrets file: API_TOKEN, DB_PASSWORD
				Required secrets must not be empty. Note that \`\${VAR}\` references to unset environment variables expand to empty strings.
				Set a non-empty value for each, or remove them from the secrets file to keep the value already set on the Worker.]
			`);
		});

		it("accepts non-empty required secrets", ({ expect }) => {
			const bindings: Record<string, Binding> = {
				API_TOKEN: { type: "secret_text", value: "token" },
				DB_PASSWORD: { type: "secret_text", value: "password" },
			};

			addRequiredSecretsInheritBindings(config, bindings, options);

			expect(bindings).toEqual({
				API_TOKEN: { type: "secret_text", value: "token" },
				DB_PASSWORD: { type: "secret_text", value: "password" },
			});
		});

		it("inherits required secrets that are absent", ({ expect }) => {
			const bindings: Record<string, Binding> = {
				API_TOKEN: { type: "secret_text", value: "token" },
			};

			addRequiredSecretsInheritBindings(config, bindings, options);

			expect(bindings).toEqual({
				API_TOKEN: { type: "secret_text", value: "token" },
				DB_PASSWORD: { type: "inherit" },
			});
		});

		it("keeps empty values for secrets that are not required", ({ expect }) => {
			const bindings: Record<string, Binding> = {
				API_TOKEN: { type: "secret_text", value: "token" },
				DB_PASSWORD: { type: "secret_text", value: "password" },
				OPTIONAL: { type: "secret_text", value: "" },
			};

			addRequiredSecretsInheritBindings(config, bindings, options);

			expect(bindings.OPTIONAL).toEqual({ type: "secret_text", value: "" });
		});
	});

	it("reports empty required secrets before missing ones on a first deploy", ({
		expect,
	}) => {
		expect(() =>
			addRequiredSecretsInheritBindings(
				config,
				{ API_TOKEN: { type: "secret_text", value: "" } },
				{ ...deployOptions, workerExists: false }
			)
		).toThrow(
			"The following required secrets have empty values in the secrets file: API_TOKEN"
		);
	});
});
