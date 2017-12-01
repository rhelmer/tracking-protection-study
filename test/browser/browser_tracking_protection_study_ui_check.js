/** eslint disable */
"use strict";

const BUTTON_ID = "tracking-protection-study-button";
const FIRSTRUN_URL = "resource://tracking-protection-study/firstrun.html";

add_task(async function() {
  // TODO:
  // 1. check first run page opens (if possible, mochitest might run too early)
  // 2. add local fake tracker to blocklist
  // 3. load local fake tracker, check that page action + counter appears
  // 4. click page action, check panel contents, check that disable works
  // 5. load about:home+newtab and ensure message is displayed
  // 6. load about:preferences and ensure global pref works
  // await BrowserTestUtils.waitForNewTab(gBrowser, FIRSTRUN_URL);
  await BrowserTestUtils.waitForCondition(
    () => document.getElementById(BUTTON_ID),
          "Tracking Protection Study button should be present", 100, 100);

  checkElements(true, [BUTTON_ID]);
});
