/// <reference types="node" />
import { Protocol } from 'devtools-protocol';
import { CDPSession } from './Connection.js';
import { WaitForSelectorOptions } from './DOMWorld.js';
import { ExecutionContext } from './ExecutionContext.js';
import { Frame, FrameManager } from './FrameManager.js';
import { BoundingBox, BoxModel, ClickOptions, JSHandle, Offset, Point, PressOptions } from './JSHandle.js';
import { Page, ScreenshotOptions } from './Page.js';
import { EvaluateFunc, NodeFor } from './types.js';
import { KeyInput } from './USKeyboardLayout.js';
/**
 * ElementHandle represents an in-page DOM element.
 *
 * @remarks
 * ElementHandles can be created with the {@link Page.$} method.
 *
 * ```ts
 * const puppeteer = require('puppeteer');
 *
 * (async () => {
 *  const browser = await puppeteer.launch();
 *  const page = await browser.newPage();
 *  await page.goto('https://example.com');
 *  const hrefElement = await page.$('a');
 *  await hrefElement.click();
 *  // ...
 * })();
 * ```
 *
 * ElementHandle prevents the DOM element from being garbage-collected unless the
 * handle is {@link JSHandle.dispose | disposed}. ElementHandles are auto-disposed
 * when their origin frame gets navigated.
 *
 * ElementHandle instances can be used as arguments in {@link Page.$eval} and
 * {@link Page.evaluate} methods.
 *
 * If you're using TypeScript, ElementHandle takes a generic argument that
 * denotes the type of element the handle is holding within. For example, if you
 * have a handle to a `<select>` element, you can type it as
 * `ElementHandle<HTMLSelectElement>` and you get some nicer type checks.
 *
 * @public
 */
export declare class ElementHandle<ElementType extends Node = Element> extends JSHandle<ElementType> {
    #private;
    /**
     * @internal
     */
    constructor(context: ExecutionContext, client: CDPSession, remoteObject: Protocol.Runtime.RemoteObject, frame: Frame, page: Page, frameManager: FrameManager);
    /**
     * Wait for the `selector` to appear within the element. If at the moment of calling the
     * method the `selector` already exists, the method will return immediately. If
     * the `selector` doesn't appear after the `timeout` milliseconds of waiting, the
     * function will throw.
     *
     * This method does not work across navigations or if the element is detached from DOM.
     *
     * @param selector - A
     * {@link https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors | selector}
     * of an element to wait for
     * @param options - Optional waiting parameters
     * @returns Promise which resolves when element specified by selector string
     * is added to DOM. Resolves to `null` if waiting for hidden: `true` and
     * selector is not found in DOM.
     * @remarks
     * The optional parameters in `options` are:
     *
     * - `visible`: wait for the selected element to be present in DOM and to be
     * visible, i.e. to not have `display: none` or `visibility: hidden` CSS
     * properties. Defaults to `false`.
     *
     * - `hidden`: wait for the selected element to not be found in the DOM or to be hidden,
     * i.e. have `display: none` or `visibility: hidden` CSS properties. Defaults to
     * `false`.
     *
     * - `timeout`: maximum time to wait in milliseconds. Defaults to `30000`
     * (30 seconds). Pass `0` to disable timeout. The default value can be changed
     * by using the {@link Page.setDefaultTimeout} method.
     */
    waitForSelector<Selector extends string>(selector: Selector, options?: Exclude<WaitForSelectorOptions, 'root'>): Promise<ElementHandle<NodeFor<Selector>> | null>;
    /**
     * Wait for the `xpath` within the element. If at the moment of calling the
     * method the `xpath` already exists, the method will return immediately. If
     * the `xpath` doesn't appear after the `timeout` milliseconds of waiting, the
     * function will throw.
     *
     * If `xpath` starts with `//` instead of `.//`, the dot will be appended automatically.
     *
     * This method works across navigation
     * ```ts
     * const puppeteer = require('puppeteer');
     * (async () => {
     * const browser = await puppeteer.launch();
     * const page = await browser.newPage();
     * let currentURL;
     * page
     * .waitForXPath('//img')
     * .then(() => console.log('First URL with image: ' + currentURL));
     * for (currentURL of [
     * 'https://example.com',
     * 'https://google.com',
     * 'https://bbc.com',
     * ]) {
     * await page.goto(currentURL);
     * }
     * await browser.close();
     * })();
     * ```
     * @param xpath - A
     * {@link https://developer.mozilla.org/en-US/docs/Web/XPath | xpath} of an
     * element to wait for
     * @param options - Optional waiting parameters
     * @returns Promise which resolves when element specified by xpath string is
     * added to DOM. Resolves to `null` if waiting for `hidden: true` and xpath is
     * not found in DOM.
     * @remarks
     * The optional Argument `options` have properties:
     *
     * - `visible`: A boolean to wait for element to be present in DOM and to be
     * visible, i.e. to not have `display: none` or `visibility: hidden` CSS
     * properties. Defaults to `false`.
     *
     * - `hidden`: A boolean wait for element to not be found in the DOM or to be
     * hidden, i.e. have `display: none` or `visibility: hidden` CSS properties.
     * Defaults to `false`.
     *
     * - `timeout`: A number which is maximum time to wait for in milliseconds.
     * Defaults to `30000` (30 seconds). Pass `0` to disable timeout. The default
     * value can be changed by using the {@link Page.setDefaultTimeout} method.
     */
    waitForXPath(xpath: string, options?: {
        visible?: boolean;
        hidden?: boolean;
        timeout?: number;
    }): Promise<ElementHandle<Node> | null>;
    asElement(): ElementHandle<ElementType> | null;
    /**
     * Resolves to the content frame for element handles referencing
     * iframe nodes, or null otherwise
     */
    contentFrame(): Promise<Frame | null>;
    /**
     * Returns the middle point within an element unless a specific offset is provided.
     */
    clickablePoint(offset?: Offset): Promise<Point>;
    /**
     * This method scrolls element into view if needed, and then
     * uses {@link Page.mouse} to hover over the center of the element.
     * If the element is detached from DOM, the method throws an error.
     */
    hover(this: ElementHandle<Element>): Promise<void>;
    /**
     * This method scrolls element into view if needed, and then
     * uses {@link Page.mouse} to click in the center of the element.
     * If the element is detached from DOM, the method throws an error.
     */
    click(this: ElementHandle<Element>, options?: ClickOptions): Promise<void>;
    /**
     * This method creates and captures a dragevent from the element.
     */
    drag(this: ElementHandle<Element>, target: Point): Promise<Protocol.Input.DragData>;
    /**
     * This method creates a `dragenter` event on the element.
     */
    dragEnter(this: ElementHandle<Element>, data?: Protocol.Input.DragData): Promise<void>;
    /**
     * This method creates a `dragover` event on the element.
     */
    dragOver(this: ElementHandle<Element>, data?: Protocol.Input.DragData): Promise<void>;
    /**
     * This method triggers a drop on the element.
     */
    drop(this: ElementHandle<Element>, data?: Protocol.Input.DragData): Promise<void>;
    /**
     * This method triggers a dragenter, dragover, and drop on the element.
     */
    dragAndDrop(this: ElementHandle<Element>, target: ElementHandle<Node>, options?: {
        delay: number;
    }): Promise<void>;
    /**
     * Triggers a `change` and `input` event once all the provided options have been
     * selected. If there's no `<select>` element matching `selector`, the method
     * throws an error.
     *
     * @example
     * ```ts
     * handle.select('blue'); // single selection
     * handle.select('red', 'green', 'blue'); // multiple selections
     * ```
     * @param values - Values of options to select. If the `<select>` has the
     *    `multiple` attribute, all values are considered, otherwise only the first
     *    one is taken into account.
     */
    select(...values: string[]): Promise<string[]>;
    /**
     * This method expects `elementHandle` to point to an
     * {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input | input element}.
     *
     * @param filePaths - Sets the value of the file input to these paths.
     *    If a path is relative, then it is resolved against the
     *    {@link https://nodejs.org/api/process.html#process_process_cwd | current working directory}.
     *    Note for locals script connecting to remote chrome environments,
     *    paths must be absolute.
     */
    uploadFile(this: ElementHandle<HTMLInputElement>, ...filePaths: string[]): Promise<void>;
    /**
     * This method scrolls element into view if needed, and then uses
     * {@link Touchscreen.tap} to tap in the center of the element.
     * If the element is detached from DOM, the method throws an error.
     */
    tap(this: ElementHandle<Element>): Promise<void>;
    /**
     * Calls {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus | focus} on the element.
     */
    focus(): Promise<void>;
    /**
     * Focuses the element, and then sends a `keydown`, `keypress`/`input`, and
     * `keyup` event for each character in the text.
     *
     * To press a special key, like `Control` or `ArrowDown`,
     * use {@link ElementHandle.press}.
     *
     * @example
     * ```ts
     * await elementHandle.type('Hello'); // Types instantly
     * await elementHandle.type('World', {delay: 100}); // Types slower, like a user
     * ```
     *
     * @example
     * An example of typing into a text field and then submitting the form:
     *
     * ```ts
     * const elementHandle = await page.$('input');
     * await elementHandle.type('some text');
     * await elementHandle.press('Enter');
     * ```
     */
    type(text: string, options?: {
        delay: number;
    }): Promise<void>;
    /**
     * Focuses the element, and then uses {@link Keyboard.down} and {@link Keyboard.up}.
     *
     * @remarks
     * If `key` is a single character and no modifier keys besides `Shift`
     * are being held down, a `keypress`/`input` event will also be generated.
     * The `text` option can be specified to force an input event to be generated.
     *
     * **NOTE** Modifier keys DO affect `elementHandle.press`. Holding down `Shift`
     * will type the text in upper case.
     *
     * @param key - Name of key to press, such as `ArrowLeft`.
     *    See {@link KeyInput} for a list of all key names.
     */
    press(key: KeyInput, options?: PressOptions): Promise<void>;
    /**
     * This method returns the bounding box of the element (relative to the main frame),
     * or `null` if the element is not visible.
     */
    boundingBox(): Promise<BoundingBox | null>;
    /**
     * This method returns boxes of the element, or `null` if the element is not visible.
     *
     * @remarks
     *
     * Boxes are represented as an array of points;
     * Each Point is an object `{x, y}`. Box points are sorted clock-wise.
     */
    boxModel(): Promise<BoxModel | null>;
    /**
     * This method scrolls element into view if needed, and then uses
     * {@link Page.screenshot} to take a screenshot of the element.
     * If the element is detached from DOM, the method throws an error.
     */
    screenshot(this: ElementHandle<Element>, options?: ScreenshotOptions): Promise<string | Buffer>;
    /**
     * Runs `element.querySelector` within the page.
     *
     * @param selector - The selector to query with.
     * @returns `null` if no element matches the selector.
     * @throws `Error` if the selector has no associated query handler.
     */
    $<Selector extends string>(selector: Selector): Promise<ElementHandle<NodeFor<Selector>> | null>;
    /**
     * Runs `element.querySelectorAll` within the page. If no elements match the selector,
     * the return value resolves to `[]`.
     */
    /**
     * Runs `element.querySelectorAll` within the page.
     *
     * @param selector - The selector to query with.
     * @returns `[]` if no element matches the selector.
     * @throws `Error` if the selector has no associated query handler.
     */
    $$<Selector extends string>(selector: Selector): Promise<Array<ElementHandle<NodeFor<Selector>>>>;
    /**
     * This method runs `document.querySelector` within the element and passes it as
     * the first argument to `pageFunction`. If there's no element matching `selector`,
     * the method throws an error.
     *
     * If `pageFunction` returns a Promise, then `frame.$eval` would wait for the promise
     * to resolve and return its value.
     *
     * @example
     * ```ts
     * const tweetHandle = await page.$('.tweet');
     * expect(await tweetHandle.$eval('.like', node => node.innerText)).toBe('100');
     * expect(await tweetHandle.$eval('.retweets', node => node.innerText)).toBe('10');
     * ```
     */
    $eval<Selector extends string, Params extends unknown[], Func extends EvaluateFunc<[
        ElementHandle<NodeFor<Selector>>,
        ...Params
    ]> = EvaluateFunc<[ElementHandle<NodeFor<Selector>>, ...Params]>>(selector: Selector, pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    /**
     * This method runs `document.querySelectorAll` within the element and passes it as
     * the first argument to `pageFunction`. If there's no element matching `selector`,
     * the method throws an error.
     *
     * If `pageFunction` returns a Promise, then `frame.$$eval` would wait for the
     * promise to resolve and return its value.
     *
     * @example
     * ```html
     * <div class="feed">
     *   <div class="tweet">Hello!</div>
     *   <div class="tweet">Hi!</div>
     * </div>
     * ```
     *
     * @example
     * ```ts
     * const feedHandle = await page.$('.feed');
     * expect(await feedHandle.$$eval('.tweet', nodes => nodes.map(n => n.innerText)))
     *  .toEqual(['Hello!', 'Hi!']);
     * ```
     */
    $$eval<Selector extends string, Params extends unknown[], Func extends EvaluateFunc<[
        Array<NodeFor<Selector>>,
        ...Params
    ]> = EvaluateFunc<[Array<NodeFor<Selector>>, ...Params]>>(selector: Selector, pageFunction: Func | string, ...args: Params): Promise<Awaited<ReturnType<Func>>>;
    /**
     * The method evaluates the XPath expression relative to the elementHandle.
     * If there are no such elements, the method will resolve to an empty array.
     * @param expression - Expression to {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/evaluate | evaluate}
     */
    $x(expression: string): Promise<Array<ElementHandle<Node>>>;
    /**
     * Resolves to true if the element is visible in the current viewport.
     */
    isIntersectingViewport(this: ElementHandle<Element>, options?: {
        threshold?: number;
    }): Promise<boolean>;
}
//# sourceMappingURL=ElementHandle.d.ts.map