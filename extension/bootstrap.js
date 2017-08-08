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
      const newWin = win;
      newWin.gBrowser.selectedTab = tab;
    }
  },

  init() {
    const prefs = new Preferences();
    prefs.set(TRACKING_PROTECTION_PREF, true);

    let win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win.gBrowser) {
      this.openURL(win, NEW_TAB_URL);
      this.openDoorhanger(win);
    } else {
      // If there is no window yet, add a listener for UI startup.
      const observer = {
        observe: (subject, topic, data) => {
          Services.obs.removeObserver(observer, UI_AVAILABLE_NOTIFICATION);

          win = Services.wm.getMostRecentWindow("navigator:browser");
          this.openURL(win, NEW_TAB_URL);
          this.openDoorhanger(win);
        },
      };
      Services.obs.addObserver(observer, UI_AVAILABLE_NOTIFICATION);
    }
  },

  uninit() {
    const prefs = new Preferences();
    prefs.set(TRACKING_PROTECTION_PREF, false);

    this.doorhanger.remove()
  }
}

this.startup = function() {
  TrackingProtectionStudy.init();
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
};

this.install = function() {};

this.uninstall = function() {
  TrackingProtectionStudy.uninit();
};
