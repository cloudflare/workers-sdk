import { FUSE_CONTAINER_PRIVILEGES } from "@cloudflare/containers-shared";
import { describe, it } from "vitest";
import { getImageNameFromDOClassName } from "../../dev/miniflare";

describe("getImageNameFromDOClassName", () => {
	it("returns container options for configured DO containers", ({ expect }) => {
		expect(
			getImageNameFromDOClassName({
				doClassName: "ExampleContainer",
				containerDOClassNames: new Set(["ExampleContainer"]),
				containerBuildId: "build-123",
			})
		).toEqual({ imageName: "cloudflare-dev/examplecontainer:build-123" });
	});

	it("adds resolved container privileges when present", ({ expect }) => {
		expect(
			getImageNameFromDOClassName({
				doClassName: "ExampleContainer",
				containerDOClassNames: new Set(["ExampleContainer"]),
				containerBuildId: "build-123",
				containerPrivileges: FUSE_CONTAINER_PRIVILEGES,
			})
		).toEqual({
			imageName: "cloudflare-dev/examplecontainer:build-123",
			privileges: FUSE_CONTAINER_PRIVILEGES,
		});
	});

	it("returns undefined for DOs without containers", ({ expect }) => {
		expect(
			getImageNameFromDOClassName({
				doClassName: "ExampleDurableObject",
				containerDOClassNames: new Set(["ExampleContainer"]),
				containerBuildId: "build-123",
				containerPrivileges: FUSE_CONTAINER_PRIVILEGES,
			})
		).toBeUndefined();
	});
});
