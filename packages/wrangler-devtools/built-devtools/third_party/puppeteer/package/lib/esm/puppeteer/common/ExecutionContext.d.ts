/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Protocol } from 'devtools-protocol';
import { CDPSession } from './Connection.js';
import { DOMWorld } from './DOMWorld.js';
import { ElementHandle } from './ElementHandle.js';
import { Frame } from './FrameManager.js';
import { JSHandle } from './JSHandle.js';
import { EvaluateFunc, HandleFor } from './types.js';
/**
 * @public
 */
export declare const EVALUATION_SCRIPT_URL = "pptr://__puppeteer_evaluation_script__";
/**
 * This class represents a context for JavaScript execution. A [Page] might have
 * many execution contexts:
 * - each
 *   {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe |
 *   frame } has "default" execution context that is always created after frame is
 *   attached to DOM. This context is returned by the
 *   {@link Frame.executionContext} method.
 * - {@link https://developer.chrome.com/extensions | Extension}'s content scripts
 *   create additional execution contexts.
 *
 * Besides pages, execution contexts can be found in
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API |
 * workers }.
 *
 * @public
 */
export declare class ExecutionContext {
    #private;
    /**
     * @internal
     */
    _client: CDPSession;
    /**
     * @internal
     */
    _world?: DOMWorld;
    /**
     * @internal
     */
    _contextId: number;
    /**
     * @internal
     */
    _contextName: string;
    /**
     * @internal
     */
    constructor(client: CDPSession, contextPayload: Protocol.Runtime.ExecutionContextDescription, world?: DOMWorld);
    /**
     * @remarks
     *
     * Not every execution context is associated with a frame. For
     * example, workers and extensions have execution contexts that are not
     * associated with frames.
     *
     * @returns The frame associated with this execution context.
     */
    frame(): Frame | null;
    /**
     * @remarks
     * If the function passed to the `executionContext.evaluate` returns a
     * Promise, then `executionContext.evaluate` would wait for the promise to
     * resolve and return its value. If the function passed to the
     * `executionContext.evaluate` returns a non-serializable value, then
     * `executionContext.evaluate` resolves to `undefined`. DevTools Protocol also
     * supports transferring some additional values that are not serializable by
     * `JSON`: `-0`, `NaN`, `Infinity`, `-Infinity`, and bigint literals.
     *
     *
     * @example
     * ```ts
     * const executionContext = await page.mainFrame().executionContext();
     * const result = await executionContext.evaluate(() => Promise.resolve(8 * 7))* ;
     * console.log(result); // prints "56"
     * ```
     *
     * @example
     * A string can also be passed in instead of a function.
     *
     * ```ts
     * console.log(await executionContext.evaluate('1 + 2')); // prints "3"
     * ```
     *
     * @example
     * {@link JSHandle} instances can be passed as arguments to the
     * `executionContext.* evaluate`:
     * ```ts
     * const oneHandle = await executionContext.evaluateHandle(() => 1);
     * const twoHandle = await executionContext.evaluateHandle(() => 2);
     * const result = await executionContext.evaluate(
     *    (a, b) => a + b, oneHandle, * twoHandle
     * );
     * await oneHandle.dispose();
     * await twoHandle.dispose();
     * console.log(result); // prints '3'.
     * ```
     * @param pageFunction - a function to be evaluated in the `executionContext`
     * @param args - argument to pass to the page function
     *
     * @returns A promise that resolves to the return value of the given function.
     */
    evaluate<Params extends unknown[], Func extends EvaluateFunc<Params> = EvaluateFunc<Params>>(pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    /**
     * @remarks
     * The only difference between `executionContext.evaluate` and
     * `executionContext.evaluateHandle` is that `executionContext.evaluateHandle`
     * returns an in-page object (a {@link JSHandle}).
     * If the function passed to the `executionContext.evaluateHandle` returns a
     * Promise, then `executionContext.evaluateHandle` would wait for the
     * promise to resolve and return its value.
     *
     * @example
     * ```ts
     * const context = await page.mainFrame().executionContext();
     * const aHandle = await context.evaluateHandle(() => Promise.resolve(self));
     * aHandle; // Handle for the global object.
     * ```
     *
     * @example
     * A string can also be passed in instead of a function.
     *
     * ```ts
     * // Handle for the '3' * object.
     * const aHandle = await context.evaluateHandle('1 + 2');
     * ```
     *
     * @example
     * JSHandle instances can be passed as arguments
     * to the `executionContext.* evaluateHandle`:
     *
     * ```ts
     * const aHandle = await context.evaluateHandle(() => document.body);
     * const resultHandle = await context.evaluateHandle(body => body.innerHTML, * aHandle);
     * console.log(await resultHandle.jsonValue()); // prints body's innerHTML
     * await aHandle.dispose();
     * await resultHandle.dispose();
     * ```
     *
     * @param pageFunction - a function to be evaluated in the `executionContext`
     * @param args - argument to pass to the page function
     *
     * @returns A promise that resolves to the return value of the given function
     * as an in-page object (a {@link JSHandle}).
     */
    evaluateHandle<Params extends unknown[], Func extends EvaluateFunc<Params> = EvaluateFunc<Params>>(pageFunction: Func | string, ...args: Params): Promise<HandleFor<Awaited<ReturnType<Func>>>>;
    /**
     * This method iterates the JavaScript heap and finds all the objects with the
     * given prototype.
     * @remarks
     * @example
     * ```ts
     * // Create a Map object
     * await page.evaluate(() => window.map = new Map());
     * // Get a handle to the Map object prototype
     * const mapPrototype = await page.evaluateHandle(() => Map.prototype);
     * // Query all map instances into an array
     * const mapInstances = await page.queryObjects(mapPrototype);
     * // Count amount of map objects in heap
     * const count = await page.evaluate(maps => maps.length, mapInstances);
     * await mapInstances.dispose();
     * await mapPrototype.dispose();
     * ```
     *
     * @param prototypeHandle - a handle to the object prototype
     *
     * @returns A handle to an array of objects with the given prototype.
     */
    queryObjects<Prototype>(prototypeHandle: JSHandle<Prototype>): Promise<HandleFor<Prototype[]>>;
    /**
     * @internal
     */
    _adoptBackendNodeId(backendNodeId?: Protocol.DOM.BackendNodeId): Promise<ElementHandle<Node>>;
    /**
     * @internal
     */
    _adoptElementHandle<T extends ElementHandle<Node>>(elementHandle: T): Promise<T>;
}
//# sourceMappingURL=ExecutionContext.d.ts.map