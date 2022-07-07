import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
export declare class Database {
    private readonly model;
    private readonly idInternal;
    private domainInternal;
    private nameInternal;
    private versionInternal;
    constructor(model: DatabaseModel, id: Protocol.Database.DatabaseId, domain: string, name: string, version: string);
    get id(): string;
    get name(): string;
    set name(x: string);
    get version(): string;
    set version(x: string);
    get domain(): string;
    set domain(x: string);
    tableNames(): Promise<string[]>;
    executeSql(query: string, onSuccess: (arg0: Array<string>, arg1: Array<any>) => void, onError: (arg0: string) => void): Promise<void>;
}
export declare class DatabaseModel extends SDK.SDKModel.SDKModel<EventTypes> {
    private databasesInternal;
    readonly agent: ProtocolProxyApi.DatabaseApi;
    private enabled?;
    constructor(target: SDK.Target.Target);
    enable(): void;
    disable(): void;
    databases(): Database[];
    addDatabase(database: Database): void;
}
export declare enum Events {
    DatabaseAdded = "DatabaseAdded",
    DatabasesRemoved = "DatabasesRemoved"
}
export declare type EventTypes = {
    [Events.DatabaseAdded]: Database;
    [Events.DatabasesRemoved]: void;
};
export declare class DatabaseDispatcher implements ProtocolProxyApi.DatabaseDispatcher {
    private readonly model;
    constructor(model: DatabaseModel);
    addDatabase({ database }: Protocol.Database.AddDatabaseEvent): void;
}
