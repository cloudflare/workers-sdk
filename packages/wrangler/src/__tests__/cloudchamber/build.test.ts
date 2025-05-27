import * as fs from "node:fs";
import { dirname } from "node:path";
import { constructBuildCommand } from "@cloudflare/containers-shared";
import { getBuildArguments } from "../../cloudchamber/deploy";
import { type ContainerApp } from "../../config/environment";

const defaultConfiguration: ContainerApp = {
	name: "abc",
	class_name: "",
	instances: 0,
	configuration: { image: "" },
};

function writeDockerfile(dockerfile = "FROM scratch\n"): string {
	const path = "./Dockerfile";
	fs.mkdirSync(dirname(path), { recursive: true });
	fs.writeFileSync(path, dockerfile, "utf-8");
	return path;
}

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

	describe("get build arguments", () => {
		it("should get build arguments", () => {
			const buildArguments = getBuildArguments(
				{ image: writeDockerfile(), ...defaultConfiguration },
				"1234"
			);
			expect(buildArguments).toEqual({
				dockerfileContents: "FROM scratch\n",
				isDockerImage: true,
				pathToDocker: "docker",
				pathToDockerfileDirectory: ".",
				push: true,
				tag: "abc:1234",
			});
		});

		it("should get build arguments with an image ref", () => {
			const buildArguments = getBuildArguments(
				{ image: "docker.io/httpd:1", ...defaultConfiguration },
				"1234"
			);
			expect(buildArguments).toEqual({
				isDockerImage: false,
			});
		});

		it("should fail to get build arguments with non existant dockerfile", () => {
			try {
				getBuildArguments(
					{ image: "./Dockerfile2", ...defaultConfiguration },
					"1234"
				);
				throw new Error("expected to throw an error");
			} catch (err) {
				expect(err).toHaveProperty(
					"message",
					"The image ./Dockerfile2 could not be found, and the image is not a valid reference: image needs to include atleast a tag ':' (e.g: docker.io/httpd:1)"
				);
			}
		});

		it("should fail to get build arguments with invalid image ref", () => {
			try {
				getBuildArguments(
					{ image: "http://docker.io", ...defaultConfiguration },
					"1234"
				);
				throw new Error("expected to throw an error");
			} catch (err) {
				expect(err).toHaveProperty(
					"message",
					"The image http://docker.io could not be found, and the image is not a valid reference: image needs to include atleast a tag ':' (e.g: docker.io/httpd:1)"
				);
			}
		});
	});
});
