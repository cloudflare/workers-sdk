import { UserError } from "@cloudflare/workers-utils";
import getPort from "get-port";
import { describe, it, vi } from "vitest";
import { memoizeGetPort } from "../utils/memoizeGetPort";

vi.mock("get-port", () => {
	return {
		default: vi.fn().mockResolvedValue(8787),
		portNumbers: (from: number, to: number) => [from, to],
	};
});

const mockGetPort = vi.mocked(getPort);

describe("memoizeGetPort()", () => {
	it("should throw a UserError when port binding is blocked by EPERM", async ({
		expect,
	}) => {
		mockGetPort.mockImplementationOnce(() => {
			throw Object.assign(
				new Error("listen EPERM: operation not permitted ::1:8787"),
				{ code: "EPERM", syscall: "listen" }
			);
		});

		const getPortFn = memoizeGetPort(8787, "localhost");
		await expect(getPortFn()).rejects.toThrow(UserError);
	});

	it("should mention sandbox in EPERM error message", async ({ expect }) => {
		mockGetPort.mockImplementationOnce(() => {
			throw Object.assign(
				new Error("listen EPERM: operation not permitted ::1:8787"),
				{ code: "EPERM", syscall: "listen" }
			);
		});

		const getPortFn = memoizeGetPort(8787, "localhost");
		await expect(getPortFn()).rejects.toThrow(/sandbox or security policy/);
	});

	it("should throw a UserError when port binding is blocked by EACCES", async ({
		expect,
	}) => {
		mockGetPort.mockImplementationOnce(() => {
			throw Object.assign(
				new Error("listen EACCES: permission denied 127.0.0.1:8787"),
				{ code: "EACCES", syscall: "listen" }
			);
		});

		const getPortFn = memoizeGetPort(8787, "127.0.0.1");
		await expect(getPortFn()).rejects.toThrow(UserError);
	});

	it("should re-throw non-permission errors unchanged", async ({ expect }) => {
		mockGetPort.mockImplementationOnce(() => {
			throw new Error("something else went wrong");
		});

		const getPortFn = memoizeGetPort(8787, "localhost");
		await expect(getPortFn()).rejects.toThrow("something else went wrong");
	});

	it("should not treat filesystem EPERM as a network bind error", async ({
		expect,
	}) => {
		mockGetPort.mockImplementationOnce(() => {
			throw Object.assign(
				new Error("EPERM: operation not permitted, open '/tmp/foo'"),
				{ code: "EPERM", syscall: "open" }
			);
		});

		const getPortFn = memoizeGetPort(8787, "localhost");
		await expect(getPortFn()).rejects.not.toThrow(UserError);
		// Re-mock since the previous call consumed it and memoization means we need a fresh instance
	});
});
