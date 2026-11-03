import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker.js" with { type: "cf-worker" };
export default defineConfig({worker:{name:"vitest-local-identity",entrypoint,compatibilityDate:"2026-10-30",env:{
  IDENTITY:bindings.identity({audience:"urn:local-test",authorization_grants:{allowed_authorization_servers:["https://as.identity.local"],allowed_scopes:["read"]},request_signing:{allowed_origins:["https://api.identity.local"],allowed_methods:["GET"]}}),
  ACCOUNT:bindings.identity({selection:"app",scope:["read"],resources:[{origin:"https://api.identity.local",methods:["GET"]}],oauth:{grant:"authorization_code",authorization_server:"https://as.identity.local",resource:"https://api.identity.local",discovery:true,client_registration:{mode:"dynamic",authentication:"none"},permission_ceiling:{scope:["read"],resources:[{origin:"https://api.identity.local",methods:["GET"]}]}}}),
}}});
