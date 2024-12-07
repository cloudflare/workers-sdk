import { constructBuildCommand } from "../../cloudchamber/build";

describe("cloudchamber build", () => {
	describe("build command generation", () => {
		it("should work with no build command set", async () => {
			const bc = await constructBuildCommand({
				imageTag: "test-registry/no-bc:v1",
				pathToDockerfile: "bogus/path",
			});
			expect(bc).toEqual(
				"build -t registry.cloudchamber.cfdata.org/test-registry/no-bc:v1 --platform linux/amd64 bogus/path"
			);
		});
		it("should work with a build command set", async () => {
			const bc = await constructBuildCommand({
				customBuildCommand: "test-build -t thing:v2 --platform fake",
			});
			expect(bc).toEqual("test-build -t thing:v2 --platform fake");
		});
	});
});
