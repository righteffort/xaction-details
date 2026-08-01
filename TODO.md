Release
* permissions reduction & tidy up
  * try to get rid of host permissions: enable/disable via options; and then register & inject contentscript
  * after that, declarativeContent to enable/disable action
  * and action click -> prompt to enable for site (but don't get carried away?)
* expose historyRetentionDays in settings ui

Necessary
* support encryption key during config
* Refuse to fetch history beyond prune window
* What to do about multiple Amazon accounts?
* Disable scraping until logged in
* Know what's already in local storage to avoid re-fetching it (i.e. default date range)
* Purge old persistent data
* Talk to Actual
* Privacy policy etc
* Put it in Google Web Store
* Basic testing
* Don't pre-emptively get permissions for all sites. Maybe narrower hosts / paths.
* Be consistent about error handling e.g. if we can get some invoices but not others
* Prune immediately when historyRetentionDays changes

Probably
* Move scrapeUi back into chaseContent

Maybe
* maybe initial ui is in popup and we just use box for status

Nice to have
* Be more robust to failed fetch of single transaction/invoice but still show a clear error (in red!)
* Provide a hint that we need (N) orders from Amazon
* Provide a hint that we have (some) state we can usefully post to Actual
* Provide a hint that you might be logged into the wrong Amazon account
* Adjust icon based on enabled/disabled/current site/current status (working, failed, etc)
* Heavy duty testing with my historical data
* Maybe give up on Amazon transactions if we've waited long enough
* Factor out duplicate CSS
* Dependabot
* Forward compatible with multiple merchants, institutions, multiple accounts at each
* Deterministic identifier for logged in Amazon user. Apparently: `await fetch(https://www.amazon.com/gp/profile/, { credentials: "include", redirect: "follow" }).url` will have it at the tail of the URL. And the body will have the "label" in `#shop-influencer-profile-name` which we can suggest as the friendly name
* Use a leaky bucket rate limiter to sleep *before* expensive calls instead of fragile logic to lsleep after. See thromer/amazon-orders repo.
* cancel scrape button ? (not esc/x those just close dialog)
* Some form of undo
