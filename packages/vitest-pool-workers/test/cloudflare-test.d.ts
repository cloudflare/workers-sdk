declare module "cloudflare:test" {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface ProvidedEnv {}

	export const env: ProvidedEnv;
	export const fetchMock: MockAgent;

	export function runInDurableObject<O extends DurableObject, R>(
		stub: DurableObjectStub,
		callback: (instance: O, state: DurableObjectState) => R | Promise<R>
	): Promise<R>;
	export function runDurableObjectAlarm(
		stub: DurableObjectStub
	): Promise<boolean /* ran */>;

	export function createExecutionContext(): ExecutionContext;
	export function getWaitUntil<T extends unknown[]>(
		ctx: ExecutionContext
	): Promise<T>;
	export function createScheduledController(
		options?: FetcherScheduledOptions
	): ScheduledController;
	export function getScheduledResult(
		ctrl: ScheduledController,
		ctx: ExecutionContext
	): Promise<FetcherScheduledResult>;
	export function createMessageBatch(
		queueName: string,
		messages: ServiceBindingQueueMessage[]
	): MessageBatch;
	export function getQueueResult(
		batch: QueueController,
		ctx: ExecutionContext
	): Promise<FetcherQueueResult>;
}

// Taken from `undici` (https://github.com/nodejs/undici/tree/main/types) with
// no dependency on `@types/node` and with unusable functions removed
//
// MIT License
//
// Copyright (c) Matteo Collina and Undici contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

/** The scope associated with a mock dispatch. */
declare abstract class MockScope<TData extends object = object> {
	/** Delay a reply by a set amount of time in ms. */
	delay(waitInMs: number): MockScope<TData>;
	/** Persist the defined mock data for the associated reply. It will return the defined mock data indefinitely. */
	persist(): MockScope<TData>;
	/** Define a reply for a set amount of matching requests. */
	times(repeatTimes: number): MockScope<TData>;
}

/** The interceptor for a Mock. */
declare abstract class MockInterceptor {
	/** Mock an undici request with the defined reply. */
	reply<TData extends object = object>(
		replyOptionsCallback: MockInterceptor.MockReplyOptionsCallback<TData>
	): MockScope<TData>;
	reply<TData extends object = object>(
		statusCode: number,
		data?:
			| TData
			| Buffer
			| string
			| MockInterceptor.MockResponseDataHandler<TData>,
		responseOptions?: MockInterceptor.MockResponseOptions
	): MockScope<TData>;
	/** Mock an undici request by throwing the defined reply error. */
	replyWithError<TError extends Error = Error>(error: TError): MockScope;
	/** Set default reply headers on the interceptor for subsequent mocked replies. */
	defaultReplyHeaders(headers: IncomingHttpHeaders): MockInterceptor;
	/** Set default reply trailers on the interceptor for subsequent mocked replies. */
	defaultReplyTrailers(trailers: Record<string, string>): MockInterceptor;
	/** Set automatically calculated content-length header on subsequent mocked replies. */
	replyContentLength(): MockInterceptor;
}
declare namespace MockInterceptor {
	/** MockInterceptor options. */
	export interface Options {
		/** Path to intercept on. */
		path: string | RegExp | ((path: string) => boolean);
		/** Method to intercept on. Defaults to GET. */
		method?: string | RegExp | ((method: string) => boolean);
		/** Body to intercept on. */
		body?: string | RegExp | ((body: string) => boolean);
		/** Headers to intercept on. */
		headers?: // eslint-disable-next-line unused-imports/no-unused-vars
		| Record<string, string | RegExp | ((body: string) => boolean)>
			| ((headers: Record<string, string>) => boolean);
		/** Query params to intercept on */
		query?: Record<string, unknown>;
	}
	export interface MockDispatch<
		TData extends object = object,
		TError extends Error = Error
	> extends Options {
		times: number | null;
		persist: boolean;
		consumed: boolean;
		data: MockDispatchData<TData, TError>;
	}
	export interface MockDispatchData<
		TData extends object = object,
		TError extends Error = Error
	> extends MockResponseOptions {
		error: TError | null;
		statusCode?: number;
		data?: TData | string;
	}
	export interface MockResponseOptions {
		headers?: IncomingHttpHeaders;
		trailers?: Record<string, string>;
	}
	export interface MockResponseCallbackOptions {
		path: string;
		origin: string;
		method: string;
		body?: BodyInit;
		headers: Headers | Record<string, string>;
		maxRedirections: number;
	}
	export type MockResponseDataHandler<TData extends object = object> = (
		opts: MockResponseCallbackOptions
	) => TData | Buffer | string;
	export type MockReplyOptionsCallback<TData extends object = object> = (
		opts: MockResponseCallbackOptions
	) => {
		statusCode: number;
		data?: TData | Buffer | string;
		responseOptions?: MockResponseOptions;
	};
}

interface Interceptable {
	/** Intercepts any matching requests that use the same origin as this mock client. */
	intercept(options: MockInterceptor.Options): MockInterceptor;
}

interface PendingInterceptor extends MockInterceptor.MockDispatch {
	origin: string;
}
interface PendingInterceptorsFormatter {
	format(pendingInterceptors: readonly PendingInterceptor[]): string;
}

/** A mocked Agent class that implements the Agent API. It allows one to intercept HTTP requests made through undici and return mocked responses instead. */
declare abstract class MockAgent {
	/** Creates and retrieves mock Dispatcher instances which can then be used to intercept HTTP requests. If the number of connections on the mock agent is set to 1, a MockClient instance is returned. Otherwise a MockPool instance is returned. */
	// eslint-disable-next-line no-shadow
	get(origin: string | RegExp | ((origin: string) => boolean)): Interceptable;

	/** Disables mocking in MockAgent. */
	deactivate(): void;
	/** Enables mocking in a MockAgent instance. When instantiated, a MockAgent is automatically activated. Therefore, this method is only effective after MockAgent.deactivate has been called. */
	activate(): void;

	/** Define host matchers so only matching requests that aren't intercepted by the mock dispatchers will be attempted. */
	// eslint-disable-next-line no-shadow
	enableNetConnect(host?: string | RegExp | ((host: string) => boolean)): void;
	/** Causes all requests to throw when requests are not matched in a MockAgent intercept. */
	disableNetConnect(): void;

	pendingInterceptors(): PendingInterceptor[];
	assertNoPendingInterceptors(options?: {
		pendingInterceptorsFormatter?: PendingInterceptorsFormatter;
	}): void;
}
