import { describe, it } from "vitest";
import { bindings } from "../bindings";
import { convertToWranglerConfig } from "../convert";
import { BindingSchema } from "../schema";

const stream = "0123456789abcdef0123456789abcdef";

describe("K2 producer bindings", () => {
	it.for([stream, "stream-v2:orders", ""])(
		"preserves the stream identifier when converting shared configuration: %j",
		(streamId, { expect }) => {
			const binding = bindings.k2({ stream: streamId });
			expect(BindingSchema.parse(binding)).toEqual(binding);
			expect(
				convertToWranglerConfig({
					worker: {
						name: "producer",
						compatibilityDate: "2025-04-28",
						env: { ORDERS: binding },
					},
					containers: [],
				})
			).toEqual({
				name: "producer",
				compatibility_date: "2025-04-28",
				k2: [{ binding: "ORDERS", stream: streamId }],
			});
		}
	);

	it.for([undefined, null, 42, {}])(
		"requires a string stream identifier: %j",
		(id, { expect }) => {
			expect(BindingSchema.safeParse({ type: "k2", stream: id }).success).toBe(
				false
			);
		}
	);

	it("rejects Pipelines identifiers and internal routing fields", ({
		expect,
	}) => {
		expect(
			BindingSchema.safeParse({ type: "k2", pipeline: stream }).success
		).toBe(false);
		expect(
			BindingSchema.safeParse({ type: "k2", stream, staging: true }).success
		).toBe(false);
	});
});
