import { it } from "vitest";
import { experimental_readRawConfig } from "../../src/config";
import { normalizeAndValidateConfig } from "../../src/config/validation";
import { runInTempDir, writeWranglerConfig } from "../../src/test-helpers";

runInTempDir();
it.for(["json", "jsonc", "toml"])(
	"preserves combined OAuth authority through %s configuration",
	(format, { expect }) => {
		for (const exchange of [
			"workload_authorization",
			"client_credentials",
		] as const) {
			const oauth = {
				exchange,
				...(exchange === "client_credentials"
					? { client_id: "provider-id" }
					: {}),
				authorization_server: "https://auth.example.com",
				token_endpoint: "https://auth.example.com/token",
				resource: "https://api.example.com",
				scope: ["read"],
				allowed_origins: ["https://api.example.com"],
				allowed_methods: ["GET"],
				require_sender_constraint: true as const,
				http_message_signatures: "web_bot_auth" as const,
			};
			const identities = [{ binding: "API", oauth }];
			const path = `wrangler.${format}`;
			writeWranglerConfig({ identities }, path);
			const { rawConfig, configPath, userConfigPath } =
				experimental_readRawConfig({ config: path });
			const { config, diagnostics } = normalizeAndValidateConfig(
				rawConfig,
				configPath,
				userConfigPath,
				{}
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(config.identities).toEqual(identities);
		}
	}
);
