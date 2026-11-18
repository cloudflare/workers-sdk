import { UserError } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { pickRemoteBindings } from "../../api/remoteBindings";
import { buildMiniflareBindingOptions } from "../../dev/miniflare";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

// https://github.com/cloudflare/workers-sdk/issues/13727
//
// Queue producers are local-only in `wrangler dev`: nothing delivers a
// deployed queue's messages to a local consumer, so `remote: true` on a queue
// producer should be rejected as a config error rather than silently ignored.

const remoteProxyConnectionString = new URL(
	"http://localhost:52222/"
) as RemoteProxyConnectionString;

function buildQueueOptions(
	binding: Extract<Binding, { type: "queue" }>,
	connectionString?: RemoteProxyConnectionString
) {
	const { bindingOptions } = buildMiniflareBindingOptions(
		{
			name: "test-worker",
			complianceRegion: undefined,
			bindings: { MY_QUEUE: binding },
			queueConsumers: undefined,
			migrations: undefined,
			exports: undefined,
			tails: [],
			streamingTails: [],
			enableContainers: false,
		},
		connectionString
	);
	return bindingOptions.queueProducers;
}

describe("queue producer bindings in local dev", () => {
	mockConsoleMethods();

	it.for([
		{ session: "with", connectionString: remoteProxyConnectionString },
		{ session: "without", connectionString: undefined },
	])(
		"rejects `remote: true` on a queue producer $session a remote proxy session",
		({ connectionString }, { expect }) => {
			let error: unknown;
			try {
				buildQueueOptions(
					{ type: "queue", queue_name: "my-prod-queue", remote: true },
					connectionString
				);
			} catch (e) {
				error = e;
			}
			expect(error).toBeInstanceOf(UserError);
			expect((error as Error).message).toMatch(/remote/);
		}
	);

	it("doesn't start a remote proxy session for a queue producer with `remote: true`", ({
		expect,
	}) => {
		expect(
			pickRemoteBindings({
				MY_QUEUE: { type: "queue", queue_name: "my-prod-queue", remote: true },
			})
		).toEqual({});
	});

	it.for([undefined, false])(
		"keeps a queue producer with remote=%s local",
		(remote, { expect }) => {
			expect(
				buildQueueOptions(
					{ type: "queue", queue_name: "my-prod-queue", remote },
					remoteProxyConnectionString
				)
			).toEqual({
				MY_QUEUE: { queueName: "my-prod-queue", deliveryDelay: undefined },
			});
		}
	);
});
