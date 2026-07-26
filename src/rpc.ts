import type { AmazonInvoice, AmazonOrderNumber } from './amazon';
import type { ChaseTransaction, ChaseTransactionId } from './chase';

export interface PutAmazonInvoiceReq {
  orderNumber: AmazonOrderNumber;
  invoice: AmazonInvoice;
}

export interface PutChaseTransactionReq {
  id: ChaseTransactionId;
  transaction: ChaseTransaction;
}

export interface XactionServiceWorkerMethods {
  getNeededAmazonOrders(): Promise<AmazonOrderNumber[]>;
  putAmazonInvoice(req: PutAmazonInvoiceReq): Promise<void>;
  hasChaseTransaction(id: ChaseTransactionId): Promise<boolean>;
  putChaseTransaction(req: PutChaseTransactionReq): Promise<void>;
  testActual(): Promise<void>;
}

export type XactionServiceWorkerRequest = {
  [K in keyof XactionServiceWorkerMethods]: {
    method: K;
    args: Parameters<XactionServiceWorkerMethods[K]>;
  };
}[keyof XactionServiceWorkerMethods];

export function callSw<M extends keyof XactionServiceWorkerMethods>(
  method: M,
  ...args: Parameters<XactionServiceWorkerMethods[M]>
): ReturnType<XactionServiceWorkerMethods[M]> {
  return chrome.runtime.sendMessage({ method, args }) as ReturnType<XactionServiceWorkerMethods[M]>;
}
