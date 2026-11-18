# Monetization plan

Web games earn mainly from **ads** and **cosmetic purchases**. Terms change, so re-check every number below before you sign or submit anything.

## Order of attack
1. **Build the game so it is fun with no ads** (Milestones 1-4).
2. **Add ad hooks at natural pauses** (Milestone 5): between matches, and an optional **rewarded ad** (revive once, double XP). Rewarded ads pay the most and players do not hate them because they choose them.
3. **Publish on portals** (Milestone 6). They bring the players and run the ads through their SDK:
   - **Poki**: revenue share reported as 100% on your own traffic and 50/50 on Poki traffic, with web exclusivity. Selective approval.
   - **CrazyGames**: revenue share reported around 60% for ads and 70% for purchases in their jam terms; ads go through their SDK only.
   - **GameDistribution**: wide reach, ads through their SDK.
   - **itch.io**: simple, 90% to you by default, small audience for shooters.
4. **Own site** (Cloudflare Pages) with your own ad network and a cosmetics shop, so you are not dependent on one portal.
5. **Later**: Android/iOS and a Windows download (Steam), sharing the same game code.

## Rules that protect the business
- No pay-to-win. Cosmetics only.
- Never copy GPL code or unlicensed assets (a takedown kills a launch). See `ASSETS.md`.
- Keep the first load small and fast; portals measure it.
- Each portal can have exclusivity terms. Read them before publishing the same build elsewhere.
- You can only collect payments in the portal's own programs; for your own cosmetics shop you need a payment provider that supports Namibia (check Paddle, Lemon Squeezy, Stripe availability, or a Namibian bank/PayPal route). Verify before you promise players a shop.
