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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ExecutionContext_instances, _ExecutionContext_evaluate;
import { assert } from './assert.js';
import { JSHandle } from './JSHandle.js';
import { getExceptionMessage, isString, valueFromRemoteObject, createJSHandle, } from './util.js';
/**
 * @public
 */
export const EVALUATION_SCRIPT_URL = 'pptr://__puppeteer_evaluation_script__';
const SOURCE_URL_REGEX = /^[\040\t]*\/\/[@#] sourceURL=\s*(\S*?)\s*$/m;
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
export class ExecutionContext {
    /**
     * @internal
     */
    constructor(client, contextPayload, world) {
        _ExecutionContext_instances.add(this);
        this._client = client;
        this._world = world;
        this._contextId = contextPayload.id;
        this._contextName = contextPayload.name;
    }
    /**
     * @remarks
     *
     * Not every execution context is associated with a frame. For
     * example, workers and extensions have execution contexts that are not
     * associated with frames.
     *
     * @returns The frame associated with this execution context.
     */
    frame() {
        return this._world ? this._world.frame() : null;
    }
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
    async evaluate(pageFunction, ...args) {
        return await __classPrivateFieldGet(this, _ExecutionContext_instances, "m", _ExecutionContext_evaluate).call(this, true, pageFunction, ...args);
    }
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
    async evaluateHandle(pageFunction, ...args) {
        return __classPrivateFieldGet(this, _ExecutionContext_instances, "m", _ExecutionContext_evaluate).call(this, false, pageFunction, ...args);
    }
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
    async queryObjects(prototypeHandle) {
        assert(!prototypeHandle._disposed, 'Prototype JSHandle is disposed!');
        assert(prototypeHandle._remoteObject.objectId, 'Prototype JSHandle must not be referencing primitive value');
        const response = await this._client.send('Runtime.queryObjects', {
            prototypeObjectId: prototypeHandle._remoteObject.objectId,
        });
        return createJSHandle(this, response.objects);
    }
    /**
     * @internal
     */
    async _adoptBackendNodeId(backendNodeId) {
        const { object } = await this._client.send('DOM.resolveNode', {
            backendNodeId: backendNodeId,
            executionContextId: this._contextId,
        });
        return createJSHandle(this, object);
    }
    /**
     * @internal
     */
    async _adoptElementHandle(elementHandle) {
        assert(elementHandle.executionContext() !== this, 'Cannot adopt handle that already belongs to this execution context');
        assert(this._world, 'Cannot adopt handle without DOMWorld');
        const nodeInfo = await this._client.send('DOM.describeNode', {
            objectId: elementHandle._remoteObject.objectId,
        });
        return (await this._adoptBackendNodeId(nodeInfo.node.backendNodeId));
    }
}
_ExecutionContext_instances = new WeakSet(), _ExecutionContext_evaluate = async function _ExecutionContext_evaluate(returnByValue, pageFunction, ...args) {
    const suffix = `//# sourceURL=${EVALUATION_SCRIPT_URL}`;
    if (isString(pageFunction)) {
        const contextId = this._contextId;
        const expression = pageFunction;
        const expressionWithSourceUrl = SOURCE_URL_REGEX.test(expression)
            ? expression
            : expression + '\n' + suffix;
        const { exceptionDetails, result: remoteObject } = await this._client
            .send('Runtime.evaluate', {
            expression: expressionWithSourceUrl,
            contextId,
            returnByValue,
            awaitPromise: true,
            userGesture: true,
        })
            .catch(rewriteError);
        if (exceptionDetails) {
            throw new Error('Evaluation failed: ' + getExceptionMessage(exceptionDetails));
        }
        return returnByValue
            ? valueFromRemoteObject(remoteObject)
            : createJSHandle(this, remoteObject);
    }
    if (typeof pageFunction !== 'function') {
        throw new Error(`Expected to get |string| or |function| as the first argument, but got "${pageFunction}" instead.`);
    }
    let functionText = pageFunction.toString();
    try {
        new Function('(' + functionText + ')');
    }
    catch (error) {
        // This means we might have a function shorthand. Try another
        // time prefixing 'function '.
        if (functionText.startsWith('async ')) {
            functionText =
                'async function ' + functionText.substring('async '.length);
        }
        else {
            functionText = 'function ' + functionText;
        }
        try {
            new Function('(' + functionText + ')');
        }
        catch (error) {
            // We tried hard to serialize, but there's a weird beast here.
            throw new Error('Passed function is not well-serializable!');
        }
    }
    let callFunctionOnPromise;
    try {
        callFunctionOnPromise = this._client.send('Runtime.callFunctionOn', {
            functionDeclaration: functionText + '\n' + suffix + '\n',
            executionContextId: this._contextId,
            arguments: args.map(convertArgument.bind(this)),
            returnByValue,
            awaitPromise: true,
            userGesture: true,
        });
    }
    catch (error) {
        if (error instanceof TypeError &&
            error.message.startsWith('Converting circular structure to JSON')) {
            error.message += ' Recursive objects are not allowed.';
        }
        throw error;
    }
    const { exceptionDetails, result: remoteObject } = await callFunctionOnPromise.catch(rewriteError);
    if (exceptionDetails) {
        throw new Error('Evaluation failed: ' + getExceptionMessage(exceptionDetails));
    }
    return returnByValue
        ? valueFromRemoteObject(remoteObject)
        : createJSHandle(this, remoteObject);
    function convertArgument(arg) {
        if (typeof arg === 'bigint') {
            // eslint-disable-line valid-typeof
            return { unserializableValue: `${arg.toString()}n` };
        }
        if (Object.is(arg, -0)) {
            return { unserializableValue: '-0' };
        }
        if (Object.is(arg, Infinity)) {
            return { unserializableValue: 'Infinity' };
        }
        if (Object.is(arg, -Infinity)) {
            return { unserializableValue: '-Infinity' };
        }
        if (Object.is(arg, NaN)) {
            return { unserializableValue: 'NaN' };
        }
        const objectHandle = arg && arg instanceof JSHandle ? arg : null;
        if (objectHandle) {
            if (objectHandle._context !== this) {
                throw new Error('JSHandles can be evaluated only in the context they were created!');
            }
            if (objectHandle._disposed) {
                throw new Error('JSHandle is disposed!');
            }
            if (objectHandle._remoteObject.unserializableValue) {
                return {
                    unserializableValue: objectHandle._remoteObject.unserializableValue,
                };
            }
            if (!objectHandle._remoteObject.objectId) {
                return { value: objectHandle._remoteObject.value };
            }
            return { objectId: objectHandle._remoteObject.objectId };
        }
        return { value: arg };
    }
    function rewriteError(error) {
        if (error.message.includes('Object reference chain is too long')) {
            return { result: { type: 'undefined' } };
        }
        if (error.message.includes("Object couldn't be returned by value")) {
            return { result: { type: 'undefined' } };
        }
        if (error.message.endsWith('Cannot find context with specified id') ||
            error.message.endsWith('Inspected target navigated or closed')) {
            throw new Error('Execution context was destroyed, most likely because of a navigation.');
        }
        throw error;
    }
};
//# sourceMappingURL=ExecutionContext.js.map