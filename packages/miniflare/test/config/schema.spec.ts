import { describe, test, vi } from "vitest";
import { MiniflareWorkerConfigSchema } from "../../src/config/schema";

vi.mock("../../src/plugins/shared/constants", () => ({
	HOST_CAPNP_CONNECT: "localhost:0",
}));

describe("MiniflareWorkerConfigSchema", () => {
	test("defaults resource binding identifiers from binding and worker names", ({
		expect,
	}) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv" },
				DB: { type: "d1" },
				FLAGS: { type: "flagship" },
				BUCKET: { type: "r2" },
				QUEUE: { type: "queue" },
			},
		});

		expect(parsed.env).toMatchObject({
			KV: { type: "kv", id: "KV-api" },
			DB: { type: "d1", id: "DB-api" },
			FLAGS: { type: "flagship", id: "FLAGS-api" },
			BUCKET: { type: "r2", name: "BUCKET-api" },
			QUEUE: { type: "queue", name: "QUEUE-api" },
		});
	});

	test("defaults resource binding identifiers to worker for unnamed workers", ({
		expect,
	}) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv" },
			},
		});

		expect(parsed.env?.KV).toMatchObject({ type: "kv", id: "KV-worker" });
	});

	test("preserves explicit resource binding identifiers", ({ expect }) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv", id: "custom-kv" },
				DB: { type: "d1", id: "custom-db" },
				FLAGS: { type: "flagship", id: "custom-flags" },
				BUCKET: { type: "r2", name: "custom-bucket" },
				QUEUE: { type: "queue", name: "custom-queue" },
			},
		});

		expect(parsed.env).toMatchObject({
			KV: { type: "kv", id: "custom-kv" },
			DB: { type: "d1", id: "custom-db" },
			FLAGS: { type: "flagship", id: "custom-flags" },
			BUCKET: { type: "r2", name: "custom-bucket" },
			QUEUE: { type: "queue", name: "custom-queue" },
		});
	});
});
