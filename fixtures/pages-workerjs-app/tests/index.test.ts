import { execSync } from "child_process";
import path from "path";

describe("Pages _worker.js", () => {
	it.concurrent(
		"should throw an error when the _worker.js file imports something",
		() => {
			expect(() =>
				execSync("npm run dev", { cwd: path.resolve(__dirname, "..") })
			).toThrowError();
		}
	);
});
