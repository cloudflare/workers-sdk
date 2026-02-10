import { beforeEach, describe, it, vi } from "vitest";
import { checkExposedPorts } from "./../src/utils";
import type { ContainerDevOptions } from "../src/types";

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

	it("should not error when some ports are exported", async ({ expect }) => {
		docketImageInspectResult = "1";
		await expect(
			checkExposedPorts("docker", containerConfig)
		).resolves.toBeUndefined();
	});

	it("should error, with an appropriate message when no ports are exported", async ({
		expect,
	}) => {
		docketImageInspectResult = "0";
		await expect(checkExposedPorts("docker", containerConfig)).rejects
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: The container "MyContainer" does not expose any ports. In your Dockerfile, please expose any ports you intend to connect to.
				For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.
				]
			`);
	});
});
