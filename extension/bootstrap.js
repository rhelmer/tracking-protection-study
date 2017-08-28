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

  attach(win) {
    this.loadedListener = {
      QueryInterface: XPCOMUtils.generateQI(["nsIWebProgressListener",
        "nsISupportsWeakReference"]),
      onStateChange(webProgress, request, stateFlags, status) {
        if (request && request.URI) {
          console.log(`rhelmer debug state was changed ${request.URI.spec}`);
        } else {
          console.log(`rhelmer debug state was changed`);
        }
      },
      onSecurityChange(webProgress, request, state) {
        let isBlocked = state & Ci.nsIWebProgressListener.STATE_BLOCKED_TRACKING_CONTENT;
        if (isBlocked) {
          console.log(`rhelmer debug something was blocked`);
        }
      }
    };

    win.gBrowser.addProgressListener(this.loadedListener);
  },

  async init() {
    // Enable the underlying tracking protection.
    Services.prefs.setBoolPref(TRACKING_PROTECTION_PREF, true);
    Services.prefs.setBoolPref(TRACKING_PROTECTION_UI_PREF, true);

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
    // suppress built-in tracking protection intro.
    // FIXME should this be restored on uninstall? it changes the pref that controls
      // how many intros to show...
    win.TrackingProtection.enabledGlobally = false;

    if (this.treatment === "ALL") {
      Object.keys(this.TREATMENTS).forEach((key, index) => {
        if (Object.prototype.hasOwnProperty.call(this.TREATMENTS, key)) {
          this.TREATMENTS[key](win, this.message, this.url);
        }
      });
    } else if (this.treatment in this.TREATMENTS) {
      this.TREATMENTS[this.treatment](win, this.message, this.url);
    }

    // attach new UI to any new windows.
    // FIXME figure out how to bind `this` properly...
    var that = this;
    this.windowListener = {
      onOpenWindow: xulWindow => {
        let win = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindow);
        win.addEventListener("load", () => {
          if (win.gBrowser) {
            that.attach(win);
          } else {
            console.log(`rhelmer debug no gBrowser in ${win}`)
          }
        }, {once: true});
      },
    }
    Services.wm.addListener(this.windowListener);

    // attach new UI to any existing windows.
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      this.attach(win);
    }
  },

  uninit() {
    Services.prefs.setBoolPref(TRACKING_PROTECTION_PREF, false);
    Services.prefs.setBoolPref(TRACKING_PROTECTION_UI_PREF, false);

    // Remove UI and listeners from all open windows.
    Services.wm.removeListener(this.windowListener);
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }
      win.document.getElementById("urlbar-tracking-protection-button").remove();
      win.gBrowser.removeProgressListener(this.loadedListener);
    }
  }
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
};

this.install = function(data, reason) {};

this.startup = async function(data, reason) {

  let api = await data.webExtension.startup();
  const {browser} = api;
  browser.runtime.onMessage.addListener((message, sender, sendReply) => {
    let win = Services.wm.getMostRecentWindow("navigator:browser");
    let normalizedUrl = Services.io.newURI(
      "https://" + win.gBrowser.selectedBrowser.currentURI.hostPort);

    if (message == "toggle-tracking-disabled") {
      if (!Services.perms.testExactPermission(normalizedUrl, "trackingprotection")) {
        // @see browser-trackingprotection.js
        Services.perms.add(normalizedUrl,
          "trackingprotection", Services.perms.ALLOW_ACTION);
        win.gBrowser.reload();
      }
    } else if (message == "toggle-tracking-enabled") {
      // @see browser-trackingprotection.js
      if (Services.perms.testExactPermission(normalizedUrl, "trackingprotection")) {
        Services.perms.remove(normalizedUrl, "trackingprotection");
        win.gBrowser.reload();
      }
    } else if (message == "open-prefs") {
      let url = "about:preferences#privacy";
      // FIXME this needs to first find any already-open about:preferences tab
      // there is probably already a function to do this somewhere in the tree...
      const tab = win.gBrowser.addTab(url);
      win.gBrowser.selectedTab = tab;
    } else {
      console.log(`Unknown message: ${message}`);
    }

  });

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

  TrackingProtectionStudy.init();
};

this.shutdown = this.uninstall = function(data, reason) {

  TrackingProtectionStudy.uninit();

  Cu.unload("resource://tracking-protection-study/StudyUtils.jsm");
  Cu.unload("resource://tracking-protection-study/Config.jsm");

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

this.uninstall = function(data, reason) {
}
