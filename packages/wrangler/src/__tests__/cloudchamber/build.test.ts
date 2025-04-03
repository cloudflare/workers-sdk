import { constructBuildCommand } from "../../cloudchamber/build";

describe("cloudchamber build", () => {
	describe("build command generation", () => {
		it("should work with no build command set", async () => {
			const bc = await constructBuildCommand({
				imageTag: "test-registry/no-bc:v1",
				pathToDockerfile: "bogus/path",
			});
			expect(bc).toEqual(
				"docker build -t registry.cloudchamber.cfdata.org/test-registry/no-bc:v1 --platform linux/amd64 bogus/path"
			);
		});

		it("should error if dockerfile provided without a tag", async () => {
			await expect(
				constructBuildCommand({
					pathToDockerfile: "bogus/path",
				})
			).rejects.toThrowError();
		});

		it("should respect a custom path to docker", async () => {
			const bc = await constructBuildCommand({
				pathToDocker: "/my/special/path/docker",
				imageTag: "test-registry/no-bc:v1",
				pathToDockerfile: "bogus/path",
			});
			expect(bc).toEqual(
				"/my/special/path/docker build -t registry.cloudchamber.cfdata.org/test-registry/no-bc:v1 --platform linux/amd64 bogus/path"
			);
		});

		it("should respect passed in platform", async () => {
			const bc = await constructBuildCommand({
				imageTag: "test-registry/no-bc:v1",
				pathToDockerfile: "bogus/path",
				platform: "linux/arm64",
			});
			expect(bc).toEqual(
				"docker build -t registry.cloudchamber.cfdata.org/test-registry/no-bc:v1 --platform linux/arm64 bogus/path"
			);
		});
	});
});
