import * as fs from "node:fs";
import { dirname } from "node:path";
import {
	constructBuildCommand,
	ensureDiskLimits,
} from "../../cloudchamber/build";
import { resolveAppDiskSize } from "../../cloudchamber/common";
import { getBuildArguments } from "../../cloudchamber/deploy";
import { type ContainerApp } from "../../config/environment";
import type { CompleteAccountCustomer } from "../../cloudchamber/client";

const MiB = 1024 * 1024;
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

		it("should add --network=host flag if WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST is set", async () => {
			vi.stubEnv("WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST", "true");
			const bc = await constructBuildCommand({
				imageTag: "test-registry/no-bc:v1",
				pathToDockerfile: "bogus/path",
			});
			expect(bc).toEqual(
				"docker build -t registry.cloudchamber.cfdata.org/test-registry/no-bc:v1 --platform linux/amd64 --network=host bogus/path"
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
				container: { image: writeDockerfile(), ...defaultConfiguration },
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

	describe("ensureDiskLimits", () => {
		const accountBase = {
			limits: { disk_mb_per_deployment: 2000 },
		} as CompleteAccountCustomer;

		it("should throw error if app configured disk exceeds account limit", async () => {
			await expect(() =>
				ensureDiskLimits({
					requiredSize: 333 * MiB, // 333MiB
					account: accountBase,
					containerApp: {
						...defaultConfiguration,
						configuration: {
							image: "",
							disk: { size: "3GB" }, // This exceeds the account limit of 2GB
						},
					},
				})
			).rejects.toThrow("Exceeded account limits");
		});

		it("should throw error if image size exceeds allowed size", async () => {
			await expect(() =>
				ensureDiskLimits({
					requiredSize: 3000 * MiB, // 3GiB
					account: accountBase,
					containerApp: undefined,
				})
			).rejects.toThrow("Image too large");
		});

		it("should not throw when disk size is within limits", async () => {
			const result = await ensureDiskLimits({
				requiredSize: 256 * MiB, // 256MiB
				account: accountBase,
				containerApp: undefined,
			});

			expect(result).toEqual(undefined);
		});
	});

	describe("resolveAppDiskSize", () => {
		const accountBase = {
			limits: { disk_mb_per_deployment: 2000 },
		} as CompleteAccountCustomer;
		it("should return parsed app disk size", () => {
			const result = resolveAppDiskSize(accountBase, {
				...defaultConfiguration,
				configuration: { image: "", disk: { size: "500MB" } },
			});
			expect(result).toBeCloseTo(500 * 1000 * 1000, -5);
		});

		it("should return default size when disk size not set", () => {
			const result = resolveAppDiskSize(accountBase, {
				...defaultConfiguration,
				configuration: { image: "" },
			});
			expect(result).toBeCloseTo(2 * 1000 * 1000 * 1000, -5);
		});

		it("should return undefined if app is not passed", () => {
			expect(resolveAppDiskSize(accountBase, undefined)).toBeUndefined();
		});
	});
});
