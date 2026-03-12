/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { ApiError } from "./ApiError";
import { CancelablePromise } from "./CancelablePromise";
import { type OpenAPIConfig } from "./OpenAPI";
import type { ApiRequestOptions } from "./ApiRequestOptions";
import type { ApiResult } from "./ApiResult";
import type { OnCancel } from "./CancelablePromise";
import type { PaginatedResult, ResultInfo } from "./PaginatedResult";

type FetchResponseInfo = {
	code: number;
	message: string;
};

type FetchResult<ResponseType = unknown> = {
	success: boolean;
	result?: ResponseType;
	errors?: FetchResponseInfo[];
	messages?: FetchResponseInfo[];
	result_info?: ResultInfo;
};

const isDefined = <T>(
	value: T | null | undefined
): value is Exclude<T, null | undefined> => {
	return value !== undefined && value !== null;
};

const isString = (value: any): value is string => {
	return typeof value === "string";
};

const isStringWithValue = (value: any): value is string => {
	return isString(value) && value !== "";
};

const isBlob = (value: any): value is Blob => {
	return (
		typeof value === "object" &&
		typeof value.type === "string" &&
		typeof value.stream === "function" &&
		typeof value.arrayBuffer === "function" &&
		typeof value.constructor === "function" &&
		typeof value.constructor.name === "string" &&
		/^(Blob|File)$/.test(value.constructor.name) &&
		/^(Blob|File)$/.test(value[Symbol.toStringTag])
	);
};

const base64 = (str: string): string => {
	try {
		return btoa(str);
	} catch (err) {
		// @ts-ignore
		return Buffer.from(str).toString("base64");
	}
};

const getQueryString = (params: Record<string, any>): string => {
	const qs: string[] = [];

	const append = (key: string, value: any) => {
		qs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	};

	const process = (key: string, value: any) => {
		if (isDefined(value)) {
			if (Array.isArray(value)) {
				value.forEach((v) => {
					process(key, v);
				});
			} else if (typeof value === "object") {
				Object.entries(value).forEach(([k, v]) => {
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
			if (options.path?.hasOwnProperty(group)) {
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

		const process = async (key: string, value: any) => {
			if (isString(value)) {
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
			(headers, [key, value]) => ({
				...headers,
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

const getRequestBody = (options: ApiRequestOptions): any => {
	if (options.body !== undefined) {
		if (options.mediaType?.includes("/json")) {
			return JSON.stringify(options.body);
		} else if (isString(options.body) || isBlob(options.body)) {
			return options.body;
		} else {
			return JSON.stringify(options.body);
		}
	}
	return undefined;
};

const isResponseSchemaV4 = (
	config: OpenAPIConfig,
	_options: ApiRequestOptions
): boolean => {
	return config.BASE.endsWith("/containers");
};

const parseResponseSchemaV4 = <T>(
	url: string,
	response: Response,
	responseHeader: string | undefined,
	responseBody: any
): ApiResult => {
	const fetchResult = (
		typeof responseBody === "object" ? responseBody : JSON.parse(responseBody)
	) as FetchResult<T>;
	const ok = response.ok && fetchResult.success;
	let result: any;
	if (ok) {
		if (fetchResult.result !== undefined) {
			result = fetchResult.result;
		} else {
			result = {};
		}
	} else {
		result = { error: fetchResult.errors?.[0]?.message };
	}
	return {
		url,
		ok,
		status: response.status,
		statusText: response.statusText,
		body: responseHeader ?? result,
	};
};

export const sendRequest = async (
	config: OpenAPIConfig,
	options: ApiRequestOptions,
	url: string,
	body: any,
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
	};

	if (config.WITH_CREDENTIALS) {
		// :(
		// The vite-plugin is attempting to typecheck everything with worker types, which does not support request.credentials
		// Also note this is always set to "omit".
		// @ts-ignore
		request.credentials = config.CREDENTIALS;
	}

	onCancel(() => controller.abort());

	return await fetch(url, request);
};

const getResponseHeader = (
	response: Response,
	responseHeader?: string
): string | undefined => {
	if (responseHeader) {
		const content = response.headers.get(responseHeader);
		if (isString(content)) {
			return content;
		}
	}
	return undefined;
};

const getResponseBody = async (response: Response): Promise<any> => {
	if (response.status !== 204) {
		try {
			const contentType = response.headers.get("Content-Type");
			if (contentType) {
				const jsonTypes = ["application/json", "application/problem+json"];
				const isJSON = jsonTypes.some((type) =>
					contentType.toLowerCase().startsWith(type)
				);
				if (isJSON) {
					return await response.json();
				} else {
					return await response.text();
				}
			}
		} catch (error) {
			console.error(error);
		}
	}
	return undefined;
};

const catchErrorCodes = (
	options: ApiRequestOptions,
	result: ApiResult
): void => {
	const errors: Record<number, string> = {
		400: "Bad Request",
		401: "Unauthorized",
		403: "Forbidden",
		404: "Not Found",
		500: "Internal Server Error",
		502: "Bad Gateway",
		503: "Service Unavailable",
		...options.errors,
	};

	const error = errors[result.status];
	if (error) {
		throw new ApiError(options, result, error);
	}

	if (!result.ok) {
		throw new ApiError(options, result, "Generic Error");
	}
};

type ExecuteRequestResult = {
	url: string;
	response: Response;
	responseBody: any;
	responseHeader: string | undefined;
};

/**
 * Shared HTTP execution: builds URL, headers, body, sends the request,
 * and returns the raw response components for further processing.
 * Returns null if the request was cancelled before sending.
 */
const executeRequest = async (
	config: OpenAPIConfig,
	options: ApiRequestOptions,
	onCancel: OnCancel
): Promise<ExecuteRequestResult | null> => {
	const url = getUrl(config, options);
	const formData = getFormData(options);
	const body = getRequestBody(options);
	const headers = await getHeaders(config, options);
	debugLogRequest(config, url, headers, formData ?? body ?? {});

	if (onCancel.isCancelled) {
		return null;
	}

	const response = await sendRequest(
		config,
		options,
		url,
		body,
		formData,
		headers,
		onCancel
	);
	const responseBody = await getResponseBody(response);
	const responseHeader = getResponseHeader(response, options.responseHeader);

	return { url, response, responseBody, responseHeader };
};

/**
 * Build an ApiResult from the raw response, handling V4 schema parsing.
 */
const buildApiResult = (
	config: OpenAPIConfig,
	options: ApiRequestOptions,
	req: ExecuteRequestResult
): ApiResult => {
	if (isResponseSchemaV4(config, options)) {
		return parseResponseSchemaV4(
			req.url,
			req.response,
			req.responseHeader,
			req.responseBody
		);
	}

	return {
		url: req.url,
		ok: req.response.ok,
		status: req.response.status,
		statusText: req.response.statusText,
		body: req.responseHeader ?? req.responseBody,
	};
};

/**
 * Request method
 * @param config The OpenAPI configuration object
 * @param options The request options from the service
 * @returns CancelablePromise<T>
 * @throws ApiError
 */
export const request = <T>(
	config: OpenAPIConfig,
	options: ApiRequestOptions
): CancelablePromise<T> => {
	return new CancelablePromise(async (resolve, reject, onCancel) => {
		try {
			const req = await executeRequest(config, options, onCancel);
			if (!req) {
				return;
			}

			const result = buildApiResult(config, options, req);
			debugLogResponse(config, result);
			catchErrorCodes(options, result);
			resolve(result.body);
		} catch (error) {
			reject(error);
		}
	});
};

/**
 * Request method that preserves pagination info from V4 responses
 * @param config The OpenAPI configuration object
 * @param options The request options from the service
 * @returns CancelablePromise<PaginatedResult<T>>
 * @throws ApiError
 */
export const requestPaginated = <T>(
	config: OpenAPIConfig,
	options: ApiRequestOptions
): CancelablePromise<PaginatedResult<T>> => {
	return new CancelablePromise(async (resolve, reject, onCancel) => {
		try {
			const req = await executeRequest(config, options, onCancel);
			if (!req) {
				return;
			}

			const result = buildApiResult(config, options, req);
			debugLogResponse(config, result);
			catchErrorCodes(options, result);

			// Extract result_info from the raw V4 response body for pagination
			let resultInfo: ResultInfo | undefined;
			if (isResponseSchemaV4(config, options)) {
				const fetchResult = (
					typeof req.responseBody === "object"
						? req.responseBody
						: JSON.parse(req.responseBody)
				) as FetchResult<T>;
				resultInfo = fetchResult.result_info;
			}

			resolve({
				data: result.body as T,
				resultInfo,
			});
		} catch (error) {
			reject(error);
		}
	});
};

const debugLogRequest = async (
	config: OpenAPIConfig,
	url: string,
	headers: Headers,
	body: FormData | unknown
) => {
	config.LOGGER?.debug(`-- START CF API REQUEST: ${url}`);
	const logHeaders = new Headers(headers);
	logHeaders.delete("Authorization");
	config.LOGGER?.debugWithSanitization(
		"HEADERS:",
		JSON.stringify(logHeaders, null, 2)
	);
	config.LOGGER?.debugWithSanitization(
		"BODY:",
		JSON.stringify(
			body instanceof FormData ? await new Response(body).text() : body,
			null,
			2
		)
	);
	config.LOGGER?.debug("-- END CF API REQUEST");
};

const debugLogResponse = (config: OpenAPIConfig, response: ApiResult) => {
	config.LOGGER?.debug(
		"-- START CF API RESPONSE:",
		response.statusText,
		response.status
	);

	config.LOGGER?.debugWithSanitization("RESPONSE:", response.body);
	config.LOGGER?.debug("-- END CF API RESPONSE");
};
