import _ from "lodash";

import { ortToConsn } from "./transformers-js/tensor_utils";
import { structureArray } from "./utils";
import { pipeline, Pipeline } from "./transformers-js/pipelines";

export interface Env {
	CONSN: any;
}

globalThis.binding = {};

var SENTIMENT_ANALYSIS_PIPELINE: Pipeline;
var EMBED_PIPELINE: Pipeline;
var TRANSLATE_PIPELINE: Pipeline;

interface TranslationConfig {
	inputLanguage: string;
	outputLanguage: string;
}

interface TextClassificationConfig {
	topk: number;
}

interface TextProcessRequest {
	task: string;
	input: string | string[];
	config?: TranslationConfig | TextClassificationConfig;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		globalThis.binding = env.CONSN;
		const req = await request.json<TextProcessRequest>();
		var body: string;
		if (req.task === "embed") {
			body = await embed(req.input);
		} else if (req.task === "translate") {
			if (!req.config) {
				return new Response("Translate config not passed");
			}
			body = await translate(req.input, req.config);
		} else if (req.task === "text-similarity") {
			if (!req.input.length || req.input.length <= 1) {
				throw Error("Need more than 1 text input");
			}
			body = await textSimilarity(req.input[0], req.input.slice(1));
		} else if (req.task == "sentiment-analysis") {
			body = await classify_sentiment(req.input, req.config);
		} else {
			return new Response("Invalid task");
		}

		return new Response(body);
	},
};

async function classify_sentiment(
	input: string | string[],
	config?: TextClassificationConfig,
): Promise<string> {
	let topk = 1;
	if (config?.topk) {
		topk = config.topk;
	}
	if (!Array.isArray(input)) {
		input = [input];
	}
	if (!SENTIMENT_ANALYSIS_PIPELINE) {
		SENTIMENT_ANALYSIS_PIPELINE = await pipeline("sentiment-analysis");
	}
	const result = await SENTIMENT_ANALYSIS_PIPELINE(input, { topk: topk });
	return JSON.stringify(result);
}

async function embed(input: string | string[]): Promise<string> {
	if (!Array.isArray(input)) {
		input = [input];
	}
	if (!EMBED_PIPELINE) {
		EMBED_PIPELINE = await pipeline("embeddings");
	}
	const result = await EMBED_PIPELINE(input);
	const tensor = ortToConsn(result);
	const resp = {
		result: structureArray(tensor.value, tensor.shape),
	};
	return JSON.stringify(resp);
}

async function textSimilarity(
	query: string,
	value: string | string[],
): Promise<string> {
	if (!Array.isArray(value)) {
		value = [value];
	}
	if (!EMBED_PIPELINE) {
		EMBED_PIPELINE = await pipeline("embeddings");
	}
	const result = await EMBED_PIPELINE([query].concat(value)); // query is first item in batch
	const tensor = ortToConsn(result);

	let i = 0;
	let queryTensor;
	let outSims = [];
	for (let item of tensor) {
		if (i == 0) {
			queryTensor = item;
		} else {
			outSims.push(queryTensor.dot(item));
		}
		i++;
	}
	const resp = {
		result: outSims,
	};
	return JSON.stringify(resp);
}

async function translate(
	input: string | string[],
	config: TranslationConfig,
): Promise<string> {
	const max_tokens = 20;

	if (!Array.isArray(input)) {
		input = [input];
	}
	if (!TRANSLATE_PIPELINE) {
		TRANSLATE_PIPELINE = await pipeline("translation");
	}

	input = input[0];

	const result = await TRANSLATE_PIPELINE(
		`translate ${config.inputLanguage} to ${config.outputLanguage}: ${input}`,
		{ max_new_tokens: max_tokens },
	);
	return JSON.stringify(result[0]);
}
