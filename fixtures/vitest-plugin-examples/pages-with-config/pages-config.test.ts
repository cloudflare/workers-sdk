import { it } from "vitest";

it("should run tests even if Pages project specifies wrangler config file", ({
	expect,
}) => {
	expect(1).toBe(1);
});
