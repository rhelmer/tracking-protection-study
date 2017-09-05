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

var privateBrowsingMode = false
var currentActiveTabID
var currentActiveOrigin
var blockedRequests = {}
var blockedEntities = {}
var allowedRequests = {}
var allowedEntities = {}
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
        path: {
          '19': 'img/tracking-protection-disabled-16.png',
          '38': 'img/tracking-protection-disabled-32.png'
        }
      })
      browser.pageAction.show(requestTabID)
      allowedRequests[requestTabID].push(requestTopHost)
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
      if (focusedWindow.incognito) {
        privateBrowsingMode = true
      } else {
        privateBrowsingMode = false
      }
    })
    log('browser.windows.onFocusChanged, windowID: ' + windowID)
    browser.tabs.query({active: true, windowId: windowID}, (tabsArray) => {
      let tab = tabsArray[0]
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
        path: {
          '19': 'img/tracking-protection-disabled-16.png',
          '38': 'img/tracking-protection-disabled-32.png'
        }
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
        path: {
          '19': 'img/tracking-protection-16.png',
          '38': 'img/tracking-protection-32.png'
        }
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
  let TESTPILOT_TELEMETRY_CHANNEL = 'testpilot-telemetry'
  let testPilotPingChannel = new BroadcastChannel(TESTPILOT_TELEMETRY_CHANNEL)
  return testPilotPingChannel
}

loadLists(state).then(() => {
  let testPilotPingChannel = initTestPilotPingChannel(window)
  startListeners(state, testPilotPingChannel)
}, console.error.bind(console))

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwic3JjL2pzL2JhY2tncm91bmQuanMiLCJzcmMvanMvY2Fub25pY2FsaXplLmpzIiwic3JjL2pzL2xpc3RzLmpzIiwic3JjL2pzL2xvZy5qcyIsInNyYy9qcy9yZXF1ZXN0cy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDOUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiY29uc3Qge2Nhbm9uaWNhbGl6ZUhvc3R9ID0gcmVxdWlyZSgnLi9jYW5vbmljYWxpemUnKVxuY29uc3Qge2xvYWRMaXN0cywgaG9zdEluQmxvY2tsaXN0fSA9IHJlcXVpcmUoJy4vbGlzdHMnKVxuY29uc3Qge3JlcXVlc3RBbGxvd2VyLCBnZXRSZXF1ZXN0RW50aXR5fSA9IHJlcXVpcmUoJy4vcmVxdWVzdHMnKVxuY29uc3Qge2xvZ30gPSByZXF1aXJlKCcuL2xvZycpXG5cbi8vIFNldCBzb21lIGV4cGxpY2l0IHdpbmRvdyB2YXJpYWJsZSBmb3IgcGFnZUFjdGlvbiB0byBhY2Nlc3NcbndpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IGZhbHNlXG53aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0ge31cblxudmFyIHByaXZhdGVCcm93c2luZ01vZGUgPSBmYWxzZVxudmFyIGN1cnJlbnRBY3RpdmVUYWJJRFxudmFyIGN1cnJlbnRBY3RpdmVPcmlnaW5cbnZhciBibG9ja2VkUmVxdWVzdHMgPSB7fVxudmFyIGJsb2NrZWRFbnRpdGllcyA9IHt9XG52YXIgYWxsb3dlZFJlcXVlc3RzID0ge31cbnZhciBhbGxvd2VkRW50aXRpZXMgPSB7fVxudmFyIHRvdGFsRXhlY1RpbWUgPSB7fVxudmFyIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkID0ge31cbnZhciBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0cyA9IHt9XG52YXIgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IC0xXG5cbmZ1bmN0aW9uIHJlc3RhcnRCbG9rRm9yVGFiICh0YWJJRCkge1xuICBibG9ja2VkUmVxdWVzdHNbdGFiSURdID0gW11cbiAgYmxvY2tlZEVudGl0aWVzW3RhYklEXSA9IFtdXG4gIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0gPSBbXVxuICBhbGxvd2VkRW50aXRpZXNbdGFiSURdID0gW11cbiAgdG90YWxFeGVjVGltZVt0YWJJRF0gPSAwXG4gIG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3RhYklEXSA9IG51bGxcbiAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRbdGFiSURdID0gZmFsc2Vcbn1cblxuZnVuY3Rpb24gc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAgKHRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cykge1xuICBpZiAoaXNPcmlnaW5EaXNhYmxlZCh0b3BIb3N0LCBhbGxvd2VkSG9zdHMpKSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkID0gdHJ1ZVxuICB9IGVsc2Uge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IGZhbHNlXG4gIH1cbiAgaWYgKHJlcG9ydGVkSG9zdHMuaGFzT3duUHJvcGVydHkodG9wSG9zdCkpIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0gcmVwb3J0ZWRIb3N0c1t0b3BIb3N0XVxuICB9IGVsc2Uge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3RSZXBvcnQgPSB7fVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzT3JpZ2luRGlzYWJsZWQgKGhvc3QsIGFsbG93ZWRIb3N0cykge1xuICByZXR1cm4gYWxsb3dlZEhvc3RzLmluZGV4T2YoaG9zdCkgPiAtMVxufVxuXG5mdW5jdGlvbiBibG9ja1RyYWNrZXJSZXF1ZXN0cyAoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGZpbHRlclJlcXVlc3QgKHJlcXVlc3REZXRhaWxzKSB7XG4gICAgdmFyIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnQgPSBEYXRlLm5vdygpXG4gICAgdmFyIHJlcXVlc3RUYWJJRCA9IHJlcXVlc3REZXRhaWxzLnRhYklkXG4gICAgdmFyIG9yaWdpblRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdFRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdEVudGl0eVxuXG4gICAgdmFyIGZsYWdzID0ge1xuICAgICAgbWFpbk9yaWdpbkRpc2FibGVkOiBmYWxzZSxcbiAgICAgIGZpcmVmb3hPcmlnaW46IGZhbHNlLFxuICAgICAgbmV3T3JpZ2luOiBmYWxzZSxcbiAgICAgIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3Q6IGZhbHNlLFxuICAgICAgcmVxdWVzdElzVGhpcmRQYXJ0eTogZmFsc2UsXG4gICAgICByZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWU6IGZhbHNlXG4gICAgfVxuXG4gICAgdmFyIGFsbG93UmVxdWVzdCA9IHJlcXVlc3RBbGxvd2VyLmJpbmQobnVsbCwgcmVxdWVzdFRhYklELCB0b3RhbEV4ZWNUaW1lLCBibG9ja1RyYWNrZXJSZXF1ZXN0c1N0YXJ0KVxuXG4gICAgaWYgKHByaXZhdGVCcm93c2luZ01vZGUpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBpbiBwcml2YXRlIGJyb3dzaW5nIG1vZGUgd2luZG93OyBQQk0gVFAgd2lsbCBjYXRjaCB0aGVtLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBmcm9tIFwidW5kZWZpbmVkXCIgb3JpZ2luIC0gYSBicm93c2VyIGludGVybmFsIG9yaWdpbi4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGFsbCBvcmlnaW4gZmxhZ3NcbiAgICBvcmlnaW5Ub3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCkuaG9zdClcbiAgICBjdXJyZW50QWN0aXZlT3JpZ2luID0gb3JpZ2luVG9wSG9zdFxuXG4gICAgZmxhZ3MuZmlyZWZveE9yaWdpbiA9ICh0eXBlb2Ygb3JpZ2luVG9wSG9zdCAhPT0gJ3VuZGVmaW5lZCcgJiYgb3JpZ2luVG9wSG9zdC5pbmNsdWRlcygnbW96LW51bGxwcmluY2lwYWwnKSlcbiAgICBmbGFncy5uZXdPcmlnaW4gPSBvcmlnaW5Ub3BIb3N0ID09PSAnJ1xuICAgIGlmIChmbGFncy5maXJlZm94T3JpZ2luIHx8IGZsYWdzLm5ld09yaWdpbikge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gRmlyZWZveCBhbmQvb3IgbmV3IHRhYi93aW5kb3cgb3JpZ2lucy4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gU2V0IG1haW4gJiB0b3AgZnJhbWUgdmFsdWVzIGlmIGZyYW1lSWQgPT09IDBcbiAgICBpZiAocmVxdWVzdERldGFpbHMuZnJhbWVJZCA9PT0gMCkge1xuICAgICAgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSA9IG9yaWdpblRvcEhvc3RcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZihvcmlnaW5Ub3BIb3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRbcmVxdWVzdFRhYklEXSA9IG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPiAtMVxuICAgIH1cblxuICAgIHJlcXVlc3RUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLnVybCkuaG9zdClcblxuICAgIGlmIChtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFtyZXF1ZXN0VGFiSURdKSB7XG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiByZXF1ZXN0VGFiSUQsXG4gICAgICAgIHBhdGg6IHtcbiAgICAgICAgICAnMTknOiAnaW1nL3RyYWNraW5nLXByb3RlY3Rpb24tZGlzYWJsZWQtMTYucG5nJyxcbiAgICAgICAgICAnMzgnOiAnaW1nL3RyYWNraW5nLXByb3RlY3Rpb24tZGlzYWJsZWQtMzIucG5nJ1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNob3cocmVxdWVzdFRhYklEKVxuICAgICAgYWxsb3dlZFJlcXVlc3RzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0VG9wSG9zdClcbiAgICAgIC8qXG4gICAgICBpZiAoYWxsb3dlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0uaW5kZXhPZihyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpID09PSAtMSkge1xuICAgICAgICBhbGxvd2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSlcbiAgICAgIH1cbiAgICAgICovXG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgZnJvbSBvcmlnaW4gZm9yIHdoaWNoIEJsb2sgaXMgZGlzYWJsZWQuJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0RGV0YWlscy50eXBlID09PSAnbWFpbl9mcmFtZScpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgY2xpY2tzIHRvIGxpbmtzLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBmbGFncy5yZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gaG9zdEluQmxvY2tsaXN0KGJsb2NrbGlzdCwgcmVxdWVzdFRvcEhvc3QpXG5cbiAgICBpZiAoIWZsYWdzLnJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCB0byBkb21haW4gTk9UIGluIHRoZSBibG9jay1saXN0LicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICByZXF1ZXN0RW50aXR5ID0gZ2V0UmVxdWVzdEVudGl0eShlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgb3JpZ2luVG9wSG9zdClcbiAgICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgdG8gYmxvY2stbGlzdCBkb21haW4gdGhhdCBiZWxvbmdzIHRvIHNhbWUgZW50aXR5IGFzIG9yaWdpbiBkb21haW4uJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkgPSByZXF1ZXN0VG9wSG9zdCAhPT0gb3JpZ2luVG9wSG9zdFxuXG4gICAgaWYgKGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkpIHtcbiAgICAgIGZsYWdzLnJlcXVlc3RIb3N0TWF0Y2hlc01haW5GcmFtZSA9IChyZXF1ZXN0RGV0YWlscy5mcmFtZUlkID4gMCAmJiByZXF1ZXN0VG9wSG9zdCA9PT0gbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSlcbiAgICAgIGlmIChmbGFncy5yZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWUpIHtcbiAgICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IHRvIGJsb2NrLWxpc3QgZG9tYWluIHRoYXQgbWF0Y2hlcyB0aGUgdG9wL21haW4gZnJhbWUgZG9tYWluLicpXG4gICAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgICAgfVxuXG4gICAgICBsb2coJ0Jsb2NraW5nIHJlcXVlc3Q6IG9yaWdpblRvcEhvc3Q6ICcsIG9yaWdpblRvcEhvc3QsICcgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdDogJywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSwgJyByZXF1ZXN0VG9wSG9zdDogJywgcmVxdWVzdFRvcEhvc3QsICcgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdDogJywgZmxhZ3MucmVxdWVzdEhvc3RJbkJsb2NrbGlzdClcbiAgICAgIGJsb2NrZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLnB1c2gocmVxdWVzdFRvcEhvc3QpXG4gICAgICBpZiAoYmxvY2tlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0uaW5kZXhPZihyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpID09PSAtMSkge1xuICAgICAgICBibG9ja2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSlcbiAgICAgIH1cbiAgICAgIHRvdGFsRXhlY1RpbWVbcmVxdWVzdFRhYklEXSArPSBEYXRlLm5vdygpIC0gYmxvY2tUcmFja2VyUmVxdWVzdHNTdGFydFxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNob3cocmVxdWVzdFRhYklEKVxuICAgICAgcmV0dXJuIHtjYW5jZWw6IHRydWV9XG4gICAgfVxuXG4gICAgbG9nKCdEZWZhdWx0IHRvIGFsbG93aW5nIHJlcXVlc3QuJylcbiAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydFJlcXVlc3RMaXN0ZW5lciAoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpIHtcbiAgYnJvd3Nlci53ZWJSZXF1ZXN0Lm9uQmVmb3JlUmVxdWVzdC5hZGRMaXN0ZW5lcihcbiAgICBibG9ja1RyYWNrZXJSZXF1ZXN0cyhibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCksXG4gICAge3VybHM6IFsnKjovLyovKiddfSxcbiAgICBbJ2Jsb2NraW5nJ11cbiAgKVxufVxuXG5mdW5jdGlvbiBzdGFydFdpbmRvd0FuZFRhYkxpc3RlbmVycyAoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKSB7XG4gIGJyb3dzZXIud2luZG93cy5vbkZvY3VzQ2hhbmdlZC5hZGRMaXN0ZW5lcigod2luZG93SUQpID0+IHtcbiAgICBicm93c2VyLndpbmRvd3MuZ2V0KHdpbmRvd0lELCB7fSwgKGZvY3VzZWRXaW5kb3cpID0+IHtcbiAgICAgIGlmIChmb2N1c2VkV2luZG93LmluY29nbml0bykge1xuICAgICAgICBwcml2YXRlQnJvd3NpbmdNb2RlID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcHJpdmF0ZUJyb3dzaW5nTW9kZSA9IGZhbHNlXG4gICAgICB9XG4gICAgfSlcbiAgICBsb2coJ2Jyb3dzZXIud2luZG93cy5vbkZvY3VzQ2hhbmdlZCwgd2luZG93SUQ6ICcgKyB3aW5kb3dJRClcbiAgICBicm93c2VyLnRhYnMucXVlcnkoe2FjdGl2ZTogdHJ1ZSwgd2luZG93SWQ6IHdpbmRvd0lEfSwgKHRhYnNBcnJheSkgPT4ge1xuICAgICAgbGV0IHRhYiA9IHRhYnNBcnJheVswXVxuICAgICAgY3VycmVudEFjdGl2ZVRhYklEID0gdGFiLmlkXG4gICAgICBsZXQgdGFiVG9wSG9zdCA9IGNhbm9uaWNhbGl6ZUhvc3QobmV3IFVSTCh0YWIudXJsKS5ob3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKHRhYlRvcEhvc3QpXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCh0YWJUb3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfSlcbiAgfSlcblxuICBicm93c2VyLnRhYnMub25BY3RpdmF0ZWQuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKGFjdGl2ZUluZm8pIHtcbiAgICBjdXJyZW50QWN0aXZlVGFiSUQgPSBhY3RpdmVJbmZvLnRhYklkXG4gICAgYnJvd3Nlci50YWJzLmdldChjdXJyZW50QWN0aXZlVGFiSUQsIGZ1bmN0aW9uICh0YWIpIHtcbiAgICAgIGxldCB0YWJUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHRhYi51cmwpLmhvc3QpXG4gICAgICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4ID0gYWxsb3dlZEhvc3RzLmluZGV4T2YodGFiVG9wSG9zdClcbiAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKHRhYlRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICB9KVxuICB9KVxuXG4gIGJyb3dzZXIudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKHRhYklELCBjaGFuZ2VJbmZvKSB7XG4gICAgaWYgKGNoYW5nZUluZm8uc3RhdHVzID09PSAnbG9hZGluZycpIHtcbiAgICAgIHJlc3RhcnRCbG9rRm9yVGFiKHRhYklEKVxuICAgICAgYnJvd3Nlci50YWJzLmdldChjdXJyZW50QWN0aXZlVGFiSUQsIGZ1bmN0aW9uICh0YWIpIHtcbiAgICAgICAgbGV0IHRhYlRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwodGFiLnVybCkuaG9zdClcbiAgICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAodGFiVG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgICAgfSlcbiAgICB9IGVsc2UgaWYgKGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgICBsb2coJyoqKioqKioqIHRhYiBjaGFuZ2VJbmZvLnN0YXR1cyBjb21wbGV0ZSAqKioqKioqKicpXG4gICAgICBpZiAoYmxvY2tlZFJlcXVlc3RzW3RhYklEXSkge1xuICAgICAgICBsb2coJ2Jsb2NrZWQgJyArIGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0ubGVuZ3RoICsgJyByZXF1ZXN0czogJywgYmxvY2tlZFJlcXVlc3RzW3RhYklEXSlcbiAgICAgICAgbG9nKCdmcm9tICcgKyBibG9ja2VkRW50aXRpZXNbdGFiSURdLmxlbmd0aCArICcgZW50aXRpZXM6ICcsIGJsb2NrZWRFbnRpdGllc1t0YWJJRF0pXG4gICAgICB9XG4gICAgICBpZiAoYWxsb3dlZFJlcXVlc3RzW3RhYklEXSkge1xuICAgICAgICBsb2coJ2FsbG93ZWQgJyArIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0ubGVuZ3RoICsgJyByZXF1ZXN0czogJywgYWxsb3dlZFJlcXVlc3RzW3RhYklEXSlcbiAgICAgICAgbG9nKCdmcm9tICcgKyBhbGxvd2VkRW50aXRpZXNbdGFiSURdLmxlbmd0aCArICcgZW50aXRpZXM6ICcsIGFsbG93ZWRFbnRpdGllc1t0YWJJRF0pXG4gICAgICB9XG4gICAgICBsb2coJ3RvdGFsRXhlY1RpbWU6ICcgKyB0b3RhbEV4ZWNUaW1lW3RhYklEXSlcbiAgICAgIGxvZygnKioqKioqKiogdGFiIGNoYW5nZUluZm8uc3RhdHVzIGNvbXBsZXRlICoqKioqKioqJylcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIHN0YXJ0TWVzc2FnZUxpc3RlbmVyIChhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMsIHRlc3RQaWxvdFBpbmdDaGFubmVsKSB7XG4gIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICBpZiAobWVzc2FnZSA9PT0gJ2Rpc2FibGUnKSB7XG4gICAgICBsZXQgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCA9IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF1cbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0LFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiAnYmxvay1kaXNhYmxlZCcsXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IGN1cnJlbnRBY3RpdmVUYWJJRCxcbiAgICAgICAgcGF0aDoge1xuICAgICAgICAgICcxOSc6ICdpbWcvdHJhY2tpbmctcHJvdGVjdGlvbi1kaXNhYmxlZC0xNi5wbmcnLFxuICAgICAgICAgICczOCc6ICdpbWcvdHJhY2tpbmctcHJvdGVjdGlvbi1kaXNhYmxlZC0zMi5wbmcnXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBhbGxvd2VkSG9zdHMucHVzaChtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7YWxsb3dlZEhvc3RzOiBhbGxvd2VkSG9zdHN9KVxuICAgICAgYnJvd3Nlci50YWJzLnJlbG9hZChjdXJyZW50QWN0aXZlVGFiSUQpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlID09PSAncmUtZW5hYmxlJykge1xuICAgICAgbGV0IG1haW5GcmFtZU9yaWdpblRvcEhvc3QgPSBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdXG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ2Jsb2stZW5hYmxlZCcsXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IGN1cnJlbnRBY3RpdmVUYWJJRCxcbiAgICAgICAgcGF0aDoge1xuICAgICAgICAgICcxOSc6ICdpbWcvdHJhY2tpbmctcHJvdGVjdGlvbi0xNi5wbmcnLFxuICAgICAgICAgICczOCc6ICdpbWcvdHJhY2tpbmctcHJvdGVjdGlvbi0zMi5wbmcnXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBhbGxvd2VkSG9zdHMuc3BsaWNlKG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXgsIDEpXG4gICAgICBicm93c2VyLnN0b3JhZ2UubG9jYWwuc2V0KHthbGxvd2VkSG9zdHM6IGFsbG93ZWRIb3N0c30pXG4gICAgICBicm93c2VyLnRhYnMucmVsb2FkKGN1cnJlbnRBY3RpdmVUYWJJRClcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuaGFzT3duUHJvcGVydHkoJ2ZlZWRiYWNrJykpIHtcbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiBtZXNzYWdlLmZlZWRiYWNrLFxuICAgICAgICBicmVha2FnZTogJycsXG4gICAgICAgIG5vdGVzOiAnJ1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgICByZXBvcnRlZEhvc3RzW21haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF1dID0gbWVzc2FnZVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7cmVwb3J0ZWRIb3N0czogcmVwb3J0ZWRIb3N0c30pXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cChjdXJyZW50QWN0aXZlT3JpZ2luLCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlLmhhc093blByb3BlcnR5KCdicmVha2FnZScpKSB7XG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ3N1Ym1pdCcsXG4gICAgICAgIGJyZWFrYWdlOiBtZXNzYWdlLmJyZWFrYWdlLFxuICAgICAgICBub3RlczogbWVzc2FnZS5ub3Rlc1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBzdGFydExpc3RlbmVycyAoe2Jsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0LCByZXBvcnRlZEhvc3RzfSwgdGVzdFBpbG90UGluZ0NoYW5uZWwpIHtcbiAgc3RhcnRSZXF1ZXN0TGlzdGVuZXIoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpXG5cbiAgc3RhcnRXaW5kb3dBbmRUYWJMaXN0ZW5lcnMoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuXG4gIHN0YXJ0TWVzc2FnZUxpc3RlbmVyKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cywgdGVzdFBpbG90UGluZ0NoYW5uZWwpXG59XG5cbmNvbnN0IHN0YXRlID0ge1xuICBibG9ja2xpc3Q6IG5ldyBNYXAoKSxcbiAgYWxsb3dlZEhvc3RzOiBbXSxcbiAgcmVwb3J0ZWRIb3N0czoge30sXG4gIGVudGl0eUxpc3Q6IHt9XG59XG5cbmZ1bmN0aW9uIGluaXRUZXN0UGlsb3RQaW5nQ2hhbm5lbCAoe0Jyb2FkY2FzdENoYW5uZWx9KSB7XG4gIGxldCBURVNUUElMT1RfVEVMRU1FVFJZX0NIQU5ORUwgPSAndGVzdHBpbG90LXRlbGVtZXRyeSdcbiAgbGV0IHRlc3RQaWxvdFBpbmdDaGFubmVsID0gbmV3IEJyb2FkY2FzdENoYW5uZWwoVEVTVFBJTE9UX1RFTEVNRVRSWV9DSEFOTkVMKVxuICByZXR1cm4gdGVzdFBpbG90UGluZ0NoYW5uZWxcbn1cblxubG9hZExpc3RzKHN0YXRlKS50aGVuKCgpID0+IHtcbiAgbGV0IHRlc3RQaWxvdFBpbmdDaGFubmVsID0gaW5pdFRlc3RQaWxvdFBpbmdDaGFubmVsKHdpbmRvdylcbiAgc3RhcnRMaXN0ZW5lcnMoc3RhdGUsIHRlc3RQaWxvdFBpbmdDaGFubmVsKVxufSwgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpKVxuIiwidmFyIGlwNERlY2ltYWxQYXR0ZXJuID0gJ14oPzooPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT8pLil7M30oPzooPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT8pKSQnXG52YXIgaXA0SGV4UGF0dGVybiA9ICdeKD86KD86MHhbMC05YS1mXXsxLDJ9KS4pezN9KD86MHhbMC05YS1mXXsxLDJ9KSQnXG52YXIgaXA0T2N0YWxQYXR0ZXJuID0gJ14oPzooPzowM1sxLTddWzAtN118MFsxMl1bMC03XXsxLDJ9fFswLTddezEsMn0pLil7M30oPzowM1sxLTddWzAtN118MFsxMl1bMC03XXsxLDJ9fFswLTddezEsMn0pJCdcblxuLy8gbGlrZSB0cmltKCkgaGVscGVyIGZyb20gdW5kZXJzY29yZS5zdHJpbmc6XG4vLyB0cmltcyBjaGFycyBmcm9tIGJlZ2lubmluZyBhbmQgZW5kIG9mIHN0clxuZnVuY3Rpb24gdHJpbSAoc3RyLCBjaGFycykge1xuICAvLyBlc2NhcGUgYW55IHJlZ2V4cCBjaGFyc1xuICBjaGFycyA9IGNoYXJzLnJlcGxhY2UoLyhbLiorP149IToke30oKXxbXFxdXFwvXFxcXF0pL2csICdcXFxcJDEnKVxuICByZXR1cm4gc3RyLnJlcGxhY2UobmV3IFJlZ0V4cCgnXicgKyBjaGFycyArICcrfCcgKyBjaGFycyArICcrJCcsICdnJyksICcnKVxufVxuXG4vLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zYWZlLWJyb3dzaW5nL3Y0L3VybHMtaGFzaGluZyNjYW5vbmljYWxpemF0aW9uXG5mdW5jdGlvbiBjYW5vbmljYWxpemVIb3N0IChob3N0KSB7XG4gIC8vIFJlbW92ZSBhbGwgbGVhZGluZyBhbmQgdHJhaWxpbmcgZG90c1xuICB2YXIgY2Fub25pY2FsaXplZEhvc3QgPSB0cmltKGhvc3QsICcuJylcblxuICAvLyBSZXBsYWNlIGNvbnNlY3V0aXZlIGRvdHMgd2l0aCBhIHNpbmdsZSBkb3RcbiAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC5yZXBsYWNlKG5ldyBSZWdFeHAoJ1suXSsnLCAnZycpLCAnLicpXG5cbiAgLy8gSWYgdGhlIGhvc3RuYW1lIGNhbiBiZSBwYXJzZWQgYXMgYW4gSVAgYWRkcmVzcyxcbiAgLy8gbm9ybWFsaXplIGl0IHRvIDQgZG90LXNlcGFyYXRlZCBkZWNpbWFsIHZhbHVlcy5cbiAgLy8gVGhlIGNsaWVudCBzaG91bGQgaGFuZGxlIGFueSBsZWdhbCBJUC1hZGRyZXNzIGVuY29kaW5nLFxuICAvLyBpbmNsdWRpbmcgb2N0YWwsIGhleCwgYW5kIFRPRE86IGZld2VyIHRoYW4gZm91ciBjb21wb25lbnRzXG4gIHZhciBiYXNlID0gMTBcbiAgdmFyIGlzSVA0RGVjaW1hbCwgaXNJUDRIZXgsIGlzSVA0T2N0YWxcblxuICBpc0lQNERlY2ltYWwgPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDREZWNpbWFsUGF0dGVybikgIT0gbnVsbFxuICBpc0lQNEhleCA9IGNhbm9uaWNhbGl6ZWRIb3N0Lm1hdGNoKGlwNEhleFBhdHRlcm4pICE9IG51bGxcbiAgaXNJUDRPY3RhbCA9IGNhbm9uaWNhbGl6ZWRIb3N0Lm1hdGNoKGlwNE9jdGFsUGF0dGVybikgIT0gbnVsbFxuICBpZiAoaXNJUDREZWNpbWFsIHx8IGlzSVA0SGV4IHx8IGlzSVA0T2N0YWwpIHtcbiAgICBpZiAoaXNJUDRIZXgpIHtcbiAgICAgIGJhc2UgPSAxNlxuICAgIH0gZWxzZSBpZiAoaXNJUDRPY3RhbCkge1xuICAgICAgYmFzZSA9IDhcbiAgICB9XG4gICAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC5zcGxpdCgnLicpLm1hcChudW0gPT4gcGFyc2VJbnQobnVtLCBiYXNlKSkuam9pbignLicpXG4gIH1cblxuICAvLyBMb3dlcmNhc2UgdGhlIHdob2xlIHN0cmluZ1xuICBjYW5vbmljYWxpemVkSG9zdCA9IGNhbm9uaWNhbGl6ZWRIb3N0LnRvTG93ZXJDYXNlKClcbiAgcmV0dXJuIGNhbm9uaWNhbGl6ZWRIb3N0XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjYW5vbmljYWxpemVIb3N0LFxuICB0cmltXG59XG4iLCJmdW5jdGlvbiBhbGxIb3N0cyAoaG9zdCkge1xuICBjb25zdCBhbGxIb3N0cyA9IFtdXG4gIGNvbnN0IGhvc3RQYXJ0cyA9IGhvc3Quc3BsaXQoJy4nKVxuICB3aGlsZSAoaG9zdFBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICBhbGxIb3N0cy5wdXNoKGhvc3RQYXJ0cy5qb2luKCcuJykpXG4gICAgaG9zdFBhcnRzLnNwbGljZSgwLCAxKVxuICB9XG4gIHJldHVybiBhbGxIb3N0c1xufVxuXG5mdW5jdGlvbiBsb2FkTGlzdHMgKHN0YXRlKSB7XG4gIGNvbnN0IGJsb2NrTGlzdFByb21pc2UgPSBsb2FkSlNPTignanMvZGlzY29ubmVjdC1ibG9ja2xpc3QuanNvbicpLnRoZW4oKGRhdGEpID0+IHtcbiAgICBzdGF0ZS5ibG9ja2xpc3QgPSBwcm9jZXNzQmxvY2tMaXN0SlNPTihkYXRhKVxuICB9KVxuXG4gIGNvbnN0IGVudGl0eUxpc3RQcm9taXNlID0gbG9hZEpTT04oJ2pzL2Rpc2Nvbm5lY3QtZW50aXR5bGlzdC5qc29uJykudGhlbigoZGF0YSkgPT4ge1xuICAgIHN0YXRlLmVudGl0eUxpc3QgPSBkYXRhXG4gIH0pXG5cbiAgY29uc3QgYWxsb3dlZEhvc3RzUHJvbWlzZSA9IGdldEFsbG93ZWRIb3N0c0xpc3QoKS50aGVuKChhbGxvd2VkSG9zdHMpID0+IHtcbiAgICBzdGF0ZS5hbGxvd2VkSG9zdHMgPSBhbGxvd2VkSG9zdHNcbiAgfSlcblxuICBjb25zdCByZXBvcnRlZEhvc3RzUHJvbWlzZSA9IGdldFJlcG9ydGVkSG9zdHNMaXN0KCkudGhlbigocmVwb3J0ZWRIb3N0cykgPT4ge1xuICAgIHN0YXRlLnJlcG9ydGVkSG9zdHMgPSByZXBvcnRlZEhvc3RzXG4gIH0pXG5cbiAgcmV0dXJuIFByb21pc2UuYWxsKFtibG9ja0xpc3RQcm9taXNlLCBlbnRpdHlMaXN0UHJvbWlzZSwgYWxsb3dlZEhvc3RzUHJvbWlzZSwgcmVwb3J0ZWRIb3N0c1Byb21pc2VdKVxufVxuXG5mdW5jdGlvbiBsb2FkSlNPTiAodXJsKSB7XG4gIHJldHVybiBmZXRjaCh1cmwpXG4gICAgLnRoZW4oKHJlcykgPT4gcmVzLmpzb24oKSlcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc0Jsb2NrTGlzdEpTT04gKGRhdGEpIHtcbiAgY29uc3QgYmxvY2tsaXN0ID0gbmV3IE1hcCgpXG5cbiAgLy8gcmVtb3ZlIHVuLW5lZWRlZCBjYXRlZ29yaWVzIHBlciBkaXNjb25uZWN0XG4gIGRlbGV0ZSBkYXRhLmNhdGVnb3JpZXNbJ0NvbnRlbnQnXVxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydMZWdhY3kgRGlzY29ubmVjdCddXG4gIGRlbGV0ZSBkYXRhLmNhdGVnb3JpZXNbJ0xlZ2FjeSBDb250ZW50J11cblxuICAvLyBwYXJzZSB0aHJ1IHRoZSBkaXNjb25uZWN0IGJsb2NrbGlzdCBhbmQgY3JlYXRlXG4gIC8vIGxvY2FsIGJsb2NrbGlzdCBcImdyb3VwZWRcIiBieSBtYWluIGRvbWFpbi4gSS5lLixcbiAgLy8gYmxvY2tsaXN0W1wiZmFjZWJvb2suY29tXCJdID0gaHR0cDovL3d3dy5mYWNlYm9vay5jb21cbiAgLy8gYmxvY2tsaXN0W1wiZmIuY29tXCJdID0gaHR0cDovL3d3dy5mYWNlYm9vay5jb21cbiAgLy8gYmxvY2tsaXN0W1wiZG91YmxlY2xpY2submV0XCJdID0gaHR0cDovL3d3dy5nb29nbGUuY29tXG4gIC8vIGJsb2NrbGlzdFtcImdvb2dsZS1hbmFseXRpY3MuY29tXCJdID0gaHR0cDovL3d3dy5nb29nbGUuY29tXG4gIC8vIGV0Yy5cbiAgZm9yIChsZXQgY2F0ZWdvcnlOYW1lIGluIGRhdGEuY2F0ZWdvcmllcykge1xuICAgIHZhciBjYXRlZ29yeSA9IGRhdGEuY2F0ZWdvcmllc1tjYXRlZ29yeU5hbWVdXG4gICAgdmFyIGVudGl0eUNvdW50ID0gY2F0ZWdvcnkubGVuZ3RoXG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVudGl0eUNvdW50OyBpKyspIHtcbiAgICAgIHZhciBlbnRpdHkgPSBjYXRlZ29yeVtpXVxuXG4gICAgICBmb3IgKGxldCBlbnRpdHlOYW1lIGluIGVudGl0eSkge1xuICAgICAgICB2YXIgdXJscyA9IGVudGl0eVtlbnRpdHlOYW1lXVxuXG4gICAgICAgIGZvciAobGV0IG1haW5Eb21haW4gaW4gdXJscykge1xuICAgICAgICAgIGJsb2NrbGlzdC5zZXQobWFpbkRvbWFpbiwgW10pXG4gICAgICAgICAgdmFyIGRvbWFpbnMgPSB1cmxzW21haW5Eb21haW5dXG4gICAgICAgICAgdmFyIGRvbWFpbnNDb3VudCA9IGRvbWFpbnMubGVuZ3RoXG5cbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRvbWFpbnNDb3VudDsgaisrKSB7XG4gICAgICAgICAgICBibG9ja2xpc3Quc2V0KGRvbWFpbnNbal0sIG1haW5Eb21haW4pXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJsb2NrbGlzdFxufVxuXG5mdW5jdGlvbiBnZXRBbGxvd2VkSG9zdHNMaXN0ICgpIHtcbiAgcmV0dXJuIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5nZXQoJ2FsbG93ZWRIb3N0cycpLnRoZW4oKGl0ZW0pID0+IHtcbiAgICBpZiAoaXRlbS5hbGxvd2VkSG9zdHMpIHtcbiAgICAgIHJldHVybiBpdGVtLmFsbG93ZWRIb3N0c1xuICAgIH1cbiAgICByZXR1cm4gW11cbiAgfSlcbn1cblxuZnVuY3Rpb24gZ2V0UmVwb3J0ZWRIb3N0c0xpc3QgKCkge1xuICByZXR1cm4gYnJvd3Nlci5zdG9yYWdlLmxvY2FsLmdldCgncmVwb3J0ZWRIb3N0cycpLnRoZW4oKGl0ZW0pID0+IHtcbiAgICBpZiAoaXRlbS5yZXBvcnRlZEhvc3RzKSB7XG4gICAgICByZXR1cm4gaXRlbS5yZXBvcnRlZEhvc3RzXG4gICAgfVxuICAgIHJldHVybiB7fVxuICB9KVxufVxuXG4vLyBjaGVjayBpZiBhbnkgaG9zdCBmcm9tIGxvd2VzdC1sZXZlbCB0byB0b3AtbGV2ZWwgaXMgaW4gdGhlIGJsb2NrbGlzdFxuZnVuY3Rpb24gaG9zdEluQmxvY2tsaXN0IChibG9ja2xpc3QsIGhvc3QpIHtcbiAgbGV0IHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QgPSBmYWxzZVxuICB2YXIgYWxsSG9zdFZhcmlhbnRzID0gYWxsSG9zdHMoaG9zdClcbiAgZm9yIChsZXQgaG9zdFZhcmlhbnQgb2YgYWxsSG9zdFZhcmlhbnRzKSB7XG4gICAgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdCA9IGJsb2NrbGlzdC5oYXMoaG9zdFZhcmlhbnQpXG4gICAgaWYgKHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG4vLyBjaGVjayBpZiBhbnkgaG9zdCBmcm9tIGxvd2VzdC1sZXZlbCB0byB0b3AtbGV2ZWwgaXMgaW4gdGhlIGVudGl0eWxpc3RcbmZ1bmN0aW9uIGhvc3RJbkVudGl0eSAoZW50aXR5SG9zdHMsIGhvc3QpIHtcbiAgbGV0IGVudGl0eUhvc3QgPSBmYWxzZVxuICBmb3IgKGxldCBob3N0VmFyaWFudCBvZiBhbGxIb3N0cyhob3N0KSkge1xuICAgIGVudGl0eUhvc3QgPSBlbnRpdHlIb3N0cy5pbmRleE9mKGhvc3RWYXJpYW50KSA+IC0xXG4gICAgaWYgKGVudGl0eUhvc3QpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxsSG9zdHMsXG4gIGxvYWRMaXN0cyxcbiAgcHJvY2Vzc0Jsb2NrTGlzdEpTT04sXG4gIGhvc3RJbkJsb2NrbGlzdCxcbiAgaG9zdEluRW50aXR5XG59XG4iLCJpZiAocHJvY2Vzcy5lbnYuTU9ERSA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gIGV4cG9ydHMubG9nID0gZnVuY3Rpb24gbm9vcCAoKSB7fVxufSBlbHNlIHtcbiAgZXhwb3J0cy5sb2cgPSBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpXG59XG4iLCJjb25zdCB7bG9nfSA9IHJlcXVpcmUoJy4vbG9nJylcbmNvbnN0IHtob3N0SW5FbnRpdHl9ID0gcmVxdWlyZSgnLi9saXN0cycpXG5cbmxldCBob3N0RW50aXR5Q2FjaGUgPSB7fVxuXG5mdW5jdGlvbiByZXF1ZXN0QWxsb3dlciAodGFiSUQsIHRvdGFsRXhlY1RpbWUsIHN0YXJ0RGF0ZVRpbWUpIHtcbiAgdG90YWxFeGVjVGltZVt0YWJJRF0gKz0gRGF0ZS5ub3coKSAtIHN0YXJ0RGF0ZVRpbWVcbiAgcmV0dXJuIHt9XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVlc3RFbnRpdHkgKGVudGl0eUxpc3QsIG9yaWdpblRvcEhvc3QsIHJlcXVlc3RUb3BIb3N0LCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KSB7XG4gIGxldCByZXF1ZXN0RW50aXR5ID0geydlbnRpdHlOYW1lJzogbnVsbCwgJ3NhbWVFbnRpdHknOiBmYWxzZX1cblxuICAvLyBGaXJzdCwgdHJ5IHRvIHJldHVybiBldmVyeXRoaW5nIGZyb20gbWVtby1pemVkIGNhY2hlXG4gIGxldCByZXF1ZXN0RW50aXR5TmFtZSA9IGhvc3RFbnRpdHlDYWNoZVtyZXF1ZXN0VG9wSG9zdF1cbiAgbGV0IG9yaWdpbkVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbb3JpZ2luVG9wSG9zdF1cbiAgbGV0IG1haW5GcmFtZU9yaWdpbkVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbbWFpbkZyYW1lT3JpZ2luVG9wSG9zdF1cbiAgcmVxdWVzdEVudGl0eS5zYW1lRW50aXR5ID0gKFxuICAgIHJlcXVlc3RFbnRpdHlOYW1lICYmIChcbiAgICAgIHJlcXVlc3RFbnRpdHlOYW1lID09PSBvcmlnaW5FbnRpdHlOYW1lIHx8IHJlcXVlc3RFbnRpdHlOYW1lID09PSBtYWluRnJhbWVPcmlnaW5FbnRpdHlOYW1lXG4gICAgKVxuICApXG4gIGlmIChyZXF1ZXN0RW50aXR5LnNhbWVFbnRpdHkpIHtcbiAgICByZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUgPSByZXF1ZXN0RW50aXR5TmFtZVxuICAgIGxvZygncmV0dXJuaW5nIGZyb20gbWVtby1pemVkIGNhY2hlOiAnLCByZXF1ZXN0RW50aXR5KVxuICAgIHJldHVybiByZXF1ZXN0RW50aXR5XG4gIH1cblxuICAvLyBJZiBhIGhvc3Qgd2FzIG5vdCBmb3VuZCBpbiB0aGUgbWVtby1pemVkIGNhY2hlLCBjaGVjayB0aHJ1IHRoZSBlbnRpdHlMaXN0XG4gIGZvciAobGV0IGVudGl0eU5hbWUgaW4gZW50aXR5TGlzdCkge1xuICAgIGxldCBlbnRpdHkgPSBlbnRpdHlMaXN0W2VudGl0eU5hbWVdXG4gICAgbGV0IHJlcXVlc3RJc0VudGl0eVJlc291cmNlID0gZmFsc2VcbiAgICBsZXQgb3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSA9IGZhbHNlXG4gICAgbGV0IG1haW5GcmFtZU9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBmYWxzZVxuXG4gICAgcmVxdWVzdElzRW50aXR5UmVzb3VyY2UgPSBob3N0SW5FbnRpdHkoZW50aXR5LnJlc291cmNlcywgcmVxdWVzdFRvcEhvc3QpXG4gICAgaWYgKHJlcXVlc3RJc0VudGl0eVJlc291cmNlKSB7XG4gICAgICByZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUgPSBlbnRpdHlOYW1lXG4gICAgICBob3N0RW50aXR5Q2FjaGVbcmVxdWVzdFRvcEhvc3RdID0gZW50aXR5TmFtZVxuICAgIH1cblxuICAgIG9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBob3N0SW5FbnRpdHkoZW50aXR5LnByb3BlcnRpZXMsIG9yaWdpblRvcEhvc3QpXG4gICAgaWYgKG9yaWdpbklzRW50aXR5UHJvcGVydHkpIHtcbiAgICAgIGhvc3RFbnRpdHlDYWNoZVtvcmlnaW5Ub3BIb3N0XSA9IGVudGl0eU5hbWVcbiAgICB9XG5cbiAgICBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gaG9zdEluRW50aXR5KGVudGl0eS5wcm9wZXJ0aWVzLCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KVxuICAgIGlmIChtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5KSB7XG4gICAgICBob3N0RW50aXR5Q2FjaGVbbWFpbkZyYW1lT3JpZ2luVG9wSG9zdF0gPSBlbnRpdHlOYW1lXG4gICAgfVxuXG4gICAgaWYgKChvcmlnaW5Jc0VudGl0eVByb3BlcnR5IHx8IG1haW5GcmFtZU9yaWdpbklzRW50aXR5UHJvcGVydHkpICYmIHJlcXVlc3RJc0VudGl0eVJlc291cmNlKSB7XG4gICAgICBsb2coYG9yaWdpblRvcEhvc3QgJHtvcmlnaW5Ub3BIb3N0fSBhbmQgcmVzb3VyY2UgcmVxdWVzdFRvcEhvc3QgJHtyZXF1ZXN0VG9wSG9zdH0gYmVsb25nIHRvIHRoZSBzYW1lIGVudGl0eTogJHtlbnRpdHlOYW1lfTsgYWxsb3dpbmcgcmVxdWVzdGApXG4gICAgICByZXF1ZXN0RW50aXR5LnNhbWVFbnRpdHkgPSB0cnVlXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICAvLyBUT0RPOiBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9ibG9rL2lzc3Vlcy8xMTBcbiAgcmV0dXJuIHJlcXVlc3RFbnRpdHlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcXVlc3RBbGxvd2VyLFxuICBnZXRSZXF1ZXN0RW50aXR5XG59XG4iXX0=
