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
import { CDPSession } from './Connection.js';
import { ElementHandle } from './ElementHandle.js';
import { ExecutionContext } from './ExecutionContext.js';
import { Frame, FrameManager } from './FrameManager.js';
import { MouseButton } from './Input.js';
import { JSHandle } from './JSHandle.js';
import { PuppeteerLifeCycleEvent } from './LifecycleWatcher.js';
import { TimeoutSettings } from './TimeoutSettings.js';
import { EvaluateFunc, HandleFor, NodeFor } from './types.js';
/**
 * @public
 */
export interface WaitForSelectorOptions {
    visible?: boolean;
    hidden?: boolean;
    timeout?: number;
    root?: ElementHandle<Node>;
}
/**
 * @internal
 */
export interface PageBinding {
    name: string;
    pptrFunction: Function;
}
/**
 * @internal
 */
export declare class DOMWorld {
    #private;
    get _waitTasks(): Set<WaitTask>;
    get _boundFunctions(): Map<string, Function>;
    constructor(client: CDPSession, frameManager: FrameManager, frame: Frame, timeoutSettings: TimeoutSettings);
    frame(): Frame;
    _setContext(context: ExecutionContext | null): Promise<void>;
    _hasContext(): boolean;
    _detach(): void;
    executionContext(): Promise<ExecutionContext>;
    evaluateHandle<Params extends unknown[], Func extends EvaluateFunc<Params> = EvaluateFunc<Params>>(pageFunction: Func | string, ...args: Params): Promise<HandleFor<Awaited<ReturnType<Func>>>>;
    evaluate<Params extends unknown[], Func extends EvaluateFunc<Params> = EvaluateFunc<Params>>(pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    $<Selector extends string>(selector: Selector): Promise<ElementHandle<NodeFor<Selector>> | null>;
    $$<Selector extends string>(selector: Selector): Promise<Array<ElementHandle<NodeFor<Selector>>>>;
    _document(): Promise<ElementHandle<Document>>;
    $x(expression: string): Promise<Array<ElementHandle<Node>>>;
    $eval<Selector extends string, Params extends unknown[], Func extends EvaluateFunc<[
        ElementHandle<NodeFor<Selector>>,
        ...Params
    ]> = EvaluateFunc<[ElementHandle<NodeFor<Selector>>, ...Params]>>(selector: Selector, pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    $$eval<Selector extends string, Params extends unknown[], Func extends EvaluateFunc<[
        Array<NodeFor<Selector>>,
        ...Params
    ]> = EvaluateFunc<[Array<NodeFor<Selector>>, ...Params]>>(selector: Selector, pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    content(): Promise<string>;
    setContent(html: string, options?: {
        timeout?: number;
        waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[];
    }): Promise<void>;
    /**
     * Adds a script tag into the current context.
     *
     * @remarks
     *
     * You can pass a URL, filepath or string of contents. Note that when running Puppeteer
     * in a browser environment you cannot pass a filepath and should use either
     * `url` or `content`.
     */
    addScriptTag(options: {
        url?: string;
        path?: string;
        content?: string;
        id?: string;
        type?: string;
    }): Promise<ElementHandle<HTMLScriptElement>>;
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
    addStyleTag(options: {
        url?: string;
        path?: string;
        content?: string;
    }): Promise<ElementHandle<Node>>;
    click(selector: string, options: {
        delay?: number;
        button?: MouseButton;
        clickCount?: number;
    }): Promise<void>;
    focus(selector: string): Promise<void>;
    hover(selector: string): Promise<void>;
    select(selector: string, ...values: string[]): Promise<string[]>;
    tap(selector: string): Promise<void>;
    type(selector: string, text: string, options?: {
        delay: number;
    }): Promise<void>;
    waitForSelector<Selector extends string>(selector: Selector, options: WaitForSelectorOptions): Promise<ElementHandle<NodeFor<Selector>> | null>;
    _addBindingToContext(context: ExecutionContext, name: string): Promise<void>;
    _waitForSelectorInPage(queryOne: Function, selector: string, options: WaitForSelectorOptions, binding?: PageBinding): Promise<ElementHandle<Node> | null>;
    waitForXPath(xpath: string, options: WaitForSelectorOptions): Promise<ElementHandle<Node> | null>;
    waitForFunction(pageFunction: Function | string, options?: {
        polling?: string | number;
        timeout?: number;
    }, ...args: unknown[]): Promise<JSHandle>;
    title(): Promise<string>;
}
/**
 * @internal
 */
export interface WaitTaskOptions {
    domWorld: DOMWorld;
    predicateBody: Function | string;
    predicateAcceptsContextElement: boolean;
    title: string;
    polling: string | number;
    timeout: number;
    binding?: PageBinding;
    args: unknown[];
    root?: ElementHandle<Node>;
}
/**
 * @internal
 */
export declare class WaitTask {
    #private;
    promise: Promise<JSHandle>;
    constructor(options: WaitTaskOptions);
    terminate(error: Error): void;
    rerun(): Promise<void>;
}
//# sourceMappingURL=DOMWorld.d.ts.map