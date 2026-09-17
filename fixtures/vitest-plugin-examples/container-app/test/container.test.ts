import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { it, vi } from "vitest";
import { NamedImageContainer } from "../src";

const EXPECTED_RESPONSE =
	"Hello World! Have an env var! I was passed to the container";
const WAIT_OPTIONS = { interval: 250, timeout: 20_000 };

it(
	"runs a Durable Object-managed named image",
	{ timeout: 30_000 },
	async ({ expect }) => {
		const container = env.NAMED_CONTAINER.getByName("named-image-test");
		const response = await vi.waitFor(
			() =>
				runInDurableObject(container, (instance: NamedImageContainer) =>
					instance.fetch(new Request("http://container/"))
				).then((result) => result.text()),
			WAIT_OPTIONS
		);
		expect(response).toBe(EXPECTED_RESPONSE);
	}
);

it(
	"runs a scheduler-backed default image",
	{ timeout: 30_000 },
	async ({ expect }) => {
		const container = env.DEFAULT_CONTAINER.getByName("default-image-test");
		const response = await vi.waitFor(
			async () =>
				container.fetch("http://container/").then((result) => result.text()),
			WAIT_OPTIONS
		);
		expect(response).toBe(EXPECTED_RESPONSE);
	}
);
