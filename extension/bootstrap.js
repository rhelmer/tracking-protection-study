const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Preferences.jsm")
Cu.import("resource://gre/modules/PopupNotifications.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "studyUtils",
  "resource://tracking-protection-study/StudyUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "config",
  "resource://tracking-protection-study/Config.jsm");

const UI_AVAILABLE_NOTIFICATION = "sessionstore-windows-restored";
const TRACKING_PROTECTION_PREF = "privacy.trackingprotection.enabled";
const DOORHANGER_ID = "onboarding-trackingprotection-confirmation";
const DOORHANGER_MESSAGE = "Tracking protection is enabled.";
const NEW_TAB_URL = "about:mozilla";

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
   */
  openDoorhanger(win) {
    this.doorhanger = new PopupNotifications(win.gBrowser,
      win.document.getElementById("notification-popup"),
      win.document.getElementById("notification-popup-box"));

    const options = {
      displayURI: "test123",
      persistent: true,
      hideClose: true,
    };

    const action = {
      label: "Got it!",
      accessKey: "G",
      callback: () => {},
    };

    this.doorhanger.show(win.gBrowser.selectedBrowser, DOORHANGER_ID, DOORHANGER_MESSAGE,
      null, action, [], options);
  },

  /**
   * Open URL in new tab on desired chrome window.
   *
   * @param {ChromeWindow} win
   * @param {URL} url
   * @param {bool} foreground - true if this tab should open in the foreground.
   */
  openURL(win, url, foreground = true) {
    const tab = win.gBrowser.addTab(url);
    if (foreground) {
      win.gBrowser.selectedTab = tab;
    }
  },

  run(win) {
    if (this.treatment === "ALL") {
      Object.keys(this.TREATMENTS).forEach((key, index) => {
        if (Object.prototype.hasOwnProperty.call(this.TREATMENTS, key)) {
          this.TREATMENTS[key](win, NEW_TAB_URL);
        }
      });
    } else if (this.treatment in this.TREATMENTS) {
      console.log("rhelmer debug1");
      this.TREATMENTS[this.treatment](win, NEW_TAB_URL);
    }

  },

  init() {
    const prefs = new Preferences();
    prefs.set(TRACKING_PROTECTION_PREF, true);

    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      doorhanger: this.openDoorhanger,
      opentab: this.openURL,
    }

    this.treatment = studyUtils.getVariation().name;

    let win = Services.wm.getMostRecentWindow("navigator:browser");

    if (win.gBrowser) {
      this.run(win);
    } else {
      // If there is no window yet, add a listener for UI startup.
      const observer = {
        observe: (subject, topic, data) => {
          Services.obs.removeObserver(observer, UI_AVAILABLE_NOTIFICATION);
          win = Services.wm.getMostRecentWindow("navigator:browser");
          this.run(win);
        },
      };
      Services.obs.addObserver(observer, UI_AVAILABLE_NOTIFICATION);
    }
  },

  uninit() {
    const prefs = new Preferences();
    prefs.set(TRACKING_PROTECTION_PREF, false);

    if (this.doorhanger) {
      this.doorhanger.remove();
    }
  }
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
};

this.install = function(data, reason) {};

this.startup = async function(data, reason) {
  studyUtils.setup({
    studyName: config.study.studyName,
    endings: config.study.endings,
    addon: { id: data.id, version: data.version },
    telemetry: config.study.telemetry,
  });

  studyUtils.setLoggingLevel(config.log.studyUtils.level);
  const variation = await chooseVariation();
  studyUtils.setVariation(variation);

  // TODO Import config.modules?

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
    Preferences.set("extensions.sharebuttonstudy.counter", 0);
    if (!studyUtils._isEnding) {
      // we are the first requestors, must be user action.
      studyUtils.endStudy({ reason: "user-disable" });
    }
  }

}

this.uninstall = function(data, reason) {
}
