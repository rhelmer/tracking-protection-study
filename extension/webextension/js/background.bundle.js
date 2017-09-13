(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],2:[function(require,module,exports){
const {canonicalizeHost} = require('./canonicalize')
const {loadLists, hostInBlocklist} = require('./lists')
const {requestAllower, getRequestEntity} = require('./requests')
const {log} = require('./log')

// Set some explicit window variable for pageAction to access
window.topFrameHostDisabled = false
window.topFrameHostReport = {}
window.blockedRequests = {}
window.blockedEntities = {}
window.allowedRequests = {}
window.allowedEntities = {}
window.sessionURICount = 0
window.totalPageLoadTime = 0
window.currentPageLoadTime = 0
window.currentPageLoadStart = Date.now()
window.totalBlockedRequests = 0
window.totalBlockedSites = 0
window.totalBlockedEntities = 0

var privateBrowsingMode = false
var currentActiveTabID
var currentActiveOrigin
var totalExecTime = {}
var mainFrameOriginDisabled = {}
var mainFrameOriginTopHosts = {}
var mainFrameOriginDisabledIndex = -1

function restartBlokForTab (tabID) {
  blockedRequests[tabID] = []
  blockedEntities[tabID] = []
  allowedRequests[tabID] = []
  allowedEntities[tabID] = []
  totalExecTime[tabID] = 0
  mainFrameOriginTopHosts[tabID] = null
  mainFrameOriginDisabled[tabID] = false
}

function setWindowFrameVarsForPopup (topHost, allowedHosts, reportedHosts) {
  if (isOriginDisabled(topHost, allowedHosts)) {
    window.topFrameHostDisabled = true
  } else {
    window.topFrameHostDisabled = false
  }
  if (reportedHosts.hasOwnProperty(topHost)) {
    window.topFrameHostReport = reportedHosts[topHost]
  } else {
    window.topFrameHostReport = {}
  }
}

function isOriginDisabled (host, allowedHosts) {
  return allowedHosts.indexOf(host) > -1
}

function blockTrackerRequests (blocklist, allowedHosts, entityList) {
  return function filterRequest (requestDetails) {
    if (!window.topFrameHostDisabled) {
      window.sessionURICount++
      window.currentPageLoadStart = Date.now()
    }

    var blockTrackerRequestsStart = Date.now()
    var requestTabID = requestDetails.tabId
    var originTopHost
    var requestTopHost
    var requestEntity

    var flags = {
      mainOriginDisabled: false,
      firefoxOrigin: false,
      newOrigin: false,
      requestHostInBlocklist: false,
      requestIsThirdParty: false,
      requestHostMatchesMainFrame: false
    }

    var allowRequest = requestAllower.bind(null, requestTabID, totalExecTime, blockTrackerRequestsStart)

    if (privateBrowsingMode) {
      log('Allowing request in private browsing mode window; PBM TP will catch them.')
      return allowRequest()
    }

    if (typeof requestDetails.originUrl === 'undefined') {
      log('Allowing request from "undefined" origin - a browser internal origin.')
      return allowRequest()
    }

    // Determine all origin flags
    originTopHost = canonicalizeHost(new URL(requestDetails.originUrl).host)
    currentActiveOrigin = originTopHost

    flags.firefoxOrigin = (typeof originTopHost !== 'undefined' && originTopHost.includes('moz-nullprincipal'))
    flags.newOrigin = originTopHost === ''
    if (flags.firefoxOrigin || flags.newOrigin) {
      log('Allowing request from Firefox and/or new tab/window origins.')
      return allowRequest()
    }

    // Set main & top frame values if frameId === 0
    if (requestDetails.frameId === 0) {
      mainFrameOriginTopHosts[requestTabID] = originTopHost
      mainFrameOriginDisabledIndex = allowedHosts.indexOf(originTopHost)
      mainFrameOriginDisabled[requestTabID] = mainFrameOriginDisabledIndex > -1
    }

    requestTopHost = canonicalizeHost(new URL(requestDetails.url).host)

    if (mainFrameOriginDisabled[requestTabID]) {
      browser.pageAction.setIcon({
        tabId: requestTabID,
        imageData: draw(false, 0)
      })
      browser.pageAction.show(requestTabID)

      if (hostInBlocklist(blocklist, requestTopHost)) {
        allowedRequests[requestTabID].push(requestTopHost)
        browser.pageAction.setIcon({
          tabId: tabID,
          imageData: draw(!topFrameHostDisabled, allowedRequests[requestTabID].length)
        })
      }
/*
      if (allowedEntities[requestTabID].indexOf(requestEntity.entityName) === -1) {
        allowedEntities[requestTabID].push(requestEntity.entityName)
      }
*/
      log('Allowing request from origin for which Blok is disabled.')
      return allowRequest()
    }

    if (requestDetails.type === 'main_frame') {
      log('Allowing clicks to links.')
      return allowRequest()
    }

    flags.requestHostInBlocklist = hostInBlocklist(blocklist, requestTopHost)

    if (!flags.requestHostInBlocklist) {
      log('Allowing request to domain NOT in the block-list.')
      return allowRequest()
    }

    requestEntity = getRequestEntity(entityList, originTopHost, requestTopHost, originTopHost)
    if (requestEntity.sameEntity) {
      log('Allowing request to block-list domain that belongs to same entity as origin domain.')
      return allowRequest()
    }

    flags.requestIsThirdParty = requestTopHost !== originTopHost

    if (flags.requestIsThirdParty) {
      flags.requestHostMatchesMainFrame = (requestDetails.frameId > 0 && requestTopHost === mainFrameOriginTopHosts[requestTabID])
      if (flags.requestHostMatchesMainFrame) {
        log('Allowing request to block-list domain that matches the top/main frame domain.')
        return allowRequest()
      }

      log('Blocking request: originTopHost: ', originTopHost, ' mainFrameOriginTopHost: ', mainFrameOriginTopHosts[requestTabID], ' requestTopHost: ', requestTopHost, ' requestHostInBlocklist: ', flags.requestHostInBlocklist)
      blockedRequests[requestTabID].push(requestTopHost)
      totalBlockedRequests++
      if (blockedEntities[requestTabID].indexOf(requestEntity.entityName) === -1) {
        blockedEntities[requestTabID].push(requestEntity.entityName)
        totalBlockedEntities++
        browser.pageAction.setIcon({
          tabId: requestTabID,
          imageData: draw(!topFrameHostDisabled, blockedRequests[requestTabID].length)
        })
      }
      totalExecTime[requestTabID] += Date.now() - blockTrackerRequestsStart
      browser.pageAction.show(requestTabID)
      return {cancel: true}
    }

    log('Default to allowing request.')
    return allowRequest()
  }
}

function startRequestListener (blocklist, allowedHosts, entityList) {
  let filter = {urls: ['*://*/*']}

  browser.webRequest.onBeforeRequest.addListener(
    blockTrackerRequests(blocklist, allowedHosts, entityList),
    filter,
    ['blocking']
  )

  browser.webRequest.onCompleted.addListener(
    (requestDetails) => {
      window.currentPageLoadTime = Date.now() - window.currentPageLoadStart
      window.totalPageLoadTime += window.currentPageLoadTime
      /* Since we can't time the load of blocked resources, assume that tracking protection
         saves ~44% load time:
         http://lifehacker.com/turn-on-tracking-protection-in-firefox-to-make-pages-lo-1706946166
      */
      if (window.sessionURICount && window.totalPageLoadTime) {
        let timeSaved = (window.totalPageLoadTime / (1 - .44)) - window.totalPageLoadTime
        let message = {
          timeSaved: timeSaved,
          blockedRequests: window.totalBlockedRequests,
          blockedSites: window.totalBlockedSites,
          blockedEntities: window.totalBlockedEntities
        }
        browser.runtime.sendMessage(message);
      }
    },
    filter
  )
}

function startWindowAndTabListeners (allowedHosts, reportedHosts) {
  browser.windows.onFocusChanged.addListener((windowID) => {
    browser.windows.get(windowID, {}, (focusedWindow) => {
      if (focusedWindow && focusedWindow.incognito) {
        privateBrowsingMode = true
      } else {
        privateBrowsingMode = false
      }
    })
    log('browser.windows.onFocusChanged, windowID: ' + windowID)
    browser.tabs.query({active: true, windowId: windowID}, (tabsArray) => {
      let tab = tabsArray[0]
      if (!tab)
        return

      currentActiveTabID = tab.id
      let tabTopHost = canonicalizeHost(new URL(tab.url).host)
      mainFrameOriginDisabledIndex = allowedHosts.indexOf(tabTopHost)
      setWindowFrameVarsForPopup(tabTopHost, allowedHosts, reportedHosts)
    })
  })

  browser.tabs.onActivated.addListener(function (activeInfo) {
    currentActiveTabID = activeInfo.tabId
    browser.tabs.get(currentActiveTabID, function (tab) {
      let tabTopHost = canonicalizeHost(new URL(tab.url).host)
      mainFrameOriginDisabledIndex = allowedHosts.indexOf(tabTopHost)
      setWindowFrameVarsForPopup(tabTopHost, allowedHosts, reportedHosts)
    })
  })

  browser.tabs.onUpdated.addListener(function (tabID, changeInfo) {
    if (changeInfo.status === 'loading') {
      restartBlokForTab(tabID)
      browser.tabs.get(currentActiveTabID, function (tab) {
        let tabTopHost = canonicalizeHost(new URL(tab.url).host)
        setWindowFrameVarsForPopup(tabTopHost, allowedHosts, reportedHosts)
      })
    } else if (changeInfo.status === 'complete') {
      log('******** tab changeInfo.status complete ********')
      if (blockedRequests[tabID]) {
        log('blocked ' + blockedRequests[tabID].length + ' requests: ', blockedRequests[tabID])
        log('from ' + blockedEntities[tabID].length + ' entities: ', blockedEntities[tabID])
      }
      if (allowedRequests[tabID]) {
        log('allowed ' + allowedRequests[tabID].length + ' requests: ', allowedRequests[tabID])
        log('from ' + allowedEntities[tabID].length + ' entities: ', allowedEntities[tabID])
      }
      log('totalExecTime: ' + totalExecTime[tabID])
      log('******** tab changeInfo.status complete ********')
    }
  })
}

function startMessageListener (allowedHosts, reportedHosts, testPilotPingChannel) {
  browser.runtime.onMessage.addListener(function (message) {
    if (message === 'disable') {
      let mainFrameOriginTopHost = mainFrameOriginTopHosts[currentActiveTabID]
      let testPilotPingMessage = {
        originDomain: mainFrameOriginTopHost,
        trackerDomains: blockedRequests[currentActiveTabID],
        event: 'blok-disabled',
        breakage: '',
        notes: ''
      }
      log('telemetry ping payload: ' + JSON.stringify(testPilotPingMessage))
      testPilotPingChannel.postMessage(testPilotPingMessage)
      browser.pageAction.setIcon({
        tabId: currentActiveTabID,
        imageData: draw(false, 0)
      })
      allowedHosts.push(mainFrameOriginTopHost)
      browser.storage.local.set({allowedHosts: allowedHosts})
      browser.tabs.reload(currentActiveTabID)
    }
    if (message === 're-enable') {
      let mainFrameOriginTopHost = mainFrameOriginTopHosts[currentActiveTabID]
      let testPilotPingMessage = {
        originDomain: mainFrameOriginTopHost,
        trackerDomains: blockedRequests[currentActiveTabID],
        event: 'blok-enabled',
        breakage: '',
        notes: ''
      }
      log('telemetry ping payload: ' + JSON.stringify(testPilotPingMessage))
      testPilotPingChannel.postMessage(testPilotPingMessage)
      browser.pageAction.setIcon({
        tabId: currentActiveTabID,
        imageData: draw(true, 0)
      })
      allowedHosts.splice(mainFrameOriginDisabledIndex, 1)
      browser.storage.local.set({allowedHosts: allowedHosts})
      browser.tabs.reload(currentActiveTabID)
    }
    if (message.hasOwnProperty('feedback')) {
      let testPilotPingMessage = {
        originDomain: mainFrameOriginTopHosts[currentActiveTabID],
        trackerDomains: blockedRequests[currentActiveTabID],
        event: message.feedback,
        breakage: '',
        notes: ''
      }
      log('telemetry ping payload: ' + JSON.stringify(testPilotPingMessage))
      testPilotPingChannel.postMessage(testPilotPingMessage)
      reportedHosts[mainFrameOriginTopHosts[currentActiveTabID]] = message
      browser.storage.local.set({reportedHosts: reportedHosts})
      setWindowFrameVarsForPopup(currentActiveOrigin, allowedHosts, reportedHosts)
    }
    if (message.hasOwnProperty('breakage')) {
      let testPilotPingMessage = {
        originDomain: mainFrameOriginTopHosts[currentActiveTabID],
        trackerDomains: blockedRequests[currentActiveTabID],
        event: 'submit',
        breakage: message.breakage,
        notes: message.notes
      }
      log('telemetry ping payload: ' + JSON.stringify(testPilotPingMessage))
      testPilotPingChannel.postMessage(testPilotPingMessage)
    }
  })
}

function startListeners ({blocklist, allowedHosts, entityList, reportedHosts}, testPilotPingChannel) {
  startRequestListener(blocklist, allowedHosts, entityList)

  startWindowAndTabListeners(allowedHosts, reportedHosts)

  startMessageListener(allowedHosts, reportedHosts, testPilotPingChannel)
}

const state = {
  blocklist: new Map(),
  allowedHosts: [],
  reportedHosts: {},
  entityList: {}
}

function initTestPilotPingChannel ({BroadcastChannel}) {
  // let TESTPILOT_TELEMETRY_CHANNEL = 'testpilot-telemetry'
  let TESTPILOT_TELEMETRY_CHANNEL = 'blok-telemetry'
  let testPilotPingChannel = new BroadcastChannel(TESTPILOT_TELEMETRY_CHANNEL)
  return testPilotPingChannel
}

loadLists(state).then(() => {
  let testPilotPingChannel = initTestPilotPingChannel(window)
  startListeners(state, testPilotPingChannel)
}, console.error.bind(console))

/*
 * Draw pageAction icon with a text badge.
 */
function draw(enabled, counter) {
  let canvas = document.createElement("canvas")
  canvas.style.width = "16px"
  canvas.style.height = "16px"
  canvas.height = 32
  canvas.width = 32
  let context = canvas.getContext("2d")
  context.scale(2, 2)
  let img = document.createElement("img")
  img.src = "img/blok-8.png"

  if (enabled) {
    context.fillStyle = "rgba(0, 150, 0, 1)"
  } else {
    context.fillStyle = "rgba(300, 200, 0, 1)"
  }

  context.fillRect(0, 0, 32, 32)
  context.drawImage(img, 1, 1)
  context.fillStyle = "white"
  context.font = "8px Arial"
  if (counter) {
    context.fillText(counter, 6, 14)
  }
  return context.getImageData(0, 0, 32, 32)
}

},{"./canonicalize":3,"./lists":4,"./log":5,"./requests":6}],3:[function(require,module,exports){
var ip4DecimalPattern = '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))$'
var ip4HexPattern = '^(?:(?:0x[0-9a-f]{1,2}).){3}(?:0x[0-9a-f]{1,2})$'
var ip4OctalPattern = '^(?:(?:03[1-7][0-7]|0[12][0-7]{1,2}|[0-7]{1,2}).){3}(?:03[1-7][0-7]|0[12][0-7]{1,2}|[0-7]{1,2})$'

// like trim() helper from underscore.string:
// trims chars from beginning and end of str
function trim (str, chars) {
  // escape any regexp chars
  chars = chars.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1')
  return str.replace(new RegExp('^' + chars + '+|' + chars + '+$', 'g'), '')
}

// https://developers.google.com/safe-browsing/v4/urls-hashing#canonicalization
function canonicalizeHost (host) {
  // Remove all leading and trailing dots
  var canonicalizedHost = trim(host, '.')

  // Replace consecutive dots with a single dot
  canonicalizedHost = canonicalizedHost.replace(new RegExp('[.]+', 'g'), '.')

  // If the hostname can be parsed as an IP address,
  // normalize it to 4 dot-separated decimal values.
  // The client should handle any legal IP-address encoding,
  // including octal, hex, and TODO: fewer than four components
  var base = 10
  var isIP4Decimal, isIP4Hex, isIP4Octal

  isIP4Decimal = canonicalizedHost.match(ip4DecimalPattern) != null
  isIP4Hex = canonicalizedHost.match(ip4HexPattern) != null
  isIP4Octal = canonicalizedHost.match(ip4OctalPattern) != null
  if (isIP4Decimal || isIP4Hex || isIP4Octal) {
    if (isIP4Hex) {
      base = 16
    } else if (isIP4Octal) {
      base = 8
    }
    canonicalizedHost = canonicalizedHost.split('.').map(num => parseInt(num, base)).join('.')
  }

  // Lowercase the whole string
  canonicalizedHost = canonicalizedHost.toLowerCase()
  return canonicalizedHost
}

module.exports = {
  canonicalizeHost,
  trim
}

},{}],4:[function(require,module,exports){
function allHosts (host) {
  const allHosts = []
  const hostParts = host.split('.')
  while (hostParts.length > 1) {
    allHosts.push(hostParts.join('.'))
    hostParts.splice(0, 1)
  }
  return allHosts
}

function loadLists (state) {
  const blockListPromise = loadJSON('js/disconnect-blocklist.json').then((data) => {
    state.blocklist = processBlockListJSON(data)
  })

  const entityListPromise = loadJSON('js/disconnect-entitylist.json').then((data) => {
    state.entityList = data
  })

  const allowedHostsPromise = getAllowedHostsList().then((allowedHosts) => {
    state.allowedHosts = allowedHosts
  })

  const reportedHostsPromise = getReportedHostsList().then((reportedHosts) => {
    state.reportedHosts = reportedHosts
  })

  return Promise.all([blockListPromise, entityListPromise, allowedHostsPromise, reportedHostsPromise])
}

function loadJSON (url) {
  return fetch(url)
    .then((res) => res.json())
}

function processBlockListJSON (data) {
  const blocklist = new Map()

  // remove un-needed categories per disconnect
  delete data.categories['Content']
  delete data.categories['Legacy Disconnect']
  delete data.categories['Legacy Content']

  // parse thru the disconnect blocklist and create
  // local blocklist "grouped" by main domain. I.e.,
  // blocklist["facebook.com"] = http://www.facebook.com
  // blocklist["fb.com"] = http://www.facebook.com
  // blocklist["doubleclick.net"] = http://www.google.com
  // blocklist["google-analytics.com"] = http://www.google.com
  // etc.
  for (let categoryName in data.categories) {
    var category = data.categories[categoryName]
    var entityCount = category.length

    for (var i = 0; i < entityCount; i++) {
      var entity = category[i]

      for (let entityName in entity) {
        var urls = entity[entityName]

        for (let mainDomain in urls) {
          blocklist.set(mainDomain, [])
          var domains = urls[mainDomain]
          var domainsCount = domains.length

          for (let j = 0; j < domainsCount; j++) {
            blocklist.set(domains[j], mainDomain)
          }
        }
      }
    }
  }

  return blocklist
}

function getAllowedHostsList () {
  return browser.storage.local.get('allowedHosts').then((item) => {
    if (item.allowedHosts) {
      return item.allowedHosts
    }
    return []
  })
}

function getReportedHostsList () {
  return browser.storage.local.get('reportedHosts').then((item) => {
    if (item.reportedHosts) {
      return item.reportedHosts
    }
    return {}
  })
}

// check if any host from lowest-level to top-level is in the blocklist
function hostInBlocklist (blocklist, host) {
  let requestHostInBlocklist = false
  var allHostVariants = allHosts(host)
  for (let hostVariant of allHostVariants) {
    requestHostInBlocklist = blocklist.has(hostVariant)
    if (requestHostInBlocklist) {
      return true
    }
  }
  return false
}

// check if any host from lowest-level to top-level is in the entitylist
function hostInEntity (entityHosts, host) {
  let entityHost = false
  for (let hostVariant of allHosts(host)) {
    entityHost = entityHosts.indexOf(hostVariant) > -1
    if (entityHost) {
      return true
    }
  }
  return false
}

module.exports = {
  allHosts,
  loadLists,
  processBlockListJSON,
  hostInBlocklist,
  hostInEntity
}

},{}],5:[function(require,module,exports){
(function (process){
if (process.env.MODE === 'production') {
  exports.log = function noop () {}
} else {
  exports.log = console.log.bind(console)
}

}).call(this,require('_process'))

},{"_process":1}],6:[function(require,module,exports){
const {log} = require('./log')
const {hostInEntity} = require('./lists')

let hostEntityCache = {}

function requestAllower (tabID, totalExecTime, startDateTime) {
  totalExecTime[tabID] += Date.now() - startDateTime
  return {}
}

function getRequestEntity (entityList, originTopHost, requestTopHost, mainFrameOriginTopHost) {
  let requestEntity = {'entityName': null, 'sameEntity': false}

  // First, try to return everything from memo-ized cache
  let requestEntityName = hostEntityCache[requestTopHost]
  let originEntityName = hostEntityCache[originTopHost]
  let mainFrameOriginEntityName = hostEntityCache[mainFrameOriginTopHost]
  requestEntity.sameEntity = (
    requestEntityName && (
      requestEntityName === originEntityName || requestEntityName === mainFrameOriginEntityName
    )
  )
  if (requestEntity.sameEntity) {
    requestEntity.entityName = requestEntityName
    log('returning from memo-ized cache: ', requestEntity)
    return requestEntity
  }

  // If a host was not found in the memo-ized cache, check thru the entityList
  for (let entityName in entityList) {
    let entity = entityList[entityName]
    let requestIsEntityResource = false
    let originIsEntityProperty = false
    let mainFrameOriginIsEntityProperty = false

    requestIsEntityResource = hostInEntity(entity.resources, requestTopHost)
    if (requestIsEntityResource) {
      requestEntity.entityName = entityName
      hostEntityCache[requestTopHost] = entityName
    }

    originIsEntityProperty = hostInEntity(entity.properties, originTopHost)
    if (originIsEntityProperty) {
      hostEntityCache[originTopHost] = entityName
    }

    mainFrameOriginIsEntityProperty = hostInEntity(entity.properties, mainFrameOriginTopHost)
    if (mainFrameOriginIsEntityProperty) {
      hostEntityCache[mainFrameOriginTopHost] = entityName
    }

    if ((originIsEntityProperty || mainFrameOriginIsEntityProperty) && requestIsEntityResource) {
      log(`originTopHost ${originTopHost} and resource requestTopHost ${requestTopHost} belong to the same entity: ${entityName}; allowing request`)
      requestEntity.sameEntity = true
      break
    }
  }
  // TODO: https://github.com/mozilla/blok/issues/110
  return requestEntity
}

module.exports = {
  requestAllower,
  getRequestEntity
}

},{"./lists":4,"./log":5}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwic3JjL2pzL2JhY2tncm91bmQuanMiLCJzcmMvanMvY2Fub25pY2FsaXplLmpzIiwic3JjL2pzL2xpc3RzLmpzIiwic3JjL2pzL2xvZy5qcyIsInNyYy9qcy9yZXF1ZXN0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsImNvbnN0IHtjYW5vbmljYWxpemVIb3N0fSA9IHJlcXVpcmUoJy4vY2Fub25pY2FsaXplJylcbmNvbnN0IHtsb2FkTGlzdHMsIGhvc3RJbkJsb2NrbGlzdH0gPSByZXF1aXJlKCcuL2xpc3RzJylcbmNvbnN0IHtyZXF1ZXN0QWxsb3dlciwgZ2V0UmVxdWVzdEVudGl0eX0gPSByZXF1aXJlKCcuL3JlcXVlc3RzJylcbmNvbnN0IHtsb2d9ID0gcmVxdWlyZSgnLi9sb2cnKVxuXG4vLyBTZXQgc29tZSBleHBsaWNpdCB3aW5kb3cgdmFyaWFibGUgZm9yIHBhZ2VBY3Rpb24gdG8gYWNjZXNzXG53aW5kb3cudG9wRnJhbWVIb3N0RGlzYWJsZWQgPSBmYWxzZVxud2luZG93LnRvcEZyYW1lSG9zdFJlcG9ydCA9IHt9XG53aW5kb3cuYmxvY2tlZFJlcXVlc3RzID0ge31cbndpbmRvdy5ibG9ja2VkRW50aXRpZXMgPSB7fVxud2luZG93LmFsbG93ZWRSZXF1ZXN0cyA9IHt9XG53aW5kb3cuYWxsb3dlZEVudGl0aWVzID0ge31cbndpbmRvdy5zZXNzaW9uVVJJQ291bnQgPSAwXG53aW5kb3cudG90YWxQYWdlTG9hZFRpbWUgPSAwXG53aW5kb3cuY3VycmVudFBhZ2VMb2FkVGltZSA9IDBcbndpbmRvdy5jdXJyZW50UGFnZUxvYWRTdGFydCA9IERhdGUubm93KClcbndpbmRvdy50b3RhbEJsb2NrZWRSZXF1ZXN0cyA9IDBcbndpbmRvdy50b3RhbEJsb2NrZWRTaXRlcyA9IDBcbndpbmRvdy50b3RhbEJsb2NrZWRFbnRpdGllcyA9IDBcblxudmFyIHByaXZhdGVCcm93c2luZ01vZGUgPSBmYWxzZVxudmFyIGN1cnJlbnRBY3RpdmVUYWJJRFxudmFyIGN1cnJlbnRBY3RpdmVPcmlnaW5cbnZhciB0b3RhbEV4ZWNUaW1lID0ge31cbnZhciBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZCA9IHt9XG52YXIgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHMgPSB7fVxudmFyIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSAtMVxuXG5mdW5jdGlvbiByZXN0YXJ0Qmxva0ZvclRhYiAodGFiSUQpIHtcbiAgYmxvY2tlZFJlcXVlc3RzW3RhYklEXSA9IFtdXG4gIGJsb2NrZWRFbnRpdGllc1t0YWJJRF0gPSBbXVxuICBhbGxvd2VkUmVxdWVzdHNbdGFiSURdID0gW11cbiAgYWxsb3dlZEVudGl0aWVzW3RhYklEXSA9IFtdXG4gIHRvdGFsRXhlY1RpbWVbdGFiSURdID0gMFxuICBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1t0YWJJRF0gPSBudWxsXG4gIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkW3RhYklEXSA9IGZhbHNlXG59XG5cbmZ1bmN0aW9uIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwICh0b3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpIHtcbiAgaWYgKGlzT3JpZ2luRGlzYWJsZWQodG9wSG9zdCwgYWxsb3dlZEhvc3RzKSkge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IHRydWVcbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0RGlzYWJsZWQgPSBmYWxzZVxuICB9XG4gIGlmIChyZXBvcnRlZEhvc3RzLmhhc093blByb3BlcnR5KHRvcEhvc3QpKSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdFJlcG9ydCA9IHJlcG9ydGVkSG9zdHNbdG9wSG9zdF1cbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0ge31cbiAgfVxufVxuXG5mdW5jdGlvbiBpc09yaWdpbkRpc2FibGVkIChob3N0LCBhbGxvd2VkSG9zdHMpIHtcbiAgcmV0dXJuIGFsbG93ZWRIb3N0cy5pbmRleE9mKGhvc3QpID4gLTFcbn1cblxuZnVuY3Rpb24gYmxvY2tUcmFja2VyUmVxdWVzdHMgKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KSB7XG4gIHJldHVybiBmdW5jdGlvbiBmaWx0ZXJSZXF1ZXN0IChyZXF1ZXN0RGV0YWlscykge1xuICAgIGlmICghd2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkKSB7XG4gICAgICB3aW5kb3cuc2Vzc2lvblVSSUNvdW50KytcbiAgICAgIHdpbmRvdy5jdXJyZW50UGFnZUxvYWRTdGFydCA9IERhdGUubm93KClcbiAgICB9XG5cbiAgICB2YXIgYmxvY2tUcmFja2VyUmVxdWVzdHNTdGFydCA9IERhdGUubm93KClcbiAgICB2YXIgcmVxdWVzdFRhYklEID0gcmVxdWVzdERldGFpbHMudGFiSWRcbiAgICB2YXIgb3JpZ2luVG9wSG9zdFxuICAgIHZhciByZXF1ZXN0VG9wSG9zdFxuICAgIHZhciByZXF1ZXN0RW50aXR5XG5cbiAgICB2YXIgZmxhZ3MgPSB7XG4gICAgICBtYWluT3JpZ2luRGlzYWJsZWQ6IGZhbHNlLFxuICAgICAgZmlyZWZveE9yaWdpbjogZmFsc2UsXG4gICAgICBuZXdPcmlnaW46IGZhbHNlLFxuICAgICAgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdDogZmFsc2UsXG4gICAgICByZXF1ZXN0SXNUaGlyZFBhcnR5OiBmYWxzZSxcbiAgICAgIHJlcXVlc3RIb3N0TWF0Y2hlc01haW5GcmFtZTogZmFsc2VcbiAgICB9XG5cbiAgICB2YXIgYWxsb3dSZXF1ZXN0ID0gcmVxdWVzdEFsbG93ZXIuYmluZChudWxsLCByZXF1ZXN0VGFiSUQsIHRvdGFsRXhlY1RpbWUsIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnQpXG5cbiAgICBpZiAocHJpdmF0ZUJyb3dzaW5nTW9kZSkge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGluIHByaXZhdGUgYnJvd3NpbmcgbW9kZSB3aW5kb3c7IFBCTSBUUCB3aWxsIGNhdGNoIHRoZW0uJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgcmVxdWVzdERldGFpbHMub3JpZ2luVXJsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gXCJ1bmRlZmluZWRcIiBvcmlnaW4gLSBhIGJyb3dzZXIgaW50ZXJuYWwgb3JpZ2luLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgYWxsIG9yaWdpbiBmbGFnc1xuICAgIG9yaWdpblRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwocmVxdWVzdERldGFpbHMub3JpZ2luVXJsKS5ob3N0KVxuICAgIGN1cnJlbnRBY3RpdmVPcmlnaW4gPSBvcmlnaW5Ub3BIb3N0XG5cbiAgICBmbGFncy5maXJlZm94T3JpZ2luID0gKHR5cGVvZiBvcmlnaW5Ub3BIb3N0ICE9PSAndW5kZWZpbmVkJyAmJiBvcmlnaW5Ub3BIb3N0LmluY2x1ZGVzKCdtb3otbnVsbHByaW5jaXBhbCcpKVxuICAgIGZsYWdzLm5ld09yaWdpbiA9IG9yaWdpblRvcEhvc3QgPT09ICcnXG4gICAgaWYgKGZsYWdzLmZpcmVmb3hPcmlnaW4gfHwgZmxhZ3MubmV3T3JpZ2luKSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgZnJvbSBGaXJlZm94IGFuZC9vciBuZXcgdGFiL3dpbmRvdyBvcmlnaW5zLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICAvLyBTZXQgbWFpbiAmIHRvcCBmcmFtZSB2YWx1ZXMgaWYgZnJhbWVJZCA9PT0gMFxuICAgIGlmIChyZXF1ZXN0RGV0YWlscy5mcmFtZUlkID09PSAwKSB7XG4gICAgICBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tyZXF1ZXN0VGFiSURdID0gb3JpZ2luVG9wSG9zdFxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKG9yaWdpblRvcEhvc3QpXG4gICAgICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFtyZXF1ZXN0VGFiSURdID0gbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA+IC0xXG4gICAgfVxuXG4gICAgcmVxdWVzdFRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwocmVxdWVzdERldGFpbHMudXJsKS5ob3N0KVxuXG4gICAgaWYgKG1haW5GcmFtZU9yaWdpbkRpc2FibGVkW3JlcXVlc3RUYWJJRF0pIHtcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IHJlcXVlc3RUYWJJRCxcbiAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KGZhbHNlLCAwKVxuICAgICAgfSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zaG93KHJlcXVlc3RUYWJJRClcblxuICAgICAgaWYgKGhvc3RJbkJsb2NrbGlzdChibG9ja2xpc3QsIHJlcXVlc3RUb3BIb3N0KSkge1xuICAgICAgICBhbGxvd2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RUb3BIb3N0KVxuICAgICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgICAgdGFiSWQ6IHRhYklELFxuICAgICAgICAgIGltYWdlRGF0YTogZHJhdyghdG9wRnJhbWVIb3N0RGlzYWJsZWQsIGFsbG93ZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbi8qXG4gICAgICBpZiAoYWxsb3dlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0uaW5kZXhPZihyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpID09PSAtMSkge1xuICAgICAgICBhbGxvd2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSlcbiAgICAgIH1cbiovXG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgZnJvbSBvcmlnaW4gZm9yIHdoaWNoIEJsb2sgaXMgZGlzYWJsZWQuJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0RGV0YWlscy50eXBlID09PSAnbWFpbl9mcmFtZScpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgY2xpY2tzIHRvIGxpbmtzLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBmbGFncy5yZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gaG9zdEluQmxvY2tsaXN0KGJsb2NrbGlzdCwgcmVxdWVzdFRvcEhvc3QpXG5cbiAgICBpZiAoIWZsYWdzLnJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCB0byBkb21haW4gTk9UIGluIHRoZSBibG9jay1saXN0LicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICByZXF1ZXN0RW50aXR5ID0gZ2V0UmVxdWVzdEVudGl0eShlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgb3JpZ2luVG9wSG9zdClcbiAgICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgdG8gYmxvY2stbGlzdCBkb21haW4gdGhhdCBiZWxvbmdzIHRvIHNhbWUgZW50aXR5IGFzIG9yaWdpbiBkb21haW4uJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkgPSByZXF1ZXN0VG9wSG9zdCAhPT0gb3JpZ2luVG9wSG9zdFxuXG4gICAgaWYgKGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkpIHtcbiAgICAgIGZsYWdzLnJlcXVlc3RIb3N0TWF0Y2hlc01haW5GcmFtZSA9IChyZXF1ZXN0RGV0YWlscy5mcmFtZUlkID4gMCAmJiByZXF1ZXN0VG9wSG9zdCA9PT0gbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSlcbiAgICAgIGlmIChmbGFncy5yZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWUpIHtcbiAgICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IHRvIGJsb2NrLWxpc3QgZG9tYWluIHRoYXQgbWF0Y2hlcyB0aGUgdG9wL21haW4gZnJhbWUgZG9tYWluLicpXG4gICAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgICAgfVxuXG4gICAgICBsb2coJ0Jsb2NraW5nIHJlcXVlc3Q6IG9yaWdpblRvcEhvc3Q6ICcsIG9yaWdpblRvcEhvc3QsICcgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdDogJywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSwgJyByZXF1ZXN0VG9wSG9zdDogJywgcmVxdWVzdFRvcEhvc3QsICcgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdDogJywgZmxhZ3MucmVxdWVzdEhvc3RJbkJsb2NrbGlzdClcbiAgICAgIGJsb2NrZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLnB1c2gocmVxdWVzdFRvcEhvc3QpXG4gICAgICB0b3RhbEJsb2NrZWRSZXF1ZXN0cysrXG4gICAgICBpZiAoYmxvY2tlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0uaW5kZXhPZihyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpID09PSAtMSkge1xuICAgICAgICBibG9ja2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSlcbiAgICAgICAgdG90YWxCbG9ja2VkRW50aXRpZXMrK1xuICAgICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgICAgdGFiSWQ6IHJlcXVlc3RUYWJJRCxcbiAgICAgICAgICBpbWFnZURhdGE6IGRyYXcoIXRvcEZyYW1lSG9zdERpc2FibGVkLCBibG9ja2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5sZW5ndGgpXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgICB0b3RhbEV4ZWNUaW1lW3JlcXVlc3RUYWJJRF0gKz0gRGF0ZS5ub3coKSAtIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnRcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zaG93KHJlcXVlc3RUYWJJRClcbiAgICAgIHJldHVybiB7Y2FuY2VsOiB0cnVlfVxuICAgIH1cblxuICAgIGxvZygnRGVmYXVsdCB0byBhbGxvd2luZyByZXF1ZXN0LicpXG4gICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhcnRSZXF1ZXN0TGlzdGVuZXIgKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KSB7XG4gIGxldCBmaWx0ZXIgPSB7dXJsczogWycqOi8vKi8qJ119XG5cbiAgYnJvd3Nlci53ZWJSZXF1ZXN0Lm9uQmVmb3JlUmVxdWVzdC5hZGRMaXN0ZW5lcihcbiAgICBibG9ja1RyYWNrZXJSZXF1ZXN0cyhibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCksXG4gICAgZmlsdGVyLFxuICAgIFsnYmxvY2tpbmcnXVxuICApXG5cbiAgYnJvd3Nlci53ZWJSZXF1ZXN0Lm9uQ29tcGxldGVkLmFkZExpc3RlbmVyKFxuICAgIChyZXF1ZXN0RGV0YWlscykgPT4ge1xuICAgICAgd2luZG93LmN1cnJlbnRQYWdlTG9hZFRpbWUgPSBEYXRlLm5vdygpIC0gd2luZG93LmN1cnJlbnRQYWdlTG9hZFN0YXJ0XG4gICAgICB3aW5kb3cudG90YWxQYWdlTG9hZFRpbWUgKz0gd2luZG93LmN1cnJlbnRQYWdlTG9hZFRpbWVcbiAgICAgIC8qIFNpbmNlIHdlIGNhbid0IHRpbWUgdGhlIGxvYWQgb2YgYmxvY2tlZCByZXNvdXJjZXMsIGFzc3VtZSB0aGF0IHRyYWNraW5nIHByb3RlY3Rpb25cbiAgICAgICAgIHNhdmVzIH40NCUgbG9hZCB0aW1lOlxuICAgICAgICAgaHR0cDovL2xpZmVoYWNrZXIuY29tL3R1cm4tb24tdHJhY2tpbmctcHJvdGVjdGlvbi1pbi1maXJlZm94LXRvLW1ha2UtcGFnZXMtbG8tMTcwNjk0NjE2NlxuICAgICAgKi9cbiAgICAgIGlmICh3aW5kb3cuc2Vzc2lvblVSSUNvdW50ICYmIHdpbmRvdy50b3RhbFBhZ2VMb2FkVGltZSkge1xuICAgICAgICBsZXQgdGltZVNhdmVkID0gKHdpbmRvdy50b3RhbFBhZ2VMb2FkVGltZSAvICgxIC0gLjQ0KSkgLSB3aW5kb3cudG90YWxQYWdlTG9hZFRpbWVcbiAgICAgICAgbGV0IG1lc3NhZ2UgPSB7XG4gICAgICAgICAgdGltZVNhdmVkOiB0aW1lU2F2ZWQsXG4gICAgICAgICAgYmxvY2tlZFJlcXVlc3RzOiB3aW5kb3cudG90YWxCbG9ja2VkUmVxdWVzdHMsXG4gICAgICAgICAgYmxvY2tlZFNpdGVzOiB3aW5kb3cudG90YWxCbG9ja2VkU2l0ZXMsXG4gICAgICAgICAgYmxvY2tlZEVudGl0aWVzOiB3aW5kb3cudG90YWxCbG9ja2VkRW50aXRpZXNcbiAgICAgICAgfVxuICAgICAgICBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICB9XG4gICAgfSxcbiAgICBmaWx0ZXJcbiAgKVxufVxuXG5mdW5jdGlvbiBzdGFydFdpbmRvd0FuZFRhYkxpc3RlbmVycyAoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKSB7XG4gIGJyb3dzZXIud2luZG93cy5vbkZvY3VzQ2hhbmdlZC5hZGRMaXN0ZW5lcigod2luZG93SUQpID0+IHtcbiAgICBicm93c2VyLndpbmRvd3MuZ2V0KHdpbmRvd0lELCB7fSwgKGZvY3VzZWRXaW5kb3cpID0+IHtcbiAgICAgIGlmIChmb2N1c2VkV2luZG93ICYmIGZvY3VzZWRXaW5kb3cuaW5jb2duaXRvKSB7XG4gICAgICAgIHByaXZhdGVCcm93c2luZ01vZGUgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwcml2YXRlQnJvd3NpbmdNb2RlID0gZmFsc2VcbiAgICAgIH1cbiAgICB9KVxuICAgIGxvZygnYnJvd3Nlci53aW5kb3dzLm9uRm9jdXNDaGFuZ2VkLCB3aW5kb3dJRDogJyArIHdpbmRvd0lEKVxuICAgIGJyb3dzZXIudGFicy5xdWVyeSh7YWN0aXZlOiB0cnVlLCB3aW5kb3dJZDogd2luZG93SUR9LCAodGFic0FycmF5KSA9PiB7XG4gICAgICBsZXQgdGFiID0gdGFic0FycmF5WzBdXG4gICAgICBpZiAoIXRhYilcbiAgICAgICAgcmV0dXJuXG5cbiAgICAgIGN1cnJlbnRBY3RpdmVUYWJJRCA9IHRhYi5pZFxuICAgICAgbGV0IHRhYlRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwodGFiLnVybCkuaG9zdClcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZih0YWJUb3BIb3N0KVxuICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAodGFiVG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgIH0pXG4gIH0pXG5cbiAgYnJvd3Nlci50YWJzLm9uQWN0aXZhdGVkLmFkZExpc3RlbmVyKGZ1bmN0aW9uIChhY3RpdmVJbmZvKSB7XG4gICAgY3VycmVudEFjdGl2ZVRhYklEID0gYWN0aXZlSW5mby50YWJJZFxuICAgIGJyb3dzZXIudGFicy5nZXQoY3VycmVudEFjdGl2ZVRhYklELCBmdW5jdGlvbiAodGFiKSB7XG4gICAgICBsZXQgdGFiVG9wSG9zdCA9IGNhbm9uaWNhbGl6ZUhvc3QobmV3IFVSTCh0YWIudXJsKS5ob3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKHRhYlRvcEhvc3QpXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCh0YWJUb3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfSlcbiAgfSlcblxuICBicm93c2VyLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKGZ1bmN0aW9uICh0YWJJRCwgY2hhbmdlSW5mbykge1xuICAgIGlmIChjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2xvYWRpbmcnKSB7XG4gICAgICByZXN0YXJ0Qmxva0ZvclRhYih0YWJJRClcbiAgICAgIGJyb3dzZXIudGFicy5nZXQoY3VycmVudEFjdGl2ZVRhYklELCBmdW5jdGlvbiAodGFiKSB7XG4gICAgICAgIGxldCB0YWJUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHRhYi51cmwpLmhvc3QpXG4gICAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKHRhYlRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICAgIH0pXG4gICAgfSBlbHNlIGlmIChjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgbG9nKCcqKioqKioqKiB0YWIgY2hhbmdlSW5mby5zdGF0dXMgY29tcGxldGUgKioqKioqKionKVxuICAgICAgaWYgKGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0pIHtcbiAgICAgICAgbG9nKCdibG9ja2VkICcgKyBibG9ja2VkUmVxdWVzdHNbdGFiSURdLmxlbmd0aCArICcgcmVxdWVzdHM6ICcsIGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0pXG4gICAgICAgIGxvZygnZnJvbSAnICsgYmxvY2tlZEVudGl0aWVzW3RhYklEXS5sZW5ndGggKyAnIGVudGl0aWVzOiAnLCBibG9ja2VkRW50aXRpZXNbdGFiSURdKVxuICAgICAgfVxuICAgICAgaWYgKGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0pIHtcbiAgICAgICAgbG9nKCdhbGxvd2VkICcgKyBhbGxvd2VkUmVxdWVzdHNbdGFiSURdLmxlbmd0aCArICcgcmVxdWVzdHM6ICcsIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0pXG4gICAgICAgIGxvZygnZnJvbSAnICsgYWxsb3dlZEVudGl0aWVzW3RhYklEXS5sZW5ndGggKyAnIGVudGl0aWVzOiAnLCBhbGxvd2VkRW50aXRpZXNbdGFiSURdKVxuICAgICAgfVxuICAgICAgbG9nKCd0b3RhbEV4ZWNUaW1lOiAnICsgdG90YWxFeGVjVGltZVt0YWJJRF0pXG4gICAgICBsb2coJyoqKioqKioqIHRhYiBjaGFuZ2VJbmZvLnN0YXR1cyBjb21wbGV0ZSAqKioqKioqKicpXG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBzdGFydE1lc3NhZ2VMaXN0ZW5lciAoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzLCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCkge1xuICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgaWYgKG1lc3NhZ2UgPT09ICdkaXNhYmxlJykge1xuICAgICAgbGV0IG1haW5GcmFtZU9yaWdpblRvcEhvc3QgPSBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ2Jsb2stZGlzYWJsZWQnLFxuICAgICAgICBicmVha2FnZTogJycsXG4gICAgICAgIG5vdGVzOiAnJ1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiBjdXJyZW50QWN0aXZlVGFiSUQsXG4gICAgICAgIGltYWdlRGF0YTogZHJhdyhmYWxzZSwgMClcbiAgICAgIH0pXG4gICAgICBhbGxvd2VkSG9zdHMucHVzaChtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7YWxsb3dlZEhvc3RzOiBhbGxvd2VkSG9zdHN9KVxuICAgICAgYnJvd3Nlci50YWJzLnJlbG9hZChjdXJyZW50QWN0aXZlVGFiSUQpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlID09PSAncmUtZW5hYmxlJykge1xuICAgICAgbGV0IG1haW5GcmFtZU9yaWdpblRvcEhvc3QgPSBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ2Jsb2stZW5hYmxlZCcsXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IGN1cnJlbnRBY3RpdmVUYWJJRCxcbiAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KHRydWUsIDApXG4gICAgICB9KVxuICAgICAgYWxsb3dlZEhvc3RzLnNwbGljZShtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4LCAxKVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7YWxsb3dlZEhvc3RzOiBhbGxvd2VkSG9zdHN9KVxuICAgICAgYnJvd3Nlci50YWJzLnJlbG9hZChjdXJyZW50QWN0aXZlVGFiSUQpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlLmhhc093blByb3BlcnR5KCdmZWVkYmFjaycpKSB7XG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogbWVzc2FnZS5mZWVkYmFjayxcbiAgICAgICAgYnJlYWthZ2U6ICcnLFxuICAgICAgICBub3RlczogJydcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgICAgcmVwb3J0ZWRIb3N0c1ttYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXSA9IG1lc3NhZ2VcbiAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe3JlcG9ydGVkSG9zdHM6IHJlcG9ydGVkSG9zdHN9KVxuICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAoY3VycmVudEFjdGl2ZU9yaWdpbiwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgIH1cbiAgICBpZiAobWVzc2FnZS5oYXNPd25Qcm9wZXJ0eSgnYnJlYWthZ2UnKSkge1xuICAgICAgbGV0IHRlc3RQaWxvdFBpbmdNZXNzYWdlID0ge1xuICAgICAgICBvcmlnaW5Eb21haW46IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIHRyYWNrZXJEb21haW5zOiBibG9ja2VkUmVxdWVzdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgZXZlbnQ6ICdzdWJtaXQnLFxuICAgICAgICBicmVha2FnZTogbWVzc2FnZS5icmVha2FnZSxcbiAgICAgICAgbm90ZXM6IG1lc3NhZ2Uubm90ZXNcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gc3RhcnRMaXN0ZW5lcnMgKHtibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCwgcmVwb3J0ZWRIb3N0c30sIHRlc3RQaWxvdFBpbmdDaGFubmVsKSB7XG4gIHN0YXJ0UmVxdWVzdExpc3RlbmVyKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KVxuXG4gIHN0YXJ0V2luZG93QW5kVGFiTGlzdGVuZXJzKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcblxuICBzdGFydE1lc3NhZ2VMaXN0ZW5lcihhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMsIHRlc3RQaWxvdFBpbmdDaGFubmVsKVxufVxuXG5jb25zdCBzdGF0ZSA9IHtcbiAgYmxvY2tsaXN0OiBuZXcgTWFwKCksXG4gIGFsbG93ZWRIb3N0czogW10sXG4gIHJlcG9ydGVkSG9zdHM6IHt9LFxuICBlbnRpdHlMaXN0OiB7fVxufVxuXG5mdW5jdGlvbiBpbml0VGVzdFBpbG90UGluZ0NoYW5uZWwgKHtCcm9hZGNhc3RDaGFubmVsfSkge1xuICAvLyBsZXQgVEVTVFBJTE9UX1RFTEVNRVRSWV9DSEFOTkVMID0gJ3Rlc3RwaWxvdC10ZWxlbWV0cnknXG4gIGxldCBURVNUUElMT1RfVEVMRU1FVFJZX0NIQU5ORUwgPSAnYmxvay10ZWxlbWV0cnknXG4gIGxldCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCA9IG5ldyBCcm9hZGNhc3RDaGFubmVsKFRFU1RQSUxPVF9URUxFTUVUUllfQ0hBTk5FTClcbiAgcmV0dXJuIHRlc3RQaWxvdFBpbmdDaGFubmVsXG59XG5cbmxvYWRMaXN0cyhzdGF0ZSkudGhlbigoKSA9PiB7XG4gIGxldCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCA9IGluaXRUZXN0UGlsb3RQaW5nQ2hhbm5lbCh3aW5kb3cpXG4gIHN0YXJ0TGlzdGVuZXJzKHN0YXRlLCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbClcbn0sIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKSlcblxuLypcbiAqIERyYXcgcGFnZUFjdGlvbiBpY29uIHdpdGggYSB0ZXh0IGJhZGdlLlxuICovXG5mdW5jdGlvbiBkcmF3KGVuYWJsZWQsIGNvdW50ZXIpIHtcbiAgbGV0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIilcbiAgY2FudmFzLnN0eWxlLndpZHRoID0gXCIxNnB4XCJcbiAgY2FudmFzLnN0eWxlLmhlaWdodCA9IFwiMTZweFwiXG4gIGNhbnZhcy5oZWlnaHQgPSAzMlxuICBjYW52YXMud2lkdGggPSAzMlxuICBsZXQgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIilcbiAgY29udGV4dC5zY2FsZSgyLCAyKVxuICBsZXQgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKVxuICBpbWcuc3JjID0gXCJpbWcvYmxvay04LnBuZ1wiXG5cbiAgaWYgKGVuYWJsZWQpIHtcbiAgICBjb250ZXh0LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAxNTAsIDAsIDEpXCJcbiAgfSBlbHNlIHtcbiAgICBjb250ZXh0LmZpbGxTdHlsZSA9IFwicmdiYSgzMDAsIDIwMCwgMCwgMSlcIlxuICB9XG5cbiAgY29udGV4dC5maWxsUmVjdCgwLCAwLCAzMiwgMzIpXG4gIGNvbnRleHQuZHJhd0ltYWdlKGltZywgMSwgMSlcbiAgY29udGV4dC5maWxsU3R5bGUgPSBcIndoaXRlXCJcbiAgY29udGV4dC5mb250ID0gXCI4cHggQXJpYWxcIlxuICBpZiAoY291bnRlcikge1xuICAgIGNvbnRleHQuZmlsbFRleHQoY291bnRlciwgNiwgMTQpXG4gIH1cbiAgcmV0dXJuIGNvbnRleHQuZ2V0SW1hZ2VEYXRhKDAsIDAsIDMyLCAzMilcbn1cbiIsInZhciBpcDREZWNpbWFsUGF0dGVybiA9ICdeKD86KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/KS4pezN9KD86KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/KSkkJ1xudmFyIGlwNEhleFBhdHRlcm4gPSAnXig/Oig/OjB4WzAtOWEtZl17MSwyfSkuKXszfSg/OjB4WzAtOWEtZl17MSwyfSkkJ1xudmFyIGlwNE9jdGFsUGF0dGVybiA9ICdeKD86KD86MDNbMS03XVswLTddfDBbMTJdWzAtN117MSwyfXxbMC03XXsxLDJ9KS4pezN9KD86MDNbMS03XVswLTddfDBbMTJdWzAtN117MSwyfXxbMC03XXsxLDJ9KSQnXG5cbi8vIGxpa2UgdHJpbSgpIGhlbHBlciBmcm9tIHVuZGVyc2NvcmUuc3RyaW5nOlxuLy8gdHJpbXMgY2hhcnMgZnJvbSBiZWdpbm5pbmcgYW5kIGVuZCBvZiBzdHJcbmZ1bmN0aW9uIHRyaW0gKHN0ciwgY2hhcnMpIHtcbiAgLy8gZXNjYXBlIGFueSByZWdleHAgY2hhcnNcbiAgY2hhcnMgPSBjaGFycy5yZXBsYWNlKC8oWy4qKz9ePSE6JHt9KCl8W1xcXVxcL1xcXFxdKS9nLCAnXFxcXCQxJylcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKG5ldyBSZWdFeHAoJ14nICsgY2hhcnMgKyAnK3wnICsgY2hhcnMgKyAnKyQnLCAnZycpLCAnJylcbn1cblxuLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2FmZS1icm93c2luZy92NC91cmxzLWhhc2hpbmcjY2Fub25pY2FsaXphdGlvblxuZnVuY3Rpb24gY2Fub25pY2FsaXplSG9zdCAoaG9zdCkge1xuICAvLyBSZW1vdmUgYWxsIGxlYWRpbmcgYW5kIHRyYWlsaW5nIGRvdHNcbiAgdmFyIGNhbm9uaWNhbGl6ZWRIb3N0ID0gdHJpbShob3N0LCAnLicpXG5cbiAgLy8gUmVwbGFjZSBjb25zZWN1dGl2ZSBkb3RzIHdpdGggYSBzaW5nbGUgZG90XG4gIGNhbm9uaWNhbGl6ZWRIb3N0ID0gY2Fub25pY2FsaXplZEhvc3QucmVwbGFjZShuZXcgUmVnRXhwKCdbLl0rJywgJ2cnKSwgJy4nKVxuXG4gIC8vIElmIHRoZSBob3N0bmFtZSBjYW4gYmUgcGFyc2VkIGFzIGFuIElQIGFkZHJlc3MsXG4gIC8vIG5vcm1hbGl6ZSBpdCB0byA0IGRvdC1zZXBhcmF0ZWQgZGVjaW1hbCB2YWx1ZXMuXG4gIC8vIFRoZSBjbGllbnQgc2hvdWxkIGhhbmRsZSBhbnkgbGVnYWwgSVAtYWRkcmVzcyBlbmNvZGluZyxcbiAgLy8gaW5jbHVkaW5nIG9jdGFsLCBoZXgsIGFuZCBUT0RPOiBmZXdlciB0aGFuIGZvdXIgY29tcG9uZW50c1xuICB2YXIgYmFzZSA9IDEwXG4gIHZhciBpc0lQNERlY2ltYWwsIGlzSVA0SGV4LCBpc0lQNE9jdGFsXG5cbiAgaXNJUDREZWNpbWFsID0gY2Fub25pY2FsaXplZEhvc3QubWF0Y2goaXA0RGVjaW1hbFBhdHRlcm4pICE9IG51bGxcbiAgaXNJUDRIZXggPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDRIZXhQYXR0ZXJuKSAhPSBudWxsXG4gIGlzSVA0T2N0YWwgPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDRPY3RhbFBhdHRlcm4pICE9IG51bGxcbiAgaWYgKGlzSVA0RGVjaW1hbCB8fCBpc0lQNEhleCB8fCBpc0lQNE9jdGFsKSB7XG4gICAgaWYgKGlzSVA0SGV4KSB7XG4gICAgICBiYXNlID0gMTZcbiAgICB9IGVsc2UgaWYgKGlzSVA0T2N0YWwpIHtcbiAgICAgIGJhc2UgPSA4XG4gICAgfVxuICAgIGNhbm9uaWNhbGl6ZWRIb3N0ID0gY2Fub25pY2FsaXplZEhvc3Quc3BsaXQoJy4nKS5tYXAobnVtID0+IHBhcnNlSW50KG51bSwgYmFzZSkpLmpvaW4oJy4nKVxuICB9XG5cbiAgLy8gTG93ZXJjYXNlIHRoZSB3aG9sZSBzdHJpbmdcbiAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC50b0xvd2VyQ2FzZSgpXG4gIHJldHVybiBjYW5vbmljYWxpemVkSG9zdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY2Fub25pY2FsaXplSG9zdCxcbiAgdHJpbVxufVxuIiwiZnVuY3Rpb24gYWxsSG9zdHMgKGhvc3QpIHtcbiAgY29uc3QgYWxsSG9zdHMgPSBbXVxuICBjb25zdCBob3N0UGFydHMgPSBob3N0LnNwbGl0KCcuJylcbiAgd2hpbGUgKGhvc3RQYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgYWxsSG9zdHMucHVzaChob3N0UGFydHMuam9pbignLicpKVxuICAgIGhvc3RQYXJ0cy5zcGxpY2UoMCwgMSlcbiAgfVxuICByZXR1cm4gYWxsSG9zdHNcbn1cblxuZnVuY3Rpb24gbG9hZExpc3RzIChzdGF0ZSkge1xuICBjb25zdCBibG9ja0xpc3RQcm9taXNlID0gbG9hZEpTT04oJ2pzL2Rpc2Nvbm5lY3QtYmxvY2tsaXN0Lmpzb24nKS50aGVuKChkYXRhKSA9PiB7XG4gICAgc3RhdGUuYmxvY2tsaXN0ID0gcHJvY2Vzc0Jsb2NrTGlzdEpTT04oZGF0YSlcbiAgfSlcblxuICBjb25zdCBlbnRpdHlMaXN0UHJvbWlzZSA9IGxvYWRKU09OKCdqcy9kaXNjb25uZWN0LWVudGl0eWxpc3QuanNvbicpLnRoZW4oKGRhdGEpID0+IHtcbiAgICBzdGF0ZS5lbnRpdHlMaXN0ID0gZGF0YVxuICB9KVxuXG4gIGNvbnN0IGFsbG93ZWRIb3N0c1Byb21pc2UgPSBnZXRBbGxvd2VkSG9zdHNMaXN0KCkudGhlbigoYWxsb3dlZEhvc3RzKSA9PiB7XG4gICAgc3RhdGUuYWxsb3dlZEhvc3RzID0gYWxsb3dlZEhvc3RzXG4gIH0pXG5cbiAgY29uc3QgcmVwb3J0ZWRIb3N0c1Byb21pc2UgPSBnZXRSZXBvcnRlZEhvc3RzTGlzdCgpLnRoZW4oKHJlcG9ydGVkSG9zdHMpID0+IHtcbiAgICBzdGF0ZS5yZXBvcnRlZEhvc3RzID0gcmVwb3J0ZWRIb3N0c1xuICB9KVxuXG4gIHJldHVybiBQcm9taXNlLmFsbChbYmxvY2tMaXN0UHJvbWlzZSwgZW50aXR5TGlzdFByb21pc2UsIGFsbG93ZWRIb3N0c1Byb21pc2UsIHJlcG9ydGVkSG9zdHNQcm9taXNlXSlcbn1cblxuZnVuY3Rpb24gbG9hZEpTT04gKHVybCkge1xuICByZXR1cm4gZmV0Y2godXJsKVxuICAgIC50aGVuKChyZXMpID0+IHJlcy5qc29uKCkpXG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NCbG9ja0xpc3RKU09OIChkYXRhKSB7XG4gIGNvbnN0IGJsb2NrbGlzdCA9IG5ldyBNYXAoKVxuXG4gIC8vIHJlbW92ZSB1bi1uZWVkZWQgY2F0ZWdvcmllcyBwZXIgZGlzY29ubmVjdFxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydDb250ZW50J11cbiAgZGVsZXRlIGRhdGEuY2F0ZWdvcmllc1snTGVnYWN5IERpc2Nvbm5lY3QnXVxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydMZWdhY3kgQ29udGVudCddXG5cbiAgLy8gcGFyc2UgdGhydSB0aGUgZGlzY29ubmVjdCBibG9ja2xpc3QgYW5kIGNyZWF0ZVxuICAvLyBsb2NhbCBibG9ja2xpc3QgXCJncm91cGVkXCIgYnkgbWFpbiBkb21haW4uIEkuZS4sXG4gIC8vIGJsb2NrbGlzdFtcImZhY2Vib29rLmNvbVwiXSA9IGh0dHA6Ly93d3cuZmFjZWJvb2suY29tXG4gIC8vIGJsb2NrbGlzdFtcImZiLmNvbVwiXSA9IGh0dHA6Ly93d3cuZmFjZWJvb2suY29tXG4gIC8vIGJsb2NrbGlzdFtcImRvdWJsZWNsaWNrLm5ldFwiXSA9IGh0dHA6Ly93d3cuZ29vZ2xlLmNvbVxuICAvLyBibG9ja2xpc3RbXCJnb29nbGUtYW5hbHl0aWNzLmNvbVwiXSA9IGh0dHA6Ly93d3cuZ29vZ2xlLmNvbVxuICAvLyBldGMuXG4gIGZvciAobGV0IGNhdGVnb3J5TmFtZSBpbiBkYXRhLmNhdGVnb3JpZXMpIHtcbiAgICB2YXIgY2F0ZWdvcnkgPSBkYXRhLmNhdGVnb3JpZXNbY2F0ZWdvcnlOYW1lXVxuICAgIHZhciBlbnRpdHlDb3VudCA9IGNhdGVnb3J5Lmxlbmd0aFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbnRpdHlDb3VudDsgaSsrKSB7XG4gICAgICB2YXIgZW50aXR5ID0gY2F0ZWdvcnlbaV1cblxuICAgICAgZm9yIChsZXQgZW50aXR5TmFtZSBpbiBlbnRpdHkpIHtcbiAgICAgICAgdmFyIHVybHMgPSBlbnRpdHlbZW50aXR5TmFtZV1cblxuICAgICAgICBmb3IgKGxldCBtYWluRG9tYWluIGluIHVybHMpIHtcbiAgICAgICAgICBibG9ja2xpc3Quc2V0KG1haW5Eb21haW4sIFtdKVxuICAgICAgICAgIHZhciBkb21haW5zID0gdXJsc1ttYWluRG9tYWluXVxuICAgICAgICAgIHZhciBkb21haW5zQ291bnQgPSBkb21haW5zLmxlbmd0aFxuXG4gICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkb21haW5zQ291bnQ7IGorKykge1xuICAgICAgICAgICAgYmxvY2tsaXN0LnNldChkb21haW5zW2pdLCBtYWluRG9tYWluKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBibG9ja2xpc3Rcbn1cblxuZnVuY3Rpb24gZ2V0QWxsb3dlZEhvc3RzTGlzdCAoKSB7XG4gIHJldHVybiBicm93c2VyLnN0b3JhZ2UubG9jYWwuZ2V0KCdhbGxvd2VkSG9zdHMnKS50aGVuKChpdGVtKSA9PiB7XG4gICAgaWYgKGl0ZW0uYWxsb3dlZEhvc3RzKSB7XG4gICAgICByZXR1cm4gaXRlbS5hbGxvd2VkSG9zdHNcbiAgICB9XG4gICAgcmV0dXJuIFtdXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGdldFJlcG9ydGVkSG9zdHNMaXN0ICgpIHtcbiAgcmV0dXJuIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5nZXQoJ3JlcG9ydGVkSG9zdHMnKS50aGVuKChpdGVtKSA9PiB7XG4gICAgaWYgKGl0ZW0ucmVwb3J0ZWRIb3N0cykge1xuICAgICAgcmV0dXJuIGl0ZW0ucmVwb3J0ZWRIb3N0c1xuICAgIH1cbiAgICByZXR1cm4ge31cbiAgfSlcbn1cblxuLy8gY2hlY2sgaWYgYW55IGhvc3QgZnJvbSBsb3dlc3QtbGV2ZWwgdG8gdG9wLWxldmVsIGlzIGluIHRoZSBibG9ja2xpc3RcbmZ1bmN0aW9uIGhvc3RJbkJsb2NrbGlzdCAoYmxvY2tsaXN0LCBob3N0KSB7XG4gIGxldCByZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gZmFsc2VcbiAgdmFyIGFsbEhvc3RWYXJpYW50cyA9IGFsbEhvc3RzKGhvc3QpXG4gIGZvciAobGV0IGhvc3RWYXJpYW50IG9mIGFsbEhvc3RWYXJpYW50cykge1xuICAgIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QgPSBibG9ja2xpc3QuaGFzKGhvc3RWYXJpYW50KVxuICAgIGlmIChyZXF1ZXN0SG9zdEluQmxvY2tsaXN0KSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy8gY2hlY2sgaWYgYW55IGhvc3QgZnJvbSBsb3dlc3QtbGV2ZWwgdG8gdG9wLWxldmVsIGlzIGluIHRoZSBlbnRpdHlsaXN0XG5mdW5jdGlvbiBob3N0SW5FbnRpdHkgKGVudGl0eUhvc3RzLCBob3N0KSB7XG4gIGxldCBlbnRpdHlIb3N0ID0gZmFsc2VcbiAgZm9yIChsZXQgaG9zdFZhcmlhbnQgb2YgYWxsSG9zdHMoaG9zdCkpIHtcbiAgICBlbnRpdHlIb3N0ID0gZW50aXR5SG9zdHMuaW5kZXhPZihob3N0VmFyaWFudCkgPiAtMVxuICAgIGlmIChlbnRpdHlIb3N0KSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbEhvc3RzLFxuICBsb2FkTGlzdHMsXG4gIHByb2Nlc3NCbG9ja0xpc3RKU09OLFxuICBob3N0SW5CbG9ja2xpc3QsXG4gIGhvc3RJbkVudGl0eVxufVxuIiwiaWYgKHByb2Nlc3MuZW52Lk1PREUgPT09ICdwcm9kdWN0aW9uJykge1xuICBleHBvcnRzLmxvZyA9IGZ1bmN0aW9uIG5vb3AgKCkge31cbn0gZWxzZSB7XG4gIGV4cG9ydHMubG9nID0gY29uc29sZS5sb2cuYmluZChjb25zb2xlKVxufVxuIiwiY29uc3Qge2xvZ30gPSByZXF1aXJlKCcuL2xvZycpXG5jb25zdCB7aG9zdEluRW50aXR5fSA9IHJlcXVpcmUoJy4vbGlzdHMnKVxuXG5sZXQgaG9zdEVudGl0eUNhY2hlID0ge31cblxuZnVuY3Rpb24gcmVxdWVzdEFsbG93ZXIgKHRhYklELCB0b3RhbEV4ZWNUaW1lLCBzdGFydERhdGVUaW1lKSB7XG4gIHRvdGFsRXhlY1RpbWVbdGFiSURdICs9IERhdGUubm93KCkgLSBzdGFydERhdGVUaW1lXG4gIHJldHVybiB7fVxufVxuXG5mdW5jdGlvbiBnZXRSZXF1ZXN0RW50aXR5IChlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCkge1xuICBsZXQgcmVxdWVzdEVudGl0eSA9IHsnZW50aXR5TmFtZSc6IG51bGwsICdzYW1lRW50aXR5JzogZmFsc2V9XG5cbiAgLy8gRmlyc3QsIHRyeSB0byByZXR1cm4gZXZlcnl0aGluZyBmcm9tIG1lbW8taXplZCBjYWNoZVxuICBsZXQgcmVxdWVzdEVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbcmVxdWVzdFRvcEhvc3RdXG4gIGxldCBvcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW29yaWdpblRvcEhvc3RdXG4gIGxldCBtYWluRnJhbWVPcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdXG4gIHJlcXVlc3RFbnRpdHkuc2FtZUVudGl0eSA9IChcbiAgICByZXF1ZXN0RW50aXR5TmFtZSAmJiAoXG4gICAgICByZXF1ZXN0RW50aXR5TmFtZSA9PT0gb3JpZ2luRW50aXR5TmFtZSB8fCByZXF1ZXN0RW50aXR5TmFtZSA9PT0gbWFpbkZyYW1lT3JpZ2luRW50aXR5TmFtZVxuICAgIClcbiAgKVxuICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gcmVxdWVzdEVudGl0eU5hbWVcbiAgICBsb2coJ3JldHVybmluZyBmcm9tIG1lbW8taXplZCBjYWNoZTogJywgcmVxdWVzdEVudGl0eSlcbiAgICByZXR1cm4gcmVxdWVzdEVudGl0eVxuICB9XG5cbiAgLy8gSWYgYSBob3N0IHdhcyBub3QgZm91bmQgaW4gdGhlIG1lbW8taXplZCBjYWNoZSwgY2hlY2sgdGhydSB0aGUgZW50aXR5TGlzdFxuICBmb3IgKGxldCBlbnRpdHlOYW1lIGluIGVudGl0eUxpc3QpIHtcbiAgICBsZXQgZW50aXR5ID0gZW50aXR5TGlzdFtlbnRpdHlOYW1lXVxuICAgIGxldCByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSA9IGZhbHNlXG4gICAgbGV0IG9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBmYWxzZVxuICAgIGxldCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gZmFsc2VcblxuICAgIHJlcXVlc3RJc0VudGl0eVJlc291cmNlID0gaG9zdEluRW50aXR5KGVudGl0eS5yZXNvdXJjZXMsIHJlcXVlc3RUb3BIb3N0KVxuICAgIGlmIChyZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gZW50aXR5TmFtZVxuICAgICAgaG9zdEVudGl0eUNhY2hlW3JlcXVlc3RUb3BIb3N0XSA9IGVudGl0eU5hbWVcbiAgICB9XG5cbiAgICBvcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gaG9zdEluRW50aXR5KGVudGl0eS5wcm9wZXJ0aWVzLCBvcmlnaW5Ub3BIb3N0KVxuICAgIGlmIChvcmlnaW5Jc0VudGl0eVByb3BlcnR5KSB7XG4gICAgICBob3N0RW50aXR5Q2FjaGVbb3JpZ2luVG9wSG9zdF0gPSBlbnRpdHlOYW1lXG4gICAgfVxuXG4gICAgbWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSA9IGhvc3RJbkVudGl0eShlbnRpdHkucHJvcGVydGllcywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdClcbiAgICBpZiAobWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSkge1xuICAgICAgaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdID0gZW50aXR5TmFtZVxuICAgIH1cblxuICAgIGlmICgob3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSB8fCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5KSAmJiByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgbG9nKGBvcmlnaW5Ub3BIb3N0ICR7b3JpZ2luVG9wSG9zdH0gYW5kIHJlc291cmNlIHJlcXVlc3RUb3BIb3N0ICR7cmVxdWVzdFRvcEhvc3R9IGJlbG9uZyB0byB0aGUgc2FtZSBlbnRpdHk6ICR7ZW50aXR5TmFtZX07IGFsbG93aW5nIHJlcXVlc3RgKVxuICAgICAgcmVxdWVzdEVudGl0eS5zYW1lRW50aXR5ID0gdHJ1ZVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgLy8gVE9ETzogaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvYmxvay9pc3N1ZXMvMTEwXG4gIHJldHVybiByZXF1ZXN0RW50aXR5XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXF1ZXN0QWxsb3dlcixcbiAgZ2V0UmVxdWVzdEVudGl0eVxufVxuIl19
