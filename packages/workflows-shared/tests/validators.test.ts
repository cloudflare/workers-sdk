import { describe, expect, it } from "vitest";
import {
	MAX_WORKFLOW_ID_LENGTH,
	validateWorkflowId,
} from "../src/lib/validators";

describe("validateWorkflowId", () => {
	it("should accept valid workflow IDs", () => {
		expect(validateWorkflowId("valid-id")).toBe(true);
		expect(validateWorkflowId("another-valid-id-123")).toBe(true);
		expect(validateWorkflowId("a".repeat(64))).toBe(true); // exactly 64 characters
		expect(validateWorkflowId("short")).toBe(true);
	});

	it("should reject workflow IDs that are too long", () => {
		expect(validateWorkflowId("a".repeat(65))).toBe(false); // 65 characters
		expect(validateWorkflowId("a".repeat(100))).toBe(false); // 100 characters
		expect(
			validateWorkflowId(
				"very-long-workflow-id-that-exceeds-the-maximum-allowed-length-of-64-characters"
			)
		).toBe(false);
	});

	it("should reject workflow IDs with control characters", () => {
		expect(validateWorkflowId("id-with\n-newline")).toBe(false);
		expect(validateWorkflowId("id-with\t-tab")).toBe(false);
		expect(validateWorkflowId("id-with\x00-null")).toBe(false);
		expect(validateWorkflowId("id-with\x1F-unit-separator")).toBe(false);
	});

	it("should accept workflow IDs with valid special characters", () => {
		expect(validateWorkflowId("id-with-dashes")).toBe(true);
		expect(validateWorkflowId("id_with_underscores")).toBe(true);
		expect(validateWorkflowId("id.with.dots")).toBe(true);
		expect(validateWorkflowId("id123with456numbers")).toBe(true);
		expect(validateWorkflowId("ID-WITH-UPPERCASE")).toBe(true);
	});

	it("should have the correct constant value", () => {
		expect(MAX_WORKFLOW_ID_LENGTH).toBe(64);
	});
});
