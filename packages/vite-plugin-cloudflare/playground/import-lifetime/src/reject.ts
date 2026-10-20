import { phases } from "./state";

phases.reject.evaluated = true;
throw new Error("import-lifetime-rejection");
export const value = "unreachable";
