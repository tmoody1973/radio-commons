// The SDK ships no types; only the constructor is typed here, and amazonPay.ts narrows the client to PayClient.
declare module "@amazonpay/amazon-pay-api-sdk-nodejs" {
  export class WebStoreClient {
    constructor(config: { publicKeyId: string; privateKey: string; region: string; sandbox: boolean; algorithm?: string });
  }
}
