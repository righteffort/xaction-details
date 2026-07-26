import { addCents, type Cents, type Fetcher } from './types';

export type AmazonOrderNumber = string & { readonly __brand: 'AmazonOrder' };

export interface AmazonItem {
  description: string;
  price: Cents;
  count: number;
}

export interface AmazonTransaction {
  description: string;
  date: string;
  cents: Cents;
}

export interface AmazonDetail {
  transaction: AmazonTransaction;
  items: AmazonItem[];
}

export interface AmazonInvoice {
  date: Date;
  // who: string;   // TODO: do something fancy
  details: AmazonDetail[];
  shippingAddress: string[];
}

export class Amazon {
  // private initialized: boolean;
  private fetcher: Fetcher;
  constructor(fetcher: Fetcher) {
    // this.initialized = false;
    this.fetcher = fetcher;
  }
  async getInvoice(orderNumber: AmazonOrderNumber): Promise<AmazonInvoice | undefined> {
    console.debug(`Time to get invoice for Amazon order ${orderNumber}`);
    const url = Amazon.getInvoiceUrl(orderNumber);
    if (!url) {
      console.warn(`Couldn't determine invoice URL for order number ${orderNumber}`);
      return;
    }
    const invoiceStr = await this.fetchUrl(url);
    const invoiceDom = new DOMParser().parseFromString(invoiceStr, 'text/html');
    const detail = new InvoiceParser().parseInvoice(invoiceDom, orderNumber);
    return {
      date: detail.date,
      details: [
        {
          transaction: {
            description: detail.paymentMethod,
            date: detail.date.toISOString().slice(0, 10),
            cents: detail.grandTotal,
          },
          items: detail.items.map((i) => ({
            description: i.description,
            price: i.itemPrice,
            count: i.quantity,
          })),
        },
      ],
      shippingAddress: detail.shippingAddress,
    };
  }
  private static getInvoiceUrl(orderNumber: AmazonOrderNumber) {
    if (!/^(?:D|\d)\d{2}-\d{7}-\d{7}$/.test(orderNumber)) {
      return;
    }
    return `https://www.amazon.com/gp/css/summary/print.html?orderID=${orderNumber}`;
  }
  private async fetchUrl(url: string) {
    const resp = await this.fetcher.fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) {
      throw new Error(`${url} response status: ${resp.status}`);
    }
    return resp.text();
  }
}

class InvoiceParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceParserError';
  }
}

// TODO: probably should have OrderDetail = RegularOrder | DigitalOrder or something.
interface OrderDetail {
  orderId: string;
  isDigital: boolean;
  date: Date;
  paymentMethod: string;
  subtotal: Cents;
  tax: Cents;
  preTaxTotal: Cents;
  grandTotal: Cents;
  shippingAndHandling: Cents;
  discounts: Array<{ description: string; amount: Cents }>;
  items: ItemDetail[];
  shippingAddress: Array<string>;
}

interface ItemDetail {
  description: string;
  seller?: string;
  supplier?: string;
  quantity: number;
  itemPrice: Cents;
  // shippingStatus: string[]
  // expectedDeliveryDate?: Date
  // actualDeliveryDate?: Date
  // shippingDate?: Date
}

class InvoiceParser {
  private amountMap: Map<string, Cents> = new Map();

  parseInvoice(doc: Document, orderNumber: string): OrderDetail {
    const orderId = InvoiceParser.parseOrderId(doc);
    if (orderNumber !== orderId) {
      throw new InvoiceParserError(
        `Expected order ${orderNumber} on invoice page but found ${orderId}`,
      );
    }
    const isDigital = InvoiceParser.isDigitalOrderId(orderId);
    const date = InvoiceParser.parseOrderDate(doc);
    const { amounts, discounts } = InvoiceParser.parseAmounts(doc);
    this.amountMap = amounts;
    const subtotal = this.getAmount('item(s) subtotal:');
    const tax = isDigital
      ? this.getAmount('tax collected:')
      : this.getAmount('estimated tax to be collected:');
    const preTaxTotal = isDigital ? subtotal : this.getAmount('total before tax:');
    const grandTotal = isDigital
      ? this.getAmount('total for this order:')
      : this.getAmount('grand total:');
    const shippingAndHandling = isDigital ? (0 as Cents) : this.getAmount('shipping & handling:');
    const items = InvoiceParser.parseItems(doc);

    const detail = {
      orderId,
      isDigital,
      date,
      paymentMethod: InvoiceParser.parsePaymentMethod(doc),
      subtotal,
      tax,
      preTaxTotal,
      grandTotal,
      shippingAndHandling,
      discounts,
      items,
      shippingAddress: InvoiceParser.parseShippingAddress(doc),
    };
    InvoiceParser.validateOrderDetail(detail);
    console.debug(`parseInvoice returning details for ${orderId}`);
    return detail;
  }
  private static validateOrderDetail(detail: OrderDetail) {
    const itemsTotal = detail.items.reduce(
      (sum, item) => sum + item.itemPrice * item.quantity,
      0,
    ) as Cents;
    if (itemsTotal !== detail.subtotal) {
      throw new InvoiceParserError(
        `Items total != subtotal: expected ${InvoiceParser.amountToString(detail.subtotal)}, got ${InvoiceParser.amountToString(itemsTotal)}`,
      );
    }
    const discountSum = detail.discounts.reduce(
      (sum, discount) => sum + discount.amount,
      0,
    ) as Cents;
    const expectedPreTaxTotal: Cents = addCents(
      detail.subtotal,
      detail.shippingAndHandling,
      discountSum,
    );
    const expectedGrandTotal = addCents(detail.tax, detail.preTaxTotal);
    if (detail.preTaxTotal !== expectedPreTaxTotal) {
      throw new InvoiceParserError(
        `preTaxTotal != subtotal + shippingAndHandling + discounts: expected ${InvoiceParser.amountToString(expectedPreTaxTotal)}, got ${InvoiceParser.amountToString(detail.preTaxTotal)}`,
      );
    }
    if (detail.grandTotal !== expectedGrandTotal) {
      throw new InvoiceParserError(
        `grandTotal != tax + preTaxTotal: expected ${InvoiceParser.amountToString(expectedGrandTotal)}, got ${InvoiceParser.amountToString(detail.grandTotal)}`,
      );
    }
  }

  private static parseOrderId(doc: Document): string {
    return (
      doc.querySelector('[data-component="orderId"]')?.textContent?.trim() ||
      (() => {
        throw new InvoiceParserError('orderId missing, might be logged into the wrong account');
      })()
    );
  }

  private static isDigitalOrderId(orderId: string): boolean {
    return orderId[0] === 'D';
  }

  private static parseAmounts(doc: Document): {
    amounts: Map<string, Cents>;
    discounts: Array<{ description: string; amount: Cents }>;
  } {
    const amounts = new Map<string, Cents>();
    const discounts: Array<{ description: string; amount: Cents }> = [];

    const rows = doc.querySelectorAll('.od-line-item-row');
    for (const row of rows) {
      const labelElement = row.querySelector('.od-line-item-row-label');
      const amountElement = row.querySelector('.od-line-item-row-content');
      if (labelElement && amountElement) {
        const label = labelElement.textContent?.trim().toLowerCase();
        const amountText = amountElement.textContent?.trim();
        if (label && amountText) {
          const amount = InvoiceParser.parseAmountToCents(amountText);
          if (amount < 0) {
            // Negative amounts are discounts
            discounts.push({ description: label, amount: amount });
          } else {
            // Non-negative amounts go to the amounts map
            if (amounts.has(label)) {
              throw new InvoiceParserError(`Multiple occurrences of ${label}`);
            }
            amounts.set(label, amount);
          }
        }
      }
    }
    return { amounts, discounts };
  }

  private getAmount(label: string): Cents {
    const amount = this.amountMap.get(label);
    if (amount === undefined) {
      throw new InvoiceParserError(`Amount for "${label}" not found`);
    }
    return amount;
  }

  private static parseAmountToCents(amountText: string): Cents {
    const cleanText = amountText.replace(/[$,]/g, '');
    const formatRegex = /^-?\d+\.\d{2}$/;
    if (!formatRegex.test(cleanText)) {
      throw new InvoiceParserError(
        `Amount "${amountText}" does not match required format (must end with .XX)`,
      );
    }
    const dollarAmount = Number.parseFloat(cleanText);
    if (Number.isNaN(dollarAmount)) {
      throw new InvoiceParserError(`Amount "${amountText}" is not a valid number`);
    }
    return Math.round(dollarAmount * 100) as Cents;
  }

  private static amountToString(amount: Cents): string {
    return `${(amount / 100).toFixed(2)}`;
  }

  private static parseOrderDate(doc: Document): Date {
    const dateElement = doc.querySelector('[data-component="orderDate"]');
    if (!dateElement) {
      throw new InvoiceParserError('Order date element not found');
    }
    const dateText = dateElement.textContent?.trim();
    if (!dateText) {
      throw new InvoiceParserError('Order date text not found');
    }
    const date = new Date(`${dateText} UTC`);
    if (Number.isNaN(date.valueOf())) {
      throw new InvoiceParserError(`Invalid date: ${dateText}`);
    }
    return date;
  }

  private static parsePaymentMethod(doc: Document): string {
    const paymentElement = doc.querySelector(
      '.pmts-payments-instrument-detail-box-paystationpaymentmethod',
    );
    if (!paymentElement) {
      throw new InvoiceParserError('Payment method element not found');
    }
    const paymentText = paymentElement.textContent?.trim();
    if (!paymentText) {
      throw new InvoiceParserError('Payment method text not found');
    }
    return paymentText.replace(/\s+/g, ' ');
  }

  private static parseShippingAddress(doc: Document): Array<string> {
    const addressElement = doc.querySelector('[data-component="shippingAddress"]');
    if (!addressElement) {
      throw new InvoiceParserError('Shipping address element not found');
    }
    let lines = [];
    const DELIMITER = '\u0000';
    for (const node of [...addressElement.querySelectorAll('li span')]) {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach((br) => {
        br.replaceWith(DELIMITER);
      });
      const text = clone.textContent ?? '';
      const nodeLines = text.split(DELIMITER).map((line) => {
        return line.replace(/\s+/g, ' ').trim();
      });
      lines.push(...nodeLines);
    }
    if (lines.length === 0) {
      throw new InvoiceParserError('No shipping address lines found');
    }
    lines = lines.filter((s) => s.length > 0);
    return lines;
  }

  private static parseItems(doc: Document): ItemDetail[] {
    const items: ItemDetail[] = [];
    const itemElements = doc.querySelectorAll(
      '[data-component="purchasedItems"] .a-fixed-left-grid',
    );
    // const statusElements = doc.querySelectorAll('[data-component="shipmentStatus"]');
    // if (itemElements.length != statusElements.length) {
    //   throw new InvoiceParserError(`${itemElements.length} items, ${statusElements.length} shipping status entries`);
    // }
    itemElements.forEach((itemElement) => {
      const titleElement = itemElement.querySelector('[data-component="itemTitle"] a');
      const sellerElement = itemElement.querySelector('[data-component="orderedMerchant"] span');
      const supplierElement = itemElement.querySelector('[data-component="supplierOfRecord"] span');
      const priceElement = itemElement.querySelector('[data-component="unitPrice"] .a-offscreen');

      const description = titleElement?.textContent?.trim();
      if (!description) {
        throw new InvoiceParserError('Item description not found');
      }
      const sellerText = sellerElement?.textContent?.replace(/\s+/g, ' ').trim();
      const seller = sellerText?.replace(/^Sold by:\s*/, '').trim();
      const supplierText = supplierElement?.textContent?.replace(/\s+/g, ' ').trim();
      const supplier = supplierText?.replace(/^Supplied by:\s*/, '').trim();
      const priceText = priceElement?.textContent?.trim();
      if (!priceText) {
        throw new InvoiceParserError('Item price not found');
      }
      const itemPrice = InvoiceParser.parseAmountToCents(priceText);
      const quantityElement = itemElement.querySelector('.od-item-view-qty span');
      const quantityText = quantityElement?.textContent?.trim();
      let quantity = 1;
      if (quantityText && quantityText !== '') {
        quantity = Number.parseInt(quantityText, 10);
        if (Number.isNaN(quantity)) {
          throw new InvoiceParserError(`Item quantity not parseable as integer: ${quantityText}`);
        }
      }
      const item: ItemDetail = {
        description,
        quantity,
        itemPrice,
      };
      if (seller) {
        item.seller = seller;
      }
      if (supplier) {
        item.supplier = supplier;
      }
      items.push(item);
    });

    return items;
  }
}
