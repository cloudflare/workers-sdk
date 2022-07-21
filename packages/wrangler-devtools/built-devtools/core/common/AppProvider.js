// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../root/root.js';
const registeredAppProvider = [];
export function registerAppProvider(registration) {
    registeredAppProvider.push(registration);
}
export function getRegisteredAppProviders() {
    return registeredAppProvider
        .filter(provider => Root.Runtime.Runtime.isDescriptorEnabled({ experiment: undefined, condition: provider.condition }))
        .sort((firstProvider, secondProvider) => {
        const order1 = firstProvider.order || 0;
        const order2 = secondProvider.order || 0;
        return order1 - order2;
    });
}
//# sourceMappingURL=AppProvider.js.map