/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "cloudflare:test" {
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface ProvidedEnv {}

	/**
	 * 2nd argument passed to modules-format exported handlers. Contains bindings
	 * configured in top-level `miniflare` pool options. To configure the type
	 * of this value, use an ambient module type:
	 *
	 * ```ts
	 * declare module "cloudflare:test" {
	 *   interface ProvidedEnv {
	 *     NAMESPACE: KVNamespace;
	 *   }
	 *
	 *   // ...or if you have an existing `Env` type...
	 *   interface ProvidedEnv extends Env {}
	 * }
	 * ```
	 */
	export const env: ProvidedEnv;

	/**
	 * Service binding to the default export defined in the `main` worker. Note
	 * this `main` worker runs in the same isolate/context as tests, so any global
	 * mocks will apply to it too.
	 */
	export const SELF: Fetcher;

	/**
	 * Declarative interface for mocking outbound `fetch()` requests. Deactivated
	 * by default and reset before running each test file. Only mocks `fetch()`
	 * requests for the current test runner worker. Auxiliary workers should mock
	 * `fetch()`es with the Miniflare `fetchMock`/`outboundService` options.
	 */
	export const fetchMock: MockAgent;

	/**
	 * Runs `callback` inside the Durable Object pointed-to by `stub`'s context.
	 * Conceptually, this temporarily replaces your Durable Object's `fetch()`
	 * handler with `callback`, then sends a request to it, returning the result.
	 * This can be used to call/spy-on Durable Object instance methods or seed/get
	 * persisted data. Note this can only be used with `stub`s pointing to Durable
	 * Objects defined in the `main` worker.
	 */
	import type * as Rpc from "cloudflare:workers";
	export function runInDurableObject<
		O extends DurableObject | Rpc.DurableObject,
		R,
	>(
		stub: DurableObjectStub<O>,
		callback: (instance: O, state: DurableObjectState) => R | Promise<R>
	): Promise<R>;
	/**
	 * Immediately runs and removes the Durable Object pointed-to by `stub`'s
	 * alarm if one is scheduled. Returns `true` if an alarm ran, and `false`
	 * otherwise. Note this can only be used with `stub`s pointing to Durable
	 * Objects defined in the `main` worker.
	 */
	export function runDurableObjectAlarm(
		stub: DurableObjectStub
	): Promise<boolean /* ran */>;
	/**
	 * Gets the IDs of all objects that have been created in the `namespace`.
	 * Respects `isolatedStorage` if enabled, i.e. objects created in a different
	 * test won't be returned.
	 */
	export function listDurableObjectIds(
		namespace: DurableObjectNamespace
	): Promise<DurableObjectId[]>;

	/**
	 * Creates an instance of `ExecutionContext` for use as the 3rd argument to
	 * modules-format exported handlers.
	 */
	export function createExecutionContext(): ExecutionContext;
	/**
	 * Waits for all `ExecutionContext#waitUntil()`ed `Promise`s to settle. Only
	 * accepts `ExecutionContext`s returned by `createExecutionContext()` or
	 * `EventContext`s return by `createPagesEventContext()`.
	 */
	export function waitOnExecutionContext(
		ctx: ExecutionContext | EventContext<ProvidedEnv, string, any>
	): Promise<void>;
	/**
	 * Creates an instance of `ScheduledController` for use as the 1st argument to
	 * modules-format `scheduled()` exported handlers.
	 */
	export function createScheduledController(
		options?: FetcherScheduledOptions
	): ScheduledController;
	/**
	 * Creates an instance of `MessageBatch` for use as the 1st argument to
	 * modules-format `queue()` exported handlers.
	 */
	export function createMessageBatch<Body = unknown>(
		queueName: string,
		messages: ServiceBindingQueueMessage<Body>[]
	): MessageBatch<Body>;
	/**
	 * Gets the ack/retry state of messages in the `MessageBatch`, and waits for
	 * all `ExecutionContext#waitUntil()`ed `Promise`s to settle. Only accepts
	 * instances of `MessageBatch` returned by `createMessageBatch()`, and
	 * instances of `ExecutionContext` returned by `createExecutionContext()`.
	 */
	export function getQueueResult(
		batch: MessageBatch,
		ctx: ExecutionContext
	): Promise<FetcherQueueResult>;

	export interface D1Migration {
		name: string;
		queries: string[];
	}

	/**
	 * Applies all un-applied `migrations` to database `db`, recording migrations
	 * state in the `migrationsTableName` table. `migrationsTableName` defaults to
	 * `d1_migrations`. Call the `readD1Migrations()` function from the
	 * `@cloudflare/vitest-pool-workers/config` package inside Node.js to get the
	 * `migrations` array.
	 */
	export function applyD1Migrations(
		db: D1Database,
		migrations: D1Migration[],
		migrationsTableName?: string
	): Promise<void>;

	// Only require `params` and `data` to be specified if they're non-empty
	interface EventContextInitBase {
		request: Request<unknown, IncomingRequestCfProperties>;
		functionPath?: string;
		next?(request: Request): Response | Promise<Response>;
	}
	type EventContextInitParams<Params extends string> = [Params] extends [never]
		? { params?: Record<string, never> }
		: { params: Record<Params, string | string[]> };
	type EventContextInitData<Data> =
		Data extends Record<string, never> ? { data?: Data } : { data: Data };
	type EventContextInit<E extends EventContext<any, any, any>> =
		E extends EventContext<any, infer Params, infer Data>
			? EventContextInitBase &
					EventContextInitParams<Params> &
					EventContextInitData<Data>
			: never;

	/**
	 * Creates an instance of `EventContext` for use as the argument to Pages
	 * Functions.
	 */
	export function createPagesEventContext<
		F extends PagesFunction<ProvidedEnv, string, any>,
	>(init: EventContextInit<Parameters<F>[0]>): Parameters<F>[0];

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
	type Buffer = Uint8Array;

	/** The scope associated with a mock dispatch. */
	abstract class MockScope<TData extends object = object> {
		/** Delay a reply by a set amount of time in ms. */
		delay(waitInMs: number): MockScope<TData>;
		/** Persist the defined mock data for the associated reply. It will return the defined mock data indefinitely. */
		persist(): MockScope<TData>;
		/** Define a reply for a set amount of matching requests. */
		times(repeatTimes: number): MockScope<TData>;
	}

	/** The interceptor for a Mock. */
	abstract class MockInterceptor {
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
	namespace MockInterceptor {
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
			TError extends Error = Error,
		> extends Options {
			times: number | null;
			persist: boolean;
			consumed: boolean;
			data: MockDispatchData<TData, TError>;
		}
		export interface MockDispatchData<
			TData extends object = object,
			TError extends Error = Error,
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
	abstract class MockAgent {
		/** Creates and retrieves mock Dispatcher instances which can then be used to intercept HTTP requests. If the number of connections on the mock agent is set to 1, a MockClient instance is returned. Otherwise a MockPool instance is returned. */
		// eslint-disable-next-line no-shadow
		get(origin: string | RegExp | ((origin: string) => boolean)): Interceptable;

		/** Disables mocking in MockAgent. */
		deactivate(): void;
		/** Enables mocking in a MockAgent instance. When instantiated, a MockAgent is automatically activated. Therefore, this method is only effective after MockAgent.deactivate has been called. */
		activate(): void;

		/** Define host matchers so only matching requests that aren't intercepted by the mock dispatchers will be attempted. */
		enableNetConnect(
			// eslint-disable-next-line no-shadow
			host?: string | RegExp | ((host: string) => boolean)
		): void;
		/** Causes all requests to throw when requests are not matched in a MockAgent intercept. */
		disableNetConnect(): void;

		pendingInterceptors(): PendingInterceptor[];
		assertNoPendingInterceptors(options?: {
			pendingInterceptorsFormatter?: PendingInterceptorsFormatter;
		}): void;
	}
}
