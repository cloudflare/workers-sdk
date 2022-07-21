// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ARIAProperties from '../../generated/ARIAProperties.js';
export class ARIAMetadata {
    attributes;
    roleNames;
    constructor(config) {
        this.attributes = new Map();
        this.roleNames = [];
        if (config) {
            this.initialize(config);
        }
    }
    initialize(config) {
        const attributes = config['attributes'];
        const booleanEnum = ['true', 'false'];
        for (const attributeConfig of attributes) {
            if (attributeConfig.type === 'boolean') {
                attributeConfig.enum = booleanEnum;
            }
            this.attributes.set(attributeConfig.name, new Attribute(attributeConfig));
        }
        this.roleNames = config['roles'].map(roleConfig => roleConfig.name);
    }
    valuesForProperty(property) {
        const attribute = this.attributes.get(property);
        if (attribute) {
            return attribute.getEnum();
        }
        if (property === 'role') {
            return this.roleNames;
        }
        return [];
    }
}
let instance;
export function ariaMetadata() {
    if (!instance) {
        instance = new ARIAMetadata(ARIAProperties.config || null);
    }
    return instance;
}
export class Attribute {
    enum;
    constructor(config) {
        this.enum = [];
        if (config.enum) {
            this.enum = config.enum;
        }
    }
    getEnum() {
        return this.enum;
    }
}
//# sourceMappingURL=ARIAMetadata.js.map