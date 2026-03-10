import { assert, describe, it } from "vitest";
import { convertConfigBindingsToStartWorkerBindings } from "../../../api/startDevWorker/utils";

describe("convertConfigBindingsToStartWorkerBindings", () => {
	it("converts config bindings into startWorker bindings", async ({
		expect,
	}) => {
		const result = convertConfigBindingsToStartWorkerBindings({
			kv_namespaces: [
				{
					id: "<kv_id>",
					binding: "MY_KV",
				},
			],
			ai: { binding: "AI" },
			browser: { binding: "BROWSER" },
			d1_databases: [
				{
					database_id: "<database_id>",
					database_name: "my-database",
					binding: "MY_DB",
				},
			],
			dispatch_namespaces: [
				{
					binding: "MY_DISPATCH_NAMESPACE",
					namespace: "namespace",
				},
			],
			durable_objects: {
				bindings: [
					{
						class_name: "MyDo",
						name: "MY_DO",
					},
				],
			},
			queues: {
				producers: [
					{
						binding: "MY_QUEUE_PRODUCER",
						queue: "my-queue",
					},
				],
				consumers: undefined,
			},
			r2_buckets: [
				{
					binding: "MY_R2",
					bucket_name: "my-bucket",
				},
			],
			services: [
				{
					binding: "MY_SERVICE",
					service: "my-service",
				},
			],
			mtls_certificates: [
				{
					binding: "MTLS",
					certificate_id: "123",
				},
			],
			vectorize: [
				{
					binding: "MY_VECTORIZE",
					index_name: "idx",
				},
			],
			workflows: [
				{
					binding: "MY_WORKFLOW",
					name: "workflow",
					class_name: "MyWorkflow",
				},
			],
			vpc_services: [
				{
					binding: "MY_VPC_SERVICE",
					service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
				},
			],
		});
		expect(result).toEqual({
			AI: {
				type: "ai",
			},
			BROWSER: {
				type: "browser",
			},
			MTLS: {
				certificate_id: "123",
				type: "mtls_certificate",
			},
			MY_DB: {
				database_id: "<database_id>",
				database_name: "my-database",
				type: "d1",
			},
			MY_DISPATCH_NAMESPACE: {
				namespace: "namespace",
				type: "dispatch_namespace",
			},
			MY_DO: {
				class_name: "MyDo",
				type: "durable_object_namespace",
			},
			MY_KV: {
				id: "<kv_id>",
				type: "kv_namespace",
			},
			MY_QUEUE_PRODUCER: {
				queue: "my-queue",
				queue_name: "my-queue",
				type: "queue",
			},
			MY_R2: {
				bucket_name: "my-bucket",
				type: "r2_bucket",
			},
			MY_SERVICE: {
				service: "my-service",
				type: "service",
			},
			MY_VECTORIZE: {
				index_name: "idx",
				type: "vectorize",
			},
			MY_WORKFLOW: {
				class_name: "MyWorkflow",
				name: "workflow",
				type: "workflow",
			},
			MY_VPC_SERVICE: {
				service_id: "0199295b-b3ac-7760-8246-bca40877b3e9",
				type: "vpc_service",
			},
		});
	});

	it("prioritizes preview values compared to their standard counterparts", async ({
		expect,
	}) => {
		const result = convertConfigBindingsToStartWorkerBindings({
			ai: undefined,
			browser: undefined,
			vectorize: [],
			d1_databases: [
				{
					binding: "MY_DB",
					database_id: "production-db-id",
					preview_database_id: "staging-db-id",
				},
			],
			dispatch_namespaces: [],
			durable_objects: {
				bindings: [],
			},
			queues: {
				producers: undefined,
				consumers: undefined,
			},
			r2_buckets: [
				{
					binding: "MY_R2",
					bucket_name: "production-bucket-name",
					preview_bucket_name: "staging-bucket-name",
				},
			],
			services: undefined,
			kv_namespaces: [
				{
					binding: "MY_KV",
					id: "production-kv-id",
					preview_id: "staging-kv-id",
				},
			],
			mtls_certificates: [],
			workflows: [],
			vpc_services: [],
		});

		assert(result);
		assert(result.MY_KV.type === "kv_namespace");
		expect(result.MY_KV.id).toBe("staging-kv-id");

		assert(result);
		assert(result.MY_R2.type === "r2_bucket");
		expect(result.MY_R2.bucket_name).toBe("staging-bucket-name");

		assert(result);
		assert(result.MY_DB.type === "d1");
		expect(result.MY_DB.database_id).toBe("staging-db-id");
	});
});
