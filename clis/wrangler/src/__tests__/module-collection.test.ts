import { extractPackageName } from "../deployment-bundle/module-collection";

describe("Module Collection", () => {
	describe("extractPackageName", () => {
		test.each`
			importString                           | packageName
			${"wrangler"}                          | ${"wrangler"}
			${"wrangler/example"}                  | ${"wrangler"}
			${"wrangler/example.wasm"}             | ${"wrangler"}
			${"@cloudflare/wrangler"}              | ${"@cloudflare/wrangler"}
			${"@cloudflare/wrangler/example"}      | ${"@cloudflare/wrangler"}
			${"@cloudflare/wrangler/example.wasm"} | ${"@cloudflare/wrangler"}
			${"./some/file"}                       | ${null}
			${"../some/file"}                      | ${null}
			${"/some/file"}                        | ${null}
		`("$importString --> $packageName", ({ importString, packageName }) => {
			expect(extractPackageName(importString)).toBe(packageName);
		});
	});
});
