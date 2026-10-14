import { writeFileSync } from "node:fs";
import readline from "node:readline";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { parseBulkInputToObject } from "../src/deploy/helpers/parse-bulk-input";
import type { Interface } from "node:readline";

describe("parseBulkInputToObject", () => {
	runInTempDir();

	it("expands dotenv values from a file", async ({ expect }) => {
		vi.stubEnv("API_TOKEN", "process-token");
		writeFileSync(
			"secrets.env",
			[
				"VERSION=v1",
				"API_URL=https://api.example.com/$VERSION",
				"API_TOKEN=file-token",
			].join("\n")
		);

		await expect(parseBulkInputToObject("secrets.env")).resolves.toEqual({
			content: {
				VERSION: "v1",
				API_URL: "https://api.example.com/v1",
				API_TOKEN: "process-token",
			},
			secretSource: "file",
			secretFormat: "dotenv",
		});
	});

	it("expands dotenv values from stdin", async ({ expect }) => {
		vi.spyOn(readline, "createInterface").mockImplementation(
			() =>
				[
					"VERSION=v1",
					"API_URL=https://api.example.com/$VERSION",
				] as unknown as Interface
		);

		await expect(parseBulkInputToObject()).resolves.toEqual({
			content: {
				VERSION: "v1",
				API_URL: "https://api.example.com/v1",
			},
			secretSource: "stdin",
			secretFormat: "dotenv",
		});
	});
});
