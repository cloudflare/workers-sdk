import { execFileSync } from "node:child_process";
import { beforeEach, describe, it, vi } from "vitest";
import { checkExposedPorts, cleanupDuplicateImageTags } from "./../src/utils";
import type { ContainerDevOptions } from "../src/types";

let docketImageInspectResult = "0";

vi.mock("../src/inspect", async (importOriginal) => {
	const mod: object = await importOriginal();
	return {
		...mod,
		dockerImageInspect: () => docketImageInspectResult,
	};
});

vi.mock("node:child_process");

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

// Regression test for a bug where cleaning up stale image tags from a previous
// dev session would also remove tags belonging to other, still-active container
// classes. This happens when multiple container classes share the same underlying
// Docker image (e.g. built from the same Dockerfile) and therefore all live under
// the "cloudflare-dev/*" namespace on the same image.
//
// The original filter matched any tag starting with "cloudflare-dev", so cleaning
// up class `foo` would wipe out `bar`'s tags too. The fix narrows the filter to
// the exact repository (class name), so only stale tags for the same class are
// removed.
describe("cleanupDuplicateImageTags", () => {
	beforeEach(() => {
		vi.mocked(execFileSync).mockReset();
	});

	it("only removes stale tags from the same repository, leaving sibling classes alone", async ({
		expect,
	}) => {
		// Simulate the RepoTags that `docker image inspect` would return for an
		// image shared between two classes (`foo` and `bar`). Each class has a
		// current tag and a stale tag from a previous dev session.
		docketImageInspectResult = [
			"cloudflare-dev/foo:build-current",
			"cloudflare-dev/foo:build-old",
			"cloudflare-dev/bar:build-current",
			"cloudflare-dev/bar:build-old",
		].join("\n");

		// Run cleanup as if we just (re)built `foo`. Only `foo:build-old` should
		// be removed; `bar`'s tags must be untouched because `bar` is still in
		// use and will manage its own cleanup.
		await cleanupDuplicateImageTags(
			"docker",
			"cloudflare-dev/foo:build-current"
		);

		// Asserting on the exact args passed to `docker rmi` guards against the
		// original bug: if the filter ever regresses to matching the whole
		// `cloudflare-dev` prefix, this call would include the `bar` tags and
		// the assertion would fail.
		expect(vi.mocked(execFileSync)).toHaveBeenCalledOnce();
		const [, args] = vi.mocked(execFileSync).mock.calls[0];
		expect(args).toEqual(["rmi", "cloudflare-dev/foo:build-old"]);
	});
});
