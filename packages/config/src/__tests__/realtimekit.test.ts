import { describe, it } from "vitest";
import { bindings } from "../bindings";
import { convertToWranglerConfig } from "../convert";
import {
	BindingSchema,
	InputWorkerSchema,
	OutputWorkerSchema,
} from "../schema";

describe("RealtimeKit bindings", () => {
	it("preserves the app and explicit remote opt-in when converting configuration", ({
		expect,
	}) => {
		const binding = bindings.realtimekit({
			id: "app-id",
			dev: { remote: true },
		});
		expect(BindingSchema.parse(binding)).toEqual(binding);
		expect(
			convertToWranglerConfig({
				worker: {
					name: "meetings",
					compatibilityDate: "2026-01-01",
					env: { RTK: binding },
				},
				containers: [],
			})
		).toEqual({
			name: "meetings",
			compatibility_date: "2026-01-01",
			realtimekit: [{ binding: "RTK", app_id: "app-id", remote: true }],
		});
	});

	it.for([undefined, {}, { remote: false }, { remote: "true" }])(
		"rejects missing or invalid remote opt-in: %j",
		(dev, { expect }) => {
			for (const schema of [InputWorkerSchema, OutputWorkerSchema]) {
				expect(
					schema.safeParse({
						name: "meetings",
						compatibilityDate: "2026-01-01",
						env: { RTK: { type: "realtimekit", id: "app-id", dev } },
					}).success
				).toBe(false);
			}
		}
	);

	it.for([undefined, "", " \t ", 42])(
		"requires a non-empty app ID: %j",
		(id, { expect }) => {
			expect(
				BindingSchema.safeParse({
					type: "realtimekit",
					id,
					dev: { remote: true },
				}).success
			).toBe(false);
		}
	);

	it("rejects internal routing fields", ({ expect }) => {
		expect(
			BindingSchema.safeParse({
				type: "realtimekit",
				id: "app-id",
				dev: { remote: true },
				accountTag: "another-account",
			}).success
		).toBe(false);
	});
});
