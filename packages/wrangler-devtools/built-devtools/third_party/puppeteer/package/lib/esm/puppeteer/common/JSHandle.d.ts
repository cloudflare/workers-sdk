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
import { Protocol } from 'devtools-protocol';
import { CDPSession } from './Connection.js';
import { EvaluateFunc, HandleFor, HandleOr } from './types.js';
import { ExecutionContext } from './ExecutionContext.js';
import { MouseButton } from './Input.js';
import type { ElementHandle } from './ElementHandle.js';
declare const __JSHandleSymbol: unique symbol;
/**
 * @public
 */
export interface BoxModel {
    content: Point[];
    padding: Point[];
    border: Point[];
    margin: Point[];
    width: number;
    height: number;
}
/**
 * @public
 */
export interface BoundingBox extends Point {
    /**
     * the width of the element in pixels.
     */
    width: number;
    /**
     * the height of the element in pixels.
     */
    height: number;
}
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
export declare class JSHandle<T = unknown> {
    #private;
    /**
     * Used for nominally typing {@link JSHandle}.
     */
    [__JSHandleSymbol]?: T;
    /**
     * @internal
     */
    get _client(): CDPSession;
    /**
     * @internal
     */
    get _disposed(): boolean;
    /**
     * @internal
     */
    get _remoteObject(): Protocol.Runtime.RemoteObject;
    /**
     * @internal
     */
    get _context(): ExecutionContext;
    /**
     * @internal
     */
    constructor(context: ExecutionContext, client: CDPSession, remoteObject: Protocol.Runtime.RemoteObject);
    /** Returns the execution context the handle belongs to.
     */
    executionContext(): ExecutionContext;
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
    evaluate<Params extends unknown[], Func extends EvaluateFunc<[this, ...Params]> = EvaluateFunc<[
        this,
        ...Params
    ]>>(pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
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
    evaluateHandle<Params extends unknown[], Func extends EvaluateFunc<[this, ...Params]> = EvaluateFunc<[
        this,
        ...Params
    ]>>(pageFunction: Func | string, ...args: Params): Promise<HandleFor<Awaited<ReturnType<Func>>>>;
    /**
     * Fetches a single property from the referenced object.
     */
    getProperty<K extends keyof T>(propertyName: HandleOr<K>): Promise<HandleFor<T[K]>>;
    getProperty(propertyName: string): Promise<JSHandle<unknown>>;
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
    getProperties(): Promise<Map<string, JSHandle>>;
    /**
     * @returns Returns a JSON representation of the object.If the object has a
     * `toJSON` function, it will not be called.
     * @remarks
     *
     * The JSON is generated by running {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify | JSON.stringify}
     * on the object in page and consequent {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse} in puppeteer.
     * **NOTE** The method throws if the referenced object is not stringifiable.
     */
    jsonValue<T = unknown>(): Promise<T>;
    /**
     * @returns Either `null` or the object handle itself, if the object
     * handle is an instance of {@link ElementHandle}.
     */
    asElement(): ElementHandle<Node> | null;
    /**
     * Stops referencing the element handle, and resolves when the object handle is
     * successfully disposed of.
     */
    dispose(): Promise<void>;
    /**
     * Returns a string representation of the JSHandle.
     *
     * @remarks Useful during debugging.
     */
    toString(): string;
}
/**
 * @public
 */
export interface Offset {
    /**
     * x-offset for the clickable point relative to the top-left corder of the border box.
     */
    x: number;
    /**
     * y-offset for the clickable point relative to the top-left corder of the border box.
     */
    y: number;
}
/**
 * @public
 */
export interface ClickOptions {
    /**
     * Time to wait between `mousedown` and `mouseup` in milliseconds.
     *
     * @defaultValue 0
     */
    delay?: number;
    /**
     * @defaultValue 'left'
     */
    button?: MouseButton;
    /**
     * @defaultValue 1
     */
    clickCount?: number;
    /**
     * Offset for the clickable point relative to the top-left corder of the border box.
     */
    offset?: Offset;
}
/**
 * @public
 */
export interface PressOptions {
    /**
     * Time to wait between `keydown` and `keyup` in milliseconds. Defaults to 0.
     */
    delay?: number;
    /**
     * If specified, generates an input event with this text.
     */
    text?: string;
}
/**
 * @public
 */
export interface Point {
    x: number;
    y: number;
}
export {};
//# sourceMappingURL=JSHandle.d.ts.map