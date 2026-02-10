import { describe, it } from "vitest";
import { getFramework } from "../../../autoconfig/frameworks/get-framework";

describe("getFramework()", () => {
	it("should return a Static framework when frameworkId is undefined", ({
		expect,
	}) => {
		const framework = getFramework(undefined);

		expect(framework.id).toBe("static");
		expect(framework.name).toBe("Static");
	});

	it("should return a Static framework when frameworkId is unknown", ({
		expect,
	}) => {
		const framework = getFramework("unknown-framework");

		expect(framework.id).toBe("static");
		expect(framework.name).toBe("Static");
	});

	it("should return a target framework when frameworkId is known", ({
		expect,
	}) => {
		const framework = getFramework("next");

		expect(framework.id).toBe("next");
		expect(framework.name).toBe("Next.js");
	});
});
