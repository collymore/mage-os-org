import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/donationTracking.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ consent = true, debug = false } = {}) {
  const listeners = new Map();
  const events = [];
  const storage = new Map();
  const observers = [];
  const dismissalKey = 'homepage-membership';

  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.threshold = options.threshold;
      observers.push(this);
    }
    observe(ad) {
      this.ad = ad;
    }
    disconnect() {
      this.disconnected = true;
    }
    report(intersectionRatio) {
      this.callback([{ isIntersecting: intersectionRatio > 0, intersectionRatio }]);
    }
  }

  const window = {
    location: { pathname: '/support-options' },
    localStorage: { getItem: storage.get.bind(storage), setItem: storage.set.bind(storage) },
    IntersectionObserver,
    getCkyConsent: () => ({ categories: { analytics: consent } }),
    gtag(command, event, params) {
      assert.equal(command, 'event');
      assert.equal(params.send_to, 'G-SHPYWZSV00');
      events.push({ event, ...params });
    },
  };
  const document = {
    querySelector: () => document.campaignAd,
    addEventListener(type, listener) {
      const existing = listeners.get(type) || [];
      listeners.set(type, [...existing, listener]);
    },
  };
  class Element {
    closest() {
      return null;
    }
  }
  class HTMLAnchorElement extends Element {
    constructor(variant, action = 'join') {
      super();
      this.dataset = { donationAdAction: action };
      this.ad = { dataset: { donationAdVariant: variant } };
      this.href = 'https://opencollective.com/mage-os/contribute/community-member-44722/checkout';
    }
    closest(selector) {
      return selector === '[data-donation-ad-action]' ? this : this.ad;
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window,
    document,
    Element,
    HTMLElement: Element,
    HTMLAnchorElement,
    IntersectionObserver,
    queueMicrotask,
  });
  exports.setupDonationTracking(debug);

  function dispatch(target, type = 'click', button = 0) {
    for (const listener of listeners.get(type) || []) listener({ target, type, button });
  }
  function enterHomepage() {
    window.location.pathname = '/';
    const ad = {
      dataset: { donationAdVariant: 'in_page', donationAdDismissalKey: dismissalKey },
      isConnected: true,
      hidden: false,
      querySelector: () => dismissButton,
    };
    const dismissButton = {
      hidden: true,
      addEventListener(_type, listener) {
        this.click = listener;
      },
    };
    document.campaignAd = ad;
    dispatch(null, 'astro:after-swap');
    return { ad, dismissButton, observer: observers.at(-1) };
  }

  return { exports, window, document, listeners, Element, HTMLAnchorElement, dispatch, enterHomepage, events };
}

test('all five variants emit the stable event payload', () => {
  const h = harness();
  for (const variant of ['full_cta', 'minimal', 'modal', 'slide_in', 'in_page']) {
    const link = new h.HTMLAnchorElement(variant);
    h.dispatch(link);
    assert.deepEqual(h.events.at(-1), {
      event: 'donation_ad_click',
      ad_variant: variant,
      ad_action: 'join',
      link_url: link.href,
      page_path: '/support-options',
      send_to: 'G-SHPYWZSV00',
    });
  }
  assert.equal(h.events.length, 5);
});

test('nested CTA icons and explore-impact links are tracked', () => {
  const h = harness();
  const link = new h.HTMLAnchorElement('full_cta', 'explore_impact');
  link.href = 'https://mage-os.org/community';
  const icon = new h.Element();
  icon.closest = () => link;
  h.dispatch(icon);
  assert.equal(h.events[0].ad_action, 'explore_impact');
  assert.equal(h.events[0].link_url, link.href);
});

test('preview controls, unrelated links and invalid markup are ignored', () => {
  const h = harness();
  h.dispatch(new h.Element());
  h.dispatch(new h.HTMLAnchorElement('unknown'));
  h.dispatch(new h.HTMLAnchorElement('minimal', 'dismiss'));
  h.dispatch(null);
  assert.equal(h.events.length, 0);
});

test('middle-clicks emit once; right-clicks and other auxiliary clicks do not', () => {
  const h = harness();
  const link = new h.HTMLAnchorElement('minimal');
  h.dispatch(link, 'click', 1);
  h.dispatch(link, 'auxclick', 1);
  h.dispatch(link, 'auxclick', 0);
  h.dispatch(link, 'auxclick', 2);
  assert.equal(h.events.length, 1);
});

test('repeated setup does not duplicate listeners; new page links still work', () => {
  const h = harness();
  h.exports.setupDonationTracking();
  assert.equal(h.listeners.get('click').length, 1);
  assert.equal(h.listeners.get('auxclick').length, 1);
  h.window.location.pathname = '/community';
  h.dispatch(new h.HTMLAnchorElement('minimal'));
  assert.equal(h.events[0].page_path, '/community');
});

test('unavailable consent or a failing Google tag never breaks the page', () => {
  const h = harness();
  const getConsent = h.window.getCkyConsent;
  delete h.window.getCkyConsent;
  h.dispatch(new h.HTMLAnchorElement('minimal'));
  assert.equal(h.events.length, 0);
  h.window.getCkyConsent = getConsent;
  h.window.gtag = () => {
    throw new Error('blocked');
  };
  assert.doesNotThrow(() => h.dispatch(new h.HTMLAnchorElement('minimal')));
});

test('every donation CTA in the templates has an action and variant', () => {
  const page = readFileSync(new URL('../src/pages/support-options.astro', import.meta.url), 'utf8');
  const banner = readFileSync(new URL('../src/components/widgets/DonationBanner.astro', import.meta.url), 'utf8');
  const inPage = readFileSync(new URL('../src/components/widgets/InPageDonationAd.astro', import.meta.url), 'utf8');
  assert.equal((page.match(/data-donation-ad-action="join"/g) || []).length, 3);
  assert.equal((page.match(/data-donation-ad-action="explore_impact"/g) || []).length, 1);
  assert.equal((banner.match(/data-donation-ad-action="join"/g) || []).length, 1);
  for (const variant of ['full_cta', 'modal', 'slide_in']) {
    assert.ok(page.includes(`data-donation-ad-variant="${variant}"`));
  }
  assert.ok(banner.includes('data-donation-ad-variant="minimal"'));
  assert.ok(inPage.includes('data-donation-ad-variant="in_page"'));
  assert.ok(inPage.includes('data-donation-ad-action="join"'));
});

test('homepage impression fires once when half the ad enters the viewport', () => {
  const h = harness();
  const { observer } = h.enterHomepage();
  assert.equal(observer.threshold, 0.5);
  observer.report(0.4);
  assert.equal(h.events.length, 0);
  observer.report(0.5);
  observer.report(0.9);
  assert.deepEqual(h.events, [
    { event: 'donation_ad_impression', ad_variant: 'in_page', page_path: '/', send_to: 'G-SHPYWZSV00' },
  ]);
});

test('homepage dismissal fires once and a return visit restores it without another event', () => {
  const h = harness();
  const { ad, dismissButton, observer } = h.enterHomepage();
  assert.equal(dismissButton.hidden, false);
  dismissButton.click();
  dismissButton.click();
  observer.report(0.9);
  assert.equal(ad.hidden, true);
  const returnVisit = h.enterHomepage();
  assert.equal(returnVisit.ad.hidden, true);
  assert.equal(returnVisit.dismissButton.hidden, true);
  assert.deepEqual(h.events, [
    { event: 'donation_ad_dismiss', ad_variant: 'in_page', page_path: '/', send_to: 'G-SHPYWZSV00' },
  ]);
});

test('consent gates all sends and a visible impression can fire after opt-in', async () => {
  const h = harness({ consent: false, debug: true });
  const { observer } = h.enterHomepage();
  observer.report(0.75);
  h.dispatch(new h.HTMLAnchorElement('in_page'));
  assert.equal(h.events.length, 0);

  h.window.getCkyConsent = () => ({ categories: { analytics: true } });
  h.dispatch(null, 'cookieyes_consent_update');
  await Promise.resolve();
  assert.deepEqual(h.events, [
    {
      event: 'donation_ad_impression',
      ad_variant: 'in_page',
      page_path: '/',
      send_to: 'G-SHPYWZSV00',
      debug_mode: true,
    },
  ]);

  h.window.getCkyConsent = () => ({ categories: { analytics: false } });
  h.enterHomepage().dismissButton.click();
  assert.equal(h.events.length, 1);
});
