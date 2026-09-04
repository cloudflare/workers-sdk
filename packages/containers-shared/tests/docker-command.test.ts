import { describe, it } from "vitest";
import {
	getDockerCommandArgs,
	getDockerHostFromContainerEngine,
} from "../src/docker-command";

const dockerHost = "unix:///custom/docker.sock";

describe("Docker endpoint helpers", () => {
	it("places an explicit host before the command", ({ expect }) => {
		expect(getDockerCommandArgs(["context", "ls"])).toEqual(["context", "ls"]);
		expect(getDockerCommandArgs(["image", "inspect"], dockerHost)).toEqual([
			"--host",
			dockerHost,
			"image",
			"inspect",
		]);
	});

	it("reads string and structured container engines", ({ expect }) => {
		expect(getDockerHostFromContainerEngine(dockerHost)).toBe(dockerHost);
		expect(
			getDockerHostFromContainerEngine({
				localDocker: { socketPath: dockerHost },
			})
		).toBe(dockerHost);
	});
});
