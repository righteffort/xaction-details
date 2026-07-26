import type { ChaseTransaction } from './chase';

export interface PutChaseTransactionReq {
  id: string;
  transaction: ChaseTransaction;
}

export interface XactionServiceWorkerMethods {
  hasChaseTransaction(id: string): Promise<boolean>;
  putChaseTransaction(req: PutChaseTransactionReq): Promise<void>;
}

export type XactionServiceWorkerRequest = {
  [K in keyof XactionServiceWorkerMethods]: {
    method: K;
    args: Parameters<XactionServiceWorkerMethods[K]>;
  };
}[keyof XactionServiceWorkerMethods];
