const APPLICABLE_PROTOCOLS = ["http:", "https:"];

let counter = 0;

function protocolIsApplicable(url) {
  var anchor =  document.createElement('a');
  anchor.href = url;
  return APPLICABLE_PROTOCOLS.includes(anchor.protocol);
}

/*
Initialize the page action: set icon and title, then show.
Only operates on tabs whose URL's protocol is applicable.
*/
function initializePageAction(tab) {
  if (protocolIsApplicable(tab.url)) {
    browser.pageAction.setTitle({tabId: tab.id, title: "Tracking Protection"});
    browser.pageAction.show(tab.id);
    browser.pageAction.setIcon({imageData: draw(0, 0, counter), tabId: tab.id});
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

let port = browser.runtime.connect({name: "connection-to-legacy"});

port.onMessage.addListener(function(message) {
  if (message) {
    if (message.content == "resource blocked") {
      counter++;
    } else if (message.content == "state change") {
      counter = 0;
    }
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
function draw(starty, startx, count) {
  // let canvas = document.getElementById('canvas');
  let canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");

  context.fillStyle = "rgba(0, 150, 0, 1)";
  context.fillRect(startx % 16, starty % 16, 16, 16);
  context.fillStyle = "white";
  context.font = "8px Arial";
  if (count) {
    context.fillText(count, 0, 16);
  }
  return context.getImageData(0, 0, 16, 16);
}
