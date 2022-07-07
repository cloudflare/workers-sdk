import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type { Issue, IssueKind } from './Issue.js';
import { Events } from './IssuesManagerEvents.js';
export { Events } from './IssuesManagerEvents.js';
export interface IssuesManagerCreationOptions {
    forceNew: boolean;
    /** Throw an error if this is not the first instance created */
    ensureFirst: boolean;
    showThirdPartyIssuesSetting?: Common.Settings.Setting<boolean>;
    hideIssueSetting?: Common.Settings.Setting<HideIssueMenuSetting>;
}
export declare type HideIssueMenuSetting = {
    [x: string]: IssueStatus;
};
export declare const enum IssueStatus {
    Hidden = "Hidden",
    Unhidden = "Unhidden"
}
export declare function defaultHideIssueByCodeSetting(): HideIssueMenuSetting;
export declare function getHideIssueByCodeSetting(): Common.Settings.Setting<HideIssueMenuSetting>;
/**
 * The `IssuesManager` is the central storage for issues. It collects issues from all the
 * `IssuesModel` instances in the page, and deduplicates them wrt their primary key.
 * It also takes care of clearing the issues when it sees a main-frame navigated event.
 * Any client can subscribe to the events provided, and/or query the issues via the public
 * interface.
 *
 * Additionally, the `IssuesManager` can filter Issues. All Issues are stored, but only
 * Issues that are accepted by the filter cause events to be fired or are returned by
 * `IssuesManager#issues()`.
 */
export declare class IssuesManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.IssuesModel.IssuesModel> {
    #private;
    private readonly showThirdPartyIssuesSetting?;
    private readonly hideIssueSetting?;
    constructor(showThirdPartyIssuesSetting?: Common.Settings.Setting<boolean> | undefined, hideIssueSetting?: Common.Settings.Setting<HideIssueMenuSetting> | undefined);
    static instance(opts?: IssuesManagerCreationOptions): IssuesManager;
    static removeInstance(): void;
    /**
     * Once we have seen at least one `TopFrameNavigated` event, we can be reasonably sure
     * that we also collected issues that were reported during the navigation to the current
     * page. If we haven't seen a main frame navigated, we might have missed issues that arose
     * during navigation.
     */
    reloadForAccurateInformationRequired(): boolean;
    modelAdded(issuesModel: SDK.IssuesModel.IssuesModel): void;
    modelRemoved(issuesModel: SDK.IssuesModel.IssuesModel): void;
    addIssue(issuesModel: SDK.IssuesModel.IssuesModel, issue: Issue): void;
    issues(): Iterable<Issue>;
    numberOfIssues(kind?: IssueKind): number;
    numberOfHiddenIssues(kind?: IssueKind): number;
    numberOfAllStoredIssues(): number;
    unhideAllIssues(): void;
    getIssueById(id: string): Issue | undefined;
}
export interface IssueAddedEvent {
    issuesModel: SDK.IssuesModel.IssuesModel;
    issue: Issue;
}
export declare type EventTypes = {
    [Events.IssuesCountUpdated]: void;
    [Events.FullUpdateRequired]: void;
    [Events.IssueAdded]: IssueAddedEvent;
};
