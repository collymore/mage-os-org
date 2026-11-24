const trackedDocuments = new WeakSet<Document>();
const variants = new Set(['full_cta', 'minimal', 'modal', 'slide_in', 'in_page']);
const actions = new Set(['join', 'explore_impact']);
// The existing site container initializes this Mage-OS web stream.
const GA4_DESTINATION = 'G-SHPYWZSV00';

type DonationEvent =
  | { event: 'donation_ad_click'; ad_action: string; link_url: string }
  | { event: 'donation_ad_impression' | 'donation_ad_dismiss' };

type AnalyticsWindow = Window & {
  getCkyConsent?: () => { categories?: { analytics?: boolean } } | undefined;
  gtag?: (command: 'event', name: DonationEvent['event'], parameters: Record<string, string | boolean>) => void;
};

export function setupDonationTracking(debug = false) {
  if (trackedDocuments.has(document)) return;
  trackedDocuments.add(document);

  function emitDonationEvent(adVariant: string, { event, ...details }: DonationEvent) {
    try {
      const { getCkyConsent, gtag } = window as AnalyticsWindow;
      if (!gtag || getCkyConsent?.()?.categories?.analytics !== true) return false;

      gtag('event', event, {
        ...details,
        ad_variant: adVariant,
        page_path: window.location.pathname,
        send_to: GA4_DESTINATION,
        ...(debug ? { debug_mode: true } : {}),
      });
      return true;
    } catch {
      // Analytics must never interfere with the ad or its links.
      return false;
    }
  }

  function trackClick(event: MouseEvent) {
    // Include middle-clicks without counting right-clicks or primary clicks twice.
    if (event.type === 'click' ? event.button !== 0 : event.button !== 1) return;
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest('[data-donation-ad-action]');
    if (!(link instanceof HTMLAnchorElement)) return;

    const adVariant = link.closest<HTMLElement>('[data-donation-ad-variant]')?.dataset.donationAdVariant;
    const adAction = link.dataset.donationAdAction;
    if (!adVariant || !variants.has(adVariant) || !adAction || !actions.has(adAction)) return;

    emitDonationEvent(adVariant, { event: 'donation_ad_click', ad_action: adAction, link_url: link.href });
  }

  // Delegation survives Astro page swaps and includes clicks on nested CTA icons.
  document.addEventListener('click', trackClick, { capture: true });
  document.addEventListener('auxclick', trackClick, { capture: true });

  let observer: IntersectionObserver | undefined;
  let countVisibleImpression: (() => void) | undefined;

  function setupCampaignAd() {
    observer?.disconnect();
    observer = undefined;
    countVisibleImpression = undefined;

    const ad = document.querySelector<HTMLElement>('[data-donation-ad-dismissal-key]');
    if (!ad || ad.hidden) return;

    const { donationAdVariant: variant, donationAdDismissalKey: dismissalKey } = ad.dataset;
    const dismissButton = ad.querySelector<HTMLButtonElement>('[data-donation-ad-dismiss]');
    if (!variant || !dismissalKey || !dismissButton) return;

    try {
      if (window.localStorage.getItem(dismissalKey) === 'true') {
        ad.hidden = true;
        return;
      }
    } catch {
      // Dismissal still works for the current page without storage.
    }

    if ('IntersectionObserver' in window) {
      let visible = false;
      const recordImpression = () => {
        if (!visible || ad.hidden || !ad.isConnected || countVisibleImpression !== recordImpression) return;
        if (emitDonationEvent(variant, { event: 'donation_ad_impression' })) {
          countVisibleImpression = undefined;
          campaignObserver.disconnect();
        }
      };
      const campaignObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries.at(-1);
          visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.5;
          recordImpression();
        },
        { threshold: 0.5 }
      );
      campaignObserver.observe(ad);
      observer = campaignObserver;
      countVisibleImpression = recordImpression;
    }

    dismissButton.addEventListener('click', () => {
      if (ad.hidden) return;
      ad.hidden = true;
      observer?.disconnect();
      countVisibleImpression = undefined;

      try {
        window.localStorage.setItem(dismissalKey, 'true');
      } catch {
        // The ad remains dismissed for the current page.
      }

      emitDonationEvent(variant, { event: 'donation_ad_dismiss' });
      const nextSection = ad.nextElementSibling;
      if (nextSection instanceof HTMLElement) {
        if (!nextSection.hasAttribute('tabindex')) nextSection.tabIndex = -1;
        nextSection.focus({ preventScroll: true });
      }
    });
    dismissButton.hidden = false;
  }

  setupCampaignAd();
  document.addEventListener('astro:after-swap', setupCampaignAd);
  const retryVisibleImpression = () => queueMicrotask(() => countVisibleImpression?.());
  document.addEventListener('cookieyes_banner_load', retryVisibleImpression);
  document.addEventListener('cookieyes_consent_update', retryVisibleImpression);
}
