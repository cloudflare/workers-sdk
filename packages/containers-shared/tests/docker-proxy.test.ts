import { describe, it } from "vitest";
import { isNamedPipeAddress, normalizePipePath } from "../src/docker-proxy";

describe("isNamedPipeAddress", () => {
	it("recognises Windows named pipe host forms", ({ expect }) => {
		expect(isNamedPipeAddress("//./pipe/docker_engine")).toBe(true);
		expect(isNamedPipeAddress("npipe:////./pipe/docker_engine")).toBe(true);
		expect(isNamedPipeAddress("\\\\.\\pipe\\docker_engine")).toBe(true);
	});

	it("does not treat TCP or unix addresses as named pipes", ({ expect }) => {
		expect(isNamedPipeAddress("127.0.0.1:2375")).toBe(false);
		expect(isNamedPipeAddress("tcp://localhost:2375")).toBe(false);
		expect(isNamedPipeAddress("unix:///var/run/docker.sock")).toBe(false);
	});
});

describe("normalizePipePath", () => {
	it("normalises all host forms to a canonical Windows pipe path", ({
		expect,
	}) => {
		const expected = "\\\\.\\pipe\\docker_engine";
		expect(normalizePipePath("//./pipe/docker_engine")).toBe(expected);
		expect(normalizePipePath("npipe:////./pipe/docker_engine")).toBe(expected);
		expect(normalizePipePath("\\\\.\\pipe\\docker_engine")).toBe(expected);
	});

	it("preserves a custom pipe name", ({ expect }) => {
		expect(normalizePipePath("//./pipe/my_custom_engine")).toBe(
			"\\\\.\\pipe\\my_custom_engine"
		);
	});
});
