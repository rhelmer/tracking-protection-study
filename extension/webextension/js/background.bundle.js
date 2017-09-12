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
      if (blockedEntities[requestTabID].indexOf(requestEntity.entityName) === -1) {
        blockedEntities[requestTabID].push(requestEntity.entityName)
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
  browser.webRequest.onBeforeRequest.addListener(
    blockTrackerRequests(blocklist, allowedHosts, entityList),
    {urls: ['*://*/*']},
    ['blocking']
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwic3JjL2pzL2JhY2tncm91bmQuanMiLCJzcmMvanMvY2Fub25pY2FsaXplLmpzIiwic3JjL2pzL2xpc3RzLmpzIiwic3JjL2pzL2xvZy5qcyIsInNyYy9qcy9yZXF1ZXN0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDOUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiY29uc3Qge2Nhbm9uaWNhbGl6ZUhvc3R9ID0gcmVxdWlyZSgnLi9jYW5vbmljYWxpemUnKVxuY29uc3Qge2xvYWRMaXN0cywgaG9zdEluQmxvY2tsaXN0fSA9IHJlcXVpcmUoJy4vbGlzdHMnKVxuY29uc3Qge3JlcXVlc3RBbGxvd2VyLCBnZXRSZXF1ZXN0RW50aXR5fSA9IHJlcXVpcmUoJy4vcmVxdWVzdHMnKVxuY29uc3Qge2xvZ30gPSByZXF1aXJlKCcuL2xvZycpXG5cbi8vIFNldCBzb21lIGV4cGxpY2l0IHdpbmRvdyB2YXJpYWJsZSBmb3IgcGFnZUFjdGlvbiB0byBhY2Nlc3NcbndpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IGZhbHNlXG53aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0ge31cbndpbmRvdy5ibG9ja2VkUmVxdWVzdHMgPSB7fVxud2luZG93LmJsb2NrZWRFbnRpdGllcyA9IHt9XG53aW5kb3cuYWxsb3dlZFJlcXVlc3RzID0ge31cbndpbmRvdy5hbGxvd2VkRW50aXRpZXMgPSB7fVxuXG52YXIgcHJpdmF0ZUJyb3dzaW5nTW9kZSA9IGZhbHNlXG52YXIgY3VycmVudEFjdGl2ZVRhYklEXG52YXIgY3VycmVudEFjdGl2ZU9yaWdpblxudmFyIHRvdGFsRXhlY1RpbWUgPSB7fVxudmFyIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkID0ge31cbnZhciBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0cyA9IHt9XG52YXIgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IC0xXG5cbmZ1bmN0aW9uIHJlc3RhcnRCbG9rRm9yVGFiICh0YWJJRCkge1xuICBibG9ja2VkUmVxdWVzdHNbdGFiSURdID0gW11cbiAgYmxvY2tlZEVudGl0aWVzW3RhYklEXSA9IFtdXG4gIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0gPSBbXVxuICBhbGxvd2VkRW50aXRpZXNbdGFiSURdID0gW11cbiAgdG90YWxFeGVjVGltZVt0YWJJRF0gPSAwXG4gIG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3RhYklEXSA9IG51bGxcbiAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRbdGFiSURdID0gZmFsc2Vcbn1cblxuZnVuY3Rpb24gc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAgKHRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cykge1xuICBpZiAoaXNPcmlnaW5EaXNhYmxlZCh0b3BIb3N0LCBhbGxvd2VkSG9zdHMpKSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkID0gdHJ1ZVxuICB9IGVsc2Uge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IGZhbHNlXG4gIH1cbiAgaWYgKHJlcG9ydGVkSG9zdHMuaGFzT3duUHJvcGVydHkodG9wSG9zdCkpIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0gcmVwb3J0ZWRIb3N0c1t0b3BIb3N0XVxuICB9IGVsc2Uge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3RSZXBvcnQgPSB7fVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzT3JpZ2luRGlzYWJsZWQgKGhvc3QsIGFsbG93ZWRIb3N0cykge1xuICByZXR1cm4gYWxsb3dlZEhvc3RzLmluZGV4T2YoaG9zdCkgPiAtMVxufVxuXG5mdW5jdGlvbiBibG9ja1RyYWNrZXJSZXF1ZXN0cyAoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGZpbHRlclJlcXVlc3QgKHJlcXVlc3REZXRhaWxzKSB7XG4gICAgdmFyIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnQgPSBEYXRlLm5vdygpXG4gICAgdmFyIHJlcXVlc3RUYWJJRCA9IHJlcXVlc3REZXRhaWxzLnRhYklkXG4gICAgdmFyIG9yaWdpblRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdFRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdEVudGl0eVxuXG4gICAgdmFyIGZsYWdzID0ge1xuICAgICAgbWFpbk9yaWdpbkRpc2FibGVkOiBmYWxzZSxcbiAgICAgIGZpcmVmb3hPcmlnaW46IGZhbHNlLFxuICAgICAgbmV3T3JpZ2luOiBmYWxzZSxcbiAgICAgIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3Q6IGZhbHNlLFxuICAgICAgcmVxdWVzdElzVGhpcmRQYXJ0eTogZmFsc2UsXG4gICAgICByZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWU6IGZhbHNlXG4gICAgfVxuXG4gICAgdmFyIGFsbG93UmVxdWVzdCA9IHJlcXVlc3RBbGxvd2VyLmJpbmQobnVsbCwgcmVxdWVzdFRhYklELCB0b3RhbEV4ZWNUaW1lLCBibG9ja1RyYWNrZXJSZXF1ZXN0c1N0YXJ0KVxuXG4gICAgaWYgKHByaXZhdGVCcm93c2luZ01vZGUpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBpbiBwcml2YXRlIGJyb3dzaW5nIG1vZGUgd2luZG93OyBQQk0gVFAgd2lsbCBjYXRjaCB0aGVtLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBmcm9tIFwidW5kZWZpbmVkXCIgb3JpZ2luIC0gYSBicm93c2VyIGludGVybmFsIG9yaWdpbi4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGFsbCBvcmlnaW4gZmxhZ3NcbiAgICBvcmlnaW5Ub3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCkuaG9zdClcbiAgICBjdXJyZW50QWN0aXZlT3JpZ2luID0gb3JpZ2luVG9wSG9zdFxuXG4gICAgZmxhZ3MuZmlyZWZveE9yaWdpbiA9ICh0eXBlb2Ygb3JpZ2luVG9wSG9zdCAhPT0gJ3VuZGVmaW5lZCcgJiYgb3JpZ2luVG9wSG9zdC5pbmNsdWRlcygnbW96LW51bGxwcmluY2lwYWwnKSlcbiAgICBmbGFncy5uZXdPcmlnaW4gPSBvcmlnaW5Ub3BIb3N0ID09PSAnJ1xuICAgIGlmIChmbGFncy5maXJlZm94T3JpZ2luIHx8IGZsYWdzLm5ld09yaWdpbikge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gRmlyZWZveCBhbmQvb3IgbmV3IHRhYi93aW5kb3cgb3JpZ2lucy4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gU2V0IG1haW4gJiB0b3AgZnJhbWUgdmFsdWVzIGlmIGZyYW1lSWQgPT09IDBcbiAgICBpZiAocmVxdWVzdERldGFpbHMuZnJhbWVJZCA9PT0gMCkge1xuICAgICAgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSA9IG9yaWdpblRvcEhvc3RcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZihvcmlnaW5Ub3BIb3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRbcmVxdWVzdFRhYklEXSA9IG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPiAtMVxuICAgIH1cblxuICAgIHJlcXVlc3RUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLnVybCkuaG9zdClcblxuICAgIGlmIChtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFtyZXF1ZXN0VGFiSURdKSB7XG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiByZXF1ZXN0VGFiSUQsXG4gICAgICAgIGltYWdlRGF0YTogZHJhdyhmYWxzZSwgMClcbiAgICAgIH0pXG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2hvdyhyZXF1ZXN0VGFiSUQpXG5cbiAgICAgIGlmIChob3N0SW5CbG9ja2xpc3QoYmxvY2tsaXN0LCByZXF1ZXN0VG9wSG9zdCkpIHtcbiAgICAgICAgYWxsb3dlZFJlcXVlc3RzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0VG9wSG9zdClcbiAgICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNldEljb24oe1xuICAgICAgICAgIHRhYklkOiB0YWJJRCxcbiAgICAgICAgICBpbWFnZURhdGE6IGRyYXcoIXRvcEZyYW1lSG9zdERpc2FibGVkLCBhbGxvd2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5sZW5ndGgpXG4gICAgICAgIH0pXG4gICAgICB9XG4vKlxuICAgICAgaWYgKGFsbG93ZWRFbnRpdGllc1tyZXF1ZXN0VGFiSURdLmluZGV4T2YocmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgYWxsb3dlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpXG4gICAgICB9XG4qL1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gb3JpZ2luIGZvciB3aGljaCBCbG9rIGlzIGRpc2FibGVkLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdERldGFpbHMudHlwZSA9PT0gJ21haW5fZnJhbWUnKSB7XG4gICAgICBsb2coJ0FsbG93aW5nIGNsaWNrcyB0byBsaW5rcy4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgZmxhZ3MucmVxdWVzdEhvc3RJbkJsb2NrbGlzdCA9IGhvc3RJbkJsb2NrbGlzdChibG9ja2xpc3QsIHJlcXVlc3RUb3BIb3N0KVxuXG4gICAgaWYgKCFmbGFncy5yZXF1ZXN0SG9zdEluQmxvY2tsaXN0KSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgdG8gZG9tYWluIE5PVCBpbiB0aGUgYmxvY2stbGlzdC4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgcmVxdWVzdEVudGl0eSA9IGdldFJlcXVlc3RFbnRpdHkoZW50aXR5TGlzdCwgb3JpZ2luVG9wSG9zdCwgcmVxdWVzdFRvcEhvc3QsIG9yaWdpblRvcEhvc3QpXG4gICAgaWYgKHJlcXVlc3RFbnRpdHkuc2FtZUVudGl0eSkge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IHRvIGJsb2NrLWxpc3QgZG9tYWluIHRoYXQgYmVsb25ncyB0byBzYW1lIGVudGl0eSBhcyBvcmlnaW4gZG9tYWluLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBmbGFncy5yZXF1ZXN0SXNUaGlyZFBhcnR5ID0gcmVxdWVzdFRvcEhvc3QgIT09IG9yaWdpblRvcEhvc3RcblxuICAgIGlmIChmbGFncy5yZXF1ZXN0SXNUaGlyZFBhcnR5KSB7XG4gICAgICBmbGFncy5yZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWUgPSAocmVxdWVzdERldGFpbHMuZnJhbWVJZCA+IDAgJiYgcmVxdWVzdFRvcEhvc3QgPT09IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3JlcXVlc3RUYWJJRF0pXG4gICAgICBpZiAoZmxhZ3MucmVxdWVzdEhvc3RNYXRjaGVzTWFpbkZyYW1lKSB7XG4gICAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCB0byBibG9jay1saXN0IGRvbWFpbiB0aGF0IG1hdGNoZXMgdGhlIHRvcC9tYWluIGZyYW1lIGRvbWFpbi4nKVxuICAgICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICAgIH1cblxuICAgICAgbG9nKCdCbG9ja2luZyByZXF1ZXN0OiBvcmlnaW5Ub3BIb3N0OiAnLCBvcmlnaW5Ub3BIb3N0LCAnIG1haW5GcmFtZU9yaWdpblRvcEhvc3Q6ICcsIG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3JlcXVlc3RUYWJJRF0sICcgcmVxdWVzdFRvcEhvc3Q6ICcsIHJlcXVlc3RUb3BIb3N0LCAnIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3Q6ICcsIGZsYWdzLnJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpXG4gICAgICBibG9ja2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RUb3BIb3N0KVxuICAgICAgaWYgKGJsb2NrZWRFbnRpdGllc1tyZXF1ZXN0VGFiSURdLmluZGV4T2YocmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgYmxvY2tlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpXG4gICAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgICB0YWJJZDogcmVxdWVzdFRhYklELFxuICAgICAgICAgIGltYWdlRGF0YTogZHJhdyghdG9wRnJhbWVIb3N0RGlzYWJsZWQsIGJsb2NrZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHRvdGFsRXhlY1RpbWVbcmVxdWVzdFRhYklEXSArPSBEYXRlLm5vdygpIC0gYmxvY2tUcmFja2VyUmVxdWVzdHNTdGFydFxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNob3cocmVxdWVzdFRhYklEKVxuICAgICAgcmV0dXJuIHtjYW5jZWw6IHRydWV9XG4gICAgfVxuXG4gICAgbG9nKCdEZWZhdWx0IHRvIGFsbG93aW5nIHJlcXVlc3QuJylcbiAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydFJlcXVlc3RMaXN0ZW5lciAoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpIHtcbiAgYnJvd3Nlci53ZWJSZXF1ZXN0Lm9uQmVmb3JlUmVxdWVzdC5hZGRMaXN0ZW5lcihcbiAgICBibG9ja1RyYWNrZXJSZXF1ZXN0cyhibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCksXG4gICAge3VybHM6IFsnKjovLyovKiddfSxcbiAgICBbJ2Jsb2NraW5nJ11cbiAgKVxufVxuXG5mdW5jdGlvbiBzdGFydFdpbmRvd0FuZFRhYkxpc3RlbmVycyAoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKSB7XG4gIGJyb3dzZXIud2luZG93cy5vbkZvY3VzQ2hhbmdlZC5hZGRMaXN0ZW5lcigod2luZG93SUQpID0+IHtcbiAgICBicm93c2VyLndpbmRvd3MuZ2V0KHdpbmRvd0lELCB7fSwgKGZvY3VzZWRXaW5kb3cpID0+IHtcbiAgICAgIGlmIChmb2N1c2VkV2luZG93ICYmIGZvY3VzZWRXaW5kb3cuaW5jb2duaXRvKSB7XG4gICAgICAgIHByaXZhdGVCcm93c2luZ01vZGUgPSB0cnVlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwcml2YXRlQnJvd3NpbmdNb2RlID0gZmFsc2VcbiAgICAgIH1cbiAgICB9KVxuICAgIGxvZygnYnJvd3Nlci53aW5kb3dzLm9uRm9jdXNDaGFuZ2VkLCB3aW5kb3dJRDogJyArIHdpbmRvd0lEKVxuICAgIGJyb3dzZXIudGFicy5xdWVyeSh7YWN0aXZlOiB0cnVlLCB3aW5kb3dJZDogd2luZG93SUR9LCAodGFic0FycmF5KSA9PiB7XG4gICAgICBsZXQgdGFiID0gdGFic0FycmF5WzBdXG4gICAgICBpZiAoIXRhYilcbiAgICAgICAgcmV0dXJuXG5cbiAgICAgIGN1cnJlbnRBY3RpdmVUYWJJRCA9IHRhYi5pZFxuICAgICAgbGV0IHRhYlRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwodGFiLnVybCkuaG9zdClcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZih0YWJUb3BIb3N0KVxuICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAodGFiVG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgIH0pXG4gIH0pXG5cbiAgYnJvd3Nlci50YWJzLm9uQWN0aXZhdGVkLmFkZExpc3RlbmVyKGZ1bmN0aW9uIChhY3RpdmVJbmZvKSB7XG4gICAgY3VycmVudEFjdGl2ZVRhYklEID0gYWN0aXZlSW5mby50YWJJZFxuICAgIGJyb3dzZXIudGFicy5nZXQoY3VycmVudEFjdGl2ZVRhYklELCBmdW5jdGlvbiAodGFiKSB7XG4gICAgICBsZXQgdGFiVG9wSG9zdCA9IGNhbm9uaWNhbGl6ZUhvc3QobmV3IFVSTCh0YWIudXJsKS5ob3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKHRhYlRvcEhvc3QpXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCh0YWJUb3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfSlcbiAgfSlcblxuICBicm93c2VyLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKGZ1bmN0aW9uICh0YWJJRCwgY2hhbmdlSW5mbykge1xuICAgIGlmIChjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2xvYWRpbmcnKSB7XG4gICAgICByZXN0YXJ0Qmxva0ZvclRhYih0YWJJRClcbiAgICAgIGJyb3dzZXIudGFicy5nZXQoY3VycmVudEFjdGl2ZVRhYklELCBmdW5jdGlvbiAodGFiKSB7XG4gICAgICAgIGxldCB0YWJUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHRhYi51cmwpLmhvc3QpXG4gICAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKHRhYlRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICAgIH0pXG4gICAgfSBlbHNlIGlmIChjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgbG9nKCcqKioqKioqKiB0YWIgY2hhbmdlSW5mby5zdGF0dXMgY29tcGxldGUgKioqKioqKionKVxuICAgICAgaWYgKGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0pIHtcbiAgICAgICAgbG9nKCdibG9ja2VkICcgKyBibG9ja2VkUmVxdWVzdHNbdGFiSURdLmxlbmd0aCArICcgcmVxdWVzdHM6ICcsIGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0pXG4gICAgICAgIGxvZygnZnJvbSAnICsgYmxvY2tlZEVudGl0aWVzW3RhYklEXS5sZW5ndGggKyAnIGVudGl0aWVzOiAnLCBibG9ja2VkRW50aXRpZXNbdGFiSURdKVxuICAgICAgfVxuICAgICAgaWYgKGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0pIHtcbiAgICAgICAgbG9nKCdhbGxvd2VkICcgKyBhbGxvd2VkUmVxdWVzdHNbdGFiSURdLmxlbmd0aCArICcgcmVxdWVzdHM6ICcsIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0pXG4gICAgICAgIGxvZygnZnJvbSAnICsgYWxsb3dlZEVudGl0aWVzW3RhYklEXS5sZW5ndGggKyAnIGVudGl0aWVzOiAnLCBhbGxvd2VkRW50aXRpZXNbdGFiSURdKVxuICAgICAgfVxuICAgICAgbG9nKCd0b3RhbEV4ZWNUaW1lOiAnICsgdG90YWxFeGVjVGltZVt0YWJJRF0pXG4gICAgICBsb2coJyoqKioqKioqIHRhYiBjaGFuZ2VJbmZvLnN0YXR1cyBjb21wbGV0ZSAqKioqKioqKicpXG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBzdGFydE1lc3NhZ2VMaXN0ZW5lciAoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzLCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCkge1xuICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gICAgaWYgKG1lc3NhZ2UgPT09ICdkaXNhYmxlJykge1xuICAgICAgbGV0IG1haW5GcmFtZU9yaWdpblRvcEhvc3QgPSBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ2Jsb2stZGlzYWJsZWQnLFxuICAgICAgICBicmVha2FnZTogJycsXG4gICAgICAgIG5vdGVzOiAnJ1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiBjdXJyZW50QWN0aXZlVGFiSUQsXG4gICAgICAgIGltYWdlRGF0YTogZHJhdyhmYWxzZSwgMClcbiAgICAgIH0pXG4gICAgICBhbGxvd2VkSG9zdHMucHVzaChtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7YWxsb3dlZEhvc3RzOiBhbGxvd2VkSG9zdHN9KVxuICAgICAgYnJvd3Nlci50YWJzLnJlbG9hZChjdXJyZW50QWN0aXZlVGFiSUQpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlID09PSAncmUtZW5hYmxlJykge1xuICAgICAgbGV0IG1haW5GcmFtZU9yaWdpblRvcEhvc3QgPSBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ2Jsb2stZW5hYmxlZCcsXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IGN1cnJlbnRBY3RpdmVUYWJJRCxcbiAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KHRydWUsIDApXG4gICAgICB9KVxuICAgICAgYWxsb3dlZEhvc3RzLnNwbGljZShtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4LCAxKVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7YWxsb3dlZEhvc3RzOiBhbGxvd2VkSG9zdHN9KVxuICAgICAgYnJvd3Nlci50YWJzLnJlbG9hZChjdXJyZW50QWN0aXZlVGFiSUQpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlLmhhc093blByb3BlcnR5KCdmZWVkYmFjaycpKSB7XG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogbWVzc2FnZS5mZWVkYmFjayxcbiAgICAgICAgYnJlYWthZ2U6ICcnLFxuICAgICAgICBub3RlczogJydcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgICAgcmVwb3J0ZWRIb3N0c1ttYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXSA9IG1lc3NhZ2VcbiAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe3JlcG9ydGVkSG9zdHM6IHJlcG9ydGVkSG9zdHN9KVxuICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAoY3VycmVudEFjdGl2ZU9yaWdpbiwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgIH1cbiAgICBpZiAobWVzc2FnZS5oYXNPd25Qcm9wZXJ0eSgnYnJlYWthZ2UnKSkge1xuICAgICAgbGV0IHRlc3RQaWxvdFBpbmdNZXNzYWdlID0ge1xuICAgICAgICBvcmlnaW5Eb21haW46IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIHRyYWNrZXJEb21haW5zOiBibG9ja2VkUmVxdWVzdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgZXZlbnQ6ICdzdWJtaXQnLFxuICAgICAgICBicmVha2FnZTogbWVzc2FnZS5icmVha2FnZSxcbiAgICAgICAgbm90ZXM6IG1lc3NhZ2Uubm90ZXNcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gc3RhcnRMaXN0ZW5lcnMgKHtibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCwgcmVwb3J0ZWRIb3N0c30sIHRlc3RQaWxvdFBpbmdDaGFubmVsKSB7XG4gIHN0YXJ0UmVxdWVzdExpc3RlbmVyKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KVxuXG4gIHN0YXJ0V2luZG93QW5kVGFiTGlzdGVuZXJzKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcblxuICBzdGFydE1lc3NhZ2VMaXN0ZW5lcihhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMsIHRlc3RQaWxvdFBpbmdDaGFubmVsKVxufVxuXG5jb25zdCBzdGF0ZSA9IHtcbiAgYmxvY2tsaXN0OiBuZXcgTWFwKCksXG4gIGFsbG93ZWRIb3N0czogW10sXG4gIHJlcG9ydGVkSG9zdHM6IHt9LFxuICBlbnRpdHlMaXN0OiB7fVxufVxuXG5mdW5jdGlvbiBpbml0VGVzdFBpbG90UGluZ0NoYW5uZWwgKHtCcm9hZGNhc3RDaGFubmVsfSkge1xuICAvLyBsZXQgVEVTVFBJTE9UX1RFTEVNRVRSWV9DSEFOTkVMID0gJ3Rlc3RwaWxvdC10ZWxlbWV0cnknXG4gIGxldCBURVNUUElMT1RfVEVMRU1FVFJZX0NIQU5ORUwgPSAnYmxvay10ZWxlbWV0cnknXG4gIGxldCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCA9IG5ldyBCcm9hZGNhc3RDaGFubmVsKFRFU1RQSUxPVF9URUxFTUVUUllfQ0hBTk5FTClcbiAgcmV0dXJuIHRlc3RQaWxvdFBpbmdDaGFubmVsXG59XG5cbmxvYWRMaXN0cyhzdGF0ZSkudGhlbigoKSA9PiB7XG4gIGxldCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCA9IGluaXRUZXN0UGlsb3RQaW5nQ2hhbm5lbCh3aW5kb3cpXG4gIHN0YXJ0TGlzdGVuZXJzKHN0YXRlLCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbClcbn0sIGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKSlcblxuLypcbiAqIERyYXcgcGFnZUFjdGlvbiBpY29uIHdpdGggYSB0ZXh0IGJhZGdlLlxuICovXG5mdW5jdGlvbiBkcmF3KGVuYWJsZWQsIGNvdW50ZXIpIHtcbiAgbGV0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIilcbiAgY2FudmFzLnN0eWxlLndpZHRoID0gXCIxNnB4XCJcbiAgY2FudmFzLnN0eWxlLmhlaWdodCA9IFwiMTZweFwiXG4gIGNhbnZhcy5oZWlnaHQgPSAzMlxuICBjYW52YXMud2lkdGggPSAzMlxuICBsZXQgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIilcbiAgY29udGV4dC5zY2FsZSgyLCAyKVxuICBsZXQgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKVxuICBpbWcuc3JjID0gXCJpbWcvYmxvay04LnBuZ1wiXG5cbiAgaWYgKGVuYWJsZWQpIHtcbiAgICBjb250ZXh0LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAxNTAsIDAsIDEpXCJcbiAgfSBlbHNlIHtcbiAgICBjb250ZXh0LmZpbGxTdHlsZSA9IFwicmdiYSgzMDAsIDIwMCwgMCwgMSlcIlxuICB9XG5cbiAgY29udGV4dC5maWxsUmVjdCgwLCAwLCAzMiwgMzIpXG4gIGNvbnRleHQuZHJhd0ltYWdlKGltZywgMSwgMSlcbiAgY29udGV4dC5maWxsU3R5bGUgPSBcIndoaXRlXCJcbiAgY29udGV4dC5mb250ID0gXCI4cHggQXJpYWxcIlxuICBpZiAoY291bnRlcikge1xuICAgIGNvbnRleHQuZmlsbFRleHQoY291bnRlciwgNiwgMTQpXG4gIH1cbiAgcmV0dXJuIGNvbnRleHQuZ2V0SW1hZ2VEYXRhKDAsIDAsIDMyLCAzMilcbn1cbiIsInZhciBpcDREZWNpbWFsUGF0dGVybiA9ICdeKD86KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/KS4pezN9KD86KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/KSkkJ1xudmFyIGlwNEhleFBhdHRlcm4gPSAnXig/Oig/OjB4WzAtOWEtZl17MSwyfSkuKXszfSg/OjB4WzAtOWEtZl17MSwyfSkkJ1xudmFyIGlwNE9jdGFsUGF0dGVybiA9ICdeKD86KD86MDNbMS03XVswLTddfDBbMTJdWzAtN117MSwyfXxbMC03XXsxLDJ9KS4pezN9KD86MDNbMS03XVswLTddfDBbMTJdWzAtN117MSwyfXxbMC03XXsxLDJ9KSQnXG5cbi8vIGxpa2UgdHJpbSgpIGhlbHBlciBmcm9tIHVuZGVyc2NvcmUuc3RyaW5nOlxuLy8gdHJpbXMgY2hhcnMgZnJvbSBiZWdpbm5pbmcgYW5kIGVuZCBvZiBzdHJcbmZ1bmN0aW9uIHRyaW0gKHN0ciwgY2hhcnMpIHtcbiAgLy8gZXNjYXBlIGFueSByZWdleHAgY2hhcnNcbiAgY2hhcnMgPSBjaGFycy5yZXBsYWNlKC8oWy4qKz9ePSE6JHt9KCl8W1xcXVxcL1xcXFxdKS9nLCAnXFxcXCQxJylcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKG5ldyBSZWdFeHAoJ14nICsgY2hhcnMgKyAnK3wnICsgY2hhcnMgKyAnKyQnLCAnZycpLCAnJylcbn1cblxuLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2FmZS1icm93c2luZy92NC91cmxzLWhhc2hpbmcjY2Fub25pY2FsaXphdGlvblxuZnVuY3Rpb24gY2Fub25pY2FsaXplSG9zdCAoaG9zdCkge1xuICAvLyBSZW1vdmUgYWxsIGxlYWRpbmcgYW5kIHRyYWlsaW5nIGRvdHNcbiAgdmFyIGNhbm9uaWNhbGl6ZWRIb3N0ID0gdHJpbShob3N0LCAnLicpXG5cbiAgLy8gUmVwbGFjZSBjb25zZWN1dGl2ZSBkb3RzIHdpdGggYSBzaW5nbGUgZG90XG4gIGNhbm9uaWNhbGl6ZWRIb3N0ID0gY2Fub25pY2FsaXplZEhvc3QucmVwbGFjZShuZXcgUmVnRXhwKCdbLl0rJywgJ2cnKSwgJy4nKVxuXG4gIC8vIElmIHRoZSBob3N0bmFtZSBjYW4gYmUgcGFyc2VkIGFzIGFuIElQIGFkZHJlc3MsXG4gIC8vIG5vcm1hbGl6ZSBpdCB0byA0IGRvdC1zZXBhcmF0ZWQgZGVjaW1hbCB2YWx1ZXMuXG4gIC8vIFRoZSBjbGllbnQgc2hvdWxkIGhhbmRsZSBhbnkgbGVnYWwgSVAtYWRkcmVzcyBlbmNvZGluZyxcbiAgLy8gaW5jbHVkaW5nIG9jdGFsLCBoZXgsIGFuZCBUT0RPOiBmZXdlciB0aGFuIGZvdXIgY29tcG9uZW50c1xuICB2YXIgYmFzZSA9IDEwXG4gIHZhciBpc0lQNERlY2ltYWwsIGlzSVA0SGV4LCBpc0lQNE9jdGFsXG5cbiAgaXNJUDREZWNpbWFsID0gY2Fub25pY2FsaXplZEhvc3QubWF0Y2goaXA0RGVjaW1hbFBhdHRlcm4pICE9IG51bGxcbiAgaXNJUDRIZXggPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDRIZXhQYXR0ZXJuKSAhPSBudWxsXG4gIGlzSVA0T2N0YWwgPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDRPY3RhbFBhdHRlcm4pICE9IG51bGxcbiAgaWYgKGlzSVA0RGVjaW1hbCB8fCBpc0lQNEhleCB8fCBpc0lQNE9jdGFsKSB7XG4gICAgaWYgKGlzSVA0SGV4KSB7XG4gICAgICBiYXNlID0gMTZcbiAgICB9IGVsc2UgaWYgKGlzSVA0T2N0YWwpIHtcbiAgICAgIGJhc2UgPSA4XG4gICAgfVxuICAgIGNhbm9uaWNhbGl6ZWRIb3N0ID0gY2Fub25pY2FsaXplZEhvc3Quc3BsaXQoJy4nKS5tYXAobnVtID0+IHBhcnNlSW50KG51bSwgYmFzZSkpLmpvaW4oJy4nKVxuICB9XG5cbiAgLy8gTG93ZXJjYXNlIHRoZSB3aG9sZSBzdHJpbmdcbiAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC50b0xvd2VyQ2FzZSgpXG4gIHJldHVybiBjYW5vbmljYWxpemVkSG9zdFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY2Fub25pY2FsaXplSG9zdCxcbiAgdHJpbVxufVxuIiwiZnVuY3Rpb24gYWxsSG9zdHMgKGhvc3QpIHtcbiAgY29uc3QgYWxsSG9zdHMgPSBbXVxuICBjb25zdCBob3N0UGFydHMgPSBob3N0LnNwbGl0KCcuJylcbiAgd2hpbGUgKGhvc3RQYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgYWxsSG9zdHMucHVzaChob3N0UGFydHMuam9pbignLicpKVxuICAgIGhvc3RQYXJ0cy5zcGxpY2UoMCwgMSlcbiAgfVxuICByZXR1cm4gYWxsSG9zdHNcbn1cblxuZnVuY3Rpb24gbG9hZExpc3RzIChzdGF0ZSkge1xuICBjb25zdCBibG9ja0xpc3RQcm9taXNlID0gbG9hZEpTT04oJ2pzL2Rpc2Nvbm5lY3QtYmxvY2tsaXN0Lmpzb24nKS50aGVuKChkYXRhKSA9PiB7XG4gICAgc3RhdGUuYmxvY2tsaXN0ID0gcHJvY2Vzc0Jsb2NrTGlzdEpTT04oZGF0YSlcbiAgfSlcblxuICBjb25zdCBlbnRpdHlMaXN0UHJvbWlzZSA9IGxvYWRKU09OKCdqcy9kaXNjb25uZWN0LWVudGl0eWxpc3QuanNvbicpLnRoZW4oKGRhdGEpID0+IHtcbiAgICBzdGF0ZS5lbnRpdHlMaXN0ID0gZGF0YVxuICB9KVxuXG4gIGNvbnN0IGFsbG93ZWRIb3N0c1Byb21pc2UgPSBnZXRBbGxvd2VkSG9zdHNMaXN0KCkudGhlbigoYWxsb3dlZEhvc3RzKSA9PiB7XG4gICAgc3RhdGUuYWxsb3dlZEhvc3RzID0gYWxsb3dlZEhvc3RzXG4gIH0pXG5cbiAgY29uc3QgcmVwb3J0ZWRIb3N0c1Byb21pc2UgPSBnZXRSZXBvcnRlZEhvc3RzTGlzdCgpLnRoZW4oKHJlcG9ydGVkSG9zdHMpID0+IHtcbiAgICBzdGF0ZS5yZXBvcnRlZEhvc3RzID0gcmVwb3J0ZWRIb3N0c1xuICB9KVxuXG4gIHJldHVybiBQcm9taXNlLmFsbChbYmxvY2tMaXN0UHJvbWlzZSwgZW50aXR5TGlzdFByb21pc2UsIGFsbG93ZWRIb3N0c1Byb21pc2UsIHJlcG9ydGVkSG9zdHNQcm9taXNlXSlcbn1cblxuZnVuY3Rpb24gbG9hZEpTT04gKHVybCkge1xuICByZXR1cm4gZmV0Y2godXJsKVxuICAgIC50aGVuKChyZXMpID0+IHJlcy5qc29uKCkpXG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NCbG9ja0xpc3RKU09OIChkYXRhKSB7XG4gIGNvbnN0IGJsb2NrbGlzdCA9IG5ldyBNYXAoKVxuXG4gIC8vIHJlbW92ZSB1bi1uZWVkZWQgY2F0ZWdvcmllcyBwZXIgZGlzY29ubmVjdFxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydDb250ZW50J11cbiAgZGVsZXRlIGRhdGEuY2F0ZWdvcmllc1snTGVnYWN5IERpc2Nvbm5lY3QnXVxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydMZWdhY3kgQ29udGVudCddXG5cbiAgLy8gcGFyc2UgdGhydSB0aGUgZGlzY29ubmVjdCBibG9ja2xpc3QgYW5kIGNyZWF0ZVxuICAvLyBsb2NhbCBibG9ja2xpc3QgXCJncm91cGVkXCIgYnkgbWFpbiBkb21haW4uIEkuZS4sXG4gIC8vIGJsb2NrbGlzdFtcImZhY2Vib29rLmNvbVwiXSA9IGh0dHA6Ly93d3cuZmFjZWJvb2suY29tXG4gIC8vIGJsb2NrbGlzdFtcImZiLmNvbVwiXSA9IGh0dHA6Ly93d3cuZmFjZWJvb2suY29tXG4gIC8vIGJsb2NrbGlzdFtcImRvdWJsZWNsaWNrLm5ldFwiXSA9IGh0dHA6Ly93d3cuZ29vZ2xlLmNvbVxuICAvLyBibG9ja2xpc3RbXCJnb29nbGUtYW5hbHl0aWNzLmNvbVwiXSA9IGh0dHA6Ly93d3cuZ29vZ2xlLmNvbVxuICAvLyBldGMuXG4gIGZvciAobGV0IGNhdGVnb3J5TmFtZSBpbiBkYXRhLmNhdGVnb3JpZXMpIHtcbiAgICB2YXIgY2F0ZWdvcnkgPSBkYXRhLmNhdGVnb3JpZXNbY2F0ZWdvcnlOYW1lXVxuICAgIHZhciBlbnRpdHlDb3VudCA9IGNhdGVnb3J5Lmxlbmd0aFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbnRpdHlDb3VudDsgaSsrKSB7XG4gICAgICB2YXIgZW50aXR5ID0gY2F0ZWdvcnlbaV1cblxuICAgICAgZm9yIChsZXQgZW50aXR5TmFtZSBpbiBlbnRpdHkpIHtcbiAgICAgICAgdmFyIHVybHMgPSBlbnRpdHlbZW50aXR5TmFtZV1cblxuICAgICAgICBmb3IgKGxldCBtYWluRG9tYWluIGluIHVybHMpIHtcbiAgICAgICAgICBibG9ja2xpc3Quc2V0KG1haW5Eb21haW4sIFtdKVxuICAgICAgICAgIHZhciBkb21haW5zID0gdXJsc1ttYWluRG9tYWluXVxuICAgICAgICAgIHZhciBkb21haW5zQ291bnQgPSBkb21haW5zLmxlbmd0aFxuXG4gICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkb21haW5zQ291bnQ7IGorKykge1xuICAgICAgICAgICAgYmxvY2tsaXN0LnNldChkb21haW5zW2pdLCBtYWluRG9tYWluKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBibG9ja2xpc3Rcbn1cblxuZnVuY3Rpb24gZ2V0QWxsb3dlZEhvc3RzTGlzdCAoKSB7XG4gIHJldHVybiBicm93c2VyLnN0b3JhZ2UubG9jYWwuZ2V0KCdhbGxvd2VkSG9zdHMnKS50aGVuKChpdGVtKSA9PiB7XG4gICAgaWYgKGl0ZW0uYWxsb3dlZEhvc3RzKSB7XG4gICAgICByZXR1cm4gaXRlbS5hbGxvd2VkSG9zdHNcbiAgICB9XG4gICAgcmV0dXJuIFtdXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGdldFJlcG9ydGVkSG9zdHNMaXN0ICgpIHtcbiAgcmV0dXJuIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5nZXQoJ3JlcG9ydGVkSG9zdHMnKS50aGVuKChpdGVtKSA9PiB7XG4gICAgaWYgKGl0ZW0ucmVwb3J0ZWRIb3N0cykge1xuICAgICAgcmV0dXJuIGl0ZW0ucmVwb3J0ZWRIb3N0c1xuICAgIH1cbiAgICByZXR1cm4ge31cbiAgfSlcbn1cblxuLy8gY2hlY2sgaWYgYW55IGhvc3QgZnJvbSBsb3dlc3QtbGV2ZWwgdG8gdG9wLWxldmVsIGlzIGluIHRoZSBibG9ja2xpc3RcbmZ1bmN0aW9uIGhvc3RJbkJsb2NrbGlzdCAoYmxvY2tsaXN0LCBob3N0KSB7XG4gIGxldCByZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gZmFsc2VcbiAgdmFyIGFsbEhvc3RWYXJpYW50cyA9IGFsbEhvc3RzKGhvc3QpXG4gIGZvciAobGV0IGhvc3RWYXJpYW50IG9mIGFsbEhvc3RWYXJpYW50cykge1xuICAgIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QgPSBibG9ja2xpc3QuaGFzKGhvc3RWYXJpYW50KVxuICAgIGlmIChyZXF1ZXN0SG9zdEluQmxvY2tsaXN0KSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy8gY2hlY2sgaWYgYW55IGhvc3QgZnJvbSBsb3dlc3QtbGV2ZWwgdG8gdG9wLWxldmVsIGlzIGluIHRoZSBlbnRpdHlsaXN0XG5mdW5jdGlvbiBob3N0SW5FbnRpdHkgKGVudGl0eUhvc3RzLCBob3N0KSB7XG4gIGxldCBlbnRpdHlIb3N0ID0gZmFsc2VcbiAgZm9yIChsZXQgaG9zdFZhcmlhbnQgb2YgYWxsSG9zdHMoaG9zdCkpIHtcbiAgICBlbnRpdHlIb3N0ID0gZW50aXR5SG9zdHMuaW5kZXhPZihob3N0VmFyaWFudCkgPiAtMVxuICAgIGlmIChlbnRpdHlIb3N0KSB7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFsbEhvc3RzLFxuICBsb2FkTGlzdHMsXG4gIHByb2Nlc3NCbG9ja0xpc3RKU09OLFxuICBob3N0SW5CbG9ja2xpc3QsXG4gIGhvc3RJbkVudGl0eVxufVxuIiwiaWYgKHByb2Nlc3MuZW52Lk1PREUgPT09ICdwcm9kdWN0aW9uJykge1xuICBleHBvcnRzLmxvZyA9IGZ1bmN0aW9uIG5vb3AgKCkge31cbn0gZWxzZSB7XG4gIGV4cG9ydHMubG9nID0gY29uc29sZS5sb2cuYmluZChjb25zb2xlKVxufVxuIiwiY29uc3Qge2xvZ30gPSByZXF1aXJlKCcuL2xvZycpXG5jb25zdCB7aG9zdEluRW50aXR5fSA9IHJlcXVpcmUoJy4vbGlzdHMnKVxuXG5sZXQgaG9zdEVudGl0eUNhY2hlID0ge31cblxuZnVuY3Rpb24gcmVxdWVzdEFsbG93ZXIgKHRhYklELCB0b3RhbEV4ZWNUaW1lLCBzdGFydERhdGVUaW1lKSB7XG4gIHRvdGFsRXhlY1RpbWVbdGFiSURdICs9IERhdGUubm93KCkgLSBzdGFydERhdGVUaW1lXG4gIHJldHVybiB7fVxufVxuXG5mdW5jdGlvbiBnZXRSZXF1ZXN0RW50aXR5IChlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCkge1xuICBsZXQgcmVxdWVzdEVudGl0eSA9IHsnZW50aXR5TmFtZSc6IG51bGwsICdzYW1lRW50aXR5JzogZmFsc2V9XG5cbiAgLy8gRmlyc3QsIHRyeSB0byByZXR1cm4gZXZlcnl0aGluZyBmcm9tIG1lbW8taXplZCBjYWNoZVxuICBsZXQgcmVxdWVzdEVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbcmVxdWVzdFRvcEhvc3RdXG4gIGxldCBvcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW29yaWdpblRvcEhvc3RdXG4gIGxldCBtYWluRnJhbWVPcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdXG4gIHJlcXVlc3RFbnRpdHkuc2FtZUVudGl0eSA9IChcbiAgICByZXF1ZXN0RW50aXR5TmFtZSAmJiAoXG4gICAgICByZXF1ZXN0RW50aXR5TmFtZSA9PT0gb3JpZ2luRW50aXR5TmFtZSB8fCByZXF1ZXN0RW50aXR5TmFtZSA9PT0gbWFpbkZyYW1lT3JpZ2luRW50aXR5TmFtZVxuICAgIClcbiAgKVxuICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gcmVxdWVzdEVudGl0eU5hbWVcbiAgICBsb2coJ3JldHVybmluZyBmcm9tIG1lbW8taXplZCBjYWNoZTogJywgcmVxdWVzdEVudGl0eSlcbiAgICByZXR1cm4gcmVxdWVzdEVudGl0eVxuICB9XG5cbiAgLy8gSWYgYSBob3N0IHdhcyBub3QgZm91bmQgaW4gdGhlIG1lbW8taXplZCBjYWNoZSwgY2hlY2sgdGhydSB0aGUgZW50aXR5TGlzdFxuICBmb3IgKGxldCBlbnRpdHlOYW1lIGluIGVudGl0eUxpc3QpIHtcbiAgICBsZXQgZW50aXR5ID0gZW50aXR5TGlzdFtlbnRpdHlOYW1lXVxuICAgIGxldCByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSA9IGZhbHNlXG4gICAgbGV0IG9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBmYWxzZVxuICAgIGxldCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gZmFsc2VcblxuICAgIHJlcXVlc3RJc0VudGl0eVJlc291cmNlID0gaG9zdEluRW50aXR5KGVudGl0eS5yZXNvdXJjZXMsIHJlcXVlc3RUb3BIb3N0KVxuICAgIGlmIChyZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gZW50aXR5TmFtZVxuICAgICAgaG9zdEVudGl0eUNhY2hlW3JlcXVlc3RUb3BIb3N0XSA9IGVudGl0eU5hbWVcbiAgICB9XG5cbiAgICBvcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gaG9zdEluRW50aXR5KGVudGl0eS5wcm9wZXJ0aWVzLCBvcmlnaW5Ub3BIb3N0KVxuICAgIGlmIChvcmlnaW5Jc0VudGl0eVByb3BlcnR5KSB7XG4gICAgICBob3N0RW50aXR5Q2FjaGVbb3JpZ2luVG9wSG9zdF0gPSBlbnRpdHlOYW1lXG4gICAgfVxuXG4gICAgbWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSA9IGhvc3RJbkVudGl0eShlbnRpdHkucHJvcGVydGllcywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdClcbiAgICBpZiAobWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSkge1xuICAgICAgaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdID0gZW50aXR5TmFtZVxuICAgIH1cblxuICAgIGlmICgob3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSB8fCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5KSAmJiByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgbG9nKGBvcmlnaW5Ub3BIb3N0ICR7b3JpZ2luVG9wSG9zdH0gYW5kIHJlc291cmNlIHJlcXVlc3RUb3BIb3N0ICR7cmVxdWVzdFRvcEhvc3R9IGJlbG9uZyB0byB0aGUgc2FtZSBlbnRpdHk6ICR7ZW50aXR5TmFtZX07IGFsbG93aW5nIHJlcXVlc3RgKVxuICAgICAgcmVxdWVzdEVudGl0eS5zYW1lRW50aXR5ID0gdHJ1ZVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgLy8gVE9ETzogaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvYmxvay9pc3N1ZXMvMTEwXG4gIHJldHVybiByZXF1ZXN0RW50aXR5XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXF1ZXN0QWxsb3dlcixcbiAgZ2V0UmVxdWVzdEVudGl0eVxufVxuIl19
