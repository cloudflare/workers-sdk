/* istanbul ignore file */
/* tslint:disable */
import type { ApiRequestOptions } from "./ApiRequestOptions";

type Resolver<T> = (options: ApiRequestOptions) => Promise<T>;
type Headers = Record<string, string>;
type WranglerLogger = {
	debug: (...args: unknown[]) => void;
	debugWithSanitization: (label: string, ...args: unknown[]) => void;
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};

export type OpenAPIConfig = {
	BASE: string;
	VERSION: string;
	WITH_CREDENTIALS: boolean;
	CREDENTIALS: "include" | "omit" | "same-origin";
	TOKEN?: string | Resolver<string>;
	USERNAME?: string | Resolver<string>;
	PASSWORD?: string | Resolver<string>;
	HEADERS?: Headers | Resolver<Headers>;
	ENCODE_PATH?: (path: string) => string;
	LOGGER?: WranglerLogger | undefined;
};

export const OpenAPI: OpenAPIConfig = {
	BASE: "",
	VERSION: "1.0.0",
	WITH_CREDENTIALS: false,
	CREDENTIALS: "include",
	TOKEN: undefined,
	USERNAME: undefined,
	PASSWORD: undefined,
	HEADERS: undefined,
	ENCODE_PATH: undefined,
	LOGGER: undefined,
};
