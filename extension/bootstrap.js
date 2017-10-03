const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "blocklists",
  "resource://tracking-protection-study/BlockLists.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
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

  onOpenWindow(xulWindow) {
    var win = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);

    this.addEventListeners(win.gBrowser);
  },

  onLocationChange(browser, progress, request, uri, flags) {
    if (this.state.blockedResources.has(browser)) {
      this.showPageAction(browser.getRootNode());
      this.setPageActionCounter(browser.getRootNode(), 0);
      this.state.blockedResources.set(browser, 0);
    }
    if (browser.currentURI.spec == "about:newtab") {
      let doc = browser.contentDocument;
      if (doc.getElementById("tracking-protection-message")) {
        return;
      }
      let minutes = this.state.timeSaved / 1000 / 60;
      // FIXME commented out for testing
      // if (minutes >= 1 && this.blockedRequests) {
      if (this.state.totalBlockedResources) {
        let message = this.newtab_message;
        message = message.replace("${blockedRequests}", this.state.totalBlockedResources);
        message = message.replace("${blockedEntities}", this.state.totalBlockedEntities);
        message = message.replace("${blockedSites}", this.state.totalBlockedSites);
        message = message.replace("${minutes}", minutes.toPrecision(3));

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
        newContainer.id = "tracking-protection-message";
        newContainer.style.padding = "24px";
        newContainer.append(logo);
        newContainer.append(span);

        let container = doc.getElementById("newtab-margin-top");
        container.append(newContainer);
      }
    }
  },

  onBeforeRequest(details) {
    if (details && details.url && details.browser) {
      let browser = details.browser;
      let currentURI = browser.currentURI;

      if (!currentURI) {
        return;
      }

      if (!details.originUrl) {
        return;
      }

      let currentHost = currentURI.host;
      let host = new URL(details.originUrl).host;

      // Block third-party requests only.
      if (currentHost != host && blocklists.hostInBlocklist(this.state.blocklist, host)) {
        let counter;
        if (this.state.blockedResources.has(details.browser)) {
          counter = this.state.blockedResources.get(details.browser);
          counter++;
        } else {
          counter = 1;
        }

        // TODO enable allowed hosts.
        if (this.state.allowedHosts.has(currentHost)) {
          this.state.totalAllowedResources += 1;
        } else {
          this.state.totalBlockedResources += 1;
        }

        this.state.blockedResources.set(details.browser, counter);

        let enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
          let win = enumerator.getNext();
          if (win === Services.appShell.hiddenDOMWindow) {
            continue;
          }

          if (details.browser == win.gBrowser.selectedBrowser) {
            this.showPageAction(browser.getRootNode());
            this.setPageActionCounter(browser.getRootNode(), counter);
          }
        }
        return {cancel: true};
      }
    }
  },

  /**
   * Shows the page action button for the current window.
   */
  showPageAction(doc) {
    let win = Services.wm.getMostRecentWindow("navigator:browser");
    let currentHost = win.gBrowser.currentURI.host;

    let button = doc.getElementById("tracking-protection-study-button");
    if (button) {
      button.parentElement.removeChild(button);
    }
    doc.getElementById("tracking")
    let urlbar = doc.getElementById("urlbar-icons");

    let panel = doc.createElement("panel");
    panel.setAttribute("id", "tracking-protection-study-panel");
    panel.setAttribute("type", "arrow");
    panel.setAttribute("level", "parent");
    let panelHbox = doc.createElement("hbox");

    let controls = doc.createElement("vbox");

    let group = doc.createElement("radiogroup");
    let enabled = doc.createElement("radio");
    enabled.setAttribute("label", "Enable on this site");
    enabled.addEventListener("click", () => {
      if (this.state.allowedHosts.has(currentHost)) {
        this.state.allowedHosts.delete(currentHost);
      }
      win.gBrowser.reload();
    });
    let disabled = doc.createElement("radio");
    disabled.setAttribute("label", "Disable on this site");
    disabled.addEventListener("click", () => {
      this.state.allowedHosts.add(currentHost);
      win.gBrowser.reload();
    });
    if (this.state.allowedHosts.has(currentHost)) {
      disabled.setAttribute("selected", true);
    } else {
      enabled.setAttribute("selected", true);
    }
    group.append(enabled);
    group.append(disabled);
    controls.append(group);

    let footer = doc.createElement("vbox");
    footer.setAttribute("value", "If the website appears broken, consider disabling" +
                                  "tracking protection and refreshing the page.");

    panelHbox.append(controls);
    panelHbox.append(footer);
    panel.append(panelHbox);

    button = doc.createElement("toolbarbutton");
    if (this.state.allowedHosts.has(currentHost)) {
      button.style.backgroundColor = "yellow";
    } else {
      button.style.backgroundColor = "green";
    }
    button.setAttribute("id", "tracking-protection-study-button");
    button.setAttribute("image", "chrome://browser/skin/controlcenter/tracking-protection.svg#enabled");
    button.append(panel);
    button.addEventListener("command", event => {
      doc.getElementById("panel");
      panel.openPopup(button);
    });

    urlbar.append(button);
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

    let currentWin = Services.wm.getMostRecentWindow("navigator:browser");

    if (win == currentWin) {
      this.hidePageAction(win.document);
      let counter = this.state.blockedResources.get(win.gBrowser.selectedBrowser);

      if (counter) {
        this.showPageAction(win.document);
        this.setPageActionCounter(win.document, counter);
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

  async init() {
    // define treatments as STRING: fn(browserWindow, url)
    this.TREATMENTS = {
      doorhanger: this.openDoorhanger,
      opentab: this.openURL,
    }

    // TODO hardcode for the moment, but get from distribution ID instead
    this.treatment = "opentab";
    this.distribution_id = "test123";
    let newtab_messages = [
      "Firefox blocked ${blockedRequests} trackers today<br/> from ${blockedEntities} companies that track your browsing",
      "Firefox blocked ${blockedRequests} trackers today<br/> and saved you ${minutes} minutes",
      "Firefox blocked ${blockedRequests} ads today from<br/> ${blockedSites} different websites"
    ];
    this.newtab_message = newtab_messages[0];

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
      timeSave: 0,
      blocklist: new Map(),
      allowedHosts: new Set(),
      reportedHosts: {},
      entityList: {},
      blockedResources: new Map(),
      totalBlockedResources: 0,
      totalAllowedResources: 0
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
    this.onTabChange = this.onTabChange.bind(this);

    gBrowser.addTabsProgressListener(this);
    gBrowser.tabContainer.addEventListener("TabSelect", this.onTabChange);
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
      win.gBrowser.removeTabsProgressListener(this);
      win.gBrowser.tabContainer.removeEventListener("TabSelect", this.onTabChange);

      Services.wm.removeListener(this);
    }

    let url = "chrome://tracking-protection-study/content/tracking-protection-study.css";
    let uri = Services.io.newURI(url);
    styleSheetService.unregisterSheet(uri);
  }
}

this.shutdown = function() {
  TrackingProtectionStudy.uninit();
  Cu.unload("resource://tracking-protection-study/Blocklists.jsm");
};

this.install = function(data, reason) {};

this.startup = async function(data, reason) {
  TrackingProtectionStudy.init();
};

this.shutdown = this.uninstall = function(data, reason) {

  TrackingProtectionStudy.uninit();
}
