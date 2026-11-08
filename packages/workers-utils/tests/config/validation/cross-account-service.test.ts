import { test } from "vitest";
import { normalizeAndValidateConfig } from "../../../src/config/validation";

test.for(["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "", "123", 123, "B".repeat(32)])(
	"validates target_account_id=%s",
	(target, { expect }) => {
		const raw = {
			services: [
				{ binding: "PAYMENTS", service: "payments", target_account_id: target },
			],
		} as Parameters<typeof normalizeAndValidateConfig>[0];
		const { diagnostics, config } = normalizeAndValidateConfig(
			raw,
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.errors.length > 0).toBe(
			target !== "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
		);
		if (target === "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
			expect(config.services?.[0].target_account_id).toBe(target);
		}
	}
);

test.for(["d1_databases", "kv_namespaces", "r2_buckets"] as const)(
	"validates storage target accounts in %s",
	(field, { expect }) => {
		for (const target of [
			undefined,
			"a".repeat(32),
			"b".repeat(32),
			"",
			"B".repeat(32),
			"invalid",
		]) {
			const resource =
				field === "d1_databases"
					? { database_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }
					: field === "kv_namespaces"
						? { id: "c".repeat(32) }
						: { bucket_name: "existing" };
			const raw = {
				[field]: [
					{
						binding: "DATA",
						...resource,
						...(target === undefined ? {} : { target_account_id: target }),
					},
				],
			};
			const { diagnostics, config } = normalizeAndValidateConfig(
				raw,
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.errors.length > 0).toBe(
				target !== undefined && !/^[a-f0-9]{32}$/.test(target)
			);
			if (!diagnostics.hasErrors()) {
				expect(config[field]?.[0].target_account_id).toBe(target);
			}
		}
	}
);
