export type WorkerRouter = {
  include: string[];
  exclude: string[];
};

export function convertRouteListToFilterRules(input: string[], maxRules: number): WorkerRouter {
  return {
    include: [...input.map((str) => str.replace(/:\w+\*?/, "*"))],
    exclude: [],
  };
}
