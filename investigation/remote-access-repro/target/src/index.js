import { WorkerEntrypoint } from "cloudflare:workers";

// Deployed target worker for the remote-bindings Access repro.
//
// Exposes:
//   - a default `fetch` (exercised via the HTTP `makeFetch` proxy path)
//   - an `Api` WorkerEntrypoint with an `add` RPC method (exercised via the
//     capnweb / WebSocket `makeRemoteProxyStub` proxy path)
//
// Deploy with:  wrangler deploy   (see ../README.md)

export class Api extends WorkerEntrypoint {
	add(a, b) {
		return a + b;
	}
}

export default {
	fetch() {
		return new Response("target default fetch ok");
	},
};
