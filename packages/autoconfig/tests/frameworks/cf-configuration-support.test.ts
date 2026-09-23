import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { getFrameworkClassInstance } from "../../src/frameworks";
import { createMockContext } from "../helpers/mock-context";
import type { ConfigurationOptions } from "../../src/frameworks/framework-class";

const OPTIONS = {
	target: "cf",
	projectPath: process.cwd(),
	workerName: "test-worker",
	outputDir: "dist",
	dryRun: true,
	packageManager: NpmPackageManager,
	isWorkspaceRoot: false,
	context: createMockContext(),
} as const satisfies ConfigurationOptions;

describe("cf framework configuration support", () => {
	it.for([
		"analog",
		"angular",
		"nuxt",
		"qwik",
		"solid-start",
		"svelte-kit",
		"vike",
		"waku",
	] as const)(
		"rejects %s projects with Wrangler guidance",
		async (id, { expect }) => {
			const framework = getFrameworkClassInstance(id);

			await expect(framework.configure(OPTIONS)).rejects.toThrow(
				`cf does not support automatic configuration for ${framework.name} projects yet. You can still use Wrangler to develop and deploy this project.`
			);
		}
	);
});
