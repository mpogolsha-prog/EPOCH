declare module "@x402/fetch" {
  export function wrapFetchWithPayment(fetchFn: typeof fetch, client: any): typeof fetch;
  export class x402Client {
    register(network: string, scheme: any): x402Client;
  }
}

declare module "@x402/svm" {
  export class ExactSvmScheme {
    constructor(signer: any);
  }
}
