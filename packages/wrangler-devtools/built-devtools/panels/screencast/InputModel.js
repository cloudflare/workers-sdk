// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
export class InputModel extends SDK.SDKModel.SDKModel {
    inputAgent;
    activeTouchOffsetTop;
    activeTouchParams;
    constructor(target) {
        super(target);
        this.inputAgent = target.inputAgent();
        this.activeTouchOffsetTop = null;
        this.activeTouchParams = null;
    }
    emitKeyEvent(event) {
        let type;
        switch (event.type) {
            case 'keydown':
                type = "keyDown" /* KeyDown */;
                break;
            case 'keyup':
                type = "keyUp" /* KeyUp */;
                break;
            case 'keypress':
                type = "char" /* Char */;
                break;
            default:
                return;
        }
        const keyboardEvent = event;
        const text = event.type === 'keypress' ? String.fromCharCode(keyboardEvent.charCode) : undefined;
        void this.inputAgent.invoke_dispatchKeyEvent({
            type: type,
            modifiers: this.modifiersForEvent(keyboardEvent),
            text: text,
            unmodifiedText: text ? text.toLowerCase() : undefined,
            keyIdentifier: keyboardEvent.keyIdentifier,
            code: keyboardEvent.code,
            key: keyboardEvent.key,
            windowsVirtualKeyCode: keyboardEvent.keyCode,
            nativeVirtualKeyCode: keyboardEvent.keyCode,
            autoRepeat: false,
            isKeypad: false,
            isSystemKey: false,
        });
    }
    emitTouchFromMouseEvent(event, offsetTop, zoom) {
        const buttons = ['none', 'left', 'middle', 'right'];
        const types = {
            mousedown: "mousePressed" /* MousePressed */,
            mouseup: "mouseReleased" /* MouseReleased */,
            mousemove: "mouseMoved" /* MouseMoved */,
            mousewheel: "mouseWheel" /* MouseWheel */,
        };
        const eventType = event.type;
        if (!(eventType in types)) {
            return;
        }
        const mouseEvent = event;
        if (!(mouseEvent.which in buttons)) {
            return;
        }
        if (eventType !== 'mousewheel' && buttons[mouseEvent.which] === 'none') {
            return;
        }
        if (eventType === 'mousedown' || this.activeTouchOffsetTop === null) {
            this.activeTouchOffsetTop = offsetTop;
        }
        const x = Math.round(mouseEvent.offsetX / zoom);
        let y = Math.round(mouseEvent.offsetY / zoom);
        y = Math.round(y - this.activeTouchOffsetTop);
        const params = {
            type: types[eventType],
            x: x,
            y: y,
            modifiers: 0,
            button: buttons[mouseEvent.which],
            clickCount: 0,
        };
        if (event.type === 'mousewheel') {
            const wheelEvent = mouseEvent;
            params.deltaX = wheelEvent.deltaX / zoom;
            params.deltaY = -wheelEvent.deltaY / zoom;
        }
        else {
            this.activeTouchParams = params;
        }
        if (event.type === 'mouseup') {
            this.activeTouchOffsetTop = null;
        }
        void this.inputAgent.invoke_emulateTouchFromMouseEvent(params);
    }
    cancelTouch() {
        if (this.activeTouchParams !== null) {
            const params = this.activeTouchParams;
            this.activeTouchParams = null;
            params.type = 'mouseReleased';
            void this.inputAgent.invoke_emulateTouchFromMouseEvent(params);
        }
    }
    modifiersForEvent(event) {
        return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
    }
}
SDK.SDKModel.SDKModel.register(InputModel, { capabilities: SDK.Target.Capability.Input, autostart: false });
//# sourceMappingURL=InputModel.js.map