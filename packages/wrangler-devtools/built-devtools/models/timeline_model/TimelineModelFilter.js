// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { RecordType, TimelineModelImpl } from './TimelineModel.js';
export class TimelineModelFilter {
    accept(_event) {
        return true;
    }
}
export class TimelineVisibleEventsFilter extends TimelineModelFilter {
    visibleTypes;
    constructor(visibleTypes) {
        super();
        this.visibleTypes = new Set(visibleTypes);
    }
    accept(event) {
        return this.visibleTypes.has(TimelineVisibleEventsFilter.eventType(event));
    }
    static eventType(event) {
        if (event.hasCategory(TimelineModelImpl.Category.Console)) {
            return RecordType.ConsoleTime;
        }
        if (event.hasCategory(TimelineModelImpl.Category.UserTiming)) {
            return RecordType.UserTiming;
        }
        if (event.hasCategory(TimelineModelImpl.Category.LatencyInfo)) {
            return RecordType.LatencyInfo;
        }
        return event.name;
    }
}
export class TimelineInvisibleEventsFilter extends TimelineModelFilter {
    invisibleTypes;
    constructor(invisibleTypes) {
        super();
        this.invisibleTypes = new Set(invisibleTypes);
    }
    accept(event) {
        return !this.invisibleTypes.has(TimelineVisibleEventsFilter.eventType(event));
    }
}
export class ExclusiveNameFilter extends TimelineModelFilter {
    excludeNames;
    constructor(excludeNames) {
        super();
        this.excludeNames = new Set(excludeNames);
    }
    accept(event) {
        return !this.excludeNames.has(event.name);
    }
}
//# sourceMappingURL=TimelineModelFilter.js.map