import type {DnsAnswer as _DnsAnswer, DnsResponse as _DnsResponse} from 'dns2'

declare module 'dns2' {
  export interface DnsAnswer extends _DnsAnswer {
    ns: string;
  }

  export interface DnsResponse extends _DnsResponse {
    authorities: DnsAnswer[];
  }
}