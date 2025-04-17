import { RpcClient } from ".";

export default function (env: { SERVER: Fetcher; key: string }) {
	const client = new RpcClient(async (request) => {
		console.log("client -> server");
		const response = await fetch("http://localhost:8787/" + env.key, request);
		console.log("client <- server");
		return response;
	});
	return client.createChainProxy();
}
