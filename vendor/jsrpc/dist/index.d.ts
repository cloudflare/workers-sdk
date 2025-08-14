// This file borrows heavily from `types/defines/rpc.d.ts` in workerd.

// Branded types for identifying `WorkerEntrypoint`/`DurableObject`/`Target`s.
// TypeScript uses *structural* typing meaning anything with the same shape as type `T` is a `T`.
// For the classes exported by `cloudflare:workers` we want *nominal* typing (i.e. we only want to
// accept `WorkerEntrypoint` from `cloudflare:workers`, not any other class with the same shape)
declare const __RPC_STUB_BRAND: '__RPC_STUB_BRAND';
declare const __RPC_TARGET_BRAND: '__RPC_TARGET_BRAND';
interface RpcTargetBranded {
  [__RPC_TARGET_BRAND]: never;
}

// Types that can be used through `Stub`s
type Stubable = RpcTargetBranded | ((...args: any[]) => any);

// Types that can be passed over RPC
// The reason for using a generic type here is to build a serializable subset of structured
//   cloneable composite types. This allows types defined with the "interface" keyword to pass the
//   serializable check as well. Otherwise, only types defined with the "type" keyword would pass.
type Serializable<T> =
  // Structured cloneables
  | BaseType
  // Structured cloneable composites
  | Map<
      T extends Map<infer U, unknown> ? Serializable<U> : never,
      T extends Map<unknown, infer U> ? Serializable<U> : never
    >
  | Set<T extends Set<infer U> ? Serializable<U> : never>
  | ReadonlyArray<T extends ReadonlyArray<infer U> ? Serializable<U> : never>
  | {
      [K in keyof T]: K extends number | string ? Serializable<T[K]> : never;
    }
  // Special types
  | Stub<Stubable>
  // Serialized as stubs, see `Stubify`
  | Stubable;

// Base type for all RPC stubs, including common memory management methods.
// `T` is used as a marker type for unwrapping `Stub`s later.
interface StubBase<T extends Serializable<T>> extends Disposable {
  [__RPC_STUB_BRAND]: T;
  dup(): this;
  onRpcBroken(callback: (error: any) => void): void;
}
type Stub<T extends Serializable<T>> =
    T extends object ? Provider<T> & StubBase<T> : StubBase<T>;

type TypedArray =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | BigUint64Array
  | BigInt64Array
  | Float32Array
  | Float64Array;

// This represents all the types that can be sent as-is over an RPC boundary
type BaseType =
  | void
  | undefined
  | null
  | boolean
  | number
  | bigint
  | string
  | TypedArray
  | ArrayBuffer
  | DataView
  | Date
  | Error
  | RegExp
  | ReadableStream<Uint8Array>
  | WritableStream<Uint8Array>
  | Request
  | Response
  | Headers;
// Recursively rewrite all `Stubable` types with `Stub`s, and resolve promsies.
// prettier-ignore
type Stubify<T> =
  T extends Stubable ? Stub<T>
  : T extends Promise<T> ? Stubify<T>
  : T extends StubBase<any> ? T
  : T extends Map<infer K, infer V> ? Map<Stubify<K>, Stubify<V>>
  : T extends Set<infer V> ? Set<Stubify<V>>
  : T extends Array<infer V> ? Array<Stubify<V>>
  : T extends ReadonlyArray<infer V> ? ReadonlyArray<Stubify<V>>
  : T extends BaseType ? T
  // When using "unknown" instead of "any", interfaces are not stubified.
  : T extends { [key: string | number]: any } ? { [K in keyof T]: Stubify<T[K]> }
  : T;

// Recursively rewrite all `Stub<T>`s with the corresponding `T`s.
// Note we use `StubBase` instead of `Stub` here to avoid circular dependencies:
// `Stub` depends on `Provider`, which depends on `Unstubify`, which would depend on `Stub`.
// prettier-ignore
type UnstubifyInner<T> =
  T extends StubBase<infer V> ? (T | V)  // can provide either stub or local RpcTarget
  : T extends Map<infer K, infer V> ? Map<Unstubify<K>, Unstubify<V>>
  : T extends Set<infer V> ? Set<Unstubify<V>>
  : T extends Array<infer V> ? Array<Unstubify<V>>
  : T extends ReadonlyArray<infer V> ? ReadonlyArray<Unstubify<V>>
  : T extends BaseType ? T
  : T extends { [key: string | number]: unknown } ? { [K in keyof T]: Unstubify<T[K]> }
  : T;

// You can put promises anywhere in the params and they'll be resolved before delivery.
// (This also covers RpcPromise, because it's defined as being a Promise.)
type Unstubify<T> = UnstubifyInner<T> | Promise<UnstubifyInner<T>>

type UnstubifyAll<A extends any[]> = { [I in keyof A]: Unstubify<A[I]> };

// Utility type for adding `Provider`/`Disposable`s to `object` types only.
// Note `unknown & T` is equivalent to `T`.
type MaybeProvider<T> = T extends object ? Provider<T> : unknown;
type MaybeDisposable<T> = T extends object ? Disposable : unknown;

// Type for method return or property on an RPC interface.
// - Stubable types are replaced by stubs.
// - Serializable types are passed by value, with stubable types replaced by stubs
//   and a top-level `Disposer`.
// Everything else can't be passed over PRC.
// Technically, we use custom thenables here, but they quack like `Promise`s.
// Intersecting with `(Maybe)Provider` allows pipelining.
// prettier-ignore
type Result<R> =
  R extends Stubable ? Promise<Stub<R>> & Provider<R> & StubBase<R>
  : R extends Serializable<R> ? Promise<Stubify<R> & MaybeDisposable<R>> & MaybeProvider<R> & StubBase<R>
  : never;

// Type for method or property on an RPC interface.
// For methods, unwrap `Stub`s in parameters, and rewrite returns to be `Result`s.
// Unwrapping `Stub`s allows calling with `Stubable` arguments.
// For properties, rewrite types to be `Result`s.
// In each case, unwrap `Promise`s.
type MethodOrProperty<V> = V extends (...args: infer P) => infer R
  ? (...args: UnstubifyAll<P>) => Result<Awaited<R>>
  : Result<Awaited<V>>;

// Type for the callable part of an `Provider` if `T` is callable.
// This is intersected with methods/properties.
type MaybeCallableProvider<T> = T extends (...args: any[]) => any
  ? MethodOrProperty<T>
  : unknown;

// Base type for all other types providing RPC-like interfaces.
// Rewrites all methods/properties to be `MethodOrProperty`s, while preserving callable types.
type Provider<
  T extends object,
> = MaybeCallableProvider<T> & {
  [K in Exclude<
    keyof T,
    symbol | keyof StubBase<never>
  >]: MethodOrProperty<T[K]>;
};

declare function serialize(value: unknown): string;
declare function deserialize(value: string): unknown;

interface RpcTransport {
    send(message: string): Promise<void>;
    receive(): Promise<string>;
    abort?(reason: any): void;
}
type RpcSessionOptions = {
    onSendError?: (error: Error) => Error | void;
};

declare function newWorkersWebSocketRpcResponse(request: Request, localMain?: any, options?: RpcSessionOptions): Response;

declare function newHttpBatchRpcResponse(request: Request, localMain: any, options?: RpcSessionOptions): Promise<Response>;

type RpcStub<T extends Serializable<T>> = Stub<T>;
declare const RpcStub: {
    new <T extends Serializable<T>>(value: T): RpcStub<T>;
};
type RpcPromise<T extends Serializable<T>> = Stub<T> | Promise<Stubify<T>>;
declare const RpcPromise: {};
interface RpcSession<T extends Serializable<T> = undefined> {
    getRemoteMain(): RpcStub<T>;
    getStats(): {
        imports: number;
        exports: number;
    };
    drain(): Promise<void>;
}
declare const RpcSession: {
    new <T extends Serializable<T> = undefined>(transport: RpcTransport, localMain?: any, options?: RpcSessionOptions): RpcSession<T>;
};
interface RpcTarget extends RpcTargetBranded {
}
declare const RpcTarget: {
    new (): RpcTarget;
};
interface Empty {
}
declare let newWebSocketRpcSession: <T extends Serializable<T> = Empty>(webSocket: WebSocket | string, localMain?: any) => Stubify<T>;
declare let newHttpBatchRpcSession: <T extends Serializable<T> = Empty>(urlOrRequest: string | Request, init?: RequestInit) => Stubify<T>;
declare function newWorkersRpcResponse(request: Request, localMain: any): Response | Promise<Response>;

export { RpcPromise, RpcSession, type RpcSessionOptions, RpcStub, RpcTarget, type RpcTransport, deserialize, newHttpBatchRpcResponse, newHttpBatchRpcSession, newWebSocketRpcSession, newWorkersRpcResponse, newWorkersWebSocketRpcResponse, serialize };
