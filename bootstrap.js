const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");


XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Study",
  "resource://tracking-protection-study/Study.jsm");

const UI_AVAILABLE_NOTIFICATION = "sessionstore-windows-restored";


this.Bootstrap = {
  async startup(data, reason) {
    if (!Services.wm.getMostRecentWindow("navigator:browser")) {
      Services.obs.addObserver(this, UI_AVAILABLE_NOTIFICATION);
    } else {
      this.onBrowserReady();
    }
  },

  observe(subject, topic, data) {
    if (topic === UI_AVAILABLE_NOTIFICATION) {
      Services.obs.removeObserver(this, UI_AVAILABLE_NOTIFICATION);
      this.onBrowserReady();
    }
  },

  shutdown() {
    Study.uninit();
    Cu.unload("resource://tracking-protection-study/Study.jsm");
  },

  install() {},
  uninstall() {},

  onBrowserReady() {
    Services.mm.loadFrameScript("resource://tracking-protection-study/tracking-study-content.js", true);
    Study.init();
  },
}

// Expose bootstrap methods on the global
for (const methodName of ["install", "startup", "shutdown", "uninstall"]) {
  this[methodName] = Bootstrap[methodName].bind(Bootstrap);
}
