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
import { ariaHandler } from './AriaQueryHandler.js';
function createInternalQueryHandler(handler) {
    const internalHandler = {};
    if (handler.queryOne) {
        const queryOne = handler.queryOne;
        internalHandler.queryOne = async (element, selector) => {
            const jsHandle = await element.evaluateHandle(queryOne, selector);
            const elementHandle = jsHandle.asElement();
            if (elementHandle) {
                return elementHandle;
            }
            await jsHandle.dispose();
            return null;
        };
        internalHandler.waitFor = (domWorld, selector, options) => {
            return domWorld._waitForSelectorInPage(queryOne, selector, options);
        };
    }
    if (handler.queryAll) {
        const queryAll = handler.queryAll;
        internalHandler.queryAll = async (element, selector) => {
            const jsHandle = await element.evaluateHandle(queryAll, selector);
            const properties = await jsHandle.getProperties();
            await jsHandle.dispose();
            const result = [];
            for (const property of properties.values()) {
                const elementHandle = property.asElement();
                if (elementHandle) {
                    result.push(elementHandle);
                }
            }
            return result;
        };
        internalHandler.queryAllArray = async (element, selector) => {
            const resultHandle = (await element.evaluateHandle(queryAll, selector));
            const arrayHandle = await resultHandle.evaluateHandle(res => {
                return Array.from(res);
            });
            return arrayHandle;
        };
    }
    return internalHandler;
}
const defaultHandler = createInternalQueryHandler({
    queryOne: (element, selector) => {
        if (!('querySelector' in element)) {
            throw new Error(`Could not invoke \`querySelector\` on node of type ${element.nodeName}.`);
        }
        return element.querySelector(selector);
    },
    queryAll: (element, selector) => {
        if (!('querySelectorAll' in element)) {
            throw new Error(`Could not invoke \`querySelectorAll\` on node of type ${element.nodeName}.`);
        }
        return [
            ...element.querySelectorAll(selector),
        ];
    },
});
const pierceHandler = createInternalQueryHandler({
    queryOne: (element, selector) => {
        let found = null;
        const search = (root) => {
            const iter = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            do {
                const currentNode = iter.currentNode;
                if (currentNode.shadowRoot) {
                    search(currentNode.shadowRoot);
                }
                if (currentNode instanceof ShadowRoot) {
                    continue;
                }
                if (currentNode !== root && !found && currentNode.matches(selector)) {
                    found = currentNode;
                }
            } while (!found && iter.nextNode());
        };
        if (element instanceof Document) {
            element = element.documentElement;
        }
        search(element);
        return found;
    },
    queryAll: (element, selector) => {
        const result = [];
        const collect = (root) => {
            const iter = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            do {
                const currentNode = iter.currentNode;
                if (currentNode.shadowRoot) {
                    collect(currentNode.shadowRoot);
                }
                if (currentNode instanceof ShadowRoot) {
                    continue;
                }
                if (currentNode !== root && currentNode.matches(selector)) {
                    result.push(currentNode);
                }
            } while (iter.nextNode());
        };
        if (element instanceof Document) {
            element = element.documentElement;
        }
        collect(element);
        return result;
    },
});
const builtInHandlers = new Map([
    ['aria', ariaHandler],
    ['pierce', pierceHandler],
]);
const queryHandlers = new Map(builtInHandlers);
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
export function registerCustomQueryHandler(name, handler) {
    if (queryHandlers.get(name)) {
        throw new Error(`A custom query handler named "${name}" already exists`);
    }
    const isValidName = /^[a-zA-Z]+$/.test(name);
    if (!isValidName) {
        throw new Error(`Custom query handler names may only contain [a-zA-Z]`);
    }
    const internalHandler = createInternalQueryHandler(handler);
    queryHandlers.set(name, internalHandler);
}
/**
 * @param name - The name of the query handler to unregistered.
 *
 * @public
 */
export function unregisterCustomQueryHandler(name) {
    if (queryHandlers.has(name) && !builtInHandlers.has(name)) {
        queryHandlers.delete(name);
    }
}
/**
 * @returns a list with the names of all registered custom query handlers.
 *
 * @public
 */
export function customQueryHandlerNames() {
    return [...queryHandlers.keys()].filter(name => {
        return !builtInHandlers.has(name);
    });
}
/**
 * Clears all registered handlers.
 *
 * @public
 */
export function clearCustomQueryHandlers() {
    customQueryHandlerNames().forEach(unregisterCustomQueryHandler);
}
/**
 * @internal
 */
export function getQueryHandlerAndSelector(selector) {
    const hasCustomQueryHandler = /^[a-zA-Z]+\//.test(selector);
    if (!hasCustomQueryHandler) {
        return { updatedSelector: selector, queryHandler: defaultHandler };
    }
    const index = selector.indexOf('/');
    const name = selector.slice(0, index);
    const updatedSelector = selector.slice(index + 1);
    const queryHandler = queryHandlers.get(name);
    if (!queryHandler) {
        throw new Error(`Query set to use "${name}", but no query handler of that name was found`);
    }
    return {
        updatedSelector,
        queryHandler,
    };
}
//# sourceMappingURL=QueryHandler.js.map