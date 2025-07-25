import { describe, expect, it } from "vitest";
import {
	MAX_WORKFLOW_ID_LENGTH,
	validateWorkflowId,
} from "../src/lib/validators";

describe("Workflow ID Validation", () => {
	describe("validateWorkflowId", () => {
		it("should accept valid workflow IDs", () => {
			const validIds = [
				"valid-id",
				"another-valid-id-123",
				"a".repeat(64), // exactly 64 characters
				"short",
			];

			for (const id of validIds) {
				expect(validateWorkflowId(id)).toBe(true);
			}
		});

		it("should reject workflow IDs that are too long", () => {
			const invalidIds = [
				"a".repeat(65), // 65 characters
				"a".repeat(100), // 100 characters
				"very-long-workflow-id-that-exceeds-the-maximum-allowed-length-of-64-characters",
			];

			for (const id of invalidIds) {
				expect(validateWorkflowId(id)).toBe(false);
			}
		});

		it("should reject workflow IDs with control characters", () => {
			const invalidIds = [
				"id-with\n-newline",
				"id-with\t-tab",
				"id-with\x00-null",
				"id-with\x1F-unit-separator",
			];

			for (const id of invalidIds) {
				expect(validateWorkflowId(id)).toBe(false);
			}
		});

		it("should accept workflow IDs with valid special characters", () => {
			const validIds = [
				"id-with-dashes",
				"id_with_underscores",
				"id.with.dots",
				"id123with456numbers",
				"ID-WITH-UPPERCASE",
			];

			for (const id of validIds) {
				expect(validateWorkflowId(id)).toBe(true);
			}
		});

		it("should have the correct constant value", () => {
			expect(MAX_WORKFLOW_ID_LENGTH).toBe(64);
		});
	});
});
