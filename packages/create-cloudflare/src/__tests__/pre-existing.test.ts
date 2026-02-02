import { describe, it, vi } from "vitest";
import { buildConfigure } from "../../templates/pre-existing/c3";
import type { ConfigureParams } from "../../templates/pre-existing/c3";
import type { C3Context } from "types";

describe("configure function", () => {
	const ctx = {
		args: { deploy: true },
	} as C3Context;

	it("should successfully configure when login is successful", async ({
		expect,
	}) => {
		const params: ConfigureParams = {
			login: vi.fn().mockResolvedValue(true),
			chooseAccount: vi.fn().mockResolvedValue(undefined),
			copyFiles: vi.fn().mockResolvedValue(undefined),
		};

		const configure = buildConfigure(params);
		await configure(ctx);

		expect(params.login).toHaveBeenCalledWith(ctx);
		expect(params.chooseAccount).toHaveBeenCalledWith(ctx);
		expect(params.copyFiles).toHaveBeenCalledWith(ctx);
		expect(ctx.args.deploy).toBe(false);
	});

	it("should throw an error when login fails", async ({ expect }) => {
		const params: ConfigureParams = {
			login: vi.fn().mockResolvedValue(false),
			chooseAccount: vi.fn(),
			copyFiles: vi.fn(),
		};

		const configure = buildConfigure(params);
		await expect(configure(ctx)).rejects.toThrow(
			"Failed to login to Cloudflare",
		);
		expect(params.chooseAccount).not.toHaveBeenCalled();
		expect(params.copyFiles).not.toHaveBeenCalled();
	});
});
