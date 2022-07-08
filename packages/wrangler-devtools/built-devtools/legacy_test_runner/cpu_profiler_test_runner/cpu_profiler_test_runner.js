// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '../../panels/profiler/profiler-legacy.js';
import '../test_runner/test_runner.js';

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */
self.CPUProfilerTestRunner = self.CPUProfilerTestRunner || {};

CPUProfilerTestRunner.startProfilerTest = function(callback) {
  TestRunner.addResult('Profiler was enabled.');
  TestRunner.addSniffer(UI.panels.js_profiler, 'addProfileHeader', CPUProfilerTestRunner.profileHeaderAdded, true);
  TestRunner.addSniffer(Profiler.ProfileView.prototype, 'refresh', CPUProfilerTestRunner.profileViewRefresh, true);
  TestRunner.safeWrap(callback)();
};

CPUProfilerTestRunner.completeProfilerTest = function() {
  TestRunner.addResult('');
  TestRunner.addResult('Profiler was disabled.');
  TestRunner.completeTest();
};

CPUProfilerTestRunner.runProfilerTestSuite = function(testSuite) {
  const testSuiteTests = testSuite.slice();

  function runner() {
    if (!testSuiteTests.length) {
      CPUProfilerTestRunner.completeProfilerTest();
      return;
    }

    const nextTest = testSuiteTests.shift();
    TestRunner.addResult('');
    TestRunner.addResult(
        'Running: ' +
        /function\s([^(]*)/.exec(nextTest)[1]);
    TestRunner.safeWrap(nextTest)(runner, runner);
  }

  CPUProfilerTestRunner.startProfilerTest(runner);
};

CPUProfilerTestRunner.showProfileWhenAdded = function(title) {
  CPUProfilerTestRunner.showProfileWhenAdded = title;
};

CPUProfilerTestRunner.profileHeaderAdded = function(profile) {
  if (CPUProfilerTestRunner.showProfileWhenAdded === profile.title) {
    UI.panels.js_profiler.showProfile(profile);
  }
};

CPUProfilerTestRunner.waitUntilProfileViewIsShown = function(title, callback) {
  callback = TestRunner.safeWrap(callback);
  const profilesPanel = UI.panels.js_profiler;

  if (profilesPanel.visibleView && profilesPanel.visibleView.profile &&
      profilesPanel.visibleView.profileHeader.title === title) {
    callback(profilesPanel.visibleView);
  } else {
    CPUProfilerTestRunner.waitUntilProfileViewIsShownCallback = {title: title, callback: callback};
  }
};

CPUProfilerTestRunner.profileViewRefresh = function() {
  if (CPUProfilerTestRunner.waitUntilProfileViewIsShownCallback &&
      CPUProfilerTestRunner.waitUntilProfileViewIsShownCallback.title === this.profileHeader.title) {
    const callback = CPUProfilerTestRunner.waitUntilProfileViewIsShownCallback;
    delete CPUProfilerTestRunner.waitUntilProfileViewIsShownCallback;
    callback.callback(this);
  }
};
