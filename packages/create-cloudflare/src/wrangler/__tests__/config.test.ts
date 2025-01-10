import { existsSync } from "fs";
import { mockWorkersTypesDirectory } from "helpers/__tests__/mocks";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { updateWranglerConfig } from "../config";

vi.mock("helpers/files");
vi.mock("helpers/compatDate");
vi.mock("fs");

const mockCompatDate = "2024-01-17";

describe("update wrangler config", () => {
	const ctx = createTestContext();

	beforeEach(() => {
		vi.mocked(getWorkerdCompatibilityDate).mockReturnValue(
			Promise.resolve(mockCompatDate),
		);
		vi.mocked(existsSync).mockImplementation((f) =>
			(f as string).endsWith(".toml"),
		);
		mockWorkersTypesDirectory();

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`,
		);
	});

	test("placeholder replacement", async () => {
		const toml = [
			`name = "<TBD>"`,
			`main = "src/index.ts"`,
			`compatibility_date = "<TBD>"`,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			main = "src/index.ts"
			compatibility_date = "2024-01-17"

			[observability]
			enabled = true

			# Smart Placement
			# Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
			# [placement]
			# mode = "smart"

			###
			# Bindings
			# Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
			# databases, object storage, AI inference, real-time communication and more.
			# https://developers.cloudflare.com/workers/runtime-apis/bindings/
			###

			# Environment Variables
			# https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
			# [vars]
			# MY_VARIABLE = "production_value"

			# Note: Use secrets to store sensitive data.
			# https://developers.cloudflare.com/workers/configuration/secrets/

			# Static Assets
			# https://developers.cloudflare.com/workers/static-assets/binding/
			# [assets]
			# directory = "./public/"
			# binding = "ASSETS"

			# Service Bindings (communicate between multiple Workers)
			# https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
			# [[services]]
			# binding = "MY_SERVICE"
			# service = "my-service"
			"
		`);
	});

	test("placeholder replacement (json)", async () => {
		vi.mocked(existsSync).mockImplementationOnce((f) =>
			(f as string).endsWith(".json"),
		);
		const json = JSON.stringify({
			name: "<TBD>",
			main: "src/index.ts",
			compatibility_date: "<TBD>",
		});
		vi.mocked(readFile).mockReturnValueOnce(json);

		await updateWranglerConfig(ctx);

		const newConfig = vi.mocked(writeFile).mock.calls[0][1];
		expect(newConfig).toMatchInlineSnapshot(`
			"/**
			 * For more details on how to configure Wrangler, refer to:
			 * https://developers.cloudflare.com/workers/wrangler/configuration/
			 */
			{
			  "$schema": "node_modules/wrangler/config-schema.json",
			  "name": "test",
			  "main": "src/index.ts",
			  "compatibility_date": "2024-01-17",
			  "observability": {
			    "enabled": true
			  }
			  /**
			   * Smart Placement
			   * Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
			   */
			  // "placement": { "mode": "smart" },

			  /**
			   * Bindings
			   * Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
			   * databases, object storage, AI inference, real-time communication and more.
			   * https://developers.cloudflare.com/workers/runtime-apis/bindings/
			   */

			  /**
			   * Environment Variables
			   * https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
			   */
			  // "vars": { "MY_VARIABLE": "production_value" },
			  /**
			   * Note: Use secrets to store sensitive data.
			   * https://developers.cloudflare.com/workers/configuration/secrets/
			   */

			  /**
			   * Static Assets
			   * https://developers.cloudflare.com/workers/static-assets/binding/
			   */
			  // "assets": { "directory": "./public/", "binding": "ASSETS" },

			  /**
			   * Service Bindings (communicate between multiple Workers)
			   * https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
			   */
			  // "services": [{ "binding": "MY_SERVICE", "service": "my-service" }]
			}
			"
		`);
	});

	test("string literal replacement", async () => {
		const toml = [`name = "my-cool-worker"`, `main = "src/index.ts"`].join(
			"\n",
		);
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			main = "src/index.ts"
			compatibility_date = "2024-01-17"

			[observability]
			enabled = true

			# Smart Placement
			# Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
			# [placement]
			# mode = "smart"

			###
			# Bindings
			# Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
			# databases, object storage, AI inference, real-time communication and more.
			# https://developers.cloudflare.com/workers/runtime-apis/bindings/
			###

			# Environment Variables
			# https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
			# [vars]
			# MY_VARIABLE = "production_value"

			# Note: Use secrets to store sensitive data.
			# https://developers.cloudflare.com/workers/configuration/secrets/

			# Static Assets
			# https://developers.cloudflare.com/workers/static-assets/binding/
			# [assets]
			# directory = "./public/"
			# binding = "ASSETS"

			# Service Bindings (communicate between multiple Workers)
			# https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
			# [[services]]
			# binding = "MY_SERVICE"
			# service = "my-service"
			"
		`);
	});

	test("missing name and compat date", async () => {
		const toml = `main = "src/index.ts"`;
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			main = "src/index.ts"
			name = "test"
			compatibility_date = "2024-01-17"

			[observability]
			enabled = true

			# Smart Placement
			# Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
			# [placement]
			# mode = "smart"

			###
			# Bindings
			# Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
			# databases, object storage, AI inference, real-time communication and more.
			# https://developers.cloudflare.com/workers/runtime-apis/bindings/
			###

			# Environment Variables
			# https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
			# [vars]
			# MY_VARIABLE = "production_value"

			# Note: Use secrets to store sensitive data.
			# https://developers.cloudflare.com/workers/configuration/secrets/

			# Static Assets
			# https://developers.cloudflare.com/workers/static-assets/binding/
			# [assets]
			# directory = "./public/"
			# binding = "ASSETS"

			# Service Bindings (communicate between multiple Workers)
			# https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
			# [[services]]
			# binding = "MY_SERVICE"
			# service = "my-service"
			"
		`);
	});

	test("dont replace valid existing compatibility date", async () => {
		const toml = [
			`name = "super-old-worker"`,
			`compatibility_date = "2001-10-12"`,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			compatibility_date = "2001-10-12"

			[observability]
			enabled = true

			# Smart Placement
			# Docs: https://developers.cloudflare.com/workers/configuration/smart-placement/#smart-placement
			# [placement]
			# mode = "smart"

			###
			# Bindings
			# Bindings allow your Worker to interact with resources on the Cloudflare Developer Platform, including
			# databases, object storage, AI inference, real-time communication and more.
			# https://developers.cloudflare.com/workers/runtime-apis/bindings/
			###

			# Environment Variables
			# https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
			# [vars]
			# MY_VARIABLE = "production_value"

			# Note: Use secrets to store sensitive data.
			# https://developers.cloudflare.com/workers/configuration/secrets/

			# Static Assets
			# https://developers.cloudflare.com/workers/static-assets/binding/
			# [assets]
			# directory = "./public/"
			# binding = "ASSETS"

			# Service Bindings (communicate between multiple Workers)
			# https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
			# [[services]]
			# binding = "MY_SERVICE"
			# service = "my-service"
			"
		`);
	});
});
