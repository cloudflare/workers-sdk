import { InstanceType } from "@cloudflare/containers-shared";
import { checkInstanceTypeAgainstLimits } from "../../cloudchamber/instance-type/instance-type";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { CompleteAccountCustomer } from "@cloudflare/containers-shared";

const commonLimits = {
	vcpu_per_deployment: 1,
	memory_mib_per_deployment: 4096,
	disk_mb_per_deployment: 4000,
};

describe("instance type limit check tests", () => {
	runInTempDir();

	it("should throw error if instance type disk exceeds account limit", async () => {
		expect(() =>
			checkInstanceTypeAgainstLimits(InstanceType.BASIC, {
				limits: {
					...commonLimits,
					disk_mb_per_deployment: 2000,
				},
			} as CompleteAccountCustomer)
		).toThrow(
			"Exceeded account limits: Your configured instance type uses 4000 MB of disk which exceeds the account limit of 2000"
		);
	});

	it("should throw error if instance type memory exceeds account limit", async () => {
		expect(() =>
			checkInstanceTypeAgainstLimits(InstanceType.STANDARD, {
				limits: {
					...commonLimits,
					memory_mib_per_deployment: 1024,
				},
			} as CompleteAccountCustomer)
		).toThrow(
			"Exceeded account limits: Your configured instance type uses 4096 MiB of memory which exceeds the account limit of 1024"
		);
	});

	it("should throw error if instance type vcpu exceeds account limit", async () => {
		expect(() =>
			checkInstanceTypeAgainstLimits(InstanceType.STANDARD, {
				limits: {
					...commonLimits,
					vcpu_per_deployment: 0.25,
				},
			} as CompleteAccountCustomer)
		).toThrow(
			"Exceeded account limits: Your configured instance type uses 0.5 vCPU which exceeds the account limit of 0.25"
		);
	});

	it("should not throw when instance type is within limits", async () => {
		expect(() =>
			checkInstanceTypeAgainstLimits(InstanceType.STANDARD, {
				limits: {
					...commonLimits,
				},
			} as CompleteAccountCustomer)
		).not.toThrow();
	});
});
