Necessary
* Refuse to fetch history beyond prune window
* What to do about multiple Amazon accounts?
* Disable Ammazon scraping until logged in
* Know what's already in local storage to avoid re-fetching it (i.e. default date range for Chase)
* Update Actual
* Privacy policy etc
* Basic testing
* Be more robust to failed fetch of single transaction/invoice but still show a clear error (in red!)
* Prune immediately when historyRetentionDays changes
* Add to README: links to store listing, actual-http-api, actual budget.
* Add instructions to README.

Probably
* Move scrapeUi back into chaseContent

Nice to have
* Provide a hint that we need (N) orders from Amazon
* Provide a hint that we have (some) state we can usefully post to Actual
* Provide a hint that you might be logged into the wrong Amazon account or not logged in at all.
* Adjust icon based on enabled/disabled/current site/current status (working, failed, etc)
* Heavy duty testing with historical data.
* Maybe give up on Amazon transactions if the credit card transaction is too old.
* Factor out duplicate CSS
* Dependabot
* Forward compatible with multiple merchants, institutions, multiple accounts at each
* Deterministic identifier for logged in Amazon user. Apparently: `await fetch(https://www.amazon.com/gp/profile/, { credentials: "include", redirect: "follow" }).url` will have it at the tail of the URL. And the body will have the "label" in `#shop-influencer-profile-name` which we can suggest as the friendly name
* Use a leaky bucket rate limiter to sleep *before* expensive calls instead of fragile logic to sleep after. See [thromer/amazon-orders](https://github.com/thromer/amazon-orders) repo for an example.
* cancel scrape button ? (not esc/x those just close dialog)
* Some form of undo
