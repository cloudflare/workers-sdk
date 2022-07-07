// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import '../../tree_outline/tree_outline.js';
export const belgraveHouse = {
    treeNodeData: 'BEL',
    id: 'BEL',
};
export const officesAndProductsData = [
    {
        treeNodeData: 'Offices',
        id: 'Offices',
        children: () => Promise.resolve([
            {
                treeNodeData: 'Europe',
                id: 'Europe',
                children: () => Promise.resolve([
                    {
                        treeNodeData: 'UK',
                        id: 'UK',
                        children: () => Promise.resolve([
                            {
                                treeNodeData: 'LON',
                                id: 'LON',
                                children: () => Promise.resolve([{ treeNodeData: '6PS', id: '6PS' }, { treeNodeData: 'CSG', id: 'CSG' }, belgraveHouse]),
                            },
                        ]),
                    },
                    {
                        treeNodeData: 'Germany',
                        id: 'Germany',
                        children: () => Promise.resolve([
                            { treeNodeData: 'MUC', id: 'MUC' },
                            { treeNodeData: 'BER', id: 'BER' },
                        ]),
                    },
                ]),
            },
        ]),
    },
    {
        treeNodeData: 'Products',
        id: 'Products',
        children: () => Promise.resolve([
            {
                treeNodeData: 'Chrome',
                id: 'Chrome',
            },
            {
                treeNodeData: 'YouTube',
                id: 'YouTube',
            },
            {
                treeNodeData: 'Drive',
                id: 'Drive',
            },
            {
                treeNodeData: 'Calendar',
                id: 'Calendar',
            },
        ]),
    },
];
//# sourceMappingURL=sample-data.js.map