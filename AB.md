# actual budget poc plan

Keep it simple!!!

Don't over-engineer the merchant-only and bank-only cases.

## bank transaction has order id, no corresponding invoice
- search app transactions for what i'll call 'bank description'
  ... there may be multiple matches, so also constrain by date range and amount.
- if we find a unique match:
  - prepend the order details: a url unless it is a 'no url' case
  - mark something in indexeddb to indicate that we're done at least
    until invoice arrives
  - mark something in transaction metadata so that other extension
    instances know the state: xad:b [short for {b: true, m: false}
- if we find multiple matches (this will happen for sure for amazon pharmacy)
  - pick one arbitrarily and proceed as above
- if we find no matches:
  - do nothing, keep hoping

## merchant invoice, no corresponding bank transaction
- note this implies that user can instruct us to fetch proactively
  from merchant. seems reasonable to support if a bit of a hassle to
  discover orders.
- THINKING HERE

## merchant invoice and bank transaction
- ...

## tidbits
- for now encode state in string at end of transaction description, of
  the form `xad[0-9a-zA-Z]*:a1+b2+c3`. substring after xad is the
  protocol version, null if missing. pre-release we won't have any
  version upgrades while we tune the protocol.
  - why do we need this? to skip transactions that we've already processed; to detect transactions that we've updated based on bank transaction but could improve with merchant invoice

## end state
- for app transactions that simply aren't ever going to have an order id,
  mark that in indexeddb and perhaps in actual memo 'cookie'
- for actual transactions that only have an order id, prepend the order
  details url and the merchant user nickname to the description in
  actual, and note something in indexeddb. we'll hold out hope that we
  get a merchant invoice until we're past the lookback window, even if
  the user has disabled the extension for the merchant.
- for app transactions that only have an merchant invoice (because
  user disabled bank scraping)

## next
- add a checkbox (on by default) to scrape dialogs to sync with actual
  after scrape completes.

## indexeddb


## logic

## fairly soon
- grab the merchant user nickname and include it in the improved memo

## future

- track transactions/invoices we've abandoned and don't consider those
  when constructing the request to actual.


