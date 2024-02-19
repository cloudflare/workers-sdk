import { Response } from "miniflare";
import { performApiFetch } from "../cfetch/internal";
import { getAccountId } from "../user";
import type { Request } from "miniflare";

export async function AIFetcher(request: Request) {
	const accountId = await getAccountId();

	request.headers.delete("Host");
	request.headers.delete("Content-Length");

	const res = await performApiFetch(`/accounts/${accountId}/ai/run/proxy`, {
		method: "POST",
		headers: Object.fromEntries(request.headers.entries()),
		body: request.body,
		duplex: "half",
	});

	return new Response(res.body, { status: res.status });
}
