# Xaction Details extension design

## Terminology
* *app*: A personal finance app such as Actual Budget or YNAB.
* *bank*: 
* *merchant*: 
* *account*:
* *transaction*: A banking or credit card transaction. When the source
  of the transaction data matters and it is ambiguous, *transaction*
  means *app transaction*, i.e. the transaction data stored in the
  finance app.
* *invoice*: Details for a merchant order. Corresponds to one or more
  transactions.
* *transaction metadata*: In most contexts, shorthand for metadata stored in the
  app transaction by the extension. (app transaction extension
  metadata would be bit of a mouthful!)
