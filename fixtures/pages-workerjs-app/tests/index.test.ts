import { execSync } from "child_process";
import path from "path";
import { describe, it } from "vitest";

describe.concurrent("Pages _worker.js", () => {
	it("should throw an error when the _worker.js file imports something", ({
		expect,
	}) => {
		expect(() =>
			execSync("npm run dev", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});
});
