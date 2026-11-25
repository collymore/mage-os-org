# Mage-OS membership campaign

The campaign shows a compact membership card near the top of site pages,
below the navigation. The card sits over the page so the content stays in
place when the card appears or is dismissed. A dismissal applies across
the site for the rest of the campaign. The comparison page at
`/support-options` is used to preview the individual formats.

The timing test assigns 50% of eligible browsers to `immediate` and 50% to
`delay_10s`. A browser keeps its group across visits. For the delayed group,
the ten-second wait starts on the first eligible page in the tab and carries
across navigation. The card slides into view. Visitors with
reduced motion enabled see it appear without animation.

Set `DONATION_CAMPAIGN_ENABLED=true` in the hosting environment and trigger an
Astro build and deploy to enable it. The flag defaults to off. To disable it,
set it to `false` or remove it, then rebuild and deploy. For a quick production
rollback, restore the previous campaign-off deployment and disable the flag to
keep it off on the next build.

Run `DONATION_CAMPAIGN_ENABLED=true npm run dev` for a local preview.
Append `?campaign_timing=immediate` or `?campaign_timing=delay_10s` to force a
variant in local development.

## Events

The site sends the campaign events through `gtag('event', …)` to the existing
Mage-OS Google Analytics stream (`G-SHPYWZSV00`) when CookieYes reports that
analytics is allowed. The site's existing Google tag initializes the stream.
`donation_ad_click` measures membership interest. Open Collective holds
completed membership records.

Example payload:

```js
{
  event: 'donation_ad_click',
  ad_variant: 'full_cta',
  ad_action: 'join',
  link_url: 'https://opencollective.com/mage-os/contribute/community-member-44722/checkout',
  page_path: '/support-options'
}
```

| Placement | `ad_variant` | `ad_action` |
| --- | --- | --- |
| Full-page CTA | `full_cta` | `join`, `explore_impact` |
| Minimal banner preview | `minimal` | `join` |
| Full-screen modal | `modal` | `join` |
| Slide-in | `slide_in` | `join` |
| In-page content ad | `in_page` | `join` |
| Site-wide campaign card | `top_overlay` | `join` |

The campaign includes `ad_variant: 'top_overlay'`, the current `page_path`, and
the assigned `ad_timing` on its events.

- `donation_ad_assigned` fires once per tab session with analytics consent,
  including sessions where the banner never becomes visible. Forced local
  previews are excluded from assignment reporting.
- `donation_ad_impression` fires once per page view when analytics consent
  is granted and at least half of the ad is in the viewport.
- `donation_ad_dismiss` fires when a visitor uses the ad's dismiss button.
  Returning visitors with a saved dismissal generate neither event.

Exclude `/support-options` from campaign reports. The comparison page still
emits CTA-click events for QA. Primary and middle clicks are tracked, including
keyboard activation of CTA links. Preview and close controls are excluded from
CTA click counts.

Compare the share of assigned sessions with a membership click by `ad_timing`.
Using assigned sessions as the denominator captures visitors who leave before
the delayed banner appears.

## GA4 verification

Local development marks these campaign events for DebugView. With analytics
consent granted, bring the ad into view, follow the membership link,
and use the dismiss button. Check GA4 DebugView for the event names and
their parameters. Repeat with analytics consent declined and verify that the
test produces zero campaign events.

Register `ad_timing`, `ad_variant`, and `ad_action` as event-scoped custom dimensions in GA4
if they are needed in reports. Keep the existing Google tag enabled in the
site's container and use the direct site integration to send the three
membership events.
