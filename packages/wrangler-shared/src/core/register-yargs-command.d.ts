import type { CommonYargsArgv, SubHelp } from "../../../wrangler/src/yargs-types";
import type { InternalDefinition } from "./types";
/**
 * Creates a function for registering commands using Yargs.
 */
export declare function createRegisterYargsCommand(yargs: CommonYargsArgv, subHelp: SubHelp): (segment: string, def: InternalDefinition, registerSubTreeCallback: () => void) => void;
