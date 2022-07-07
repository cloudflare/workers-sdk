/**
 * Copyright 2020 Google Inc. All rights reserved.
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
import { DOMWorld, WaitForSelectorOptions } from './DOMWorld.js';
import { ElementHandle } from './ElementHandle.js';
import { JSHandle } from './JSHandle.js';
/**
 * @internal
 */
export interface InternalQueryHandler {
    queryOne?: (element: ElementHandle<Node>, selector: string) => Promise<ElementHandle<Node> | null>;
    queryAll?: (element: ElementHandle<Node>, selector: string) => Promise<Array<ElementHandle<Node>>>;
    waitFor?: (domWorld: DOMWorld, selector: string, options: WaitForSelectorOptions) => Promise<ElementHandle<Node> | null>;
    queryAllArray?: (element: ElementHandle<Node>, selector: string) => Promise<JSHandle<Node[]>>;
}
/**
 * Contains two functions `queryOne` and `queryAll` that can
 * be {@link registerCustomQueryHandler | registered}
 * as alternative querying strategies. The functions `queryOne` and `queryAll`
 * are executed in the page context.  `queryOne` should take an `Element` and a
 * selector string as argument and return a single `Element` or `null` if no
 * element is found. `queryAll` takes the same arguments but should instead
 * return a `NodeListOf<Element>` or `Array<Element>` with all the elements
 * that match the given query selector.
 * @public
 */
export interface CustomQueryHandler {
    queryOne?: (element: Node, selector: string) => Node | null;
    queryAll?: (element: Node, selector: string) => Node[];
}
/**
 * Registers a {@link CustomQueryHandler | custom query handler}.
 *
 * @remarks
 * After registration, the handler can be used everywhere where a selector is
 * expected by prepending the selection string with `<name>/`. The name is only
 * allowed to consist of lower- and upper case latin letters.
 *
 * @example
 * ```
 * puppeteer.registerCustomQueryHandler('text', { … });
 * const aHandle = await page.$('text/…');
 * ```
 *
 * @param name - The name that the custom query handler will be registered
 * under.
 * @param queryHandler - The {@link CustomQueryHandler | custom query handler}
 * to register.
 *
 * @public
 */
export declare function registerCustomQueryHandler(name: string, handler: CustomQueryHandler): void;
/**
 * @param name - The name of the query handler to unregistered.
 *
 * @public
 */
export declare function unregisterCustomQueryHandler(name: string): void;
/**
 * @returns a list with the names of all registered custom query handlers.
 *
 * @public
 */
export declare function customQueryHandlerNames(): string[];
/**
 * Clears all registered handlers.
 *
 * @public
 */
export declare function clearCustomQueryHandlers(): void;
/**
 * @internal
 */
export declare function getQueryHandlerAndSelector(selector: string): {
    updatedSelector: string;
    queryHandler: InternalQueryHandler;
};
//# sourceMappingURL=QueryHandler.d.ts.map