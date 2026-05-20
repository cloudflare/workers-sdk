import { execFileSync } from "node:child_process";
import { beforeEach, describe, it, vi } from "vitest";
import { checkExposedPorts, cleanupDuplicateImageTags } from "./../src/utils";
import type { ContainerDevOptions } from "../src/types";

let docketImageInspectResult = "0";

vi.mock("node:child_process");

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
		vi.mocked(execFileSync).mockReset();
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

describe("cleanupDuplicateImageTags", () => {
	beforeEach(() => {
		docketImageInspectResult = "";
		vi.mocked(execFileSync).mockReset();
		vi.mocked(execFileSync).mockReturnValue("");
	});

	it("does not remove sibling container tags from the same dev session", async ({
		expect,
	}) => {
		docketImageInspectResult = [
			"cloudflare-dev/egresstestcontainer:build-123",
			"cloudflare-dev/egresstest1container:build-123",
		].join("\n");

		await cleanupDuplicateImageTags(
			"docker",
			"cloudflare-dev/egresstest1container:build-123"
		);

		expect(execFileSync).not.toHaveBeenCalled();
	});

	it("removes stale cloudflare-dev tags from previous dev sessions", async ({
		expect,
	}) => {
		docketImageInspectResult = [
			"cloudflare-dev/egresstestcontainer:build-123",
			"cloudflare-dev/egresstest1container:build-123",
			"cloudflare-dev/egresstestcontainer:build-122",
			"user/image:latest",
		].join("\n");

		await cleanupDuplicateImageTags(
			"docker",
			"cloudflare-dev/egresstest1container:build-123"
		);

		expect(execFileSync).toHaveBeenCalledOnce();
		expect(execFileSync).toHaveBeenCalledWith(
			"docker",
			["rmi", "cloudflare-dev/egresstestcontainer:build-122"],
			{ encoding: "utf8" }
		);
	});
});
