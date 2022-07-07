// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */
self.SourcesTestRunner = self.SourcesTestRunner || {};

SourcesTestRunner.dumpSearchResults = function(searchResults) {
  function comparator(a, b) {
    a.url.localeCompare(b.url);
  }

  searchResults.sort(comparator);
  TestRunner.addResult('Search results: ');

  for (let i = 0; i < searchResults.length; i++) {
    TestRunner.addResult(
        'url: ' + searchResults[i].url.replace(/VM\d+/, 'VMXX') + ', matchesCount: ' + searchResults[i].matchesCount);
  }

  TestRunner.addResult('');
};

SourcesTestRunner.dumpSearchMatches = function(searchMatches) {
  TestRunner.addResult('Search matches: ');

  for (let i = 0; i < searchMatches.length; i++) {
    TestRunner.addResult(
        'lineNumber: ' + searchMatches[i].lineNumber + ', line: \'' + searchMatches[i].lineContent + '\'');
  }

  TestRunner.addResult('');
};

SourcesTestRunner.runSearchAndDumpResults = function(scope, searchConfig, callback) {
  const searchResults = [];
  const progress = new Common.Progress();
  scope.performSearch(searchConfig, progress, searchResultCallback, searchFinishedCallback);

  function searchResultCallback(searchResult) {
    searchResults.push(searchResult);
  }

  function searchFinishedCallback() {
    function comparator(searchResultA, searchResultB) {
      const aUrl = searchResultA.uiSourceCode.url();
      const bUrl = searchResultB.uiSourceCode.url();
      return aUrl > bUrl ? 1 : bUrl > aUrl ? -1 : 0;
    }

    searchResults.sort(comparator);

    for (let i = 0; i < searchResults.length; ++i) {
      const searchResult = searchResults[i];
      const uiSourceCode = searchResult.uiSourceCode;
      const searchMatches = searchResult.searchMatches;

      if (!searchMatches.length) {
        continue;
      }

      TestRunner.addResult(
          'Search result #' + (i + 1) + ': uiSourceCode.url = ' + uiSourceCode.url().replace(/VM\d+/, 'VMXX'));

      for (let j = 0; j < searchMatches.length; ++j) {
        const lineNumber = searchMatches[j].lineNumber;
        const lineContent = searchMatches[j].lineContent;
        TestRunner.addResult(
            '  search match #' + (j + 1) + ': lineNumber = ' + lineNumber + ', lineContent = \'' + lineContent + '\'');
      }
    }

    callback();
  }
};

SourcesTestRunner.replaceAndDumpChange = function(sourceFrame, searchConfig, replacement, replaceAll) {
  const modifiers = [];

  if (searchConfig.isRegex) {
    modifiers.push('regex');
  }

  if (searchConfig.caseSensitive) {
    modifiers.push('caseSensitive');
  }

  if (replaceAll) {
    modifiers.push('replaceAll');
  }

  const modifiersString = (modifiers.length ? ' (' + modifiers.join(', ') + ')' : '');
  TestRunner.addResult(
      'Running replace test for /' + searchConfig.query + '/' + replacement + '/ ' + modifiersString + ':');
  const editor = sourceFrame.textEditor;
  const oldLines = [];

  for (let i = 0; i < editor.linesCount; ++i) {
    oldLines.push(editor.line(i));
  }

  const searchableView = UI.panels.sources.sourcesView().searchableView();
  searchableView.showSearchField();
  searchableView.caseSensitiveButton.setToggled(searchConfig.caseSensitive);
  searchableView.regexButton.setToggled(searchConfig.isRegex);
  searchableView.searchInputElement.value = searchConfig.query;
  searchableView.replaceToggleButton.setToggled(true);
  searchableView.updateSecondRowVisibility();
  searchableView.replaceInputElement.value = replacement;
  searchableView.performSearch(true, true);

  if (replaceAll) {
    searchableView.replaceAll();
  } else {
    searchableView.replace();
  }

  const newLines = [];

  for (let i = 0; i < editor.linesCount; ++i) {
    newLines.push(editor.line(i));
  }

  for (let i = 0; i < newLines.length; ++i) {
    if (oldLines[i] === newLines[i]) {
      continue;
    }

    const oldLine = oldLines[i];
    const newLine = newLines[i];
    let prefixLength = 0;

    for (let j = 0; j < oldLine.length && j < newLine.length && newLine[j] === oldLine[j]; ++j) {
      ++prefixLength;
    }

    let postfixLength = 0;

    for (let j = 0; j < oldLine.length && j < newLine.length &&
         newLine[newLine.length - j - 1] === oldLine[oldLine.length - j - 1];
         ++j) {
      ++postfixLength;
    }

    const prefix = oldLine.substring(0, prefixLength);
    const removed = oldLine.substring(prefixLength, oldLine.length - postfixLength);
    const added = newLine.substring(prefixLength, newLine.length - postfixLength);
    const postfix = oldLine.substring(oldLine.length - postfixLength);
    TestRunner.addResult('  - ' + prefix + '#' + removed + '#' + added + '#' + postfix);
  }
};

TestRunner.deprecatedInitAsync(`
  if (window.GCController)
    GCController.collect();
`);
