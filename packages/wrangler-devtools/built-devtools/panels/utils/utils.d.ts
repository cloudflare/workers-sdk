import type * as Common from '../../core/common/common.js';
import type * as Diff from '../../third_party/diff/diff.js';
export declare function imageNameForResourceType(resourceType: Common.ResourceType.ResourceType): string;
export declare function formatCSSChangesFromDiff(diff: Diff.Diff.DiffArray): Promise<string>;
