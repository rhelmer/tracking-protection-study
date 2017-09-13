const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "studyUtils",
  "resource://tracking-protection-study/StudyUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "config",
  "resource://tracking-protection-study/Config.jsm");

const TRACKING_PROTECTION_PREF = "privacy.trackingprotection.enabled";
const TRACKING_PROTECTION_UI_PREF = "privacy.trackingprotection.ui.enabled";
const DOORHANGER_ID = "onboarding-trackingprotection-notification";
const DOORHANGER_ICON = "chrome://browser/skin/tracking-protection-16.svg#enabled";

const REASONS = {
  APP_STARTUP:      1, // The application is starting up.
  APP_SHUTDOWN:     2, // The application is shutting down.
  ADDON_ENABLE:     3, // The add-on is being enabled.
  ADDON_DISABLE:    4, // The add-on is being disabled. (Also sent during uninstallation)
  ADDON_INSTALL:    5, // The add-on is being installed.
  ADDON_UNINSTALL:  6, // The add-on is being uninstalled.
  ADDON_UPGRADE:    7, // The add-on is being upgraded.
  ADDON_DOWNGRADE:  8, // The add-on is being downgraded.
};

async function chooseVariation() {
  let variation;
  const sample = studyUtils.sample;

  if (config.study.variation) {
    variation = config.study.variation;
  } else {
    // this is the standard arm choosing method
    const clientId = await studyUtils.getTelemetryId();
    const hashFraction = await sample.hashFraction(config.study.studyName + clientId);
    variation = sample.chooseWeighted(config.study.weightedVariations, hashFraction);
  }
  return variation;
}

this.TrackingProtectionStudy = {
  timeSaved: 0,
  blockedRequests: 0,
  blockedSites: 0,
  blockedEntities: 0,

  /**
   * Open doorhanger-style notification on desired chrome window.
   *
   * @param {ChromeWindow} win
   * @param {String} message
   * @param {String} url
   */
  openDoorhanger(win, message, url) {
    const options = {
      popupIconURL: DOORHANGER_ICON,
      learnMoreURL: url,
      persistent: true,
      persistWhileVisible: true,
    };

    const action = {
      label: "Got it!",
      accessKey: "G",
      callback: () => {},
    };

    win.PopupNotifications.show(win.gBrowser.selectedBrowser, DOORHANGER_ID, message,
      null, action, [], options);
  },

  onPageLoad(evt) {
    let doc = evt.originalTarget;
    console.log(`rhelmer debug pageload ${doc}`);
    if (doc.location.href == "about:newtab") {
      let container = doc.getElementById("newtab-margin-top");
      let newContainer = doc.createElement("div");
      let minutes = this.timeSaved / 1000 / 60;

      if (minutes > 1) {
        let message = this.newtab_message;
        message = message.replace("${blockedRequests}", this.blockedRequests);
        message = message.replace("${blockedEntities}", this.blockedEntities);
        message = message.replace("${blockedSites}", this.blockedSites);
        message = message.replace("${minutes}", minutes.toPrecision(3));
        newContainer.innerHTML = message;
        container.append(newContainer);
      }
    }
  },

  /**
   * Open URL in new tab on desired chrome window.
   *
   * @param {ChromeWindow} win
   * @param {String} message
   * @param {String} url
   * @param {bool} foreground - true if this tab should open in the foreground.
   */
  openURL(win, message, url, foreground = true) {
    const tab = win.gBrowser.addTab(url);
    if (foreground) {
      win.gBrowser.selectedTab = tab;
    }
  },

  async init(api) {
    this.api = api;
    const {browser} = api;

    browser.runtime.onMessage.addListener((message, sender, sendReply) => {
      let win = Services.wm.getMostRecentWindow("navigator:browser");
      if (message == "open-prefs") {
        let url = "about:preferences#privacy";
        // FIXME this needs to first find any already-open about:preferences tab
        // there is probably already a function to do this somewhere in the tree...
        const tab = win.gBrowser.addTab(url);
        win.gBrowser.selectedTab = tab;
      } else if (message.timeSaved) {
        this.timeSaved = message.timeSaved;
        this.blockedRequests = message.blockedRequests;
        this.blockedSites = message.blockedSites;
        this.blockedEntities = message.blockedEntities;
      } else {
        console.log(`Unknown message: ${message}`);
      }
    })

    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      doorhanger: this.openDoorhanger,
      opentab: this.openURL,
    }

    this.treatment = studyUtils.getVariation().name;
    this.campaign_id = await config.study.getCampaignId();

    let campaigns = config.study.campaigns;

    if (this.treatment in campaigns) {
      let campaign = campaigns[this.treatment];
      for (let i = 0; i < campaign.campaign_ids.length; i++) {
        if (this.campaign_id === campaign.campaign_ids[i]) {
          this.message = campaign.messages[i];
          this.newtab_message = campaign.newtab_messages[i];
          this.url = campaign.urls[i];
        }
      }
    }

    if (this.treatment !== "control" && !this.message && !this.url) {
      await studyUtils.endStudy({ reason: "invalid config" });
      throw `No config found for campaign ID: ${this.campaign_id} for ${this.treatment}`;
    }

    // run once now on the most recent window.
    let win = Services.wm.getMostRecentWindow("navigator:browser");

    if (this.treatment === "ALL") {
      Object.keys(this.TREATMENTS).forEach((key, index) => {
        if (Object.prototype.hasOwnProperty.call(this.TREATMENTS, key)) {
          this.TREATMENTS[key](win, this.message, this.url);
        }
      });
    } else if (this.treatment in this.TREATMENTS) {
      this.TREATMENTS[this.treatment](win, this.message, this.url);
    }

    // Add listeners to all open windows.
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      win.gBrowser.addEventListener("DOMContentLoaded", this.onPageLoad.bind(this));
    }
  },

  uninit() {
    // Remove listeners from all open windows.
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      win.gBrowser.removeEventListener("DOMContentLoaded", this.onPageLoad);
    }
  }
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
};

this.install = function(data, reason) {};

this.startup = async function(data, reason) {

  let api = await data.webExtension.startup();

  studyUtils.setup({
    studyName: config.study.studyName,
    endings: config.study.endings,
    addon: { id: data.id, version: data.version },
    telemetry: config.study.telemetry,
  });

  studyUtils.setLoggingLevel(config.log.studyUtils.level);
  const variation = await chooseVariation();
  studyUtils.setVariation(variation);

  if (reason === REASONS.ADDON_INSTALL) {
    studyUtils.firstSeen(); // sends telemetry "enter"
    const eligible = await config.isEligible(); // addon-specific
    if (!eligible) {
      // uses config.endings.ineligible.url if any,
      // sends UT for "ineligible"
      // then uninstalls addon
      await studyUtils.endStudy({ reason: "ineligible" });
      return;
    }
  }
  // sets experiment as active and sends installed telemetry
  await studyUtils.startup({ reason });

  TrackingProtectionStudy.init(api);
};

this.shutdown = this.uninstall = function(data, reason) {

  TrackingProtectionStudy.uninit();

  // are we uninstalling due to user or automatic?
  if (reason === REASONS.ADDON_UNINSTALL || reason === REASONS.ADDON_DISABLE) {
    // reset the preference in case of uninstall or disable, primarily for testing
    // purposes
    Services.prefs.setBoolPref("extensions.trackingprotectionstudy.counter", 0);
    if (!studyUtils._isEnding) {
      // we are the first requestors, must be user action.
      studyUtils.endStudy({ reason: "user-disable" });
    }
  }

}
