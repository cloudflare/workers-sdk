import {
	Tensor,
	InferenceSession,
	TensorType,
} from "@cloudflare/constellation";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method == "POST") {
			let payload: any = await request.json();
			const xgboostSession = new InferenceSession(
				env.XGBOOST_CLASSIFIER,
				"77ee9b52-63e1-4e77-b0fc-541ef1daf32c",
			);
			const onnxSession = new InferenceSession(
				env.ONNX_CLASSIFIER,
				"0ae7bd15-a0df-4610-aa85-1998656d6e9e",
			);

			const tensorInput = new Tensor(
				TensorType.Float32,
				Array.prototype.concat(...payload.data),
				{ shape: [payload.batch_size, payload.feature_size] },
			);

			const onnxOutputTensor = Object.values(
				await onnxSession.run([tensorInput]),
			)[0];
			const xgboostOutputTensor = Object.values(
				await xgboostSession.run({ input: tensorInput }),
			)[0];

			return new Response(
				JSON.stringify({
					xgboost_prob: xgboostOutputTensor.value,
					onnx_prob: onnxOutputTensor.value,
				}),
			);
		}
		return new Response(
			`try curl ${
				env.ENVIRONMENT == "dev"
					? `http://127.0.0.1:9000`
					: "https://ai.cloudflare.com/demos/petal-length"
			} -H "Content-Type: application/json" -d '{"data":[4.8, 3.0, 1.4, 0.1], "batch_size": 1, "feature_size": 4}'`,
		);
	},
};

export interface Env {
	XGBOOST_CLASSIFIER: any;
	ONNX_CLASSIFIER: any;
	ENVIRONMENT: any;
}
