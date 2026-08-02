Necessary
* config-form: default value for history retention should be filled in
  if not is not currently set.
* onboarding form: explain what access to www.amazon.com and secure.chase.com are used for.
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
* form validation
  * tight contract for config.ts set/get; e.g. only store valid
    values; replace blank with unknown for header key/value; net
    effect should be that ActualHttpClient constructor never receives
    invalid values because it will be trivial for typechecking to
    force callers to avoid calling with unknown parameters.
  * rabbitai claims our use of reportValidity in config-form.ts will
    not propagate down to children
  * make sure we handle missing header names
* Complain during configuration about use of reserved headers, (fetch) time is just a backstop.
* Invalidate http client when config changes via a config listener?
  Just unconditionally re-read config on every op?
* Provide a hint that we need (N) orders from Amazon
* Provide a hint that we have (some) state we can usefully post to Actual
* Provide a hint that you might be logged into the wrong Amazon account or not logged in at all.
* Links to documentation for non-obvious config-form fields, maybe i
  icon like portfolio tracker. Including headers (in case user thinks
  they should provide the 1-2 headers http server requires).
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
* Provide link to options page when API server appears to be misconfigured at fetch time.
* More style tweaks to options/onboarding:
  * pre-emptively size wide and tall enough to hold 2+ custom headers
  * shrink text type input heights
  * tighten gap between header rows
  * further reduce 'margin' at top and bottom of major subsections
  * can we have onboarding just open the options page directly with chrome's built-in (and still link to it elsewhere, esp -- from content script)?
  * after clicking add header, focus on new header field
  * Cleaner 'required' indicator and handling, see a conversation with Claude.
  * Provide better hints on which field(s) are broken in case of errors
* Enable/disable action on secure.chase.com based on something about the DOM, if possible.
* Technically out of scope but would be nice: document cloudflare access

