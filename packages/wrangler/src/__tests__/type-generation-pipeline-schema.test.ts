import { describe, it } from "vitest";
import {
	generatePipelineTypeFromSchema,
	GENERIC_PIPELINE_TYPE,
	streamNameToTypeName,
} from "../type-generation/pipeline-schema";

describe("streamNameToTypeName", () => {
	it("should convert snake_case to PascalCase with Record suffix", ({
		expect,
	}) => {
		expect(streamNameToTypeName("analytics_stream")).toBe(
			"AnalyticsStreamRecord"
		);
	});

	it("should convert kebab-case to PascalCase with Record suffix", ({
		expect,
	}) => {
		expect(streamNameToTypeName("my-events")).toBe("MyEventsRecord");
	});

	it("should handle single word", ({ expect }) => {
		expect(streamNameToTypeName("events")).toBe("EventsRecord");
	});
});

describe("generatePipelineTypeFromSchema", () => {
	it("should return generic type for null schema", ({ expect }) => {
		const result = generatePipelineTypeFromSchema(null);
		expect(result.typeReference).toBe(GENERIC_PIPELINE_TYPE);
		expect(result.typeDefinition).toBeNull();
		expect(result.typeName).toBeNull();
	});

	it("should return generic type for schema with empty fields", ({
		expect,
	}) => {
		const result = generatePipelineTypeFromSchema({ fields: [] });
		expect(result.typeReference).toBe(GENERIC_PIPELINE_TYPE);
		expect(result.typeDefinition).toBeNull();
		expect(result.typeName).toBeNull();
	});

	it("should return generic type for schema with empty fields even when stream name is provided", ({
		expect,
	}) => {
		const result = generatePipelineTypeFromSchema({ fields: [] }, "my_stream");
		expect(result.typeReference).toBe(GENERIC_PIPELINE_TYPE);
		expect(result.typeDefinition).toBeNull();
		expect(result.typeName).toBeNull();
	});

	it("should return generic type for schema with non-array fields", ({
		expect,
	}) => {
		// @ts-expect-error Testing invalid input
		const result = generatePipelineTypeFromSchema({ fields: "invalid" });
		expect(result.typeReference).toBe(GENERIC_PIPELINE_TYPE);
		expect(result.typeDefinition).toBeNull();
	});

	it("should generate named type when stream name is provided", ({
		expect,
	}) => {
		const schema = {
			fields: [{ name: "user_id", type: "string" as const, required: true }],
		};
		const result = generatePipelineTypeFromSchema(schema, "analytics_stream");
		expect(result.typeReference).toBe(
			'import("cloudflare:pipelines").Pipeline<Cloudflare.AnalyticsStreamRecord>'
		);
		expect(result.typeDefinition).toBe(
			"type AnalyticsStreamRecord = { user_id: string };"
		);
		expect(result.typeName).toBe("AnalyticsStreamRecord");
	});

	it("should generate inline type when stream name is not provided", ({
		expect,
	}) => {
		const schema = {
			fields: [{ name: "user_id", type: "string" as const, required: true }],
		};
		const result = generatePipelineTypeFromSchema(schema);
		expect(result.typeReference).toBe(
			'import("cloudflare:pipelines").Pipeline<{ user_id: string }>'
		);
		expect(result.typeDefinition).toBeNull();
		expect(result.typeName).toBeNull();
	});

	it("should generate type for optional field", ({ expect }) => {
		const schema = {
			fields: [{ name: "user_id", type: "string" as const, required: false }],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toBe(
			"type MyStreamRecord = { user_id?: string };"
		);
	});

	it("should generate types for all primitive types", ({ expect }) => {
		const schema = {
			fields: [
				{ name: "str", type: "string" as const, required: true },
				{ name: "bool_val", type: "bool" as const, required: true },
				{ name: "int32_val", type: "int32" as const, required: true },
				{ name: "int64_val", type: "int64" as const, required: true },
				{ name: "uint32_val", type: "uint32" as const, required: true },
				{ name: "uint64_val", type: "uint64" as const, required: true },
				{ name: "float32_val", type: "float32" as const, required: true },
				{ name: "float64_val", type: "float64" as const, required: true },
				{ name: "decimal128_val", type: "decimal128" as const, required: true },
				{ name: "timestamp_val", type: "timestamp" as const, required: true },
				{ name: "json_val", type: "json" as const, required: true },
				{ name: "bytes_val", type: "bytes" as const, required: true },
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "test_stream");
		expect(result.typeDefinition).toContain("str: string");
		expect(result.typeDefinition).toContain("bool_val: boolean");
		expect(result.typeDefinition).toContain("int32_val: number");
		expect(result.typeDefinition).toContain("int64_val: number");
		expect(result.typeDefinition).toContain("uint32_val: number");
		expect(result.typeDefinition).toContain("uint64_val: number");
		expect(result.typeDefinition).toContain("float32_val: number");
		expect(result.typeDefinition).toContain("float64_val: number");
		expect(result.typeDefinition).toContain("decimal128_val: number");
		expect(result.typeDefinition).toContain("timestamp_val: string | number");
		expect(result.typeDefinition).toContain(
			"json_val: Record<string, unknown>"
		);
		// Binary data is base64-encoded when sent as JSON
		expect(result.typeDefinition).toContain("bytes_val: string");
	});

	it("should generate type for list field", ({ expect }) => {
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
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toBe(
			"type MyStreamRecord = { tags: Array<string> };"
		);
	});

	it("should generate type for nested struct field", ({ expect }) => {
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
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain("metadata?:");
		expect(result.typeDefinition).toContain("source?: string");
		expect(result.typeDefinition).toContain("priority: number");
	});

	it("should generate type for complex schema with multiple field types", ({
		expect,
	}) => {
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
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain("user_id: string");
		expect(result.typeDefinition).toContain("amount?: number");
		expect(result.typeDefinition).toContain("tags?: Array<string>");
		expect(result.typeDefinition).toContain("metadata?:");
	});

	it("should quote field names that are not valid identifiers", ({
		expect,
	}) => {
		const schema = {
			fields: [
				{ name: "valid_name", type: "string" as const, required: true },
				{ name: "invalid-name", type: "string" as const, required: true },
				{ name: "123invalid", type: "string" as const, required: true },
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain("valid_name: string");
		expect(result.typeDefinition).toContain('"invalid-name": string');
		expect(result.typeDefinition).toContain('"123invalid": string');
	});

	it("should escape special characters in field names", ({ expect }) => {
		const schema = {
			fields: [
				{
					name: 'field"with"quotes',
					type: "string" as const,
					required: true,
				},
				{
					name: "field\nwith\nnewlines",
					type: "string" as const,
					required: true,
				},
				{
					name: "field\\with\\backslash",
					type: "string" as const,
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		// Should produce valid TypeScript without breaking the string
		expect(result.typeDefinition).toContain('"field\\"with\\"quotes": string');
		expect(result.typeDefinition).toContain(
			'"field\\nwith\\nnewlines": string'
		);
		expect(result.typeDefinition).toContain(
			'"field\\\\with\\\\backslash": string'
		);
	});

	it("should handle list without items definition", ({ expect }) => {
		const schema = {
			fields: [
				{
					name: "unknown_list",
					type: "list" as const,
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain("unknown_list: unknown[]");
	});

	it("should handle struct without fields definition", ({ expect }) => {
		const schema = {
			fields: [
				{
					name: "empty_struct",
					type: "struct" as const,
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain(
			"empty_struct: Record<string, unknown>"
		);
	});

	it("should handle unknown field types gracefully", ({ expect }) => {
		const schema = {
			fields: [
				{
					name: "mystery_field",
					type: "unknown_type" as "string",
					required: true,
				},
			],
		};
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toContain("mystery_field: unknown");
	});

	it("should limit nesting depth to prevent stack overflow", ({ expect }) => {
		// Create a deeply nested struct (more than 10 levels)
		type NestedField = {
			name: string;
			type: "string" | "struct";
			required: boolean;
			fields?: NestedField[];
		};

		const createNestedStruct = (depth: number): NestedField => {
			if (depth === 0) {
				return { name: "leaf", type: "string", required: true };
			}
			return {
				name: `level_${depth}`,
				type: "struct",
				required: true,
				fields: [createNestedStruct(depth - 1)],
			};
		};

		const schema = {
			fields: [createNestedStruct(15)], // 15 levels deep
		};

		// Should not throw and should eventually return "unknown" for deeply nested
		const result = generatePipelineTypeFromSchema(schema, "my_stream");
		expect(result.typeDefinition).toBeDefined();
		// At depth > 10, it should fall back to "unknown"
		expect(result.typeDefinition).toContain("unknown");
	});
});
