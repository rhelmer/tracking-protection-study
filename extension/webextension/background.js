const APPLICABLE_PROTOCOLS = ["http:", "https:"];

let counter = 0;

function protocolIsApplicable(url) {
  var anchor =  document.createElement('a');
  anchor.href = url;
  return APPLICABLE_PROTOCOLS.includes(anchor.protocol);
}

let port = browser.runtime.connect({name: "connection-to-legacy"});
let enabled = true;

port.onMessage.addListener(function(message) {
  if (message) {
    if (message.content == "resource blocked") {
      console.log(`rhelmer debug resource blocked`);
      counter++;
    } else if (message.content == "state change") {
      counter = 0;
      enabled = message.tracking_protection_enabled;
    }
  }
});

/*
Initialize the page action: set icon and title, then show.
Only operates on tabs whose URL's protocol is applicable.
*/
function initializePageAction(tab) {
  if (protocolIsApplicable(tab.url)) {
    browser.pageAction.setTitle({tabId: tab.id, title: "Tracking Protection"});
    browser.pageAction.show(tab.id);
    browser.pageAction.setIcon({imageData: draw(enabled, counter), tabId: tab.id});
  }
}

/*
When first loaded, initialize the page action for all tabs.
*/
var gettingAllTabs = browser.tabs.query({});
gettingAllTabs.then((tabs) => {
  for (let tab of tabs) {
    initializePageAction(tab);
  }
});

/*
Each time a tab is updated, reset the page action for that tab.
*/
browser.tabs.onUpdated.addListener((id, changeInfo, tab) => {
  initializePageAction(tab);
});

/*
Draw pageAction icon with a text badge.
*/
function draw(enabled, counter) {
  // let canvas = document.getElementById('canvas');
  let canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");

  if (enabled) {
    context.fillStyle = "rgba(0, 150, 0, 1)";
  } else {
    context.fillStyle = "rgba(300, 200, 0, 1)";
  }
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = "white";
  context.font = "8px Arial";
  if (counter) {
    context.fillText(counter, 0, 16);
  }
  return context.getImageData(0, 0, 16, 16);
}
