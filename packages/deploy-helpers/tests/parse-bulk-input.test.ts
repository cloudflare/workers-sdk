import { writeFileSync } from "node:fs";
import readline from "node:readline";
import { parseAndExpandDotEnv } from "@cloudflare/workers-utils/local-env";
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

		await expect(
			parseBulkInputToObject("secrets.env", false, parseAndExpandDotEnv)
		).resolves.toEqual({
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

		await expect(
			parseBulkInputToObject(undefined, false, parseAndExpandDotEnv)
		).resolves.toEqual({
			content: {
				VERSION: "v1",
				API_URL: "https://api.example.com/v1",
			},
			secretSource: "stdin",
			secretFormat: "dotenv",
		});
	});

	it.for(["file", "stdin"])(
		"preserves literal dotenv values from %s by default",
		async (source, { expect }) => {
			vi.stubEnv("API_TOKEN", "process-token");
			vi.stubEnv("EMPTY_SECRET", "");
			const lines = [
				"API_TOKEN=file-token",
				"EMPTY_SECRET=file-value",
				"PASSWORD=pa$word",
				"REFERENCE=${API_TOKEN}",
			];
			if (source === "file") {
				writeFileSync("secrets.env", lines.join("\n"));
			} else {
				vi.spyOn(readline, "createInterface").mockImplementation(
					() => lines as unknown as Interface
				);
			}

			await expect(
				parseBulkInputToObject(source === "file" ? "secrets.env" : undefined)
			).resolves.toEqual({
				content: {
					API_TOKEN: "file-token",
					EMPTY_SECRET: "file-value",
					PASSWORD: "pa$word",
					REFERENCE: "${API_TOKEN}",
				},
				secretSource: source,
				secretFormat: "dotenv",
			});
		}
	);

	it("preserves JSON values when dotenv expansion is enabled", async ({
		expect,
	}) => {
		vi.stubEnv("API_TOKEN", "process-token");
		const content = { API_TOKEN: "${API_TOKEN}", PASSWORD: "pa$word" };
		writeFileSync("secrets.json", JSON.stringify(content));

		await expect(
			parseBulkInputToObject("secrets.json", false, parseAndExpandDotEnv)
		).resolves.toEqual({
			content,
			secretSource: "file",
			secretFormat: "json",
		});
	});
});
