import { env } from "cloudflare:workers";
import { it } from "vitest";

const EXPECTED_RESPONSE =
	"Hello World! Have an env var! I was passed to the container";

it(
	"runs a Durable Object-managed named image",
	{ timeout: 30_000 },
	async ({ expect }) => {
		const container = env.NAMED_CONTAINER.getByName("named-image-test");
		const response = await container.fetch("http://container/");
		expect(await response.text()).toBe(EXPECTED_RESPONSE);
	}
);

it(
	"runs a scheduler-backed default image",
	{ timeout: 30_000 },
	async ({ expect }) => {
		const container = env.DEFAULT_CONTAINER.getByName("default-image-test");
		const response = await container.fetch("http://container/");
		expect(await response.text()).toBe(EXPECTED_RESPONSE);
	}
);
