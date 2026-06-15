import { describe, it } from "vitest";
import { generateTypes } from "../generate";

describe("generateTypes", () => {
	it("defaults the package import to @cloudflare/config", ({ expect }) => {
		const out = generateTypes({ configPath: "./cloudflare.config.ts" });
		expect(out).toContain(`from "@cloudflare/config"`);
		expect(out).toContain(`import type Config from "./cloudflare.config"`);
	});

	it("accepts a custom packageName", ({ expect }) => {
		const out = generateTypes({
			configPath: "./cloudflare.config.ts",
			packageName: "@cloudflare/vite-plugin/experimental-config",
		});
		expect(out).toContain(`from "@cloudflare/vite-plugin/experimental-config"`);
		expect(out).not.toContain(`} from "@cloudflare/config"`);
	});

	it("strips .ts/.js/.mts/.mjs extensions from the config import path", ({
		expect,
	}) => {
		for (const ext of ["ts", "js", "mts", "mjs"]) {
			const out = generateTypes({ configPath: `./cloudflare.config.${ext}` });
			expect(out).toContain(`import type Config from "./cloudflare.config"`);
		}
	});
});
