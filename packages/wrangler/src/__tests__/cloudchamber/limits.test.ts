import {
	dockerImageInspect,
	InstanceType,
} from "@cloudflare/containers-shared";
/* eslint-disable workers-sdk/no-vitest-import-expect -- tests use expect with rejects patterns */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import {
	ensureContainerLimits,
	ensureImageFitsLimits,
} from "../../cloudchamber/limits";
import type {
	CompleteAccountCustomer,
	ContainerNormalizedConfig,
} from "@cloudflare/containers-shared";

const MB = 1000 * 1000;
const commonLimits = {
	vcpu_per_deployment: 4,
	memory_mib_per_deployment: 12288,
	disk_mb_per_deployment: 20000,
};

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		dockerImageInspect: vi.fn(),
	});
});

describe("ensureContainerLimits", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Returns image size and number of layers - used to calculate required size.
		// required size = 53387881 * 1.1 + 2 * 16 * MiB = 93MB
		vi.mocked(dockerImageInspect).mockResolvedValue("53387881 2");
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("instance type", async () => {
		it("should throw error if vcpu is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: {
							...commonLimits,
							vcpu_per_deployment: 0.0625,
						},
					} as CompleteAccountCustomer,
					containerConfig: {
						instance_type: InstanceType.STANDARD,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 0.5 vCPU which exceeds the account limit of 0.0625 vCPU.]`
			);
		});

		it("should throw error if memory is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: {
							...commonLimits,
							memory_mib_per_deployment: 1024,
						},
					} as CompleteAccountCustomer,
					containerConfig: {
						instance_type: InstanceType.STANDARD,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 4096 MiB of memory which exceeds the account limit of 1024 MiB.]`
			);
		});

		it("should throw error if disk is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: {
							...commonLimits,
							disk_mb_per_deployment: 2000,
						},
					} as CompleteAccountCustomer,
					containerConfig: {
						instance_type: InstanceType.STANDARD,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 8000 MB of disk which exceeds the account limit of 2000 MB.]`
			);
		});

		it("should succeed when instance type fits in limits", async () => {
			const result = await ensureContainerLimits({
				pathToDocker: "path/to/docker",
				imageTag: "docker.io/test-app:tag",
				account: {
					limits: commonLimits,
				} as CompleteAccountCustomer,
				containerConfig: {
					instance_type: InstanceType.STANDARD,
				} as ContainerNormalizedConfig,
			});
			expect(result).toBeUndefined();
		});
	});

	describe("custom limits", async () => {
		it("should throw error if vcpu is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: commonLimits,
					} as CompleteAccountCustomer,
					containerConfig: {
						vcpu: 5,
						memory_mib: 4096,
						disk_bytes: 4000 * MB,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 5 vCPU which exceeds the account limit of 4 vCPU.]`
			);
		});

		it("should throw error if memory is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: commonLimits,
					} as CompleteAccountCustomer,
					containerConfig: {
						vcpu: 1,
						memory_mib: 999999,
						disk_bytes: 4000 * MB,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 999999 MiB of memory which exceeds the account limit of 12288 MiB.]`
			);
		});

		it("should throw error if disk is greater than limit", async () => {
			await expect(() =>
				ensureContainerLimits({
					pathToDocker: "path/to/docker",
					imageTag: "docker.io/test-app:tag",
					account: {
						limits: commonLimits,
					} as CompleteAccountCustomer,
					containerConfig: {
						vcpu: 1,
						memory_mib: 4096,
						disk_bytes: 60000 * MB,
					} as ContainerNormalizedConfig,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Exceeded account limits: Your container configuration uses 60000 MB of disk which exceeds the account limit of 20000 MB.]`
			);
		});

		it("should succeed when configuration fits in limits", async () => {
			const result = await ensureContainerLimits({
				pathToDocker: "path/to/docker",
				imageTag: "docker.io/test-app:tag",
				account: {
					limits: commonLimits,
				} as CompleteAccountCustomer,
				containerConfig: {
					vcpu: 1,
					memory_mib: 4096,
					disk_bytes: 4000 * MB,
				} as ContainerNormalizedConfig,
			});
			expect(result).toBeUndefined();
		});
	});
});

describe("ensureImageFitsLimits", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should throw error if image size exceeds allowed size", async () => {
		// required size = 907387881 * 1.1 + 128 * 16 * MiB = 3146MB
		vi.mocked(dockerImageInspect).mockResolvedValue("907387881 128");

		await expect(() =>
			ensureImageFitsLimits({
				availableSizeInBytes: 2000 * MB,
				pathToDocker: "path/to/docker",
				imageTag: "docker.io/test-app:tag",
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Image too large: needs 3146MB, but your app is limited to images with size 2000MB. Your need more disk for this image.]`
		);

		expect(dockerImageInspect).toHaveBeenCalledExactlyOnceWith(
			"path/to/docker",
			{
				imageTag: `docker.io/test-app:tag`,
				formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
			}
		);
	});

	it("should not throw when disk size is within limits", async () => {
		// required size = 53387881 * 1.1 + 2 * 16 * MiB = 93MB
		vi.mocked(dockerImageInspect).mockResolvedValue("53387881 2");

		const result = await ensureImageFitsLimits({
			availableSizeInBytes: 2000 * MB,
			pathToDocker: "path/to/docker",
			imageTag: "docker.io/test-app:tag",
		});

		expect(dockerImageInspect).toHaveBeenCalledExactlyOnceWith(
			"path/to/docker",
			{
				imageTag: `docker.io/test-app:tag`,
				formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
			}
		);
		expect(result).toEqual(undefined);
	});
});
