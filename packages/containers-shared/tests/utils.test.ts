import { mkdirSync, writeFileSync } from "fs";
import {
	checkExposedPorts,
	isDockerfile,
	parseImageName,
} from "./../src/utils";
import { runInTempDir } from "./helpers/run-in-tmp-dir";
import type { ContainerDevOptions } from "../src/types";

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

const containerConfig = {
	dockerfile: "",
	class_name: "MyContainer",
} as ContainerDevOptions;
describe("checkExposedPorts", () => {
	beforeEach(() => {
		docketImageInspectResult = "1";
	});

	it("should not error when some ports are exported", async () => {
		docketImageInspectResult = "1";
		await expect(
			checkExposedPorts("docker", containerConfig)
		).resolves.toBeUndefined();
	});

	it("should error, with an appropriate message when no ports are exported", async () => {
		docketImageInspectResult = "0";
		await expect(checkExposedPorts("docker", containerConfig)).rejects
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The container "MyContainer" does not expose any ports. In your Dockerfile, please expose any ports you intend to connect to.
				For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.
				]
			`);
	});
});

describe("parseImageName", () => {
	test.concurrent.for<
		[
			string,
			{
				host?: string;
				name?: string;
				tag?: string;
				digest?: string;
				err?: string;
			},
		]
	>([
		// With hostname and namespace
		[
			"docker.io/cloudflare/hello-world:1.0",
			{ host: "docker.io", name: "cloudflare/hello-world", tag: "1.0" },
		],

		// With hostname and no namespace
		[
			"docker.io/hello-world:1.0",
			{ host: "docker.io", name: "hello-world", tag: "1.0" },
		],

		// Hostname with port
		[
			"localhost:7777/web:local",
			{ host: "localhost:7777", name: "web", tag: "local" },
		],
		[
			"registry.com:1234/foo/bar:local",
			{ host: "registry.com:1234", name: "foo/bar", tag: "local" },
		],

		// No hostname
		["hello-world:1.0", { name: "hello-world", tag: "1.0" }],

		// No hostname with namespace
		[
			"cloudflare/hello-world:1.0",
			{ name: "cloudflare/hello-world", tag: "1.0" },
		],

		// Hostname with sha256 digest
		[
			"registry.cloudflare.com/hello/world:1.0@sha256:abcdef0123456789",
			{
				host: "registry.cloudflare.com",
				name: "hello/world",
				tag: "1.0",
				digest: "sha256:abcdef0123456789",
			},
		],

		// With sha256 digest
		[
			"hello/world:1.0@sha256:abcdef0123456789",
			{ name: "hello/world", tag: "1.0", digest: "sha256:abcdef0123456789" },
		],

		// sha256 digest but no tag
		[
			"hello/world@sha256:abcdef0123456789",
			{ name: "hello/world", digest: "sha256:abcdef0123456789" },
		],

		// Invalid name
		[
			"bad image name:1",
			{
				err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
			},
		],

		// Missing tag
		[
			"no-tag",
			{
				err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
			},
		],
		[
			"no-tag:",
			{
				err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
			},
		],

		// Invalid tag
		[
			"no-tag::",
			{
				err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
			},
		],

		// latest tag
		["name:latest", { err: '"latest" tag is not allowed' }],

		// Too many colons
		[
			"registry.com:1234/foobar:4444/image:sometag",
			{
				err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
			},
		],
	])("%s", ([input, expected], { expect }) => {
		let result;
		try {
			result = parseImageName(input);
		} catch (err) {
			assert.instanceOf(err, Error);
			expect(err.message).toEqual(expected.err);
			return;
		}

		expect(result.host).toEqual(expected.host);
		expect(result.name).toEqual(expected.name);
		expect(result.tag).toEqual(expected.tag);
		expect(result.digest).toEqual(expected.digest);
	});
});
