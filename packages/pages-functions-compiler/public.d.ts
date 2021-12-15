/* Type definitions for the public Functions interfaces */

export type RequestHandler = (context: EventContext<any, any>) => Response | Promise<Response>

export type EventContext<P extends string, Data extends object = Record<string, any>> = {
  request: Request;
  waitUntil: (promise: PromiseLike<any>) => void;
  next: (input?: RequestInfo, init?: RequestInit) => ReturnType<RequestHandler>;
  env: Record<string, Binding>;
  params: Params<P>;
  data: Data
}

export type KVBinding = {
  get: (str: string) =>  string | null;
}

export type EnvironmentVariable = string

export type Binding = KVBinding | EnvironmentVariable

export type Params<T extends string = any> = Record<T, string | string[]>