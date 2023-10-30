// Types adapted from https://github.com/microsoft/TypeScript/blob/main/lib/lib.webworker.d.ts
//
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0
//
// THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
// WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
// MERCHANTABLITY OR NON-INFRINGEMENT.
//
// See the Apache Version 2.0 License for specific language governing permissions
// and limitations under the License.

interface EventInit {
	cancelable?: boolean;
}

type EventListener = (event: Event) => void;

interface EventListenerObject {
	handleEvent(event: Event): void;
}

type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

interface EventListenerOptions {
	capture?: boolean;
}

interface AddEventListenerOptions extends EventListenerOptions {
	once?: boolean;
}

interface AbortSignal extends EventTarget {
	readonly aborted: boolean;
}
