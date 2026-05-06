import { describe, it } from "vitest";
import { inferInstanceType } from "../../cloudchamber/instance-type/instance-type";

describe("inferInstanceType", () => {
	it("returns 'lite' for lite specs (0.0625 vcpu, 256 MiB, 2 GB disk)", ({
		expect,
	}) => {
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 0.0625,
			memory_mib: 256,
			disk: { size_mb: 2000 },
		});
		expect(result).toBe("lite");
	});

	it("normalizes legacy 'standard' alias to 'standard-1' (prevents phantom EDIT diffs)", ({
		expect,
	}) => {
		// 'standard' and 'standard-1' share identical specs; Object.entries yields
		// 'standard' first, so the API returning 'standard' specs must map to 'standard-1'.
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 0.5,
			memory_mib: 4096,
			disk: { size_mb: 8000 },
		});
		expect(result).toBe("standard-1");
	});

	it("returns 'basic' for basic specs", ({ expect }) => {
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 0.25,
			memory_mib: 1024,
			disk: { size_mb: 4000 },
		});
		expect(result).toBe("basic");
	});

	it("returns 'standard-2' for standard-2 specs", ({ expect }) => {
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 1,
			memory_mib: 6144,
			disk: { size_mb: 12000 },
		});
		expect(result).toBe("standard-2");
	});

	it("returns undefined when config does not match any known instance type", ({
		expect,
	}) => {
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 99,
			memory_mib: 99999,
			disk: { size_mb: 99999 },
		});
		expect(result).toBeUndefined();
	});

	it("returns undefined when disk is absent", ({ expect }) => {
		const result = inferInstanceType({
			image: "cloudflare/hello-world:1.0",
			vcpu: 0.0625,
			memory_mib: 256,
		});
		expect(result).toBeUndefined();
	});
});
