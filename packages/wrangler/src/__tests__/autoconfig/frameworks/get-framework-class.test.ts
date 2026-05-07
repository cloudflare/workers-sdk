import { describe, it } from "vitest";
import { getFrameworkClassInstance } from "../../../autoconfig/frameworks";
import { NextJs } from "../../../autoconfig/frameworks/next";
import { NoOpFramework } from "../../../autoconfig/frameworks/no-op";
import { Static } from "../../../autoconfig/frameworks/static";

describe("getFrameworkClassInstance()", () => {
	it("should return a Static framework when frameworkId is unknown", ({
		expect,
	}) => {
		const framework = getFrameworkClassInstance("unknown-framework");

		expect(framework).toBeInstanceOf(Static);
		expect(framework.id).toBe("static");
		expect(framework.name).toBe("Static");
	});

	it("should return a target framework when frameworkId is known and supported", ({
		expect,
	}) => {
		const framework = getFrameworkClassInstance("next");

		expect(framework).toBeInstanceOf(NextJs);
		expect(framework.id).toBe("next");
		expect(framework.name).toBe("Next.js");
	});

	it("should return a NoOpFramework for an unsupported framework (hono)", ({
		expect,
	}) => {
		const framework = getFrameworkClassInstance("hono");

		expect(framework).toBeInstanceOf(NoOpFramework);
		expect(framework.id).toBe("hono");
		expect(framework.name).toBe("Hono");
	});
});
