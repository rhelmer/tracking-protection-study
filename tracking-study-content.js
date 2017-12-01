/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/frame-script */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

const ABOUT_HOME_URL = "about:home";
const ABOUT_NEWTAB_URL = "about:newtab";

class TrackingProtectionStudy {
  constructor(contentWindow) {
    this.init(contentWindow);
  }

  async init(contentWindow) {
    addMessageListener("TrackingStudy:Totals", msg => {
      let totalBlockedResources = msg.data.totalBlockedResources;

      let root = contentWindow.document.getElementById("root");
      let message = contentWindow.document.getElementById("tracking-study-message");
      if (!message) {
        message = contentWindow.document.createElement("span");
        message.id = "tracking-study-message";
      }

      message.innerHTML = `Hello from Tracking Protection Study! Total blocked resources: ${totalBlockedResources}`;
      root.parentElement.prepend(message);
    });
  }
}

addEventListener("load", function onLoad(evt) {
  let window = evt.target.defaultView;

  let location = window.location.href;
  if (location == ABOUT_NEWTAB_URL || location == ABOUT_HOME_URL) {
    // We just want to run tests as quick as possible
    // so in the automation test, we don't do `requestIdleCallback`.
    if (Cu.isInAutomation) {
      new TrackingProtectionStudy(window);
      sendAsyncMessage("TrackingStudy:OnContentMessage", {action: "get-totals"});
      return;
    }
    window.requestIdleCallback(() => {
      new TrackingProtectionStudy(window);
      sendAsyncMessage("TrackingStudy:OnContentMessage", {action: "get-totals"});
    });
  }
}, true);
