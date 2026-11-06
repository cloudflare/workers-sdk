import { test } from "vitest";
import { createWorkerUploadForm } from "../src/deploy/helpers/create-worker-upload-form";

test("includes the target account in service binding upload metadata", async ({
	expect,
}) => {
	const form = createWorkerUploadForm(
		{
			name: "source",
			main: {
				name: "index.js",
				filePath: "index.js",
				type: "esm",
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
		},
		{
			PAYMENTS: {
				type: "service",
				service: "payments",
				entrypoint: "PublicAPI",
				target_account_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			},
		}
	);
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
