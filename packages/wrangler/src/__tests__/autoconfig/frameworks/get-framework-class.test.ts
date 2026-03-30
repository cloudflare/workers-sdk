import { describe, it } from "vitest";
import { getFrameworkClass } from "../../../autoconfig/frameworks";
import { NextJs } from "../../../autoconfig/frameworks/next";
import { Static } from "../../../autoconfig/frameworks/static";

describe("getFrameworkClass()", () => {
	it("should return a Static framework when frameworkId is unknown", ({
		expect,
	}) => {
		const framework = getFrameworkClass("unknown-framework");

		expect(framework).toBeInstanceOf(Static);
		expect(framework.id).toBe("static");
		expect(framework.name).toBe("Static");
	});

	it("should return a target framework when frameworkId is known", ({
		expect,
	}) => {
		const framework = getFrameworkClass("next");

		expect(framework).toBeInstanceOf(NextJs);
		expect(framework.id).toBe("next");
		expect(framework.name).toBe("Next.js");
	});
});
