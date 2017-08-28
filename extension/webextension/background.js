/*
Initialize the page action: set icon and title, then show.
Only operates on tabs whose URL's protocol is applicable.
*/
function initializePageAction(tab) {
  browser.pageAction.setIcon({tabId: tab.id, path: "icons/off.svg"});
  browser.pageAction.setTitle({tabId: tab.id, title: "Tracking Protection"});
  browser.pageAction.show(tab.id);
  let count = 0;
  browser.pageAction.setIcon({imageData: draw(10, 0, count), tabId: tab.id});
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
function draw(starty, startx, count) {
  // var canvas = document.getElementById('canvas');
  let canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");
    let img = new Image();
    img.src = "icons/tracking-protection-16.png"
    img.onload = () => {
       context.drawImage(img, 0, 2);
  }
  context.fillStyle = "rgba(0, 200, 0, 1)";
  context.fillRect(startx % 19, starty % 19, 10, 10);
  context.fillStyle = "white";
  context.font = "11px Arial";
  if (count) {
    context.fillText(count, 0, 19);
  }
  return context.getImageData(0, 0, 19, 19);
}
