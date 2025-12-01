/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "cloudflare:test" {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
	export function listDurableObjectIds<T>(
		namespace: DurableObjectNamespace<T>
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

	/**
	 * Creates an introspector for a specific Workflow instance, used to
	 * modify its behavior and await outcomes.
	 * This is the primary entry point for testing individual Workflow instances.
	 *
	 * @param workflow - The Workflow binding, e.g., `env.MY_WORKFLOW`.
	 * @param instanceId - The known ID of the Workflow instance to target.
	 * @returns A `WorkflowInstanceIntrospector` to control the instance's behavior.
	 *
	 * @remarks
	 * ### Dispose
	 *
	 * The introspector must be disposed after the test to remove mocks and release
	 * resources. This can be handled in two ways:
	 *
	 * 1.  **Implicit dispose**: With the `await using` syntax.
	 * `await using instance = await introspectWorkflowInstance(...)`
	 *
	 * 2.  **Explicit dispose**: Manually call `await instance.dispose()` at the end of the
	 * test.
	 *
	 * @example
	 * // Full test of a Workflow instance using implicit dispose
	 * it("should disable all sleeps and complete", async () => {
	 *   // 1. CONFIGURATION
	 *   // `await using` ensures .dispose() is automatically called at the end of the block.
	 *   await using instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "123456");
	 *
	 *   await instance.modify(async (m) => {
	 *     await m.disableSleeps();
	 *   });
	 *
	 *   // 2. EXECUTION
	 *   await env.MY_WORKFLOW.create({ id: "123456" });
	 *
	 *   // 3. ASSERTION
	 *   await instance.waitForStatus("complete");
	 *
	 *   // 4. DISPOSE is implicit and automatic here.
	 * });
	 */
	export function introspectWorkflowInstance(
		workflow: Workflow,
		instanceId: string
	): Promise<WorkflowInstanceIntrospector>;

	/**
	 * Provides methods to control a single Workflow instance.
	 */
	export interface WorkflowInstanceIntrospector {
		/**
		 * Applies modifications to the Workflow instance's behavior.
		 * Takes a callback function to apply modifications.
		 *
		 * @param fn - An async callback that receives a `WorkflowInstanceModifier` object.
		 * @returns The `WorkflowInstanceIntrospector` instance for chaining.
		 */
		modify(
			fn: (m: WorkflowInstanceModifier) => Promise<void>
		): Promise<WorkflowInstanceIntrospector>;

		/**
		 * Waits for a specific step to complete and return a result.
		 * If the step has already completed, this promise resolves immediately.
		 *
		 * @param step - An object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 * @returns A promise that resolves with the step's result,
		 * or rejects with an error if the step fails.
		 */
		waitForStepResult(step: { name: string; index?: number }): Promise<unknown>;

		/**
		 * Waits for the Workflow instance to reach a specific InstanceStatus status
		 * (e.g., 'running', 'complete').
		 * If the instance is already in the target status, this promise resolves immediately.
		 * Throws an error if the Workflow instance reaches a finite state
		 * (e.g., complete, errored) that is different from the target status.
		 *
		 * @param status - The target `InstanceStatus` to wait for.
		 */
		waitForStatus(status: InstanceStatus["status"]): Promise<void>;

		/**
		 * Disposes the Workflow instance introspector.
		 *
		 * This is crucial for ensuring test isolation by preventing state from
		 * leaking between tests. It should be called at the end of each test.
		 */
		dispose(): Promise<void>;

		/**
		 * An alias for {@link dispose} to support automatic disposal with the `using` keyword.
		 *
		 * @see {@link dispose}
		 * @example
		 * ```ts
		 * it('my workflow test', async () => {
		 *   await using instance = await introspectWorkflowInstance(env.WORKFLOW, "123456");
		 *
		 *   // ... your test logic ...
		 *
		 *   // .dispose() is automatically called here at the end of the scope
		 * });
		 * ```
		 */
		[Symbol.asyncDispose](): Promise<void>;
	}

	/**
	 * Provides methods to mock or alter the behavior of a Workflow instance's
	 * steps, events, and sleeps.
	 */
	interface WorkflowInstanceModifier {
		/**
		 * Disables sleeps, causing `step.sleep()` and `step.sleepUntil()` to
		 * resolve immediately.
		 *
		 * @example Disable all sleeps:
		 * ```ts
		 * await instance.modify(m => {
		 *   m.disableSleeps();
		 * });
		 * ```
		 *
		 * @example Disable a specific set of sleeps by their step names:
		 * ```ts
		 * await instance.modify(m => {
		 *   m.disableSleeps([{ name: "sleep1" }, { name: "sleep5" }, { name: "sleep7" }]);
		 * });
		 * ```
		 *
		 * @param steps - Optional array of specific steps to disable sleeps for.
		 * If omitted, **all sleeps** in the Workflow will be disabled.
		 * A step is an object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 */
		disableSleeps(steps?: { name: string; index?: number }[]): Promise<void>;

		/**
		 * Mocks the result of a `step.do()`, causing it to return a specified
		 * value instantly without executing the step's actual implementation.
		 *
		 * If called multiple times for the same step, an error will be thrown.
		 *
		 * @param step - An object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 * @param stepResult - The mock value to be returned by the step.
		 *
		 * @example Mock the result of the third step named "fetch-data":
		 * ```ts
		 * await instance.modify(m => {
		 *   m.mockStepResult(
		 *     { name: "fetch-data", index: 3 },
		 *     { success: true, data: [1, 2, 3] }
		 *   );
		 * });
		 * ```
		 */
		mockStepResult(
			step: { name: string; index?: number },
			stepResult: unknown
		): Promise<void>;

		/**
		 * Forces a `step.do()` to throw an error, simulating a failure without
		 * executing the step's actual implementation. Useful for testing retry logic
		 * and error handling.
		 *
		 * @example Mock a step that errors 3 times before succeeding:
		 * ```ts
		 * // This example assumes the "fetch-data" step is configured with at least 3 retries.
		 * await instance.modify(m => {
		 *   m.mockStepError(
		 *     { name: "fetch-data" },
		 *     new Error("Failed!"),
		 *     3
		 *   );
		 *   m.mockStepResult(
		 *     { name: "fetch-data" },
		 *     { success: true, data: [1, 2, 3] }
		 *   );
		 * });
		 * ```
		 *
		 * @param step - An object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 * @param error - The `Error` object to be thrown.
		 * @param times - Optional number of times to throw the error. If a step has
		 * retries configured, it will fail this many times before potentially
		 * succeeding on a subsequent attempt. If omitted, it will throw on **every attempt**.
		 */
		mockStepError(
			step: { name: string; index?: number },
			error: Error,
			times?: number
		): Promise<void>;

		/**
		 * Forces a `step.do()` to fail by timing out immediately, without executing
		 * the step's actual implementation. Default step timeout is 10 minutes.
		 *
		 * @example Mock a step that times out 3 times before succeeding:
		 * ```ts
		 * // This example assumes the "fetch-data" step is configured with at least 3 retries.
		 * await instance.modify(m => {
		 *   m.forceStepTimeout(
		 *     { name: "fetch-data" },
		 *     3
		 *   );
		 *   m.mockStepResult(
		 *     { name: "fetch-data" },
		 *     { success: true, data: [1, 2, 3] }
		 *   );
		 * });
		 * ```
		 *
		 * @param step - An object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 * @param times - Optional number of times the step will time out. Useful for
		 * testing retry logic. If omitted, it will time out on **every attempt**.
		 */
		forceStepTimeout(step: { name: string; index?: number }, times?: number);

		/**
		 * Sends a mock event to the Workflow instance. This causes a `step.waitForEvent()`
		 * to resolve with the provided payload, as long as the step's timeout has not
		 * yet expired. Default event timeout is 24 hours.
		 *
		 * @example Mock a step event:
		 * ```ts
		 * await instance.modify(m => {
		 *   m.mockEvent(
		 *     { type: "user-approval", payload: { approved: true } },
		 *   );
		 * ```
		 *
		 * @param event - The event to send, including its `type` and `payload`.
		 */
		mockEvent(event: { type: string; payload: unknown }): Promise<void>;

		/**
		 * Forces a `step.waitForEvent()` to time out instantly, causing the step to fail.
		 * This simulates a scenario where an expected event never arrives.
		 * Default event timeout is 24 hours.
		 *
		 * @example Mock a step to time out:
		 * ```ts
		 * await instance.modify(m => {
		 *   m.forceEventTimeout(
		 *     { name: "user-approval" },
		 *   );
		 * ```
		 *
		 * @param step - An object specifying the step `name` and optional `index` (1-based).
		 * If multiple steps share the same name, `index` targets a specific one.
		 * Defaults to the first step found (`index: 1`).
		 */
		forceEventTimeout(step: { name: string; index?: number }): Promise<void>;
	}

	/**
	 * Creates an **introspector** for a Workflow, where instance IDs are unknown
	 * beforehand. This allows for defining modifications that will apply to
	 * **all subsequently created instances**.
	 *
	 * This is the primary entry point for testing Workflow instances where the id
	 * is unknown before their creation.
	 *
	 * @param workflow - The Workflow binding, e.g., `env.MY_WORKFLOW`.
	 * @returns A `WorkflowIntrospector` to control the instances behavior.
	 *
	 * @remarks
	 * ### Dispose
	 *
	 * The introspector must be disposed after the test to remove mocks and release
	 * resources. This can be handled in two ways:
	 *
	 * 1.  **Implicit dispose**: With the `await using` syntax.
	 * `await using introspector = await introspectWorkflow(...)`
	 *
	 * 2.  **Explicit dispose**: Manually call `await introspector.dispose()` at the end of the
	 * test.
	 *
	 * @example
	 * ```ts
	 * // Full test of a Workflow instance using implicit dispose
	 * it("should disable all sleeps and complete", async () => {
	 *   // 1. CONFIGURATION
	 *   await using introspector = await introspectWorkflow(env.MY_WORKFLOW);
	 *   await introspector.modifyAll(async (m) => {
	 *     await m.disableSleeps();
	 *   });
	 *
	 *   // 2. EXECUTION
	 *   await env.MY_WORKFLOW.create();
	 *
	 *   // 3. ASSERTION
	 *   const instances = introspector.get();
	 *   for(const instance of instances) {
	 *     await instance.waitForStatus("complete");
	 *   }
	 *
	 * // 4. DISPOSE is implicit and automatic here.
	 * });
	 * ```
	 */
	export function introspectWorkflow(
		workflow: Workflow
	): Promise<WorkflowIntrospector>;

	/**
	 * Provides methods to control all instances created by a Worflow.
	 */
	export interface WorkflowIntrospector {
		/**
		 * Applies modifications to all Workflow instances created after calling
		 * `introspectWorkflow`. Takes a callback function to apply modifications.
		 *
		 * @param fn - An async callback that receives a `WorkflowInstanceModifier` object.
		 */
		modifyAll(
			fn: (m: WorkflowInstanceModifier) => Promise<void>
		): Promise<void>;

		/**
		 * Returns all `WorkflowInstanceIntrospector`s from Workflow instances
		 * created after calling `introspectWorkflow`.
		 */
		get(): WorkflowInstanceIntrospector[];

		/**
		 *
		 * Disposes the introspector and every `WorkflowInstanceIntrospector` from Workflow
		 * instances created after calling `introspectWorkflow`.
		 *
		 * This function is essential for test isolation, ensuring that results from one
		 * test do not leak into the next. It should be called at the end or after each test.
		 *
		 * **Note:** After dispose, `introspectWorkflow()` must be called again to begin
		 * a new introspection.
		 *
		 */
		dispose(): Promise<void>;

		/**
		 * An alias for {@link dispose} to support automatic disposal with the `using` keyword.
		 * This is an alternative to calling `dispose()` in an `afterEach` hook.
		 *
		 * @see {@link dispose}
		 * @example
		 * it('my workflow test', async () => {
		 * await using workflowIntrospector = await introspectWorkflow(env.WORKFLOW);
		 *
		 * // ... your test logic ...
		 *
		 * // .dispose() is automatically called here at the end of the scope
		 * });
		 */
		[Symbol.asyncDispose](): Promise<void>;
	}

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
			headers?:
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

		get(origin: string | RegExp | ((origin: string) => boolean)): Interceptable;

		/** Disables mocking in MockAgent. */
		deactivate(): void;
		/** Enables mocking in a MockAgent instance. When instantiated, a MockAgent is automatically activated. Therefore, this method is only effective after MockAgent.deactivate has been called. */
		activate(): void;

		/** Define host matchers so only matching requests that aren't intercepted by the mock dispatchers will be attempted. */
		enableNetConnect(
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
