import { it } from "vitest";
import { createWorkerUploadForm } from "../src/deploy/helpers/create-worker-upload-form";

it("includes protected receiver expectations in module and service-worker upload metadata", ({
	expect,
}) => {
	const identity_receiver = {
		delegated_requests: {
			profile: "poppy-0.3" as const,
			account_authorization: {
				issuer: "https://auth.shop.example",
				audience: "https://api.shop.example",
			},
		},
	};
	for (const type of ["esm", "commonjs"] as const) {
		const form = createWorkerUploadForm(
			{
				name: "receiver",
				modules: undefined,
				sourceMaps: undefined,
				containers: undefined,
				migrations: undefined,
				exports: undefined,
				compatibility_date: undefined,
				keepVars: undefined,
				keepSecrets: undefined,
				logpush: undefined,
				placement: undefined,
				tail_consumers: undefined,
				limits: undefined,
				assets: undefined,
				observability: undefined,
				cache: undefined,
				main: {
					name: "index.js",
					filePath: "index.js",
					content: "export default {}",
					type,
				},
				identity_receiver,
				compatibility_flags: [
					"enable_workload_identity_context",
					"enable_delegated_identity",
				],
			},
			{}
		);
		expect(JSON.parse(String(form.get("metadata"))).identity_receiver).toEqual(
			identity_receiver
		);
	}
});
