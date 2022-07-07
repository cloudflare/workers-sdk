/**
 * Copyright 2019 Google Inc. All rights reserved.
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
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _JSHandle_client, _JSHandle_disposed, _JSHandle_context, _JSHandle_remoteObject;
import { assert } from './assert.js';
import { releaseObject, valueFromRemoteObject, createJSHandle } from './util.js';
/**
 * Represents an in-page JavaScript object. JSHandles can be created with the
 * {@link Page.evaluateHandle | page.evaluateHandle} method.
 *
 * @example
 * ```ts
 * const windowHandle = await page.evaluateHandle(() => window);
 * ```
 *
 * JSHandle prevents the referenced JavaScript object from being garbage-collected
 * unless the handle is {@link JSHandle.dispose | disposed}. JSHandles are auto-
 * disposed when their origin frame gets navigated or the parent context gets destroyed.
 *
 * JSHandle instances can be used as arguments for {@link Page.$eval},
 * {@link Page.evaluate}, and {@link Page.evaluateHandle}.
 *
 * @public
 */
export class JSHandle {
    /**
     * @internal
     */
    constructor(context, client, remoteObject) {
        _JSHandle_client.set(this, void 0);
        _JSHandle_disposed.set(this, false);
        _JSHandle_context.set(this, void 0);
        _JSHandle_remoteObject.set(this, void 0);
        __classPrivateFieldSet(this, _JSHandle_context, context, "f");
        __classPrivateFieldSet(this, _JSHandle_client, client, "f");
        __classPrivateFieldSet(this, _JSHandle_remoteObject, remoteObject, "f");
    }
    /**
     * @internal
     */
    get _client() {
        return __classPrivateFieldGet(this, _JSHandle_client, "f");
    }
    /**
     * @internal
     */
    get _disposed() {
        return __classPrivateFieldGet(this, _JSHandle_disposed, "f");
    }
    /**
     * @internal
     */
    get _remoteObject() {
        return __classPrivateFieldGet(this, _JSHandle_remoteObject, "f");
    }
    /**
     * @internal
     */
    get _context() {
        return __classPrivateFieldGet(this, _JSHandle_context, "f");
    }
    /** Returns the execution context the handle belongs to.
     */
    executionContext() {
        return __classPrivateFieldGet(this, _JSHandle_context, "f");
    }
    /**
     * This method passes this handle as the first argument to `pageFunction`. If
     * `pageFunction` returns a Promise, then `handle.evaluate` would wait for the
     * promise to resolve and return its value.
     *
     * @example
     * ```ts
     * const tweetHandle = await page.$('.tweet .retweets');
     * expect(await tweetHandle.evaluate(node => node.innerText)).toBe('10');
     * ```
     */
    async evaluate(pageFunction, ...args) {
        return await this.executionContext().evaluate(pageFunction, this, ...args);
    }
    /**
     * This method passes this handle as the first argument to `pageFunction`.
     *
     * @remarks
     *
     * The only difference between `jsHandle.evaluate` and
     * `jsHandle.evaluateHandle` is that `jsHandle.evaluateHandle` returns an
     * in-page object (JSHandle).
     *
     * If the function passed to `jsHandle.evaluateHandle` returns a Promise, then
     * `evaluateHandle.evaluateHandle` waits for the promise to resolve and
     * returns its value.
     *
     * See {@link Page.evaluateHandle} for more details.
     */
    async evaluateHandle(pageFunction, ...args) {
        return await this.executionContext().evaluateHandle(pageFunction, this, ...args);
    }
    async getProperty(propertyName) {
        return await this.evaluateHandle((object, propertyName) => {
            return object[propertyName];
        }, propertyName);
    }
    /**
     * The method returns a map with property names as keys and JSHandle instances
     * for the property values.
     *
     * @example
     * ```ts
     * const listHandle = await page.evaluateHandle(() => document.body.children);
     * const properties = await listHandle.getProperties();
     * const children = [];
     * for (const property of properties.values()) {
     *   const element = property.asElement();
     *   if (element)
     *     children.push(element);
     * }
     * children; // holds elementHandles to all children of document.body
     * ```
     */
    async getProperties() {
        assert(__classPrivateFieldGet(this, _JSHandle_remoteObject, "f").objectId);
        const response = await __classPrivateFieldGet(this, _JSHandle_client, "f").send('Runtime.getProperties', {
            objectId: __classPrivateFieldGet(this, _JSHandle_remoteObject, "f").objectId,
            ownProperties: true,
        });
        const result = new Map();
        for (const property of response.result) {
            if (!property.enumerable || !property.value) {
                continue;
            }
            result.set(property.name, createJSHandle(__classPrivateFieldGet(this, _JSHandle_context, "f"), property.value));
        }
        return result;
    }
    /**
     * @returns Returns a JSON representation of the object.If the object has a
     * `toJSON` function, it will not be called.
     * @remarks
     *
     * The JSON is generated by running {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}
     * on the object in page and consequent {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse} in puppeteer.
     * **NOTE** The method throws if the referenced object is not stringifiable.
     */
    async jsonValue() {
        if (__classPrivateFieldGet(this, _JSHandle_remoteObject, "f").objectId) {
            const response = await __classPrivateFieldGet(this, _JSHandle_client, "f").send('Runtime.callFunctionOn', {
                functionDeclaration: 'function() { return this; }',
                objectId: __classPrivateFieldGet(this, _JSHandle_remoteObject, "f").objectId,
                returnByValue: true,
                awaitPromise: true,
            });
            return valueFromRemoteObject(response.result);
        }
        return valueFromRemoteObject(__classPrivateFieldGet(this, _JSHandle_remoteObject, "f"));
    }
    /**
     * @returns Either `null` or the object handle itself, if the object
     * handle is an instance of {@link ElementHandle}.
     */
    asElement() {
        /*  This always returns null, but subclasses can override this and return an
             ElementHandle.
         */
        return null;
    }
    /**
     * Stops referencing the element handle, and resolves when the object handle is
     * successfully disposed of.
     */
    async dispose() {
        if (__classPrivateFieldGet(this, _JSHandle_disposed, "f")) {
            return;
        }
        __classPrivateFieldSet(this, _JSHandle_disposed, true, "f");
        await releaseObject(__classPrivateFieldGet(this, _JSHandle_client, "f"), __classPrivateFieldGet(this, _JSHandle_remoteObject, "f"));
    }
    /**
     * Returns a string representation of the JSHandle.
     *
     * @remarks Useful during debugging.
     */
    toString() {
        if (__classPrivateFieldGet(this, _JSHandle_remoteObject, "f").objectId) {
            const type = __classPrivateFieldGet(this, _JSHandle_remoteObject, "f").subtype || __classPrivateFieldGet(this, _JSHandle_remoteObject, "f").type;
            return 'JSHandle@' + type;
        }
        return 'JSHandle:' + valueFromRemoteObject(__classPrivateFieldGet(this, _JSHandle_remoteObject, "f"));
    }
}
_JSHandle_client = new WeakMap(), _JSHandle_disposed = new WeakMap(), _JSHandle_context = new WeakMap(), _JSHandle_remoteObject = new WeakMap();
//# sourceMappingURL=JSHandle.js.map