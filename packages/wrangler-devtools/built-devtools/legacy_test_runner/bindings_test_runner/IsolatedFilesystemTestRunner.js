// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 */
self.BindingsTestRunner = self.BindingsTestRunner || {};

Host.InspectorFrontendHost.isolatedFileSystem = function(name) {
  return BindingsTestRunner.TestFileSystem.instances[name];
};

BindingsTestRunner.TestFileSystem = function(fileSystemPath) {
  this.root = new BindingsTestRunner.TestFileSystem.Entry(this, '', true, null);
  this.fileSystemPath = fileSystemPath;
};

BindingsTestRunner.TestFileSystem.instances = {};

BindingsTestRunner.TestFileSystem.prototype = {
  dumpAsText: function() {
    const result = [];
    dfs(this.root, '');
    result[0] = this.fileSystemPath;
    return result.join('\n');

    function dfs(node, indent) {
      result.push(indent + node.name);
      const newIndent = indent + '    ';

      for (const child of node.children.values()) {
        dfs(child, newIndent);
      }
    }
  },

  reportCreatedPromise: function(type) {
    return new Promise(fulfill => this.reportCreated(fulfill, type));
  },

  reportCreated: function(callback, type) {
    const fileSystemPath = this.fileSystemPath;
    BindingsTestRunner.TestFileSystem.instances[this.fileSystemPath] = this;

    Host.InspectorFrontendHost.events.dispatchEventToListeners(
        Host.InspectorFrontendHostAPI.Events.FileSystemAdded,
        {fileSystem: {fileSystemPath: this.fileSystemPath, fileSystemName: this.fileSystemPath, type}});

    self.Persistence.isolatedFileSystemManager.addEventListener(
        Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, created);

    function created(event) {
      const fileSystem = event.data;
      if (fileSystem.path() !== Common.ParsedURL.ParsedURL.rawPathToUrlString(fileSystemPath)) {
        return;
      }

      self.Persistence.isolatedFileSystemManager.removeEventListener(
          Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, created);
      callback(fileSystem);
    }
  },

  reportRemoved: function() {
    delete BindingsTestRunner.TestFileSystem.instances[this.fileSystemPath];
    Host.InspectorFrontendHost.events.dispatchEventToListeners(
        Host.InspectorFrontendHostAPI.Events.FileSystemRemoved, this.fileSystemPath);
  },

  addFile: function(path, content, lastModified) {
    const pathTokens = path.split('/');
    let node = this.root;
    const folders = pathTokens.slice(0, pathTokens.length - 1);
    const fileName = pathTokens[pathTokens.length - 1];

    for (const folder of folders) {
      let dir = node.children.get(folder);

      if (!dir) {
        dir = node.mkdir(folder);
      }

      node = dir;
    }

    const file = node.addFile(fileName, content);

    if (lastModified) {
      file.timestamp = lastModified;
    }

    return file;
  }
};

BindingsTestRunner.TestFileSystem.Entry = function(fileSystem, name, isDirectory, parent) {
  this.fileSystem = fileSystem;
  this.name = name;
  this.children = new Map();
  this.isDirectory = isDirectory;
  this.timestamp = 1000000;
  this.parent = parent;
};

BindingsTestRunner.TestFileSystem.Entry.prototype = {
  get fullPath() {
    return (this.parent ? this.parent.fullPath + '/' + this.name : '');
  },

  remove: function(success, failure) {
    this.parent.removeChild(this, success, failure);
  },

  removeChild: function(child, success, failure) {
    if (!this.children.has(child.name)) {
      failure('Failed to remove file: file not found.');
      return;
    }

    const fullPath = this.fileSystem.fileSystemPath + child.fullPath;
    this.children.delete(child.name);
    child.parent = null;

    Host.InspectorFrontendHost.events.dispatchEventToListeners(
        Host.InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [], added: [], removed: [fullPath]});

    success();
  },

  mkdir: function(name) {
    const child = new BindingsTestRunner.TestFileSystem.Entry(this.fileSystem, name, true, this);
    this.children.set(name, child);
    return child;
  },

  addFile: function(name, content) {
    const child = new BindingsTestRunner.TestFileSystem.Entry(this.fileSystem, name, false, this);
    this.children.set(name, child);

    child.content = new Blob([content], {type: 'text/plain'});

    const fullPath = this.fileSystem.fileSystemPath + child.fullPath;

    Host.InspectorFrontendHost.events.dispatchEventToListeners(
        Host.InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [], added: [fullPath], removed: []});

    return child;
  },

  setContent: function(content) {
    this.content = new Blob([content], {type: 'text/plain'});

    this.timestamp += 1000;
    const fullPath = this.fileSystem.fileSystemPath + this.fullPath;

    Host.InspectorFrontendHost.events.dispatchEventToListeners(
        Host.InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [fullPath], added: [], removed: []});
  },

  createReader: function() {
    return new BindingsTestRunner.TestFileSystem.Reader([...this.children.values()]);
  },

  createWriter: function(success, failure) {
    success(new BindingsTestRunner.TestFileSystem.Writer(this));
  },

  file: function(callback) {
    callback(this.content);
  },

  getDirectory: function(path, noop, callback, errorCallback) {
    this.getEntry(path, noop, callback, errorCallback);
  },

  getFile: function(path, noop, callback, errorCallback) {
    this.getEntry(path, noop, callback, errorCallback);
  },

  createEntry: function(path, options, callback, errorCallback) {
    const tokens = path.split('/');
    const name = tokens.pop();
    let parentEntry = this;

    for (const token of tokens) {
      parentEntry = parentEntry.children.get(token);
    }

    let entry = parentEntry.children.get(name);

    if (entry && options.exclusive) {
      errorCallback(new DOMException('File exists: ' + path, 'InvalidModificationError'));
      return;
    }

    if (!entry) {
      entry = parentEntry.addFile(name, '');
    }

    callback(entry);
  },

  getEntry: function(path, options, callback, errorCallback) {
    if (path.startsWith('/')) {
      path = path.substring(1);
    }

    if (options && options.create) {
      this.createEntry(path, options, callback, errorCallback);
      return;
    }

    if (!path) {
      callback(this);
      return;
    }

    let entry = this;

    for (const token of path.split('/')) {
      entry = entry.children.get(token);
      if (!entry) {
        break;
      }
    }

    (entry ? callback(entry) : errorCallback(new DOMException('Path not found: ' + path, 'NotFoundError')));
  },

  getMetadata: function(success, failure) {
    success({modificationTime: new Date(this.timestamp), size: (this.isDirectory ? 0 : this.content.size)});
  },

  moveTo: function(parent, newName, callback, errorCallback) {
    this.parent.children.delete(this.name);
    this.parent = parent;
    this.name = newName;
    this.parent.children.set(this.name, this);
    callback(this);
  },

  getParent: function(callback, errorCallback) {
    callback(this.parent);
  }
};

BindingsTestRunner.TestFileSystem.Reader = function(children) {
  this.children = children;
};

BindingsTestRunner.TestFileSystem.Reader.prototype = {
  readEntries: function(callback) {
    const children = this.children;
    this.children = [];
    callback(children);
  }
};

BindingsTestRunner.TestFileSystem.Writer = function(entry) {
  this.entry = entry;
  this.modificationTimesDelta = 500;
};

BindingsTestRunner.TestFileSystem.Writer.prototype = {
  write: function(blob) {
    this.entry.timestamp += this.modificationTimesDelta;
    this.entry.content = blob;

    if (this.onwriteend) {
      this.onwriteend();
    }
  },

  truncate: function(num) {
    this.entry.timestamp += this.modificationTimesDelta;
    this.entry.content = this.entry.content.slice(0, num);

    if (this.onwriteend) {
      this.onwriteend();
    }
  }
};
