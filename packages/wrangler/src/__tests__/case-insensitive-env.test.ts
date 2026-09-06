import { describe, it } from "vitest";
import { caseInsensitiveEnv } from "../config/case-insensitive-env";

describe("caseInsensitiveEnv", () => {
	it("resolves get/has/delete case-insensitively", ({ expect }) => {
		const env = caseInsensitiveEnv();
		env.PATH = "1";

		expect(env.PATH).toBe("1");
		expect(env.Path).toBe("1");
		expect(env.path).toBe("1");
		expect("path" in env).toBe(true);

		delete env.path;
		expect("PATH" in env).toBe(false);
	});

	it("does not leak a stale differently-cased key when a value is overridden", ({
		expect,
	}) => {
		const env = caseInsensitiveEnv();
		env.PATH = "1";
		env.Path = "2";

		// Only the most recently set casing should remain as an own key -
		// enumeration (Object.keys/JSON.stringify/for...in/spread) must not
		// see both "PATH" and "Path".
		expect(Object.keys(env)).toEqual(["Path"]);
		expect(JSON.stringify(env)).toBe('{"Path":"2"}');
		expect({ ...env }).toEqual({ Path: "2" });
		expect(env.PATH).toBe("2");
	});

	it("removes the tracked property when deleted under a different casing", ({
		expect,
	}) => {
		const env = caseInsensitiveEnv();
		env.FOO = "x";

		delete env.foo;

		expect(Object.keys(env)).toEqual([]);
		expect("FOO" in env).toBe(false);
		expect(env.FOO).toBeUndefined();
	});
});
