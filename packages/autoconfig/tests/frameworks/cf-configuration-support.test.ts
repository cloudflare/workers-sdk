import { describe, it } from "vitest";
import {
	getFrameworkClassInstance,
	validateFrameworkTargetSupport,
} from "../../src/frameworks";

const WRANGLER_ONLY_FRAMEWORKS = [
	"analog",
	"angular",
	"nuxt",
	"qwik",
	"solid-start",
	"svelte-kit",
	"vike",
	"waku",
] as const;

describe("cf framework configuration support", () => {
	it.for(WRANGLER_ONLY_FRAMEWORKS)(
		"rejects %s projects with Wrangler guidance",
		(id, { expect }) => {
			const framework = getFrameworkClassInstance(id);

			expect(() => validateFrameworkTargetSupport(framework, "cf")).toThrow(
				`cf does not support ${framework.name} projects yet. You can still use Wrangler to develop and deploy this project.`
			);
		}
	);

	it.for(WRANGLER_ONLY_FRAMEWORKS)(
		"allows %s projects when targeting Wrangler",
		(id, { expect }) => {
			const framework = getFrameworkClassInstance(id);

			expect(() =>
				validateFrameworkTargetSupport(framework, "wrangler")
			).not.toThrow();
		}
	);

	it.for([
		"astro",
		"next",
		"react-router",
		"static",
		"tanstack-start",
		"vite",
	] as const)("allows %s projects when targeting cf", (id, { expect }) => {
		const framework = getFrameworkClassInstance(id);

		expect(() => validateFrameworkTargetSupport(framework, "cf")).not.toThrow();
	});
});
