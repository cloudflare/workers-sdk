import { mkdirSync, writeFileSync } from "fs";
import { checkExposedPorts, isDockerfile } from "./../src/utils";
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
		expect(isDockerfile("./container-context/Dockerfile", undefined)).toBe(
			true
		);
	});

	it("should find a dockerfile relative to the wrangler config path", async () => {
		expect(
			isDockerfile("./Dockerfile", "./container-context/wrangler.json")
		).toBe(true);
	});

	it("should return false if given a valid image registry path", async () => {
		expect(isDockerfile("docker.io/httpd:1", undefined)).toBe(false);
	});

	it("should error if given a non existant dockerfile", async () => {
		expect(() => isDockerfile("./FakeDockerfile", undefined))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "./FakeDockerfile" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)]
			`);
	});

	it("should error if given a directory instead of a dockerfile", async () => {
		expect(() => isDockerfile("./container-context", undefined))
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: ./container-context is a directory, you should specify a path to the Dockerfile]
		`);
	});

	it("should error if image registry reference contains the protocol part", async () => {
		expect(() => isDockerfile("http://example.com/image:tag", undefined))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "http://example.com/image:tag" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				Image reference should not include the protocol part (e.g: docker.io/httpd:1, not https://docker.io/httpd:1)]
			`);
	});

	it("should error if image registry reference does not contain a tag", async () => {
		expect(() => isDockerfile("docker.io/httpd", undefined))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The image "docker.io/httpd" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
				If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)]
			`);
	});
});

let docketImageInspectResult = "0";

vi.mock("../src/inspect", async (importOriginal) => {
	const mod: object = await importOriginal();
	return {
		...mod,
		dockerImageInspect: () => docketImageInspectResult,
	};
});

describe("checkExposedPorts", () => {
	beforeEach(() => {
		docketImageInspectResult = "1";
	});

	it("should not error when some ports are exported", async () => {
		docketImageInspectResult = "1";
		await expect(
			checkExposedPorts("./container-context/Dockerfile", {
				image: "",
				imageTag: "",
				class_name: "MyContainer",
			})
		).resolves.toBeUndefined();
	});

	it("should error, with an appropriate message when no ports are exported", async () => {
		docketImageInspectResult = "0";
		expect(
			checkExposedPorts("./container-context/Dockerfile", {
				image: "",
				imageTag: "",
				class_name: "MyContainer",
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: The container "MyContainer" does not expose any ports. In your Dockerfile, please expose any ports you intend to connect to.
				For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.
				]
			`);
	});
});
