import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

// Returns without awaiting anything, so the write must outlive the request
const script = `export default {
	fetch(request, env) {
		env.EVENTS.writeDataPoint({
			blobs: ["GET", "/hello"],
			doubles: [1, 2.5],
			indexes: ["user-1"],
		});
		return new Response("ok");
	}
}`;

type DataPoint = {
	blobs?: string[];
	doubles?: number[];
	indexes?: string[];
};

class Dataset extends RpcTarget {
	dataPoints: DataPoint[] = [];
	throwError = false;

	writeDataPoint(event: DataPoint) {
		if (this.throwError) {
			throw new Error("Remote write failed");
		}
		this.dataPoints.push(event);
	}
}

function datasetWorker(proxyUrl?: URL, remote?: boolean) {
	return {
		config: {
			name: "writer",
			compatibilityDate: "2025-04-28",
			manifest: singleModuleManifest(script),
			env: {
				EVENTS: {
					type: "analytics-engine-dataset" as const,
					name: "events",
					...(remote === undefined ? {} : { dev: { remote } }),
				},
			},
		},
		dev: {
			remoteProxyConnectionString: proxyUrl as
				| RemoteProxyConnectionString
				| undefined,
		},
	};
}

async function useRemoteDataset() {
	const dataset = new Dataset();
	let opened = 0;
	let closed = 0;
	const { http: proxyUrl } = await useServer(
		(_req, res) => {
			res.statusCode = 500;
			res.end("Expected RPC WebSocket");
		},
		(socket) => {
			opened++;
			socket.once("close", () => {
				closed++;
			});
			newWebSocketRpcSession(socket as unknown as WebSocket, dataset);
		}
	);

	return {
		dataset,
		proxyUrl,
		getOpened: () => opened,
		getClosed: () => closed,
	};
}

describe("Analytics Engine dataset binding", () => {
	test("writes data points to the remote dataset and closes each session", async ({
		expect,
	}) => {
		const remote = await useRemoteDataset();
		const mf = new Miniflare({
			workers: [datasetWorker(remote.proxyUrl, true)],
		});
		useDispose(mf);

		for (let i = 0; i < 3; i++) {
			const response = await mf.dispatchFetch("http://localhost/");
			expect(await response.text()).toBe("ok");
		}

		await vi.waitFor(() => expect(remote.dataset.dataPoints).toHaveLength(3));
		expect(remote.dataset.dataPoints[0]).toEqual({
			blobs: ["GET", "/hello"],
			doubles: [1, 2.5],
			indexes: ["user-1"],
		});
		expect(remote.getOpened()).toBe(3);
		await vi.waitFor(() => expect(remote.getClosed()).toBe(3));
	});

	test("logs remote write failures without failing the request", async ({
		expect,
	}) => {
		const remote = await useRemoteDataset();
		remote.dataset.throwError = true;
		const errors: string[] = [];
		const mf = new Miniflare({
			handleStructuredLogs(log) {
				if (log.level === "error") {
					errors.push(log.message);
				}
			},
			workers: [datasetWorker(remote.proxyUrl, true)],
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("ok");

		await vi.waitFor(() =>
			expect(errors.join("\n")).toContain(
				'Failed to write data point to remote Analytics Engine binding "EVENTS"'
			)
		);
		expect(errors.join("\n")).toContain("Remote write failed");
		await vi.waitFor(() => expect(remote.getClosed()).toBe(remote.getOpened()));
	});

	test.for([undefined, false])(
		"does not use the proxy when remote=%s",
		async (remote, { expect }) => {
			const remoteDataset = await useRemoteDataset();
			const mf = new Miniflare({
				workers: [datasetWorker(remoteDataset.proxyUrl, remote)],
			});
			useDispose(mf);

			for (let i = 0; i < 2; i++) {
				const response = await mf.dispatchFetch("http://localhost/");
				expect(await response.text()).toBe("ok");
			}

			expect(remoteDataset.getOpened()).toBe(0);
			expect(remoteDataset.dataset.dataPoints).toHaveLength(0);
		}
	);

	test("is a no-op without a remote proxy", async ({ expect }) => {
		const mf = new Miniflare({ workers: [datasetWorker(undefined, true)] });
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("ok");
	});
});
