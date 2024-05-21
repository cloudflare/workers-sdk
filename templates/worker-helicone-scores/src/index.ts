/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;

	HELICONE_AUTH: string;
}

interface HeliconeRequest {
	request_id?: string; // Helicone request ID
	request_body?: any; // LLM request body
	response_body?: any; // LLM response body
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === 'POST') {
			const data = (await request.json()) as HeliconeRequest;

			console.log(`Received data: ${JSON.stringify(data)}`);

			// Execute the scoring function
			const scores = calculateScore(data);

			// Extract the request ID
			const requestId = data['request_id'];

			// Post the scores to the scoring API.
			const result = await postScore(
				`https://jawn.helicone.ai/v1/request/${requestId}/score`,
				scores,
				env
			);

			console.log(`Posted score data: ${JSON.stringify(result)}`);
			return new Response(JSON.stringify(result), {
				headers: {
					'Content-Type': 'application/json',
				},
				status: 200,
			});
		} else {
			return new Response('Method Not Allowed', { status: 405 });
		}
	},
};

async function postScore(url: string, scoreData: Record<string, number>, env: Env) {
	const heliconeAuth = `Bearer ${env.HELICONE_AUTH}`;
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': heliconeAuth,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ scores: scoreData }),
		});
		return {
			status: 'Success',
			responseStatusCode: response.status,
			responseBody: await response.json(),
		};
	} catch (e: any) {
		return {
			status: 'Error',
			message: e.message,
		};
	}
}

function calculateScore(data: HeliconeRequest): Record<string, number> {
	let scores: Record<string, number> = {};

	if (data.response_body) {
		const response_body_score = countWordsInResponse(data.response_body);
		scores['response_words_count'] = response_body_score;
	}

	return scores;
}

function countWordsInResponse(response_body: any): number {
	let total_words = 0;

	if (response_body.choices) {
		for (const choice of response_body.choices) {
			if (choice.message && choice.message.content) {
				const content = choice.message.content;
				const word_count = content.split(' ').length;
				total_words += word_count;
				console.log(`Content: ${content} - Words: ${word_count}`);
			}
		}
	}

	return total_words;
}
