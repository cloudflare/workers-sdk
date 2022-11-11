import { execSync } from "child_process";

const runProcess = () => {
	return execSync("npm run dev");
};

describe("Pages _worker.js", () => {
	it("should throw an error when the _worker.js file imports something", () => {
		expect(() => runProcess()).toThrowError();
	});
});
