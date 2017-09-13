/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "(config|EXPORTED_SYMBOLS)" }]*/
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm", this);
XPCOMUtils.defineLazyModuleGetter(this, "AttributionCode",
                                  "resource:///modules/AttributionCode.jsm");

const EXPORTED_SYMBOLS = ["config"];

const config = {
  study: {
    studyName: "tracking-protection-study", // no spaces, for all the reasons

    async getCampaignId() {
      if (this.variation) {
        return this.variation.campaign_id;
      }

      let data = await AttributionCode.getAttrDataAsync();
      return data.campaign;
    },

    // optional, use to override/decide
    // Disable this for production!

    variation: {
      name: "opentab",
      campaign_id: "download-2",
    },

    weightedVariations: [
      { name: "control", weight: 1 },
      { name: "doorhanger", weight: 1 },
      { name: "opentab", weight: 1 },
    ],

    campaigns: {
      "doorhanger": {
        "campaign_ids": [
          "download-1",
          "download-2",
          "download-3",
        ],
        "messages": [
          "Tracking protection is enabled, making Firefox super fast.",
          "Tracking protection is enabled, blocking annoying ads.",
          "Tracking protection is enabled, protecting your privacy.",
        ],
        "newtab_messages": [
          "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedEntities} companies that track your browsing",
          "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
          "Firefox blocked ${blockedRequests} ads today from<br/> ${blockedSites} different websites"
        ],
        "urls": [
          "https://mozilla.org/learn-more-about-tp-study#doorhanger-1",
          "https://mozilla.org/learn-more-about-tp-study#doorhanger-2",
          "https://mozilla.org/learn-more-about-tp-study#doorhanger-3",
        ],
      },
      "opentab": {
        "campaign_ids": [
          "download-1",
          "download-2",
          "download-3",
        ],
        "messages": [],
        "newtab_messages": [
          "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedEntities} companies that track your browsing",
          "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
          "Firefox blocked ${blockedRequests} ads today from<br/> ${blockedSites} different websites"
        ],
        "urls": [
          "https://mozilla.org/learn-more-about-tp-study#opentab-1",
          "https://mozilla.org/learn-more-about-tp-study#opentab-2",
          "https://mozilla.org/learn-more-about-tp-study#opentab-3",
        ],
      }
    },
    /** **endings**
      * - keys indicate the 'endStudy' even   that opens these.
      * - urls should be static (data) or external, because they have to
      *   survive uninstall
      * - If there is no key for an endStudy reason, no url will open.
      * - usually surveys, orientations, explanations
      */
    endings: {},
    telemetry: {
      send: true, // assumed false. Actually send pings?
      removeTestingFlag: false,  // Marks pings as testing, set true for actual release
      // TODO "onInvalid": "throw"  // invalid packet for schema?  throw||log
    },
    studyUtilsPath: `./StudyUtils.jsm`,
  },
  async isEligible() {
    // get whatever prefs, addons, telemetry, anything!
    // Cu.import can see 'firefox things', but not package things.
    // In order to import addon libraries, use chrome.manifest and "resource://" in order
    // to get the correct file location. Then it is necessary to use
    // XPCOMUtils.defineLazyModuleGetter() to import the library.

    if (this.study.variation) {
      return true;
    }

    let data = await AttributionCode.getAttrDataAsync();

    if (data && data.campaign) {
      return true;
    }

    return false;
  },
  // addon-specific modules to load/unload during `startup`, `shutdown`
  modules: [
    // can use ${slug} here for example
  ],
  // sets the logging for BOTH the bootstrap file AND shield-study-utils
  log: {
    // Fatal: 70, Error: 60, Warn: 50, Info: 40, Config: 30, Debug: 20, Trace: 10, All: -1,
    bootstrap:  {
      level: "Debug",
    },
    studyUtils:  {
      level: "Trace",
    },
  },
};
