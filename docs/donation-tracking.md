# Mage-OS membership campaign

The campaign uses the in-page membership ad below the homepage's
“100% Community-Owned” section. Every homepage visit is eligible while the
campaign is enabled. The browser remembers the visitor's dismissal for this
campaign.

Set `DONATION_CAMPAIGN_ENABLED=true` in the hosting environment and trigger an
Astro build and deploy to enable it. The flag defaults to off. To disable it,
set it to `false` or remove it, then rebuild and deploy. For a quick production
rollback, restore the previous campaign-off deployment and disable the flag to
keep it off on the next build.

Run `DONATION_CAMPAIGN_ENABLED=true npm run dev` for a local preview.

## Events

The site sends the three events through `gtag('event', …)` to the existing
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

The live homepage ad also emits the following events with `ad_variant: 'in_page'`
and `page_path: '/'`.

- `donation_ad_impression` fires once per homepage view when analytics consent
  is granted and at least half of the ad is in the viewport.
- `donation_ad_dismiss` fires when a visitor uses the ad's dismiss button.
  Returning visitors with a saved dismissal generate neither event.

Filter campaign reporting to `page_path = /`. The comparison page continues to
emit CTA-click events for QA. Primary and middle clicks are tracked, including
keyboard activation of CTA links. Preview and close controls are excluded from
CTA click counts.

## GA4 verification

Local development marks these campaign events for DebugView. With analytics
consent granted, bring the homepage ad into view, follow the membership link,
and use the dismiss button. Check GA4 DebugView for the three event names and
their parameters. Repeat with analytics consent declined and verify that the
test produces zero campaign events.

Register `ad_variant` and `ad_action` as event-scoped custom dimensions in GA4
if they are needed in reports. Keep the existing Google tag enabled in the
site's container and use the direct site integration to send the three
membership events.
