// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// @ts-nocheck
import * as SourceFrameModule from './source_frame.js';
self.SourceFrame = self.SourceFrame || {};
SourceFrame = SourceFrame || {};
/** @constructor */
SourceFrame.BinaryResourceViewFactory = SourceFrameModule.BinaryResourceViewFactory.BinaryResourceViewFactory;
/** @constructor */
SourceFrame.FontView = SourceFrameModule.FontView.FontView;
/** @constructor */
SourceFrame.ImageView = SourceFrameModule.ImageView.ImageView;
/** @constructor */
SourceFrame.JSONView = SourceFrameModule.JSONView.JSONView;
/** @constructor */
SourceFrame.ParsedJSON = SourceFrameModule.JSONView.ParsedJSON;
/** @constructor */
SourceFrame.PreviewFactory = SourceFrameModule.PreviewFactory.PreviewFactory;
/** @constructor */
SourceFrame.ResourceSourceFrame = SourceFrameModule.ResourceSourceFrame.ResourceSourceFrame;
/** @constructor */
SourceFrame.ResourceSourceFrame.SearchableContainer = SourceFrameModule.ResourceSourceFrame.SearchableContainer;
/** @constructor */
SourceFrame.SourceFrame = SourceFrameModule.SourceFrame.SourceFrameImpl;
/** @interface */
SourceFrame.LineDecorator = SourceFrameModule.SourceFrame.LineDecorator;
/** @constructor */
SourceFrame.XMLView = SourceFrameModule.XMLView.XMLView;
/** @constructor */
SourceFrame.XMLView.Node = SourceFrameModule.XMLView.XMLViewNode;
//# sourceMappingURL=source_frame-legacy.js.map