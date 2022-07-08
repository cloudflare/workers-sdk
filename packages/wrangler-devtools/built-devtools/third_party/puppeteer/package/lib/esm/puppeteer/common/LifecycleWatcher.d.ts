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
import { TimeoutError } from './Errors.js';
import { FrameManager, Frame } from './FrameManager.js';
import { HTTPResponse } from './HTTPResponse.js';
/**
 * @public
 */
export declare type PuppeteerLifeCycleEvent = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
/**
 * @public
 */
export declare type ProtocolLifeCycleEvent = 'load' | 'DOMContentLoaded' | 'networkIdle' | 'networkAlmostIdle';
/**
 * @internal
 */
export declare class LifecycleWatcher {
    #private;
    constructor(frameManager: FrameManager, frame: Frame, waitUntil: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[], timeout: number);
    navigationResponse(): Promise<HTTPResponse | null>;
    sameDocumentNavigationPromise(): Promise<Error | undefined>;
    newDocumentNavigationPromise(): Promise<Error | undefined>;
    lifecyclePromise(): Promise<void>;
    timeoutOrTerminationPromise(): Promise<Error | TimeoutError | undefined>;
    dispose(): void;
}
//# sourceMappingURL=LifecycleWatcher.d.ts.map