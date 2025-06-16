import { mkdirSync, rmSync, writeFileSync } from "fs";
import { isDockerfile } from "./../src/utils";
import { runInTempDir } from "./helpers/run-in-tmp-dir";

describe("isDockerfile", () => {
	const dockerfile =
		'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]';

	runInTempDir();

	beforeEach(() => {
		mkdirSync("./container-context");
		writeFileSync("./container-context/Dockerfile", dockerfile);
	});

	it("should return true if given a valid dockerfile path", async () => {
		expect(isDockerfile("./container-context/Dockerfile")).toBe(true);
	});

	it("should return false if given a valid image registry path", async () => {
		expect(isDockerfile("docker.io/httpd:1")).toBe(false);
	});

	it("should error if given a non existant dockerfile", async () => {
		expect(() => isDockerfile("./FakeDockerfile"))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "./FakeDockerfile" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)]
			`);
	});

	it("should error if given a directory instead of a dockerfile", async () => {
		expect(() => isDockerfile("./container-context"))
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: ./container-context is a directory, you should specify a path to the Dockerfile]
		`);
	});

	it("should error if image registry reference contains the protocol part", async () => {
		expect(() => isDockerfile("http://example.com/image:tag"))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "http://example.com/image:tag" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				Image reference should not include the protocol part (e.g: docker.io/httpd:1, not https://docker.io/httpd:1)]
			`);
	});

	it("should error if image registry reference does not contain a tag", async () => {
		expect(() => isDockerfile("docker.io/httpd"))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "docker.io/httpd" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)]
			`);
	});
});
