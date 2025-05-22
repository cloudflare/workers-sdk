import { describe, expect, it } from "vitest";
import { normalizeAndValidateConfig } from "../config/validation";

describe("validate assets config", () => {
	it("validates worker_first_paths", () => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				assets: {
					worker_first_paths: ["/api/", "/admin/"],
				},
			},
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(false);
	});

	it("errors if worker_first_paths is not an array", () => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				assets: {
					worker_first_paths: "/api/" as unknown as string[],
				},
			},
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(true);
		expect(diagnostics.errors[0]).toMatch(
			/"worker_first_paths" should be an array/
		);
	});

	it("errors if worker_first_paths contains non-strings", () => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				assets: {
					worker_first_paths: ["/api/", 123] as unknown as string[],
				},
			},
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(true);
		expect(diagnostics.errors[0]).toMatch(
			/"worker_first_paths" should be an array of strings/
		);
	});

	it("errors if worker_first_paths is set without a worker", () => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				assets: {
					worker_first_paths: ["/api/"],
				},
			},
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(true);
		expect(diagnostics.errors[0]).toMatch(
			/Cannot set worker_first_paths without a Worker script/
		);
	});

	it("warns if worker_first_paths is set without an assets binding", () => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				main: "worker.js",
				assets: {
					directory: "public",
					worker_first_paths: ["/api/"],
				},
			},
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasWarnings()).toBe(true);
		expect(diagnostics.warnings[0]).toMatch(
			/worker_first_paths set without an assets binding/
		);
	});
});
