import { describe, expect, it } from "vitest";
import {
	generatePipelineTypeFromSchema,
	GENERIC_PIPELINE_TYPE,
} from "../type-generation/pipeline-schema";
import type { SchemaField } from "../pipelines/types";

describe("generatePipelineTypeFromSchema", () => {
	it("should return generic type for null schema", () => {
		expect(generatePipelineTypeFromSchema(null)).toBe(GENERIC_PIPELINE_TYPE);
	});

	it("should return generic type for schema with empty fields", () => {
		expect(generatePipelineTypeFromSchema({ fields: [] })).toBe(
			GENERIC_PIPELINE_TYPE
		);
	});

	it("should generate type for simple string field", () => {
		const schema = {
			fields: [{ name: "user_id", type: "string" as const, required: true }],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toBe(
			'import("cloudflare:pipelines").Pipeline<{ user_id: string }>'
		);
	});

	it("should generate type for optional field", () => {
		const schema = {
			fields: [{ name: "user_id", type: "string" as const, required: false }],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toBe(
			'import("cloudflare:pipelines").Pipeline<{ user_id?: string }>'
		);
	});

	it("should generate types for all primitive types", () => {
		const schema = {
			fields: [
				{ name: "str", type: "string" as const, required: true },
				{ name: "bool_val", type: "bool" as const, required: true },
				{ name: "int32_val", type: "int32" as const, required: true },
				{ name: "int64_val", type: "int64" as const, required: true },
				{ name: "float32_val", type: "float32" as const, required: true },
				{ name: "float64_val", type: "float64" as const, required: true },
				{ name: "timestamp_val", type: "timestamp" as const, required: true },
				{ name: "json_val", type: "json" as const, required: true },
				{ name: "bytes_val", type: "bytes" as const, required: true },
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("str: string");
		expect(result).toContain("bool_val: boolean");
		expect(result).toContain("int32_val: number");
		expect(result).toContain("int64_val: number");
		expect(result).toContain("float32_val: number");
		expect(result).toContain("float64_val: number");
		expect(result).toContain("timestamp_val: string | number");
		expect(result).toContain("json_val: Record<string, unknown>");
		expect(result).toContain("bytes_val: ArrayBuffer");
	});

	it("should generate type for list field", () => {
		const schema = {
			fields: [
				{
					name: "tags",
					type: "list" as const,
					required: true,
					items: { name: "", type: "string" as const, required: true },
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toBe(
			'import("cloudflare:pipelines").Pipeline<{ tags: Array<string> }>'
		);
	});

	it("should generate type for nested struct field", () => {
		const schema = {
			fields: [
				{
					name: "metadata",
					type: "struct" as const,
					required: false,
					fields: [
						{ name: "source", type: "string" as const, required: false },
						{ name: "priority", type: "int32" as const, required: true },
					],
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("metadata?:");
		expect(result).toContain("source?: string");
		expect(result).toContain("priority: number");
	});

	it("should generate type for complex schema with multiple field types", () => {
		const schema = {
			fields: [
				{ name: "user_id", type: "string" as const, required: true },
				{ name: "amount", type: "float64" as const, required: false },
				{
					name: "tags",
					type: "list" as const,
					required: false,
					items: { name: "", type: "string" as const, required: true },
				},
				{
					name: "metadata",
					type: "struct" as const,
					required: false,
					fields: [
						{ name: "source", type: "string" as const, required: false },
						{ name: "priority", type: "int32" as const, required: false },
					],
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("user_id: string");
		expect(result).toContain("amount?: number");
		expect(result).toContain("tags?: Array<string>");
		expect(result).toContain("metadata?:");
	});

	it("should quote field names that are not valid identifiers", () => {
		const schema = {
			fields: [
				{ name: "valid_name", type: "string" as const, required: true },
				{ name: "invalid-name", type: "string" as const, required: true },
				{ name: "123invalid", type: "string" as const, required: true },
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("valid_name: string");
		expect(result).toContain('"invalid-name": string');
		expect(result).toContain('"123invalid": string');
	});

	it("should handle list without items definition", () => {
		const schema = {
			fields: [
				{
					name: "unknown_list",
					type: "list" as const,
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("unknown_list: unknown[]");
	});

	it("should handle struct without fields definition", () => {
		const schema = {
			fields: [
				{
					name: "empty_struct",
					type: "struct" as const,
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result).toContain("empty_struct: Record<string, unknown>");
	});
});
