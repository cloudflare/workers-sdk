import {
	generateRuntimeTypes,
	RUNTIME_TYPES_MARKER,
} from "@cloudflare/runtime-types";
import { test } from "vitest";

test("generates and reuses real runtime types for experimental configuration", async ({
	expect,
}) => {
	const options = { compatibilityDate: "2026-10-12" };
	const generated = await generateRuntimeTypes(options);
	expect(generated.isCached).toBe(false);
	expect(generated.runtimeHeader).toContain("2026-10-12");
	expect(generated.runtimeTypes).toMatch(/(?:class|interface) Request\b/);

	const cached = await generateRuntimeTypes({
		...options,
		existingContent: [
			generated.runtimeHeader,
			RUNTIME_TYPES_MARKER,
			generated.runtimeTypes,
		].join("\n"),
	});
	expect(cached.isCached).toBe(true);
	expect(cached.runtimeHeader).toBe(generated.runtimeHeader);
	expect(cached.runtimeTypes).toBe(generated.runtimeTypes);
});
