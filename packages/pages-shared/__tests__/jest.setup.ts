import makeServiceWorkerEnv from "service-worker-mock";

Object.assign(globalThis, makeServiceWorkerEnv());
