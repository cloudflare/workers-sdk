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
