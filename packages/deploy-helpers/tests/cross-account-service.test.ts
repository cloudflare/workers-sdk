import { mapWorkerMetadataBindings } from "@cloudflare/workers-utils";
import { test } from "vitest";
import { createWorkerUploadForm } from "../src/deploy/helpers/create-worker-upload-form";

const worker = {
	name: "source",
	main: {
		name: "index.js",
		filePath: "index.js",
		type: "esm" as const,
		content: "export default {}",
	},
	modules: [],
	sourceMaps: undefined,
	containers: undefined,
	migrations: undefined,
	exports: undefined,
	compatibility_date: undefined,
	compatibility_flags: undefined,
	keepVars: undefined,
	keepSecrets: undefined,
	logpush: undefined,
	placement: undefined,
	tail_consumers: undefined,
	limits: undefined,
	assets: undefined,
	observability: undefined,
	cache: undefined,
};

test("includes the target account in service binding upload metadata", async ({
	expect,
}) => {
	const form = createWorkerUploadForm(worker, {
		PAYMENTS: {
			type: "service",
			service: "payments",
			entrypoint: "PublicAPI",
			target_account_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	});
	expect(JSON.parse(String(form.get("metadata"))).bindings).toEqual([
		{
			type: "service",
			name: "PAYMENTS",
			service: "payments",
			entrypoint: "PublicAPI",
			target_account_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		},
	]);
});

test("preserves resource owners through upload and readback", ({ expect }) => {
	const target_account_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const form = createWorkerUploadForm(worker, {
		KV: {
			type: "kv_namespace",
			id: "cccccccccccccccccccccccccccccccc",
			target_account_id,
		},
		DB: {
			type: "d1",
			database_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			target_account_id,
		},
		BUCKET: {
			type: "r2_bucket",
			bucket_name: "existing",
			jurisdiction: "eu",
			target_account_id,
		},
	});
	const bindings = JSON.parse(String(form.get("metadata"))).bindings;
	expect(bindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: "KV",
				type: "kv_namespace",
				target_account_id,
			}),
			expect.objectContaining({ name: "DB", type: "d1", target_account_id }),
			expect.objectContaining({
				name: "BUCKET",
				type: "r2_bucket",
				jurisdiction: "eu",
				target_account_id,
			}),
		])
	);
	const config = mapWorkerMetadataBindings(bindings);
	expect(config.kv_namespaces?.[0].target_account_id).toBe(target_account_id);
	expect(config.d1_databases?.[0].target_account_id).toBe(target_account_id);
	expect(config.r2_buckets?.[0].target_account_id).toBe(target_account_id);
});
