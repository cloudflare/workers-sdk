import { randomUUID } from "crypto";
import {
	bold,
	brandColor,
	cyanBright,
	green,
	red,
	yellow,
} from "@cloudflare/cli/colors";
import { fetch, FormData, Headers } from "undici";
import { CancelablePromise, OpenAPI } from "./client";
import type { Config } from "../config";
import type {
	CommonYargsOptionsJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { OpenAPIConfig } from "./client";
import type { ApiRequestOptions } from "./client/core/ApiRequestOptions";
import type { OnCancel } from "./client/core/CancelablePromise";
import type { BodyInit, RequestInit, Response } from "undici";
import type yargs from "yargs";

const isDefined = <T>(
	value: T | null | undefined
): value is Exclude<T, null | undefined> => {
	return value !== undefined && value !== null;
};

const isString = (value: unknown): value is string => {
	return typeof value === "string";
};

const isStringWithValue = (value: unknown): value is string => {
	return isString(value) && value !== "";
};

const isBlob = (value: unknown): value is Blob => {
	if (value == null || typeof value !== "object") {
		return false;
	} else {
		return (
			value != null &&
			typeof value === "object" &&
			"type" in value &&
			typeof value.type === "string" &&
			"stream" in value &&
			typeof value.stream === "function" &&
			"arrayBuffer" in value &&
			typeof value.arrayBuffer === "function" &&
			typeof value.constructor === "function" &&
			typeof value.constructor.name === "string" &&
			/^(Blob|File)$/.test(value.constructor.name)
		);
	}
};

const base64 = (str: string): string => {
	return Buffer.from(str).toString("base64");
};

const getQueryString = (params: Record<string, unknown>): string => {
	const qs: string[] = [];

	const append = (key: string, value: unknown) => {
		qs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	};

	const process = (key: string, value: unknown) => {
		if (isDefined(value)) {
			if (Array.isArray(value)) {
				value.forEach((v) => {
					process(key, v);
				});
			} else if (typeof value === "object") {
				Object.entries(value as object).forEach(([k, v]) => {
					process(`${key}[${k}]`, v);
				});
			} else {
				append(key, value);
			}
		}
	};

	Object.entries(params).forEach(([key, value]) => {
		process(key, value);
	});

	if (qs.length > 0) {
		return `?${qs.join("&")}`;
	}

	return "";
};

const getUrl = (config: OpenAPIConfig, options: ApiRequestOptions): string => {
	const encoder = config.ENCODE_PATH || encodeURI;

	const path = options.url
		.replace("{api-version}", config.VERSION)
		.replace(/{(.*?)}/g, (substring: string, group: string) => {
			if (
				options.path &&
				Object.prototype.hasOwnProperty.call(options.path, group)
			) {
				return encoder(String(options.path[group]));
			}
			return substring;
		});

	const url = `${config.BASE}${path}`;
	if (options.query) {
		return `${url}${getQueryString(options.query)}`;
	}
	return url;
};

const getFormData = (options: ApiRequestOptions): FormData | undefined => {
	if (options.formData) {
		const formData = new FormData();

		const process = (key: string, value: unknown) => {
			if (isString(value) || isBlob(value)) {
				formData.append(key, value);
			} else {
				formData.append(key, JSON.stringify(value));
			}
		};

		Object.entries(options.formData)
			.filter(([_, value]) => isDefined(value))
			.forEach(([key, value]) => {
				if (Array.isArray(value)) {
					value.forEach((v) => process(key, v));
				} else {
					process(key, value);
				}
			});

		return formData;
	}
	return undefined;
};

type Resolver<T> = (options: ApiRequestOptions) => Promise<T>;

const resolve = async <T>(
	options: ApiRequestOptions,
	resolver?: T | Resolver<T>
): Promise<T | undefined> => {
	if (typeof resolver === "function") {
		return (resolver as Resolver<T>)(options);
	}
	return resolver;
};

const getHeaders = async (
	config: OpenAPIConfig,
	options: ApiRequestOptions
): Promise<Headers> => {
	const token = await resolve(options, config.TOKEN);
	const username = await resolve(options, config.USERNAME);
	const password = await resolve(options, config.PASSWORD);
	const additionalHeaders = await resolve(options, config.HEADERS);

	const headers = Object.entries({
		Accept: "application/json",
		...additionalHeaders,
		...options.headers,
	})
		.filter(([_, value]) => isDefined(value))
		.reduce(
			(items, [key, value]) => ({
				...items,
				[key]: String(value),
			}),
			{} as Record<string, string>
		);

	if (isStringWithValue(token)) {
		headers["Authorization"] = `Bearer ${token}`;
	}

	if (isStringWithValue(username) && isStringWithValue(password)) {
		const credentials = base64(`${username}:${password}`);
		headers["Authorization"] = `Basic ${credentials}`;
	}

	if (options.body) {
		if (options.mediaType) {
			headers["Content-Type"] = options.mediaType;
		} else if (isBlob(options.body)) {
			headers["Content-Type"] = options.body.type || "application/octet-stream";
		} else if (isString(options.body)) {
			headers["Content-Type"] = "text/plain";
		} else {
			headers["Content-Type"] = "application/json";
		}
	}

	return new Headers(headers);
};

const getRequestBody = (options: ApiRequestOptions): BodyInit => {
	if (options.mediaType?.includes("/json")) {
		return JSON.stringify(options.body);
	} else if (isString(options.body) || isBlob(options.body)) {
		const val: BodyInit = options.body;
		return val;
	} else {
		return JSON.stringify(options.body);
	}
};

const sendRequest = async (
	config: OpenAPIConfig,
	options: ApiRequestOptions,
	url: string,
	body: BodyInit | null,
	formData: FormData | undefined,
	headers: Headers,
	onCancel: OnCancel
): Promise<Response> => {
	const controller = new AbortController();

	const request: RequestInit = {
		headers,
		body: body ?? formData,
		method: options.method,
		signal: controller.signal,
		dispatcher: config.AGENT ?? undefined,
	};

	if (config.WITH_CREDENTIALS) {
		request.credentials = config.CREDENTIALS;
	}

	onCancel(() => controller.abort());

	return await fetch(url, request);
};

/**
 * Request method
 * @param config The OpenAPI configuration object
 * @param options The request options from the service
 * @returns CancelablePromise<T>
 * @throws ApiError
 */
const request = (
	config: OpenAPIConfig,
	options: ApiRequestOptions
): CancelablePromise<Response> => {
	return new CancelablePromise(async (solve, reject, onCancel) => {
		try {
			const url = getUrl(config, options);
			const formData = getFormData(options);
			const body = getRequestBody(options);
			const headers = await getHeaders(config, options);

			if (!onCancel.isCancelled) {
				const response = await sendRequest(
					config,
					options,
					url,
					body,
					formData,
					headers,
					onCancel
				);

				solve(response);
			}
		} catch (error) {
			reject(error);
		}
	});
};

export function yargsCurl(args: yargs.Argv<CommonYargsOptionsJSON>) {
	return args
		.positional("path", { type: "string", default: "/" })
		.option("header", {
			type: "array",
			alias: "H",
			describe: "Add headers in the form of --header <name>:<value>",
		})
		.option("data", {
			type: "string",
			describe: "Add a JSON body to the request",
			alias: "D",
		})
		.option("method", {
			type: "string",
			alias: "X",
			default: "GET",
		})
		.option("silent", {
			describe: "Only output response",
			type: "boolean",
			alias: "s",
		})
		.option("verbose", {
			describe: "Print everything, like request id, or headers",
			type: "boolean",
			alias: "v",
		})
		.option("use-stdin", {
			describe: "Equivalent of using --data-binary @- in curl",
			type: "boolean",
			alias: "stdin",
		});
}

export async function curlCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof yargsCurl>,
	config: Config
) {
	await requestFromCmd(args, config);
}

async function read(stream: NodeJS.ReadStream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function requestFromCmd(
	args: {
		path: string;
		method: string;
		header: (string | number)[] | undefined;
		data?: string;
		silent?: boolean;
		verbose?: boolean;
		useStdin?: boolean;
		json?: boolean;
	},
	_config: Config
): Promise<void> {
	const requestId = `wrangler-${randomUUID()}`;
	if (!args.json && args.verbose) {
		console.log(bold(brandColor("Request id: " + requestId)));
	}

	if (args.useStdin) {
		args.data = await read(process.stdin);
	}

	const res = await request(OpenAPI, {
		url: args.path,
		method: args.method as
			| "GET"
			| "PUT"
			| "POST"
			| "DELETE"
			| "OPTIONS"
			| "HEAD"
			| "PATCH",
		body: args.data ? JSON.parse(args.data) : undefined,
		headers: (args.header ?? []).reduce(
			(prev, now) => ({
				...prev,
				[now.toString().split(":")[0].trim()]: now
					.toString()
					.split(":")[1]
					.trim(),
			}),
			{ "coordinator-request-id": requestId }
		),
	});

	const headers = Object.fromEntries(res.headers);
	delete headers["Authorization"];
	delete headers["set-cookie"];

	const data = await res.text();
	if (args.json || args.silent) {
		console.log(
			JSON.stringify(
				!args.verbose
					? JSON.parse(data)
					: {
							data,
							headers: res.headers,
							status: res.status,
							request_id: requestId,
						},
				null,
				4
			)
		);
		return;
	}

	const colorDependingOnOK =
		res.status <= 300 ? green : res.status === 500 ? red : yellow;
	console.log(
		colorDependingOnOK(
			`${bold(res.status.toString())} ${res.statusText} ${args.path}`
		)
	);

	if (args.verbose) {
		console.log(cyanBright(">> Headers"));
		for (const key in headers) {
			console.log("\t", yellow(`${key}: ${headers[key]}`));
		}
	}

	if (res.status !== 204) {
		console.log(cyanBright(">> Body"));
		let text = "";
		try {
			const parsed = JSON.parse(data);
			text = JSON.stringify(parsed, null, 4);
		} catch {
			text = data;
		}
		console.log(
			text
				.split("\n")
				.map((line) => `${yellow(`\t`)} ${brandColor(line)}`)
				.join("\n")
		);
	}
}
