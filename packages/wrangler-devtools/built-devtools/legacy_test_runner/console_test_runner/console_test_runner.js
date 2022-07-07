// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '../test_runner/test_runner.js';
import '../../panels/console/console-legacy.js';
import '../../ui/legacy/components/object_ui/object_ui-legacy.js';

import * as ConsoleCounters from '../../panels/console_counters/console_counters.js';

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */

self.ConsoleTestRunner = self.ConsoleTestRunner || {};

/** @typedef {function(!Element, !SDK.ConsoleMessage=):string} */
ConsoleTestRunner.Formatter;

/**
 * @param {boolean=} printOriginatingCommand
 * @param {boolean=} dumpClassNames
 * @param {!ConsoleTestRunner.Formatter=} formatter
 */
ConsoleTestRunner.dumpConsoleMessages = async function(printOriginatingCommand, dumpClassNames, formatter) {
  TestRunner.addResults(
      await ConsoleTestRunner.dumpConsoleMessagesIntoArray(printOriginatingCommand, dumpClassNames, formatter));
};

/**
 * @param {boolean=} printOriginatingCommand
 * @param {boolean=} dumpClassNames
 * @param {!ConsoleTestRunner.Formatter=} formatter
 * @return {!Promise<!Array<string>>}
 */
ConsoleTestRunner.dumpConsoleMessagesIntoArray = async function(printOriginatingCommand, dumpClassNames, formatter) {
  formatter = formatter || ConsoleTestRunner.prepareConsoleMessageText;
  const result = [];
  const consoleView = Console.ConsoleView.instance();
  const originalViewportStyle = consoleView.viewport.element.style;
  const originalSize = {width: originalViewportStyle.width, height: originalViewportStyle.height};
  ConsoleTestRunner.disableConsoleViewport();
  if (consoleView.needsFullUpdate) {
    consoleView.updateMessageList();
  }
  const viewMessages = consoleView.visibleViewMessages;
  for (let i = 0; i < viewMessages.length; ++i) {
    const uiMessage = viewMessages[i];
    const message = uiMessage.consoleMessage();
    const element = uiMessage.element();
    // Retrieving the message element triggered rendering, now wait for
    // the live location within to be resolved initially.
    await uiMessage.formatErrorStackPromiseForTest();
    await TestRunner.waitForPendingLiveLocationUpdates();

    let classNames;
    if (dumpClassNames) {
      classNames = [''];
      for (let node = element.firstChild; node; node = node.traverseNextNode(element)) {
        if (node.nodeType === Node.ELEMENT_NODE && node.className) {
          let depth = 0;
          let depthTest = node;
          while (depthTest !== element) {
            if (depthTest.nodeType === Node.ELEMENT_NODE && depthTest.className) {
              depth++;
            }
            depthTest = depthTest.parentNodeOrShadowHost();
          }
          classNames.push(
              '  '.repeat(depth) +
              node.className.replace('platform-linux', 'platform-*')
                  .replace('platform-mac', 'platform-*')
                  .replace('platform-windows', 'platform-*'));
        }
      }
    }

    if (ConsoleTestRunner.dumpConsoleTableMessage(uiMessage, false, result)) {
      if (dumpClassNames) {
        result.push(classNames.join('\n'));
      }
    } else {
      let messageText = formatter(element, message);
      messageText = messageText.replace(/VM\d+/g, 'VM');
      result.push(messageText + (dumpClassNames ? ' ' + classNames.join('\n') : ''));
    }

    if (printOriginatingCommand && uiMessage.consoleMessage().originatingMessage()) {
      result.push('Originating from: ' + uiMessage.consoleMessage().originatingMessage().messageText);
    }
  }
  consoleView.viewport.element.style.width = originalSize.width;
  consoleView.viewport.element.style.height = originalSize.height;
  return result;
};

/**
 * @param {!Element} messageElement
 * @return {string}
 */
ConsoleTestRunner.prepareConsoleMessageText = function(messageElement) {
  let messageText = messageElement.deepTextContent().replace(/\u200b/g, '');
  // Replace scriptIds with generic scriptId string to avoid flakiness.
  messageText = messageText.replace(/VM\d+/g, 'VM');
  // Remove line and column of evaluate method.
  messageText = messageText.replace(/(at eval \(eval at evaluate) \(:\d+:\d+\)/, '$1');

  if (messageText.startsWith('Navigated to')) {
    const fileName = messageText.split(' ').pop().split('/').pop();
    messageText = 'Navigated to ' + fileName;
  }
  // The message might be extremely long in case of dumping stack overflow message.
  messageText = messageText.substring(0, 1024);
  return messageText;
};

/**
 * @param {!Element} messageElement
 * @return {string}
 */
ConsoleTestRunner.prepareConsoleMessageTextTrimmed = function(messageElement) {
  return ConsoleTestRunner.prepareConsoleMessageText(messageElement).replace(/[ ]+/g, ' ');
};

/**
 * @param {!Console.ConsoleViewMessage} viewMessage
 * @param {boolean} forceInvalidate
 * @param {!Array<string>} results
 * @return {boolean}
 */
ConsoleTestRunner.dumpConsoleTableMessage = function(viewMessage, forceInvalidate, results) {
  if (forceInvalidate) {
    Console.ConsoleView.instance().viewport.invalidate();
  }
  const formattedTable = viewMessage.element().querySelector('.console-message-formatted-table');
  if (!formattedTable) {
    return false;
  }
  const table = formattedTable.querySelector('span').shadowRoot;
  const headers = table.querySelectorAll('th > div:first-child');
  if (!headers.length) {
    return false;
  }

  let headerLine = '';
  for (let i = 0; i < headers.length; i++) {
    headerLine += headers[i].textContent + ' | ';
  }

  addResult('HEADER ' + headerLine);

  const rows = table.querySelectorAll('.data-container tr');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let rowLine = '';
    const items = row.querySelectorAll('td > span');
    for (let j = 0; j < items.length; j++) {
      rowLine += items[j].textContent + ' | ';
    }

    if (rowLine.trim()) {
      addResult('ROW ' + rowLine);
    }
  }

  /**
   * @param {string} x
   */
  function addResult(x) {
    if (results) {
      results.push(x);
    } else {
      TestRunner.addResult(x);
    }
  }

  return true;
};

ConsoleTestRunner.disableConsoleViewport = function() {
  ConsoleTestRunner.fixConsoleViewportDimensions(600, 2000);
};

/**
 * @param {number} width
 * @param {number} height
 */
ConsoleTestRunner.fixConsoleViewportDimensions = function(width, height) {
  const viewport = Console.ConsoleView.instance().viewport;
  viewport.element.style.width = width + 'px';
  viewport.element.style.height = height + 'px';
  viewport.element.style.position = 'absolute';
  viewport.invalidate();
};

ConsoleTestRunner.selectMainExecutionContext = function() {
  const executionContexts = TestRunner.runtimeModel.executionContexts();
  for (const context of executionContexts) {
    if (context.isDefault) {
      self.UI.context.setFlavor(SDK.ExecutionContext, context);
      return;
    }
  }
};

/**
 * @param {string} code
 * @param {!Function=} callback
 * @param {boolean=} dontForceMainContext
 */
ConsoleTestRunner.evaluateInConsole = function(code, callback, dontForceMainContext) {
  if (!dontForceMainContext) {
    ConsoleTestRunner.selectMainExecutionContext();
  }
  callback = TestRunner.safeWrap(callback);

  const consoleView = Console.ConsoleView.instance();
  consoleView.prompt.appendCommand(code, true);
  ConsoleTestRunner.addConsoleViewSniffer(function(commandResult) {
    const element = commandResult.toMessageElement();
    // Only call the callback once the live location within the
    // message element is resolved initially.
    Promise
        .all([
          commandResult.formatErrorStackPromiseForTest(),
          TestRunner.waitForPendingLiveLocationUpdates(),
        ])
        .then(() => {
          callback(element.deepTextContent());
        });
  });
};

/**
 * @param {string} code
 * @param {boolean=} dontForceMainContext
 * @return {!Promise}
 */
ConsoleTestRunner.evaluateInConsolePromise = function(code, dontForceMainContext) {
  return new Promise(fulfill => ConsoleTestRunner.evaluateInConsole(code, fulfill, dontForceMainContext));
};

/**
 * @param {!Function} override
 * @param {boolean=} opt_sticky
 */
ConsoleTestRunner.addConsoleViewSniffer = function(override, opt_sticky) {
  TestRunner.addSniffer(Console.ConsoleView.prototype, 'consoleMessageAddedForTest', override, opt_sticky);
};

ConsoleTestRunner.waitForPendingViewportUpdates = async function() {
  const refreshPromise = Console.ConsoleView.instance().scheduledRefreshPromiseForTest || Promise.resolve();
  await refreshPromise;
};

/**
 * @param {string} code
 * @param {!Function=} callback
 * @param {boolean=} dontForceMainContext
 */
ConsoleTestRunner.evaluateInConsoleAndDump = function(code, callback, dontForceMainContext) {
  callback = TestRunner.safeWrap(callback);
  /**
   * @param {string} text
   */
  function mycallback(text) {
    text = text.replace(/\bVM\d+/g, 'VM');
    TestRunner.addResult(code + ' = ' + text);
    callback(text);
  }
  ConsoleTestRunner.evaluateInConsole(code, mycallback, dontForceMainContext);
};

/**
 * @param {string} code
 * @param {boolean=} dontForceMainContext
 * @return {!Promise}
 */
ConsoleTestRunner.evaluateInConsoleAndDumpPromise = function(code, dontForceMainContext) {
  return new Promise(fulfill => ConsoleTestRunner.evaluateInConsoleAndDump(code, fulfill, dontForceMainContext));
};

/**
 * @return {number}
 */
ConsoleTestRunner.consoleMessagesCount = function() {
  const consoleView = Console.ConsoleView.instance();
  return consoleView.consoleMessages.length;
};

/**
 * @param {function(!Element):string|undefined} messageFormatter
 * @param {!Element} node
 * @return {string}
 */
ConsoleTestRunner.formatterIgnoreStackFrameUrls = function(messageFormatter, node) {
  /**
   * @param {string} string
   */
  function isNotEmptyLine(string) {
    return string.trim().length > 0;
  }

  /**
   * @param {string} string
   */
  function ignoreStackFrameAndMutableData(string) {
    let buffer = string.replace(/\u200b/g, '');
    buffer = buffer.replace(/VM\d+/g, 'VM');
    return buffer.replace(/^\s+at [^\]]+(]?)$/, '$1');
  }

  messageFormatter = messageFormatter || TestRunner.textContentWithLineBreaks;
  const buffer = messageFormatter(node);
  return buffer.split('\n').map(ignoreStackFrameAndMutableData).filter(isNotEmptyLine).join('\n');
};

/**
 * @param {!Element} element
 * @param {!SDK.ConsoleMessage} message
 * @return {string}
 */
ConsoleTestRunner.simpleFormatter = function(element, message) {
  return message.messageText + ':' + message.line + ':' + message.column;
};

/**
 * @param {boolean=} printOriginatingCommand
 * @param {boolean=} dumpClassNames
 * @param {!ConsoleTestRunner.Formatter=} messageFormatter
 */
ConsoleTestRunner.dumpConsoleMessagesIgnoreErrorStackFrames =
    async function(printOriginatingCommand, dumpClassNames, messageFormatter) {
  TestRunner.addResults(await ConsoleTestRunner.dumpConsoleMessagesIntoArray(
      printOriginatingCommand, dumpClassNames,
      ConsoleTestRunner.formatterIgnoreStackFrameUrls.bind(this, messageFormatter)));
};

ConsoleTestRunner.dumpConsoleMessagesWithStyles = function() {
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;
  for (let i = 0; i < messageViews.length; ++i) {
    const element = messageViews[i].element();
    const messageText = ConsoleTestRunner.prepareConsoleMessageText(element);
    TestRunner.addResult(messageText);
    const spans = element.querySelectorAll('.console-message-text *');
    for (let j = 0; j < spans.length; ++j) {
      TestRunner.addResult('Styled text #' + j + ': ' + (spans[j].style.cssText || 'NO STYLES DEFINED'));
    }
  }
};

/**
 * @param {boolean=} sortMessages
 * @param {boolean=} trimMessages
 */
ConsoleTestRunner.dumpConsoleMessagesWithClasses = async function(sortMessages, trimMessages) {
  const result = [];
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;
  for (let i = 0; i < messageViews.length; ++i) {
    const element = messageViews[i].element();
    const contentElement = messageViews[i].contentElement();
    await TestRunner.waitForPendingLiveLocationUpdates();
    let messageText = ConsoleTestRunner.prepareConsoleMessageText(element);
    if (trimMessages) {
      messageText = messageText.replace(/[ ]+/g, ' ');
      messageText = messageText.replace(/\s+\n\s+/g, ' ');
    }
    result.push(messageText + ' ' + element.getAttribute('class') + ' > ' + contentElement.getAttribute('class'));
  }
  if (sortMessages) {
    result.sort();
  }
  TestRunner.addResults(result);
};

ConsoleTestRunner.dumpConsoleClassesBrief = async function() {
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;
  for (let i = 0; i < messageViews.length; ++i) {
    const repeatText = messageViews[i].repeatCount() > 1 ? (' x' + messageViews[i].repeatCount()) : '';
    const element = messageViews[i].toMessageElement();
    await TestRunner.waitForPendingLiveLocationUpdates();
    TestRunner.addResult(element.className + repeatText);
  }
};

ConsoleTestRunner.dumpConsoleCounters = async function() {
  const counter = ConsoleCounters.WarningErrorCounter.WarningErrorCounter.instanceForTest;
  if (counter.updatingForTest) {
    await TestRunner.addSnifferPromise(counter, 'updatedForTest');
  }
  if (counter.titlesForTesting) {
    TestRunner.addResult(counter.titlesForTesting);
  }
  await ConsoleTestRunner.dumpConsoleClassesBrief();
};

/**
 * @param {!Function} callback
 * @param {function(!Element):boolean} deepFilter
 * @param {function(!ObjectUI.ObjectPropertiesSection):boolean} sectionFilter
 */
ConsoleTestRunner.expandConsoleMessages = function(callback, deepFilter, sectionFilter) {
  Console.ConsoleView.instance().invalidateViewport();
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;

  // Initiate round-trips to fetch necessary data for further rendering.
  for (let i = 0; i < messageViews.length; ++i) {
    messageViews[i].element();
  }

  TestRunner.deprecatedRunAfterPendingDispatches(expandTreeElements);

  function expandTreeElements() {
    for (let i = 0; i < messageViews.length; ++i) {
      const element = messageViews[i].element();
      for (let node = element; node; node = node.traverseNextNode(element)) {
        if (node.treeElementForTest) {
          node.treeElementForTest.expand();
        }
        if (node.expandStackTraceForTest) {
          node.expandStackTraceForTest();
        }
        const section = ObjectUI.ObjectPropertiesSection.getObjectPropertiesSectionFrom(node);
        if (!section) {
          continue;
        }
        if (sectionFilter && !sectionFilter(section)) {
          continue;
        }
        section.expand();

        if (!deepFilter) {
          continue;
        }
        const treeElements = section.rootElement().children();
        for (let j = 0; j < treeElements.length; ++j) {
          for (let treeElement = treeElements[j]; treeElement;
               treeElement = treeElement.traverseNextTreeElement(true, null, true)) {
            if (deepFilter(treeElement)) {
              treeElement.expand();
            }
          }
        }
      }
    }
    TestRunner.deprecatedRunAfterPendingDispatches(callback);
  }
};

/**
 * @param {function(!Element):boolean} deepFilter
 * @param {function(!ObjectUI.ObjectPropertiesSection):boolean} sectionFilter
 * @return {!Promise}
 */
ConsoleTestRunner.expandConsoleMessagesPromise = function(deepFilter, sectionFilter) {
  return new Promise(fulfill => ConsoleTestRunner.expandConsoleMessages(fulfill, deepFilter, sectionFilter));
};

/**
 * @param {!Function} callback
 */
ConsoleTestRunner.expandGettersInConsoleMessages = function(callback) {
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;
  const properties = [];
  let propertiesCount = 0;
  TestRunner.addSniffer(ObjectUI.ObjectPropertyTreeElement.prototype, 'updateExpandable', propertyExpandableUpdated);
  for (let i = 0; i < messageViews.length; ++i) {
    const element = messageViews[i].element();
    for (let node = element; node; node = node.traverseNextNode(element)) {
      if (node.classList && node.classList.contains('object-value-calculate-value-button')) {
        ++propertiesCount;
        node.click();
        properties.push(node.parentElement.parentElement);
      }
    }
  }

  function propertyExpandableUpdated() {
    --propertiesCount;
    if (propertiesCount === 0) {
      for (let i = 0; i < properties.length; ++i) {
        properties[i].click();
      }
      TestRunner.deprecatedRunAfterPendingDispatches(callback);
    } else {
      TestRunner.addSniffer(
          ObjectUI.ObjectPropertyTreeElement.prototype, 'updateExpandable', propertyExpandableUpdated);
    }
  }
};

/**
 * @param {!Function} callback
 */
ConsoleTestRunner.expandConsoleMessagesErrorParameters = function(callback) {
  const messageViews = Console.ConsoleView.instance().visibleViewMessages;
  // Initiate round-trips to fetch necessary data for further rendering.
  for (let i = 0; i < messageViews.length; ++i) {
    messageViews[i].element();
  }
  TestRunner.deprecatedRunAfterPendingDispatches(callback);
};

/**
 * @param {!Function} callback
 */
ConsoleTestRunner.waitForRemoteObjectsConsoleMessages = function(callback) {
  const messages = Console.ConsoleView.instance().visibleViewMessages;
  for (let i = 0; i < messages.length; ++i) {
    messages[i].toMessageElement();
  }
  TestRunner.deprecatedRunAfterPendingDispatches(callback);
};

/**
 * @return {!Promise}
 */
ConsoleTestRunner.waitForRemoteObjectsConsoleMessagesPromise = function() {
  return new Promise(resolve => ConsoleTestRunner.waitForRemoteObjectsConsoleMessages(resolve));
};

/**
 * @return {!Promise}
 */
ConsoleTestRunner.waitUntilConsoleEditorLoaded = function() {
  let fulfill;
  const promise = new Promise(x => {
    fulfill = x;
  });
  const prompt = Console.ConsoleView.instance().prompt;
  if (prompt.editor) {
    fulfill(prompt.editor);
  } else {
    TestRunner.addSniffer(Console.ConsolePrompt.prototype, 'editorSetForTest', _ => fulfill(prompt.editor));
  }
  return promise;
};

/**
 * @param {!Function} callback
 */
ConsoleTestRunner.waitUntilMessageReceived = function(callback) {
  TestRunner.addSniffer(self.SDK.consoleModel, 'addMessage', callback, false);
};

/**
 * @return {!Promise}
 */
ConsoleTestRunner.waitUntilMessageReceivedPromise = function() {
  return new Promise(fulfill => ConsoleTestRunner.waitUntilMessageReceived(fulfill));
};

/**
 * @param {number} count
 * @param {!Function} callback
 */
ConsoleTestRunner.waitUntilNthMessageReceived = function(count, callback) {
  function override() {
    if (--count === 0) {
      TestRunner.safeWrap(callback)();
    } else {
      TestRunner.addSniffer(self.SDK.consoleModel, 'addMessage', override, false);
    }
  }
  TestRunner.addSniffer(self.SDK.consoleModel, 'addMessage', override, false);
};

/**
 * @param {number} count
 * @return {!Promise}
 */
ConsoleTestRunner.waitUntilNthMessageReceivedPromise = function(count) {
  return new Promise(fulfill => ConsoleTestRunner.waitUntilNthMessageReceived(count, fulfill));
};

/**
 * @param {string} namePrefix
 */
ConsoleTestRunner.changeExecutionContext = function(namePrefix) {
  const selector = Console.ConsoleView.instance().consoleContextSelector;
  for (const executionContext of selector.items) {
    if (selector.titleFor(executionContext).startsWith(namePrefix)) {
      self.UI.context.setFlavor(SDK.ExecutionContext, executionContext);
      return;
    }
  }
  TestRunner.addResult('FAILED: context with prefix: ' + namePrefix + ' not found in the context list');
};

/**
 * @param {number} expectedCount
 * @param {!Function} callback
 */
ConsoleTestRunner.waitForConsoleMessages = function(expectedCount, callback) {
  const consoleView = Console.ConsoleView.instance();
  checkAndReturn();

  function checkAndReturn() {
    if (consoleView.visibleViewMessages.length === expectedCount) {
      TestRunner.addResult('Message count: ' + expectedCount);
      callback();
    } else {
      TestRunner.addSniffer(consoleView, 'messageAppendedForTests', checkAndReturn);
    }
  }
};

/**
 * @param {number} expectedCount
 * @return {!Promise}
 */
ConsoleTestRunner.waitForConsoleMessagesPromise = async function(expectedCount) {
  await new Promise(fulfill => ConsoleTestRunner.waitForConsoleMessages(expectedCount, fulfill));
  await TestRunner.waitForPendingLiveLocationUpdates();
  return ConsoleTestRunner.waitForPendingViewportUpdates();
};

/**
 * @param {number} fromMessage
 * @param {number} fromTextOffset
 * @param {number} toMessage
 * @param {number} toTextOffset
 */
ConsoleTestRunner.selectConsoleMessages = async function(fromMessage, fromTextOffset, toMessage, toTextOffset) {
  const consoleView = Console.ConsoleView.instance();
  const fromElement = consoleView.itemElement(fromMessage).element();
  const toElement = consoleView.itemElement(toMessage).element();
  await TestRunner.waitForPendingLiveLocationUpdates();
  const from = selectionContainerAndOffset(fromElement, fromTextOffset);
  const to = selectionContainerAndOffset(toElement, toTextOffset);
  window.getSelection().setBaseAndExtent(from.container, from.offset, to.container, to.offset);

  /**
   * @param {!Node} container
   * @param {number} offset
   * @return {?{container: !Node, offset: number}}
   */
  function selectionContainerAndOffset(container, offset) {
    /** @type {?Node} */
    let node = container;
    if (offset === 0 && container.nodeType !== Node.TEXT_NODE) {
      container = /** @type {!Node} */ (container.traverseNextTextNode());
      node = container;
    }
    let charCount = 0;
    while ((node = node.traverseNextTextNode(container))) {
      const length = node.textContent.length;
      if (charCount + length >= offset) {
        return {container: node, offset: offset - charCount};
      }

      charCount += length;
    }
    return null;
  }
};

/**
 * @param {!Function} override
 * @param {boolean=} opt_sticky
 */
ConsoleTestRunner.addConsoleSniffer = function(override, opt_sticky) {
  TestRunner.addSniffer(SDK.ConsoleModel.prototype, 'addMessage', override, opt_sticky);
};

/**
 * @param {!Function} func
 * @return {!Function}
 */
ConsoleTestRunner.wrapListener = function(func) {
  /**
   * @this {*}
   */
  async function wrapper() {
    await Promise.resolve();
    func.apply(this, arguments);
  }
  return wrapper;
};

ConsoleTestRunner.dumpStackTraces = function() {
  const viewMessages = Console.ConsoleView.instance().visibleViewMessages;
  for (let i = 0; i < viewMessages.length; ++i) {
    const m = viewMessages[i].consoleMessage();
    TestRunner.addResult(
        'Message[' + i + ']: ' + Bindings.displayNameForURL(m.url || '') + ':' + m.line + ' ' + m.messageText);
    const trace = m.stackTrace ? m.stackTrace.callFrames : null;
    if (!trace) {
      TestRunner.addResult('FAIL: no stack trace attached to message #' + i);
    } else {
      TestRunner.addResult('Stack Trace:\n');
      TestRunner.addResult('  url: ' + trace[0].url);
      TestRunner.addResult('  function: ' + trace[0].functionName);
      TestRunner.addResult('  line: ' + trace[0].lineNumber);
    }
  }
};

/**
 * @return {!{first: number, last: number, count: number}}
 */
ConsoleTestRunner.visibleIndices = function() {
  const consoleView = Console.ConsoleView.instance();
  const viewport = consoleView.viewport;
  const viewportRect = viewport.element.getBoundingClientRect();
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 0; i < consoleView.visibleViewMessages.length; i++) {
    // Created message elements may have a bounding rect, but not be connected to DOM.
    const item = consoleView.visibleViewMessages[i];
    if (!item.elementInternal || !item.elementInternal.isConnected) {
      continue;
    }
    const itemRect = item.elementInternal.getBoundingClientRect();
    const isVisible = (itemRect.bottom > viewportRect.top + 0.5) && (itemRect.top < viewportRect.bottom - 0.5);
    if (isVisible) {
      first = first === -1 ? i : first;
      last = i;
      count++;
    }
  }
  return {first, last, count};
};
