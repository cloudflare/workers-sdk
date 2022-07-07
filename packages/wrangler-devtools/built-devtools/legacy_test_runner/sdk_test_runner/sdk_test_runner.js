// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '../../core/sdk/sdk-legacy.js';
import '../test_runner/test_runner.js';
import * as Platform from '../../core/platform/platform.js';

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */
self.SDKTestRunner = self.SDKTestRunner || {};

let id = 0;

function nextId(prefix) {
  return (prefix || '') + ++id;
}

SDKTestRunner.PageMock = class {
  constructor(url) {
    this.url = url;
    this.type = SDK.Target.Type.Frame;
    this.enabledDomains = new Set();
    this.children = new Map();

    this.mainFrame = {id: nextId(), loaderId: nextId(), mimeType: 'text/html', securityOrigin: this.url, url: this.url};

    this.executionContexts = [];
    this.executionContexts.push(this.createExecutionContext(this.mainFrame, false));
    this.scripts = [];
    this.scriptContents = new Map();

    this.dispatchMap = {
      'Debugger.enable': this.debuggerEnable,
      'Debugger.getScriptSource': this.debuggerGetScriptSource,
      'Debugger.setBlackboxPatterns': (id, params) => this.sendResponse(id, {}),
      'Runtime.enable': this.runtimeEnable,
      'Page.enable': this.pageEnable,
      'Page.getResourceTree': this.pageGetResourceTree
    };
  }

  turnIntoWorker() {
    this.type = SDK.Target.Type.Worker;
  }

  connectAsMainTarget(targetName) {
    self.Bindings.debuggerWorkspaceBinding.resetForTest(TestRunner.mainTarget);
    self.Bindings.resourceMapping.resetForTest(TestRunner.mainTarget);
    this.enabledDomains.clear();
    self.SDK.targetManager.clearAllTargetsForTest();

    const oldFactory = ProtocolClient.Connection.getFactory();
    ProtocolClient.Connection.setFactory(() => {
      this.connection = new MockPageConnection(this);
      return this.connection;
    });
    const target = self.SDK.targetManager.createTarget(nextId('mock-target-'), targetName, this.type, null);
    ProtocolClient.Connection.setFactory(oldFactory);

    this.target = target;
    return target;
  }

  connectAsChildTarget(targetName, parentMock) {
    this.enabledDomains.clear();
    this.sessionId = nextId('mock-target-');
    this.root = parentMock.root || parentMock;
    this.root.children.set(this.sessionId, this);
    const target =
        self.SDK.targetManager.createTarget(this.sessionId, targetName, this.type, parentMock.target, this.sessionId);
    this.target = target;
    return target;
  }

  disconnect() {
    if (this.root) {
      this.root.children.delete(this.sessionId);
      this.target.dispose();
      this.root = null;
      this.sessionId = null;
    } else {
      this.connection.disconnect();
      this.connection = null;
    }
    this.target = null;
  }

  evalScript(url, content, isContentScript) {
    const id = nextId();
    content += '\n//# sourceURL=' + url;
    this.scriptContents.set(id, content);
    let context = this.executionContexts.find(context => context.auxData.isDefault !== isContentScript);

    if (!context) {
      context = this.createExecutionContext(this.mainFrame, isContentScript);
      this.executionContexts.push(context);

      this.fireEvent('Runtime.executionContextCreated', {context: context});
    }

    const text = new TextUtils.Text(content);

    const script = {
      scriptId: id,
      url: url,
      startLine: 0,
      startColumn: 0,
      endLine: text.lineCount(),
      endColumn: text.lineAt(text.lineCount()).length - 1,
      executionContextId: context.id,
      hash: Platform.StringUtilities.hashCode(content),
      executionContextAuxData: context.auxData,
      sourceMapURL: '',
      hasSourceURL: true,
      isLiveEdit: false,
      isModule: false,
      length: content.length
    };

    this.scripts.push(script);
    this.fireEvent('Debugger.scriptParsed', script);
  }

  removeContentScripts() {
    const index = this.executionContexts.findIndex(context => !context.auxData.isDefault);
    if (index !== -1) {
      this.fireEvent('Runtime.executionContextDestroyed', {executionContextId: this.executionContexts[index].id});
      this.executionContexts.splice(index, 1);
    }
  }

  reload() {
    this.fireEvent('Page.frameStartedLoading', {frameId: this.mainFrame.id});

    for (const context of this.executionContexts) {
      this.fireEvent('Runtime.executionContextDestroyed', {executionContextId: context.id});
    }

    this.scripts = [];
    this.scriptContents.clear();
    this.executionContexts = [];
    this.fireEvent('Runtime.executionContextsCleared', {});
    this.executionContexts.push(this.createExecutionContext(this.mainFrame, false));

    for (const context of this.executionContexts) {
      this.fireEvent('Runtime.executionContextCreated', {context: context});
    }

    this.fireEvent('Page.frameNavigated', {frame: this.mainFrame});

    this.fireEvent('Page.loadEventFired', {timestamp: Date.now() / 1000});

    this.fireEvent('Page.frameStoppedLoading', {frameId: this.mainFrame.id});

    this.fireEvent('Page.domContentEventFired', {timestamp: Date.now() / 1000});
  }

  createExecutionContext(frame, isContentScript) {
    return {
      id: nextId(),

      auxData: {isDefault: !isContentScript, frameId: frame.id},

      origin: frame.securityOrigin,
      name: isContentScript ? 'content-script-context' : ''
    };
  }

  debuggerEnable(id, params) {
    this.enabledDomains.add('Debugger');
    this.sendResponse(id, {});

    for (const script of this.scripts) {
      this.fireEvent('Debugger.scriptParsed', script);
    }
  }

  debuggerGetScriptSource(id, params) {
    if (!this.scriptContents.has(params.scriptId)) {
      this.sendResponse(id, undefined, {message: 'Can\'t get script content for id ' + params.scriptId, code: 1});

      return;
    }

    const result = {scriptSource: this.scriptContents.get(params.scriptId)};

    this.sendResponse(id, result);
  }

  runtimeEnable(id, params) {
    this.enabledDomains.add('Runtime');
    this.sendResponse(id, {});

    for (const context of this.executionContexts) {
      this.fireEvent('Runtime.executionContextCreated', {context: context});
    }
  }

  pageEnable(id, params) {
    this.enabledDomains.add('Page');
    this.sendResponse(id, {});
  }

  pageGetResourceTree(id, params) {
    const result = {frameTree: {frame: this.mainFrame, resources: []}};

    this.sendResponse(id, result);
  }

  isSupportedDomain(methodName) {
    const domain = methodName.split('.')[0];

    if (domain === 'Page') {
      return this.type === SDK.Target.Type.Frame;
    }

    return true;
  }

  dispatch(sessionId, id, methodName, params) {
    if (sessionId) {
      const child = this.children.get(sessionId);
      if (child) {
        child.dispatch('', id, methodName, params);
      }
      return;
    }

    const handler = (this.isSupportedDomain(methodName) ? this.dispatchMap[methodName] : null);

    if (handler) {
      return handler.call(this, id, params);
    }

    this.sendResponse(
        id, undefined, {message: 'Can\'t handle command ' + methodName, code: ProtocolClient.DevToolsStubErrorCode});
  }

  sendResponse(id, result, error) {
    const message = {id: id, result: result, error: error};
    if (this.root) {
      message.sessionId = this.sessionId;
      this.root.connection.sendMessageToDevTools(message);
    } else {
      this.connection.sendMessageToDevTools(message);
    }
  }

  fireEvent(methodName, params) {
    const domain = methodName.split('.')[0];

    if (!this.enabledDomains.has(domain)) {
      return;
    }

    const message = {method: methodName, params: params};
    if (this.root) {
      message.sessionId = this.sessionId;
      this.root.connection.sendMessageToDevTools(message);
    } else {
      this.connection.sendMessageToDevTools(message);
    }
  }
};

class MockPageConnection {
  constructor(page) {
    this.page = page;
  }

  setOnMessage(onMessage) {
    this.onMessage = onMessage;
  }

  setOnDisconnect(onDisconnect) {
    this.onDisconnect = onDisconnect;
  }

  sendMessageToDevTools(message) {
    setTimeout(() => this.onMessage.call(null, JSON.stringify(message)), 0);
  }

  sendRawMessage(messageString) {
    const message = JSON.parse(messageString);
    this.page.dispatch(message.sessionId, message.id, message.method, message.params || {});
  }

  disconnect() {
    this.onDisconnect.call(null, 'force disconnect');
    this.onDisconnect = null;
    this.onMessage = null;
    return Promise.resolve();
  }
}
