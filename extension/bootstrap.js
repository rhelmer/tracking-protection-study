const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "blocklists",
  "resource://tracking-protection-study/BlockLists.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "config",
  "resource://tracking-protection-study/Config.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "studyUtils",
  "resource://tracking-protection-study/StudyUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "WebRequest",
  "resource://gre/modules/WebRequest.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "MatchPattern",
  "resource://gre/modules/MatchPattern.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "styleSheetService",
  "@mozilla.org/content/style-sheet-service;1", "nsIStyleSheetService");

Cu.importGlobalProperties(["URL"]);

// TODO disable built-in tracking protection
// const TRACKING_PROTECTION_PREF = "privacy.trackingprotection.enabled";
// const TRACKING_PROTECTION_UI_PREF = "privacy.trackingprotection.ui.enabled";
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

  onOpenWindow(xulWindow) {
    let win = xulWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                       .getInterface(Components.interfaces.nsIDOMWindow)

    let gBrowser = win;
    this.addEventListeners(gBrowser);
  },

  onPageLoad: (evt) => {
    let doc = evt.originalTarget;
    this.hidePageAction(doc);
    this.setPageActionCounter(doc, 0);

    let currentHost = new URL(doc.location.href).host;
    this.state.blockedResources.set(currentHost, 0);

    if (doc.location.href == "about:newtab") {
      let minutes = this.timeSaved / 1000 / 60;

      // FIXME commented out for testing
      // if (minutes >= 1 && this.blockedRequests) {
      if (minutes && this.blockedRequests) {
        let message = this.newtab_message;
        message = message.replace("${blockedRequests}", this.blockedRequests);
        message = message.replace("${blockedEntities}", this.blockedEntities);
        message = message.replace("${blockedSites}", this.blockedSites);
        message = message.replace("${minutes}", minutes.toPrecision(3));

        let container = doc.getElementById("newtab-margin-top");
        let logo = doc.createElement("img");
        logo.src = "resource://tracking-protection-study/img/blok-48.png";
        logo.style.height = 48;
        logo.style.width = 48;
        logo.style.float = "left";
        logo.style.padding = "5px";

        let span = doc.createElement("span");
        span.style.fontSize = "24px";
        span.style.fontWeight = "lighter";
        span.style.float = "right";
        span.style.padding = "5px";
        span.innerHTML = message;

        let newContainer = doc.createElement("div");
        newContainer.style.padding = "24px";
        newContainer.append(logo);
        newContainer.append(span);
        container.append(newContainer);
      }
    }
  },

  onBeforeRequest(details) {
    let result;
    if (details && details.url && details.browser) {
      let browser = details.browser;
      let currentURI = browser.currentURI;
      if (!currentURI) {
        return;
      }
      let currentHost = currentURI.host;
      let host = new URL(details.originUrl).host;

      if (currentHost != host && blocklists.hostInBlocklist(this.state.blocklist, host)) {
        console.log(`Tracking Protection study has blocked a request to: ${host}`);
        let counter;
        if (this.state.blockedResources.has(currentHost)) {
          counter = this.state.blockedResources.get(currentHost);
          counter++;
        } else {
          counter = 1;
        }
        this.state.blockedResources.set(currentHost, counter);
        this.showPageAction(browser.getRootNode());
        this.setPageActionCounter(browser.getRootNode(), counter);
        result = {cancel: true};
      }
    }
    return result;
  },

  /**
   * Shows the page action button for the current window.
   */
  showPageAction(doc) {
    if (!doc.getElementById("tracking-protection-study-button")) {
      let urlbar = doc.getElementById("urlbar-icons");

      let panel = doc.createElement("panel");
      panel.setAttribute("id", "tracking-protection-study-panel");
      panel.setAttribute("type", "arrow");
      panel.setAttribute("level", "parent");
      let panelHbox = doc.createElement("hbox");
      let group = doc.createElement("radiogroup");
      let radio1 = doc.createElement("radio");
      radio1.setAttribute("label", "Enable Tracking Protection");
      radio1.addEventListener("click", () => {
        let button = doc.getElementById("tracking-protection-study-button");
        button.style.backgroundColor = "green";
        let filter = {urls: new MatchPattern("*://*/*")};
        WebRequest.onBeforeRequest.addListener(this.onBeforeRequest, filter, ["blocking"]);
        let win = Services.wm.getMostRecentWindow("navigator:browser");
        win.gBrowser.reload();
      });
      let radio2 = doc.createElement("radio");
      radio2.setAttribute("label", "Disable Tracking Protection");
      radio2.addEventListener("click", () => {
        let button = doc.getElementById("tracking-protection-study-button");
        button.style.backgroundColor = "yellow";
        WebRequest.onBeforeRequest.removeListener(this.onBeforeRequest);
        let win = Services.wm.getMostRecentWindow("navigator:browser");
        win.gBrowser.reload();
      });
      group.append(radio1);
      group.append(radio2);
      panelHbox.append(group);
      panel.append(panelHbox);

      let button = doc.createElement("toolbarbutton");
      button.style.backgroundColor = "green";
      button.setAttribute("id", "tracking-protection-study-button");
      button.setAttribute("image", "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled");
      button.append(panel);
      button.addEventListener("command", event => {
        doc.getElementById("panel");
        panel.openPopup(button);
      });

      urlbar.append(button);
    }
  },

  setPageActionCounter(doc, counter) {
    let toolbarButton = doc.getElementById("tracking-protection-study-button");
    if (toolbarButton) {
      toolbarButton.setAttribute("label", counter);
    }
  },

  hidePageAction(doc) {
    let button = doc.getElementById("tracking-protection-study-button");
    if (button) {
      button.parentElement.removeChild(button);
    }
  },

  onTabChange(evt) {
    let win = evt.target.ownerGlobal;
    let currentURI = win.gBrowser.currentURI;
    if (currentURI.scheme != "http" && currentURI.scheme != "https") {
      this.hidePageAction(win.document);
      return;
    }
    let currentHost = win.gBrowser.currentURI.host;

    this.hidePageAction(win.document);
    let counter = this.state.blockedResources.get(currentHost);

    if (counter) {
      this.showPageAction(win.document);
      this.setPageActionCounter(win.document, counter);
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

  async init() {
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

    this.state = {
      blocklist: new Map(),
      allowedHosts: [],
      reportedHosts: {},
      entityList: {},
      blockedResources: new Map()
    }
    await blocklists.loadLists(this.state);

    let filter = {urls: new MatchPattern("*://*/*")};
    this.onBeforeRequest = this.onBeforeRequest.bind(this);

    WebRequest.onBeforeRequest.addListener(this.onBeforeRequest, filter, ["blocking"]);

    let url = "resource://tracking-protection-study/tracking-protection-study.css";
    let uri = Services.io.newURI(url);
    styleSheetService.loadAndRegisterSheet(uri, styleSheetService.AGENT_SHEET);

    // Add listeners to all open windows.
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }

      let gBrowser = win.gBrowser;
      this.addEventListeners(gBrowser);
    }

    // Attach to any new windows.
    Services.wm.addListener(this);
  },

  addEventListeners(gBrowser) {
    this.onPageLoad = this.onPageLoad.bind(this);
    this.onTabChange = this.onTabChange.bind(this);

    gBrowser.addEventListener("DOMContentLoaded", this.onPageLoad);
    gBrowser.tabContainer.addEventListener("TabSelect", this.onTabChange);
    gBrowser.tabContainer.addEventListener("pageshow", this.onPageLoad);
    gBrowser.tabContainer.addEventListener("loadstart", this.onPageLoad);
  },

  uninit() {
    // Remove listeners from all open windows.
    let enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (win === Services.appShell.hiddenDOMWindow) {
        continue;
      }

      let button = win.document.getElementById("tracking-protection-study")
      if (button) {
        button.parentElement.removeChild(button);
      }

      WebRequest.onBeforeRequest.removeListener(this.onBeforeRequest);
      win.gBrowser.removeEventListener("DOMContentLoaded", this.onPageLoad);
      win.gBrowser.tabContainer.removeEventListener("TabSelect", this.onTabChange);
      win.gBrowser.tabContainer.removeEventListener("pageshow", this.onPageLoad);
      win.gBrowser.tabContainer.removeEventListener("loadstart", this.onPageLoad);

      Services.wm.removeListener(this);
    }

    let url = "chrome://tracking-protection-study/content/tracking-protection-study.css";
    let uri = Services.io.newURI(url);
    styleSheetService.unregisterSheet(uri);
  }
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
  Cu.unload("resource://tracking-protection-study/StudyUtils.jsm");
  Cu.unload("resource://tracking-protection-study/Config.jsm");
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
