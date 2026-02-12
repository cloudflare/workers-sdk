import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../../deployment-bundle/create-worker-upload-form";
import { createFullWorker, getBindings } from "./helpers";

describe("createWorkerUploadForm", () => {
	it("should convert CfWorkerInit bindings and produce a valid form", ({
		expect,
	}) => {
		const worker = createFullWorker({
			bindings: {
				vars: { MY_VAR: "hello" },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-123" }],
				d1_databases: [{ binding: "MY_DB", database_id: "db-123" }],
				r2_buckets: [{ binding: "MY_BUCKET", bucket_name: "my-bucket" }],
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadataBindings = getBindings(form);
		expect(metadataBindings).toContainEqual({
			name: "MY_VAR",
			type: "plain_text",
			text: "hello",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_KV",
			type: "kv_namespace",
			namespace_id: "kv-123",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_DB",
			type: "d1",
			id: "db-123",
		});
		expect(metadataBindings).toContainEqual({
			name: "MY_BUCKET",
			type: "r2_bucket",
			bucket_name: "my-bucket",
		});
	});

	it("should handle dryRun option", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				kv_namespaces: [{ binding: "MY_KV" }],
			},
		});
		// Without dryRun this would throw
		const form = createWorkerUploadForm(worker, { dryRun: true });
		// KV with no ID should become inherit during dry run
		expect(getBindings(form)).toContainEqual({
			name: "MY_KV",
			type: "inherit",
		});
	});

	it("should handle durable_objects bindings", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				durable_objects: {
					bindings: [
						{
							name: "MY_DO",
							class_name: "MyDurableObject",
						},
					],
				},
			},
		});
		const form = createWorkerUploadForm(worker);
		expect(getBindings(form)).toContainEqual({
			name: "MY_DO",
			type: "durable_object_namespace",
			class_name: "MyDurableObject",
		});
	});

	it("should handle services bindings", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				services: [
					{
						binding: "AUTH",
						service: "auth-worker",
					},
				],
			},
		});
		const form = createWorkerUploadForm(worker);
		expect(getBindings(form)).toContainEqual({
			name: "AUTH",
			type: "service",
			service: "auth-worker",
		});
	});

	it("should handle JSON vars", ({ expect }) => {
		const worker = createFullWorker({
			bindings: {
				vars: {
					STR_VAR: "hello",
					JSON_VAR: { nested: true },
				},
			},
		});
		const form = createWorkerUploadForm(worker);
		const metadataBindings = getBindings(form);
		expect(metadataBindings).toContainEqual({
			name: "STR_VAR",
			type: "plain_text",
			text: "hello",
		});
		expect(metadataBindings).toContainEqual({
			name: "JSON_VAR",
			type: "json",
			json: { nested: true },
		});
	});
});
