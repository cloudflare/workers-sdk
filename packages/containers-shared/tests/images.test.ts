import { beforeEach, describe, it, vi } from "vitest";
import { prepareContainerImagesForDev } from "../src/images";

const { runDockerCmd, verifyDockerInstalled } = vi.hoisted(() => {
	return {
		runDockerCmd: vi.fn(() => {
			const ready = Promise.resolve({ aborted: false });
			return {
				abort: vi.fn(),
				ready,
				then: ready.then.bind(ready),
			};
		}),
		verifyDockerInstalled: vi.fn(),
	};
});

vi.mock("../src/utils", async (importOriginal) => {
	const mod: object = await importOriginal();
	return {
		...mod,
		runDockerCmd,
		verifyDockerInstalled,
	};
});

describe("prepareContainerImagesForDev", () => {
	beforeEach(() => {
		runDockerCmd.mockClear();
		verifyDockerInstalled.mockReset();
		verifyDockerInstalled.mockResolvedValue(undefined);
	});

	it("pulls the egress interceptor image without the experimental flag", async ({
		expect,
	}) => {
		await prepareContainerImagesForDev({
			dockerPath: "docker",
			containerOptions: [],
			onContainerImagePreparationStart: () => {},
			onContainerImagePreparationEnd: () => {},
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
			isVite: false,
		});

		expect(verifyDockerInstalled).toHaveBeenCalledWith("docker");
		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"pull",
			"cloudflare/proxy-everything:3f5e832@sha256:816255f5b6ebdc2cdcddb578d803121e7ee9cfe178442da07725d75a66cdcf37",
			"--platform",
			"linux/amd64",
		]);
	});
});
