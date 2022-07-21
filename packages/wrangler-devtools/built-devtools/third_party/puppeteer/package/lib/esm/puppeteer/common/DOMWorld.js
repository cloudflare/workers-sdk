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
var _a, _DOMWorld_frameManager, _DOMWorld_client, _DOMWorld_frame, _DOMWorld_timeoutSettings, _DOMWorld_documentPromise, _DOMWorld_contextPromise, _DOMWorld_contextResolveCallback, _DOMWorld_detached, _DOMWorld_ctxBindings, _DOMWorld_boundFunctions, _DOMWorld_waitTasks, _DOMWorld_bindingIdentifier, _DOMWorld_settingUpBinding, _DOMWorld_onBindingCalled, _WaitTask_instances, _WaitTask_domWorld, _WaitTask_polling, _WaitTask_timeout, _WaitTask_predicateBody, _WaitTask_predicateAcceptsContextElement, _WaitTask_args, _WaitTask_binding, _WaitTask_runCount, _WaitTask_resolve, _WaitTask_reject, _WaitTask_timeoutTimer, _WaitTask_terminated, _WaitTask_root, _WaitTask_cleanup;
import { assert } from './assert.js';
import { TimeoutError } from './Errors.js';
import { LifecycleWatcher } from './LifecycleWatcher.js';
import { getQueryHandlerAndSelector } from './QueryHandler.js';
import { debugError, isNumber, isString, makePredicateString, pageBindingInitString, } from './util.js';
/**
 * @internal
 */
export class DOMWorld {
    constructor(client, frameManager, frame, timeoutSettings) {
        _DOMWorld_frameManager.set(this, void 0);
        _DOMWorld_client.set(this, void 0);
        _DOMWorld_frame.set(this, void 0);
        _DOMWorld_timeoutSettings.set(this, void 0);
        _DOMWorld_documentPromise.set(this, null);
        _DOMWorld_contextPromise.set(this, null);
        _DOMWorld_contextResolveCallback.set(this, null);
        _DOMWorld_detached.set(this, false);
        // Set of bindings that have been registered in the current context.
        _DOMWorld_ctxBindings.set(this, new Set());
        // Contains mapping from functions that should be bound to Puppeteer functions.
        _DOMWorld_boundFunctions.set(this, new Map());
        _DOMWorld_waitTasks.set(this, new Set());
        // If multiple waitFor are set up asynchronously, we need to wait for the
        // first one to set up the binding in the page before running the others.
        _DOMWorld_settingUpBinding.set(this, null);
        _DOMWorld_onBindingCalled.set(this, async (event) => {
            let payload;
            if (!this._hasContext()) {
                return;
            }
            const context = await this.executionContext();
            try {
                payload = JSON.parse(event.payload);
            }
            catch {
                // The binding was either called by something in the page or it was
                // called before our wrapper was initialized.
                return;
            }
            const { type, name, seq, args } = payload;
            if (type !== 'internal' ||
                !__classPrivateFieldGet(this, _DOMWorld_ctxBindings, "f").has(__classPrivateFieldGet(DOMWorld, _a, "f", _DOMWorld_bindingIdentifier).call(DOMWorld, name, context._contextId))) {
                return;
            }
            if (context._contextId !== event.executionContextId) {
                return;
            }
            try {
                const fn = this._boundFunctions.get(name);
                if (!fn) {
                    throw new Error(`Bound function $name is not found`);
                }
                const result = await fn(...args);
                await context.evaluate(deliverResult, name, seq, result);
            }
            catch (error) {
                // The WaitTask may already have been resolved by timing out, or the
                // exection context may have been destroyed.
                // In both caes, the promises above are rejected with a protocol error.
                // We can safely ignores these, as the WaitTask is re-installed in
                // the next execution context if needed.
                if (error.message.includes('Protocol error')) {
                    return;
                }
                debugError(error);
            }
            function deliverResult(name, seq, result) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore Code is evaluated in a different context.
                globalThis[name].callbacks.get(seq).resolve(result);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore Code is evaluated in a different context.
                globalThis[name].callbacks.delete(seq);
            }
        });
        // Keep own reference to client because it might differ from the FrameManager's
        // client for OOP iframes.
        __classPrivateFieldSet(this, _DOMWorld_client, client, "f");
        __classPrivateFieldSet(this, _DOMWorld_frameManager, frameManager, "f");
        __classPrivateFieldSet(this, _DOMWorld_frame, frame, "f");
        __classPrivateFieldSet(this, _DOMWorld_timeoutSettings, timeoutSettings, "f");
        this._setContext(null);
        __classPrivateFieldGet(this, _DOMWorld_client, "f").on('Runtime.bindingCalled', __classPrivateFieldGet(this, _DOMWorld_onBindingCalled, "f"));
    }
    get _waitTasks() {
        return __classPrivateFieldGet(this, _DOMWorld_waitTasks, "f");
    }
    get _boundFunctions() {
        return __classPrivateFieldGet(this, _DOMWorld_boundFunctions, "f");
    }
    frame() {
        return __classPrivateFieldGet(this, _DOMWorld_frame, "f");
    }
    async _setContext(context) {
        var _b;
        if (context) {
            assert(__classPrivateFieldGet(this, _DOMWorld_contextResolveCallback, "f"), 'Execution Context has already been set.');
            __classPrivateFieldGet(this, _DOMWorld_ctxBindings, "f").clear();
            (_b = __classPrivateFieldGet(this, _DOMWorld_contextResolveCallback, "f")) === null || _b === void 0 ? void 0 : _b.call(null, context);
            __classPrivateFieldSet(this, _DOMWorld_contextResolveCallback, null, "f");
            for (const waitTask of this._waitTasks) {
                waitTask.rerun();
            }
        }
        else {
            __classPrivateFieldSet(this, _DOMWorld_documentPromise, null, "f");
            __classPrivateFieldSet(this, _DOMWorld_contextPromise, new Promise(fulfill => {
                __classPrivateFieldSet(this, _DOMWorld_contextResolveCallback, fulfill, "f");
            }), "f");
        }
    }
    _hasContext() {
        return !__classPrivateFieldGet(this, _DOMWorld_contextResolveCallback, "f");
    }
    _detach() {
        __classPrivateFieldSet(this, _DOMWorld_detached, true, "f");
        __classPrivateFieldGet(this, _DOMWorld_client, "f").off('Runtime.bindingCalled', __classPrivateFieldGet(this, _DOMWorld_onBindingCalled, "f"));
        for (const waitTask of this._waitTasks) {
            waitTask.terminate(new Error('waitForFunction failed: frame got detached.'));
        }
    }
    executionContext() {
        if (__classPrivateFieldGet(this, _DOMWorld_detached, "f")) {
            throw new Error(`Execution context is not available in detached frame "${__classPrivateFieldGet(this, _DOMWorld_frame, "f").url()}" (are you trying to evaluate?)`);
        }
        if (__classPrivateFieldGet(this, _DOMWorld_contextPromise, "f") === null) {
            throw new Error(`Execution content promise is missing`);
        }
        return __classPrivateFieldGet(this, _DOMWorld_contextPromise, "f");
    }
    async evaluateHandle(pageFunction, ...args) {
        const context = await this.executionContext();
        return context.evaluateHandle(pageFunction, ...args);
    }
    async evaluate(pageFunction, ...args) {
        const context = await this.executionContext();
        return context.evaluate(pageFunction, ...args);
    }
    async $(selector) {
        const document = await this._document();
        const value = await document.$(selector);
        return value;
    }
    async $$(selector) {
        const document = await this._document();
        return document.$$(selector);
    }
    async _document() {
        if (__classPrivateFieldGet(this, _DOMWorld_documentPromise, "f")) {
            return __classPrivateFieldGet(this, _DOMWorld_documentPromise, "f");
        }
        __classPrivateFieldSet(this, _DOMWorld_documentPromise, this.executionContext().then(async (context) => {
            return await context.evaluateHandle(() => {
                return document;
            });
        }), "f");
        return __classPrivateFieldGet(this, _DOMWorld_documentPromise, "f");
    }
    async $x(expression) {
        const document = await this._document();
        const value = await document.$x(expression);
        return value;
    }
    async $eval(selector, pageFunction, ...args) {
        const document = await this._document();
        return document.$eval(selector, pageFunction, ...args);
    }
    async $$eval(selector, pageFunction, ...args) {
        const document = await this._document();
        const value = await document.$$eval(selector, pageFunction, ...args);
        return value;
    }
    async content() {
        return await this.evaluate(() => {
            let retVal = '';
            if (document.doctype) {
                retVal = new XMLSerializer().serializeToString(document.doctype);
            }
            if (document.documentElement) {
                retVal += document.documentElement.outerHTML;
            }
            return retVal;
        });
    }
    async setContent(html, options = {}) {
        const { waitUntil = ['load'], timeout = __classPrivateFieldGet(this, _DOMWorld_timeoutSettings, "f").navigationTimeout(), } = options;
        // We rely upon the fact that document.open() will reset frame lifecycle with "init"
        // lifecycle event. @see https://crrev.com/608658
        await this.evaluate(html => {
            document.open();
            document.write(html);
            document.close();
        }, html);
        const watcher = new LifecycleWatcher(__classPrivateFieldGet(this, _DOMWorld_frameManager, "f"), __classPrivateFieldGet(this, _DOMWorld_frame, "f"), waitUntil, timeout);
        const error = await Promise.race([
            watcher.timeoutOrTerminationPromise(),
            watcher.lifecyclePromise(),
        ]);
        watcher.dispose();
        if (error) {
            throw error;
        }
    }
    /**
     * Adds a script tag into the current context.
     *
     * @remarks
     *
     * You can pass a URL, filepath or string of contents. Note that when running Puppeteer
     * in a browser environment you cannot pass a filepath and should use either
     * `url` or `content`.
     */
    async addScriptTag(options) {
        const { url = null, path = null, content = null, id = '', type = '', } = options;
        if (url !== null) {
            try {
                const context = await this.executionContext();
                return await context.evaluateHandle(addScriptUrl, url, id, type);
            }
            catch (error) {
                throw new Error(`Loading script from ${url} failed`);
            }
        }
        if (path !== null) {
            let fs;
            try {
                fs = (await import('fs')).promises;
            }
            catch (error) {
                if (error instanceof TypeError) {
                    throw new Error('Can only pass a filepath to addScriptTag in a Node-like environment.');
                }
                throw error;
            }
            let contents = await fs.readFile(path, 'utf8');
            contents += '//# sourceURL=' + path.replace(/\n/g, '');
            const context = await this.executionContext();
            return await context.evaluateHandle(addScriptContent, contents, id, type);
        }
        if (content !== null) {
            const context = await this.executionContext();
            return await context.evaluateHandle(addScriptContent, content, id, type);
        }
        throw new Error('Provide an object with a `url`, `path` or `content` property');
        async function addScriptUrl(url, id, type) {
            const script = document.createElement('script');
            script.src = url;
            if (id) {
                script.id = id;
            }
            if (type) {
                script.type = type;
            }
            const promise = new Promise((res, rej) => {
                script.onload = res;
                script.onerror = rej;
            });
            document.head.appendChild(script);
            await promise;
            return script;
        }
        function addScriptContent(content, id, type = 'text/javascript') {
            const script = document.createElement('script');
            script.type = type;
            script.text = content;
            if (id) {
                script.id = id;
            }
            let error = null;
            script.onerror = e => {
                return (error = e);
            };
            document.head.appendChild(script);
            if (error) {
                throw error;
            }
            return script;
        }
    }
    /**
     * Adds a style tag into the current context.
     *
     * @remarks
     *
     * You can pass a URL, filepath or string of contents. Note that when running Puppeteer
     * in a browser environment you cannot pass a filepath and should use either
     * `url` or `content`.
     *
     */
    async addStyleTag(options) {
        const { url = null, path = null, content = null } = options;
        if (url !== null) {
            try {
                const context = await this.executionContext();
                const handle = await context.evaluateHandle(addStyleUrl, url);
                const elementHandle = handle.asElement();
                if (elementHandle === null) {
                    throw new Error('Style element is not found');
                }
                return elementHandle;
            }
            catch (error) {
                throw new Error(`Loading style from ${url} failed`);
            }
        }
        if (path !== null) {
            let fs;
            try {
                fs = (await import('fs')).promises;
            }
            catch (error) {
                if (error instanceof TypeError) {
                    throw new Error('Cannot pass a filepath to addStyleTag in the browser environment.');
                }
                throw error;
            }
            let contents = await fs.readFile(path, 'utf8');
            contents += '/*# sourceURL=' + path.replace(/\n/g, '') + '*/';
            const context = await this.executionContext();
            const handle = await context.evaluateHandle(addStyleContent, contents);
            const elementHandle = handle.asElement();
            if (elementHandle === null) {
                throw new Error('Style element is not found');
            }
            return elementHandle;
        }
        if (content !== null) {
            const context = await this.executionContext();
            const handle = await context.evaluateHandle(addStyleContent, content);
            const elementHandle = handle.asElement();
            if (elementHandle === null) {
                throw new Error('Style element is not found');
            }
            return elementHandle;
        }
        throw new Error('Provide an object with a `url`, `path` or `content` property');
        async function addStyleUrl(url) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            const promise = new Promise((res, rej) => {
                link.onload = res;
                link.onerror = rej;
            });
            document.head.appendChild(link);
            await promise;
            return link;
        }
        async function addStyleContent(content) {
            const style = document.createElement('style');
            style.appendChild(document.createTextNode(content));
            const promise = new Promise((res, rej) => {
                style.onload = res;
                style.onerror = rej;
            });
            document.head.appendChild(style);
            await promise;
            return style;
        }
    }
    async click(selector, options) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        await handle.click(options);
        await handle.dispose();
    }
    async focus(selector) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        await handle.focus();
        await handle.dispose();
    }
    async hover(selector) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        await handle.hover();
        await handle.dispose();
    }
    async select(selector, ...values) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        const result = await handle.select(...values);
        await handle.dispose();
        return result;
    }
    async tap(selector) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        await handle.tap();
        await handle.dispose();
    }
    async type(selector, text, options) {
        const handle = await this.$(selector);
        assert(handle, `No element found for selector: ${selector}`);
        await handle.type(text, options);
        await handle.dispose();
    }
    async waitForSelector(selector, options) {
        const { updatedSelector, queryHandler } = getQueryHandlerAndSelector(selector);
        assert(queryHandler.waitFor, 'Query handler does not support waiting');
        return (await queryHandler.waitFor(this, updatedSelector, options));
    }
    async _addBindingToContext(context, name) {
        // Previous operation added the binding so we are done.
        if (__classPrivateFieldGet(this, _DOMWorld_ctxBindings, "f").has(__classPrivateFieldGet(DOMWorld, _a, "f", _DOMWorld_bindingIdentifier).call(DOMWorld, name, context._contextId))) {
            return;
        }
        // Wait for other operation to finish
        if (__classPrivateFieldGet(this, _DOMWorld_settingUpBinding, "f")) {
            await __classPrivateFieldGet(this, _DOMWorld_settingUpBinding, "f");
            return this._addBindingToContext(context, name);
        }
        const bind = async (name) => {
            const expression = pageBindingInitString('internal', name);
            try {
                // TODO: In theory, it would be enough to call this just once
                await context._client.send('Runtime.addBinding', {
                    name,
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore The protocol definition is not up to date.
                    executionContextName: context._contextName,
                });
                await context.evaluate(expression);
            }
            catch (error) {
                // We could have tried to evaluate in a context which was already
                // destroyed. This happens, for example, if the page is navigated while
                // we are trying to add the binding
                const ctxDestroyed = error.message.includes('Execution context was destroyed');
                const ctxNotFound = error.message.includes('Cannot find context with specified id');
                if (ctxDestroyed || ctxNotFound) {
                    return;
                }
                else {
                    debugError(error);
                    return;
                }
            }
            __classPrivateFieldGet(this, _DOMWorld_ctxBindings, "f").add(__classPrivateFieldGet(DOMWorld, _a, "f", _DOMWorld_bindingIdentifier).call(DOMWorld, name, context._contextId));
        };
        __classPrivateFieldSet(this, _DOMWorld_settingUpBinding, bind(name), "f");
        await __classPrivateFieldGet(this, _DOMWorld_settingUpBinding, "f");
        __classPrivateFieldSet(this, _DOMWorld_settingUpBinding, null, "f");
    }
    async _waitForSelectorInPage(queryOne, selector, options, binding) {
        const { visible: waitForVisible = false, hidden: waitForHidden = false, timeout = __classPrivateFieldGet(this, _DOMWorld_timeoutSettings, "f").timeout(), } = options;
        const polling = waitForVisible || waitForHidden ? 'raf' : 'mutation';
        const title = `selector \`${selector}\`${waitForHidden ? ' to be hidden' : ''}`;
        async function predicate(root, selector, waitForVisible, waitForHidden) {
            const node = predicateQueryHandler
                ? (await predicateQueryHandler(root, selector))
                : root.querySelector(selector);
            return checkWaitForOptions(node, waitForVisible, waitForHidden);
        }
        const waitTaskOptions = {
            domWorld: this,
            predicateBody: makePredicateString(predicate, queryOne),
            predicateAcceptsContextElement: true,
            title,
            polling,
            timeout,
            args: [selector, waitForVisible, waitForHidden],
            binding,
            root: options.root,
        };
        const waitTask = new WaitTask(waitTaskOptions);
        const jsHandle = await waitTask.promise;
        const elementHandle = jsHandle.asElement();
        if (!elementHandle) {
            await jsHandle.dispose();
            return null;
        }
        return elementHandle;
    }
    async waitForXPath(xpath, options) {
        const { visible: waitForVisible = false, hidden: waitForHidden = false, timeout = __classPrivateFieldGet(this, _DOMWorld_timeoutSettings, "f").timeout(), } = options;
        const polling = waitForVisible || waitForHidden ? 'raf' : 'mutation';
        const title = `XPath \`${xpath}\`${waitForHidden ? ' to be hidden' : ''}`;
        function predicate(root, xpath, waitForVisible, waitForHidden) {
            const node = document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return checkWaitForOptions(node, waitForVisible, waitForHidden);
        }
        const waitTaskOptions = {
            domWorld: this,
            predicateBody: makePredicateString(predicate),
            predicateAcceptsContextElement: true,
            title,
            polling,
            timeout,
            args: [xpath, waitForVisible, waitForHidden],
            root: options.root,
        };
        const waitTask = new WaitTask(waitTaskOptions);
        const jsHandle = await waitTask.promise;
        const elementHandle = jsHandle.asElement();
        if (!elementHandle) {
            await jsHandle.dispose();
            return null;
        }
        return elementHandle;
    }
    waitForFunction(pageFunction, options = {}, ...args) {
        const { polling = 'raf', timeout = __classPrivateFieldGet(this, _DOMWorld_timeoutSettings, "f").timeout() } = options;
        const waitTaskOptions = {
            domWorld: this,
            predicateBody: pageFunction,
            predicateAcceptsContextElement: false,
            title: 'function',
            polling,
            timeout,
            args,
        };
        const waitTask = new WaitTask(waitTaskOptions);
        return waitTask.promise;
    }
    async title() {
        return this.evaluate(() => {
            return document.title;
        });
    }
}
_a = DOMWorld, _DOMWorld_frameManager = new WeakMap(), _DOMWorld_client = new WeakMap(), _DOMWorld_frame = new WeakMap(), _DOMWorld_timeoutSettings = new WeakMap(), _DOMWorld_documentPromise = new WeakMap(), _DOMWorld_contextPromise = new WeakMap(), _DOMWorld_contextResolveCallback = new WeakMap(), _DOMWorld_detached = new WeakMap(), _DOMWorld_ctxBindings = new WeakMap(), _DOMWorld_boundFunctions = new WeakMap(), _DOMWorld_waitTasks = new WeakMap(), _DOMWorld_settingUpBinding = new WeakMap(), _DOMWorld_onBindingCalled = new WeakMap();
_DOMWorld_bindingIdentifier = { value: (name, contextId) => {
        return `${name}_${contextId}`;
    } };
const noop = () => { };
/**
 * @internal
 */
export class WaitTask {
    constructor(options) {
        _WaitTask_instances.add(this);
        _WaitTask_domWorld.set(this, void 0);
        _WaitTask_polling.set(this, void 0);
        _WaitTask_timeout.set(this, void 0);
        _WaitTask_predicateBody.set(this, void 0);
        _WaitTask_predicateAcceptsContextElement.set(this, void 0);
        _WaitTask_args.set(this, void 0);
        _WaitTask_binding.set(this, void 0);
        _WaitTask_runCount.set(this, 0);
        _WaitTask_resolve.set(this, noop);
        _WaitTask_reject.set(this, noop);
        _WaitTask_timeoutTimer.set(this, void 0);
        _WaitTask_terminated.set(this, false);
        _WaitTask_root.set(this, null);
        if (isString(options.polling)) {
            assert(options.polling === 'raf' || options.polling === 'mutation', 'Unknown polling option: ' + options.polling);
        }
        else if (isNumber(options.polling)) {
            assert(options.polling > 0, 'Cannot poll with non-positive interval: ' + options.polling);
        }
        else {
            throw new Error('Unknown polling options: ' + options.polling);
        }
        function getPredicateBody(predicateBody) {
            if (isString(predicateBody)) {
                return `return (${predicateBody});`;
            }
            return `return (${predicateBody})(...args);`;
        }
        __classPrivateFieldSet(this, _WaitTask_domWorld, options.domWorld, "f");
        __classPrivateFieldSet(this, _WaitTask_polling, options.polling, "f");
        __classPrivateFieldSet(this, _WaitTask_timeout, options.timeout, "f");
        __classPrivateFieldSet(this, _WaitTask_root, options.root || null, "f");
        __classPrivateFieldSet(this, _WaitTask_predicateBody, getPredicateBody(options.predicateBody), "f");
        __classPrivateFieldSet(this, _WaitTask_predicateAcceptsContextElement, options.predicateAcceptsContextElement, "f");
        __classPrivateFieldSet(this, _WaitTask_args, options.args, "f");
        __classPrivateFieldSet(this, _WaitTask_binding, options.binding, "f");
        __classPrivateFieldSet(this, _WaitTask_runCount, 0, "f");
        __classPrivateFieldGet(this, _WaitTask_domWorld, "f")._waitTasks.add(this);
        if (__classPrivateFieldGet(this, _WaitTask_binding, "f")) {
            __classPrivateFieldGet(this, _WaitTask_domWorld, "f")._boundFunctions.set(__classPrivateFieldGet(this, _WaitTask_binding, "f").name, __classPrivateFieldGet(this, _WaitTask_binding, "f").pptrFunction);
        }
        this.promise = new Promise((resolve, reject) => {
            __classPrivateFieldSet(this, _WaitTask_resolve, resolve, "f");
            __classPrivateFieldSet(this, _WaitTask_reject, reject, "f");
        });
        // Since page navigation requires us to re-install the pageScript, we should track
        // timeout on our end.
        if (options.timeout) {
            const timeoutError = new TimeoutError(`waiting for ${options.title} failed: timeout ${options.timeout}ms exceeded`);
            __classPrivateFieldSet(this, _WaitTask_timeoutTimer, setTimeout(() => {
                return this.terminate(timeoutError);
            }, options.timeout), "f");
        }
        this.rerun();
    }
    terminate(error) {
        __classPrivateFieldSet(this, _WaitTask_terminated, true, "f");
        __classPrivateFieldGet(this, _WaitTask_reject, "f").call(this, error);
        __classPrivateFieldGet(this, _WaitTask_instances, "m", _WaitTask_cleanup).call(this);
    }
    async rerun() {
        var _b;
        const runCount = __classPrivateFieldSet(this, _WaitTask_runCount, (_b = __classPrivateFieldGet(this, _WaitTask_runCount, "f"), ++_b), "f");
        let success = null;
        let error = null;
        const context = await __classPrivateFieldGet(this, _WaitTask_domWorld, "f").executionContext();
        if (__classPrivateFieldGet(this, _WaitTask_terminated, "f") || runCount !== __classPrivateFieldGet(this, _WaitTask_runCount, "f")) {
            return;
        }
        if (__classPrivateFieldGet(this, _WaitTask_binding, "f")) {
            await __classPrivateFieldGet(this, _WaitTask_domWorld, "f")._addBindingToContext(context, __classPrivateFieldGet(this, _WaitTask_binding, "f").name);
        }
        if (__classPrivateFieldGet(this, _WaitTask_terminated, "f") || runCount !== __classPrivateFieldGet(this, _WaitTask_runCount, "f")) {
            return;
        }
        try {
            success = await context.evaluateHandle(waitForPredicatePageFunction, __classPrivateFieldGet(this, _WaitTask_root, "f") || null, __classPrivateFieldGet(this, _WaitTask_predicateBody, "f"), __classPrivateFieldGet(this, _WaitTask_predicateAcceptsContextElement, "f"), __classPrivateFieldGet(this, _WaitTask_polling, "f"), __classPrivateFieldGet(this, _WaitTask_timeout, "f"), ...__classPrivateFieldGet(this, _WaitTask_args, "f"));
        }
        catch (error_) {
            error = error_;
        }
        if (__classPrivateFieldGet(this, _WaitTask_terminated, "f") || runCount !== __classPrivateFieldGet(this, _WaitTask_runCount, "f")) {
            if (success) {
                await success.dispose();
            }
            return;
        }
        // Ignore timeouts in pageScript - we track timeouts ourselves.
        // If the frame's execution context has already changed, `frame.evaluate` will
        // throw an error - ignore this predicate run altogether.
        if (!error &&
            (await __classPrivateFieldGet(this, _WaitTask_domWorld, "f")
                .evaluate(s => {
                return !s;
            }, success)
                .catch(() => {
                return true;
            }))) {
            if (!success) {
                throw new Error('Assertion: result handle is not available');
            }
            await success.dispose();
            return;
        }
        if (error) {
            if (error.message.includes('TypeError: binding is not a function')) {
                return this.rerun();
            }
            // When frame is detached the task should have been terminated by the DOMWorld.
            // This can fail if we were adding this task while the frame was detached,
            // so we terminate here instead.
            if (error.message.includes('Execution context is not available in detached frame')) {
                this.terminate(new Error('waitForFunction failed: frame got detached.'));
                return;
            }
            // When the page is navigated, the promise is rejected.
            // We will try again in the new execution context.
            if (error.message.includes('Execution context was destroyed')) {
                return;
            }
            // We could have tried to evaluate in a context which was already
            // destroyed.
            if (error.message.includes('Cannot find context with specified id')) {
                return;
            }
            __classPrivateFieldGet(this, _WaitTask_reject, "f").call(this, error);
        }
        else {
            if (!success) {
                throw new Error('Assertion: result handle is not available');
            }
            __classPrivateFieldGet(this, _WaitTask_resolve, "f").call(this, success);
        }
        __classPrivateFieldGet(this, _WaitTask_instances, "m", _WaitTask_cleanup).call(this);
    }
}
_WaitTask_domWorld = new WeakMap(), _WaitTask_polling = new WeakMap(), _WaitTask_timeout = new WeakMap(), _WaitTask_predicateBody = new WeakMap(), _WaitTask_predicateAcceptsContextElement = new WeakMap(), _WaitTask_args = new WeakMap(), _WaitTask_binding = new WeakMap(), _WaitTask_runCount = new WeakMap(), _WaitTask_resolve = new WeakMap(), _WaitTask_reject = new WeakMap(), _WaitTask_timeoutTimer = new WeakMap(), _WaitTask_terminated = new WeakMap(), _WaitTask_root = new WeakMap(), _WaitTask_instances = new WeakSet(), _WaitTask_cleanup = function _WaitTask_cleanup() {
    __classPrivateFieldGet(this, _WaitTask_timeoutTimer, "f") !== undefined && clearTimeout(__classPrivateFieldGet(this, _WaitTask_timeoutTimer, "f"));
    __classPrivateFieldGet(this, _WaitTask_domWorld, "f")._waitTasks.delete(this);
};
async function waitForPredicatePageFunction(root, predicateBody, predicateAcceptsContextElement, polling, timeout, ...args) {
    root = root || document;
    const predicate = new Function('...args', predicateBody);
    let timedOut = false;
    if (timeout) {
        setTimeout(() => {
            return (timedOut = true);
        }, timeout);
    }
    switch (polling) {
        case 'raf':
            return await pollRaf();
        case 'mutation':
            return await pollMutation();
        default:
            return await pollInterval(polling);
    }
    async function pollMutation() {
        const success = predicateAcceptsContextElement
            ? await predicate(root, ...args)
            : await predicate(...args);
        if (success) {
            return Promise.resolve(success);
        }
        let fulfill = (_) => { };
        const result = new Promise(x => {
            return (fulfill = x);
        });
        const observer = new MutationObserver(async () => {
            if (timedOut) {
                observer.disconnect();
                fulfill();
            }
            const success = predicateAcceptsContextElement
                ? await predicate(root, ...args)
                : await predicate(...args);
            if (success) {
                observer.disconnect();
                fulfill(success);
            }
        });
        if (!root) {
            throw new Error('Root element is not found.');
        }
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
        });
        return result;
    }
    async function pollRaf() {
        let fulfill = (_) => { };
        const result = new Promise(x => {
            return (fulfill = x);
        });
        await onRaf();
        return result;
        async function onRaf() {
            if (timedOut) {
                fulfill();
                return;
            }
            const success = predicateAcceptsContextElement
                ? await predicate(root, ...args)
                : await predicate(...args);
            if (success) {
                fulfill(success);
            }
            else {
                requestAnimationFrame(onRaf);
            }
        }
    }
    async function pollInterval(pollInterval) {
        let fulfill = (_) => { };
        const result = new Promise(x => {
            return (fulfill = x);
        });
        await onTimeout();
        return result;
        async function onTimeout() {
            if (timedOut) {
                fulfill();
                return;
            }
            const success = predicateAcceptsContextElement
                ? await predicate(root, ...args)
                : await predicate(...args);
            if (success) {
                fulfill(success);
            }
            else {
                setTimeout(onTimeout, pollInterval);
            }
        }
    }
}
//# sourceMappingURL=DOMWorld.js.map