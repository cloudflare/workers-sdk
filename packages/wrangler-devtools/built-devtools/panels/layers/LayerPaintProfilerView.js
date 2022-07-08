// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as LayerViewer from '../layer_viewer/layer_viewer.js';
import * as UI from '../../ui/legacy/legacy.js';
export class LayerPaintProfilerView extends UI.SplitWidget.SplitWidget {
    logTreeView;
    paintProfilerView;
    constructor(showImageCallback) {
        super(true, false);
        this.logTreeView = new LayerViewer.PaintProfilerView.PaintProfilerCommandLogView();
        this.setSidebarWidget(this.logTreeView);
        this.paintProfilerView = new LayerViewer.PaintProfilerView.PaintProfilerView(showImageCallback);
        this.setMainWidget(this.paintProfilerView);
        this.paintProfilerView.addEventListener(LayerViewer.PaintProfilerView.Events.WindowChanged, this.onWindowChanged, this);
        this.logTreeView.focus();
    }
    reset() {
        void this.paintProfilerView.setSnapshotAndLog(null, [], null);
    }
    profile(snapshot) {
        void snapshot.commandLog().then(log => setSnapshotAndLog.call(this, snapshot, log));
        function setSnapshotAndLog(snapshot, log) {
            this.logTreeView.setCommandLog(log || []);
            void this.paintProfilerView.setSnapshotAndLog(snapshot, log || [], null);
            if (snapshot) {
                snapshot.release();
            }
        }
    }
    setScale(scale) {
        this.paintProfilerView.setScale(scale);
    }
    onWindowChanged() {
        this.logTreeView.updateWindow(this.paintProfilerView.selectionWindow());
    }
}
//# sourceMappingURL=LayerPaintProfilerView.js.map