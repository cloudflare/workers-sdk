import { describe, it } from "vitest";
import { createWorkerUploadForm } from "../src/deploy/helpers/create-worker-upload-form";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

function createEsmWorker(): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		exports: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		keepBindings: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		streaming_tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		cache: undefined,
	};
}

describe("createWorkerUploadForm — D1 bindings", () => {
	it("serializes a D1 binding with the required database_id field", ({
		expect,
	}) => {
		const form = createWorkerUploadForm(createEsmWorker(), {
			DB: { type: "d1", database_id: "db-123" },
		});

		const metadata = JSON.parse(form.get("metadata") as string) as {
			bindings: Array<Record<string, unknown>>;
		};
		const d1Binding = metadata.bindings.find(
			(binding) => binding.name === "DB"
		);

		expect(d1Binding).toMatchObject({
			name: "DB",
			type: "d1",
			database_id: "db-123",
		});
	});
});
