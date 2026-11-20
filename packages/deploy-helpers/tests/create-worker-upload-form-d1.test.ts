import { bindings, convertToWranglerConfig } from "@cloudflare/config";
import { convertConfigToBindings } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../src/deploy/helpers/create-worker-upload-form";
import type { Binding, CfWorkerInit } from "@cloudflare/workers-utils";

// https://github.com/cloudflare/workers-sdk/issues/16958
//
// The Workers script upload API lists `database_id` as the required field of a
// `d1` binding, and marks `id` as deprecated ("This property has been renamed
// to `database_id`"). The upload metadata should name the database with
// `database_id`, not the deprecated `id`.

const DATABASE_ID = "90a1b2c3-4d5e-4f60-8a71-92b3c4d5e6f7";

function createWorker(): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "d1-upload-example",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2026-11-11",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		exports: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		cache: undefined,
	};
}

function getMetadataBindings(
	workerBindings: Record<string, Binding>
): Array<Record<string, unknown>> {
	const form = createWorkerUploadForm(createWorker(), workerBindings);
	const metadata = JSON.parse(form.get("metadata") as string) as {
		bindings: Array<Record<string, unknown>>;
	};
	return metadata.bindings;
}

describe("createWorkerUploadForm — D1 binding upload metadata (#16958)", () => {
	it("names the D1 database with `database_id`, not the deprecated `id`", ({
		expect,
	}) => {
		const metadataBindings = getMetadataBindings({
			DB: { type: "d1", database_id: DATABASE_ID },
		});

		expect(metadataBindings).toEqual([
			{ name: "DB", type: "d1", database_id: DATABASE_ID },
		]);
	});

	it("uploads a cf config `bindings.d1({ id })` binding with `database_id`", ({
		expect,
	}) => {
		// The path `cf deploy` takes: a `@cloudflare/config` binding, converted to
		// Wrangler config, then to bindings, then serialized for upload.
		const wranglerConfig = convertToWranglerConfig({
			worker: {
				name: "d1-upload-example",
				entrypoint: "./src/index.ts",
				compatibilityDate: "2026-11-11",
				env: {
					DB: bindings.d1({ id: DATABASE_ID }),
				},
			},
			containers: [],
		});
		const workerBindings = convertConfigToBindings({
			d1_databases: wranglerConfig.d1_databases,
		});

		const d1Binding = getMetadataBindings(workerBindings).find(
			(binding) => binding.name === "DB"
		);

		expect(d1Binding).toEqual({
			name: "DB",
			type: "d1",
			database_id: DATABASE_ID,
		});
		expect(d1Binding).not.toHaveProperty("id");
	});
});
