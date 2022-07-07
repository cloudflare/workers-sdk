// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */

self.BindingsTestRunner = self.BindingsTestRunner || {};

BindingsTestRunner.addFiles = function(testFileSystem, files) {
  for (const filePath in files) {
    const file = files[filePath];
    testFileSystem.addFile(filePath, file.content, (file.time ? file.time.getTime() : 0));
  }
};

let timeOverrides;
let originalRequestMetadata;

BindingsTestRunner.overrideNetworkModificationTime = function(urlToTime) {
  if (!timeOverrides) {
    timeOverrides = new Map();
    originalRequestMetadata =
        TestRunner.override(Bindings.ContentProviderBasedProject.prototype, 'requestMetadata', overrideTime, true);
  }

  for (const url in urlToTime) {
    timeOverrides.set(url, urlToTime[url]);
  }

  function overrideTime(uiSourceCode) {
    if (!timeOverrides.has(uiSourceCode.url())) {
      return originalRequestMetadata.call(this, uiSourceCode);
    }

    const override = timeOverrides.get(uiSourceCode.url());
    return originalRequestMetadata.call(this, uiSourceCode).then(onOriginalMetadata.bind(null, override));
  }

  function onOriginalMetadata(timeOverride, metadata) {
    if (!timeOverride && !metadata) {
      return null;
    }

    return new Workspace.UISourceCodeMetadata(timeOverride, (metadata ? metadata.contentSize : null));
  }
};

BindingsTestRunner.AutomappingTest = function(workspace) {
  this.workspace = workspace;
  this.networkProject = new Bindings.ContentProviderBasedProject(
      this.workspace, 'AUTOMAPPING', Workspace.projectTypes.Network, 'simple website');

  if (workspace !== self.Workspace.workspace) {
    new Persistence.FileSystemWorkspaceBinding(self.Persistence.isolatedFileSystemManager, this.workspace);
  }

  this.failedBindingsCount = 0;
  this.automapping =
      new Persistence.Automapping(this.workspace, this._onStatusAdded.bind(this), this._onStatusRemoved.bind(this));
  TestRunner.addSniffer(this.automapping, 'onBindingFailedForTest', this._onBindingFailed.bind(this), true);
  TestRunner.addSniffer(this.automapping, 'onSweepHappenedForTest', this._onSweepHappened.bind(this), true);
};

BindingsTestRunner.AutomappingTest.prototype = {
  removeResources: function(urls) {
    for (const url of urls) {
      this.networkProject.removeFile(url);
    }
  },

  addNetworkResources: function(assets) {
    for (const url in assets) {
      const asset = assets[url];
      const contentType = asset.contentType || Common.resourceTypes.Script;
      const contentProvider = TextUtils.StaticContentProvider.fromString(url, contentType, asset.content);
      const metadata =
          (typeof asset.content === 'string' || asset.time ?
               new Workspace.UISourceCodeMetadata(asset.time, asset.content.length) :
               null);
      const uiSourceCode = this.networkProject.createUISourceCode(url, contentType);
      this.networkProject.addUISourceCodeWithProvider(uiSourceCode, contentProvider, metadata);
    }
  },

  waitUntilMappingIsStabilized: function() {
    const promise = new Promise(x => {
      this.stabilizedCallback = x;
    });
    this._checkStabilized();
    return promise;
  },

  _onSweepHappened: function() {
    this.failedBindingsCount = 0;
    this._checkStabilized();
  },

  _onStatusRemoved: function(status) {
    TestRunner.addResult('Binding removed: ' + status);
    this._checkStabilized();
  },

  _onStatusAdded: function(status) {
    TestRunner.addResult('Binding created: ' + status);
    this._checkStabilized();
  },

  _onBindingFailed: function() {
    ++this.failedBindingsCount;
    this._checkStabilized();
  },

  _checkStabilized: function() {
    if (!this.stabilizedCallback || this.automapping.sweepThrottler.process) {
      return;
    }

    const networkUISourceCodes = this.workspace.uiSourceCodesForProjectType(Workspace.projectTypes.Network);
    const stabilized = this.failedBindingsCount + this.automapping.statuses.size === networkUISourceCodes.length;

    if (stabilized) {
      TestRunner.addResult('Mapping has stabilized.');
      const callback = this.stabilizedCallback;
      delete this.stabilizedCallback;
      callback.call(null);
    }
  }
};
