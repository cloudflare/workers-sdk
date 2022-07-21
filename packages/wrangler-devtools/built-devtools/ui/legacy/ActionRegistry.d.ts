import type { Action } from './ActionRegistration.js';
import { Context } from './Context.js';
export declare class ActionRegistry {
    private readonly actionsById;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionRegistry;
    static removeInstance(): void;
    private registerActions;
    availableActions(): Action[];
    actions(): Action[];
    applicableActions(actionIds: string[], context: Context): Action[];
    action(actionId: string): Action | null;
}
