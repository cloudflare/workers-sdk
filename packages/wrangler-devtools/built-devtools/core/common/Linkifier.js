// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Linkifier {
    static async linkify(object, options) {
        if (!object) {
            throw new Error('Can\'t linkify ' + object);
        }
        const linkifierRegistration = getApplicableRegisteredlinkifiers(object)[0];
        if (!linkifierRegistration) {
            throw new Error('No linkifiers registered for object ' + object);
        }
        const linkifier = await linkifierRegistration.loadLinkifier();
        return linkifier.linkify(object, options);
    }
}
const registeredLinkifiers = [];
export function registerLinkifier(registration) {
    registeredLinkifiers.push(registration);
}
export function getApplicableRegisteredlinkifiers(object) {
    return registeredLinkifiers.filter(isLinkifierApplicableToContextTypes);
    function isLinkifierApplicableToContextTypes(linkifierRegistration) {
        if (!linkifierRegistration.contextTypes) {
            return true;
        }
        for (const contextType of linkifierRegistration.contextTypes()) {
            if (object instanceof contextType) {
                return true;
            }
        }
        return false;
    }
}
//# sourceMappingURL=Linkifier.js.map