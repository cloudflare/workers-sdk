import { checkRemoteSecretsOverride } from "../../deploy/check-remote-secrets-override";
import { fetchSecrets } from "../../utils/fetch-secrets";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("../../utils/fetch-secrets");

async function runMockedCheckRemoteSecretsOverride(
	config: Partial<Config>,
	remoteSecrets: string[]
): ReturnType<typeof checkRemoteSecretsOverride> {
	vi.mocked(fetchSecrets).mockResolvedValue(
		remoteSecrets.map((secret) => ({ name: secret, type: "secret_text" }))
	);
	return checkRemoteSecretsOverride(config as Config);
}

describe("checkRemoteSecretsOverride", () => {
	it("should return { override: false } when there are no possible overrides", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
				},
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET"]
		);
		expect(checkResult.override).toBe(false);
	});

	it("should detect and provide a valid deploy error message when a variable name overrides a secret", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
					MY_SECRET: "secret",
				},
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET"]
		);

		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Environment variable `MY_SECRET` conflicts with an existing remote secret. This deployment will replace the remote secret with your environment variable."
		);
	});

	it("should detect and provide a valid deploy error message when multiple (2) variable names override secrets", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
					MY_SECRET_1: "secret",
					MY_SECRET_2: "secret",
				},
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET_1", "MY_SECRET_2"]
		);
		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Environment variables `MY_SECRET_1` and `MY_SECRET_2` conflict with existing remote secrets. This deployment will replace these remote secrets with your environment variables."
		);
	});

	it("should detect and provide a valid deploy error message when multiple (3) variable names override secrets", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
					MY_SECRET_1: "secret",
					MY_SECRET_2: "secret",
					MY_SECRET_3: "secret",
				},
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET_1", "MY_SECRET_2", "MY_SECRET_3"]
		);
		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Environment variables `MY_SECRET_1`, `MY_SECRET_2`, and `MY_SECRET_3` conflict with existing remote secrets. This deployment will replace these remote secrets with your environment variables."
		);
	});

	it("should detect and provide a valid deploy error message when a binding name overrides a secret", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
				},
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "<kv_id>",
					},
					{
						binding: "MY_SECRET",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET"]
		);
		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Binding `MY_SECRET` conflicts with an existing remote secret. This deployment will replace the remote secret with your binding."
		);
	});

	it("should detect and provide a valid deploy error message when multiple binding names override secrets", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_VAR: "var",
				},
				kv_namespaces: [
					{
						binding: "MY_SECRET_1",
						id: "<kv_id>",
					},
					{
						binding: "MY_SECRET_2",
						id: "<kv_id>",
					},
					{
						binding: "MY_SECRET_3",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET_1", "MY_SECRET_2", "MY_SECRET_3"]
		);
		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Bindings `MY_SECRET_1`, `MY_SECRET_2`, and `MY_SECRET_3` conflict with existing remote secrets. This deployment will replace these remote secrets with your bindings."
		);
	});

	it("should detect and provide a valid deploy error message when a combination of variables and binding names override secrets", async () => {
		const checkResult = await runMockedCheckRemoteSecretsOverride(
			{
				vars: {
					MY_SECRET_1: "var",
					MY_SECRET_2: "var",
				},
				kv_namespaces: [
					{
						binding: "MY_SECRET_3",
						id: "<kv_id>",
					},
				],
			},
			["MY_SECRET_1", "MY_SECRET_2", "MY_SECRET_3"]
		);
		expect(checkResult.override).toBe(true);
		assert(checkResult.override);
		expect(checkResult.deployErrorMessage).toBe(
			"Configuration values (`MY_SECRET_1`, `MY_SECRET_2`, and `MY_SECRET_3`) conflict with existing remote secrets. This deployment will replace these remote secrets with the configuration values."
		);
	});

	it("should not unnecessarily fetch secrets when there are no env vars nor bindings in the config file", async () => {
		const result = await runMockedCheckRemoteSecretsOverride({}, ["MY_SECRET"]);
		expect(result.override).toBeFalsy();
		expect(fetchSecrets).not.toHaveBeenCalled();
	});
});
