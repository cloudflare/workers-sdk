import { phases } from "./state";

await new Promise((resolve) => setTimeout(resolve, 12_000));
phases.abort.evaluated = true;
export const value = "12";
