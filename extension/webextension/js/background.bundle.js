(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
      // blockedRequests[requestTabID].push(requestTopHost)
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

},{"./canonicalize":2,"./lists":3,"./log":4,"./requests":5}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
if ("production" === 'production') {
  exports.log = function noop () {}
} else {
  exports.log = console.log.bind(console)
}

},{}],5:[function(require,module,exports){
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

},{"./lists":3,"./log":4}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvYmFja2dyb3VuZC5qcyIsInNyYy9qcy9jYW5vbmljYWxpemUuanMiLCJzcmMvanMvbGlzdHMuanMiLCJzcmMvanMvbG9nLmpzIiwic3JjL2pzL3JlcXVlc3RzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJjb25zdCB7Y2Fub25pY2FsaXplSG9zdH0gPSByZXF1aXJlKCcuL2Nhbm9uaWNhbGl6ZScpXG5jb25zdCB7bG9hZExpc3RzLCBob3N0SW5CbG9ja2xpc3R9ID0gcmVxdWlyZSgnLi9saXN0cycpXG5jb25zdCB7cmVxdWVzdEFsbG93ZXIsIGdldFJlcXVlc3RFbnRpdHl9ID0gcmVxdWlyZSgnLi9yZXF1ZXN0cycpXG5jb25zdCB7bG9nfSA9IHJlcXVpcmUoJy4vbG9nJylcblxuLy8gU2V0IHNvbWUgZXhwbGljaXQgd2luZG93IHZhcmlhYmxlIGZvciBwYWdlQWN0aW9uIHRvIGFjY2Vzc1xud2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkID0gZmFsc2VcbndpbmRvdy50b3BGcmFtZUhvc3RSZXBvcnQgPSB7fVxud2luZG93LmJsb2NrZWRSZXF1ZXN0cyA9IHt9XG53aW5kb3cuYmxvY2tlZEVudGl0aWVzID0ge31cbndpbmRvdy5hbGxvd2VkUmVxdWVzdHMgPSB7fVxud2luZG93LmFsbG93ZWRFbnRpdGllcyA9IHt9XG53aW5kb3cuc2Vzc2lvblVSSUNvdW50ID0gMFxud2luZG93LnRvdGFsUGFnZUxvYWRUaW1lID0gMFxud2luZG93LmN1cnJlbnRQYWdlTG9hZFRpbWUgPSAwXG53aW5kb3cuY3VycmVudFBhZ2VMb2FkU3RhcnQgPSBEYXRlLm5vdygpXG53aW5kb3cudG90YWxCbG9ja2VkUmVxdWVzdHMgPSAwXG53aW5kb3cudG90YWxCbG9ja2VkU2l0ZXMgPSAwXG53aW5kb3cudG90YWxCbG9ja2VkRW50aXRpZXMgPSAwXG5cbnZhciBwcml2YXRlQnJvd3NpbmdNb2RlID0gZmFsc2VcbnZhciBjdXJyZW50QWN0aXZlVGFiSURcbnZhciBjdXJyZW50QWN0aXZlT3JpZ2luXG52YXIgdG90YWxFeGVjVGltZSA9IHt9XG52YXIgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWQgPSB7fVxudmFyIG1haW5GcmFtZU9yaWdpblRvcEhvc3RzID0ge31cbnZhciBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4ID0gLTFcblxuZnVuY3Rpb24gcmVzdGFydEJsb2tGb3JUYWIgKHRhYklEKSB7XG4gIGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0gPSBbXVxuICBibG9ja2VkRW50aXRpZXNbdGFiSURdID0gW11cbiAgYWxsb3dlZFJlcXVlc3RzW3RhYklEXSA9IFtdXG4gIGFsbG93ZWRFbnRpdGllc1t0YWJJRF0gPSBbXVxuICB0b3RhbEV4ZWNUaW1lW3RhYklEXSA9IDBcbiAgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbdGFiSURdID0gbnVsbFxuICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFt0YWJJRF0gPSBmYWxzZVxufVxuXG5mdW5jdGlvbiBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCAodG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKSB7XG4gIGlmIChpc09yaWdpbkRpc2FibGVkKHRvcEhvc3QsIGFsbG93ZWRIb3N0cykpIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0RGlzYWJsZWQgPSB0cnVlXG4gIH0gZWxzZSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkID0gZmFsc2VcbiAgfVxuICBpZiAocmVwb3J0ZWRIb3N0cy5oYXNPd25Qcm9wZXJ0eSh0b3BIb3N0KSkge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3RSZXBvcnQgPSByZXBvcnRlZEhvc3RzW3RvcEhvc3RdXG4gIH0gZWxzZSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdFJlcG9ydCA9IHt9XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNPcmlnaW5EaXNhYmxlZCAoaG9zdCwgYWxsb3dlZEhvc3RzKSB7XG4gIHJldHVybiBhbGxvd2VkSG9zdHMuaW5kZXhPZihob3N0KSA+IC0xXG59XG5cbmZ1bmN0aW9uIGJsb2NrVHJhY2tlclJlcXVlc3RzIChibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCkge1xuICByZXR1cm4gZnVuY3Rpb24gZmlsdGVyUmVxdWVzdCAocmVxdWVzdERldGFpbHMpIHtcbiAgICBpZiAoIXdpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCkge1xuICAgICAgd2luZG93LnNlc3Npb25VUklDb3VudCsrXG4gICAgICB3aW5kb3cuY3VycmVudFBhZ2VMb2FkU3RhcnQgPSBEYXRlLm5vdygpXG4gICAgfVxuXG4gICAgdmFyIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnQgPSBEYXRlLm5vdygpXG4gICAgdmFyIHJlcXVlc3RUYWJJRCA9IHJlcXVlc3REZXRhaWxzLnRhYklkXG4gICAgdmFyIG9yaWdpblRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdFRvcEhvc3RcbiAgICB2YXIgcmVxdWVzdEVudGl0eVxuXG4gICAgdmFyIGZsYWdzID0ge1xuICAgICAgbWFpbk9yaWdpbkRpc2FibGVkOiBmYWxzZSxcbiAgICAgIGZpcmVmb3hPcmlnaW46IGZhbHNlLFxuICAgICAgbmV3T3JpZ2luOiBmYWxzZSxcbiAgICAgIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3Q6IGZhbHNlLFxuICAgICAgcmVxdWVzdElzVGhpcmRQYXJ0eTogZmFsc2UsXG4gICAgICByZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWU6IGZhbHNlXG4gICAgfVxuXG4gICAgdmFyIGFsbG93UmVxdWVzdCA9IHJlcXVlc3RBbGxvd2VyLmJpbmQobnVsbCwgcmVxdWVzdFRhYklELCB0b3RhbEV4ZWNUaW1lLCBibG9ja1RyYWNrZXJSZXF1ZXN0c1N0YXJ0KVxuXG4gICAgaWYgKHByaXZhdGVCcm93c2luZ01vZGUpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBpbiBwcml2YXRlIGJyb3dzaW5nIG1vZGUgd2luZG93OyBQQk0gVFAgd2lsbCBjYXRjaCB0aGVtLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCBmcm9tIFwidW5kZWZpbmVkXCIgb3JpZ2luIC0gYSBicm93c2VyIGludGVybmFsIG9yaWdpbi4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGFsbCBvcmlnaW4gZmxhZ3NcbiAgICBvcmlnaW5Ub3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLm9yaWdpblVybCkuaG9zdClcbiAgICBjdXJyZW50QWN0aXZlT3JpZ2luID0gb3JpZ2luVG9wSG9zdFxuXG4gICAgZmxhZ3MuZmlyZWZveE9yaWdpbiA9ICh0eXBlb2Ygb3JpZ2luVG9wSG9zdCAhPT0gJ3VuZGVmaW5lZCcgJiYgb3JpZ2luVG9wSG9zdC5pbmNsdWRlcygnbW96LW51bGxwcmluY2lwYWwnKSlcbiAgICBmbGFncy5uZXdPcmlnaW4gPSBvcmlnaW5Ub3BIb3N0ID09PSAnJ1xuICAgIGlmIChmbGFncy5maXJlZm94T3JpZ2luIHx8IGZsYWdzLm5ld09yaWdpbikge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gRmlyZWZveCBhbmQvb3IgbmV3IHRhYi93aW5kb3cgb3JpZ2lucy4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgLy8gU2V0IG1haW4gJiB0b3AgZnJhbWUgdmFsdWVzIGlmIGZyYW1lSWQgPT09IDBcbiAgICBpZiAocmVxdWVzdERldGFpbHMuZnJhbWVJZCA9PT0gMCkge1xuICAgICAgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSA9IG9yaWdpblRvcEhvc3RcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZihvcmlnaW5Ub3BIb3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRbcmVxdWVzdFRhYklEXSA9IG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPiAtMVxuICAgIH1cblxuICAgIHJlcXVlc3RUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHJlcXVlc3REZXRhaWxzLnVybCkuaG9zdClcblxuICAgIGlmIChtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFtyZXF1ZXN0VGFiSURdKSB7XG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiByZXF1ZXN0VGFiSUQsXG4gICAgICAgIGltYWdlRGF0YTogZHJhdyhmYWxzZSwgMClcbiAgICAgIH0pXG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2hvdyhyZXF1ZXN0VGFiSUQpXG5cbiAgICAgIGlmIChob3N0SW5CbG9ja2xpc3QoYmxvY2tsaXN0LCByZXF1ZXN0VG9wSG9zdCkpIHtcbiAgICAgICAgYWxsb3dlZFJlcXVlc3RzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0VG9wSG9zdClcbiAgICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNldEljb24oe1xuICAgICAgICAgIHRhYklkOiB0YWJJRCxcbiAgICAgICAgICBpbWFnZURhdGE6IGRyYXcoIXRvcEZyYW1lSG9zdERpc2FibGVkLCBhbGxvd2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5sZW5ndGgpXG4gICAgICAgIH0pXG4gICAgICB9XG4vKlxuICAgICAgaWYgKGFsbG93ZWRFbnRpdGllc1tyZXF1ZXN0VGFiSURdLmluZGV4T2YocmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgYWxsb3dlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpXG4gICAgICB9XG4qL1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gb3JpZ2luIGZvciB3aGljaCBCbG9rIGlzIGRpc2FibGVkLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdERldGFpbHMudHlwZSA9PT0gJ21haW5fZnJhbWUnKSB7XG4gICAgICBsb2coJ0FsbG93aW5nIGNsaWNrcyB0byBsaW5rcy4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgZmxhZ3MucmVxdWVzdEhvc3RJbkJsb2NrbGlzdCA9IGhvc3RJbkJsb2NrbGlzdChibG9ja2xpc3QsIHJlcXVlc3RUb3BIb3N0KVxuXG4gICAgaWYgKCFmbGFncy5yZXF1ZXN0SG9zdEluQmxvY2tsaXN0KSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgdG8gZG9tYWluIE5PVCBpbiB0aGUgYmxvY2stbGlzdC4nKVxuICAgICAgcmV0dXJuIGFsbG93UmVxdWVzdCgpXG4gICAgfVxuXG4gICAgcmVxdWVzdEVudGl0eSA9IGdldFJlcXVlc3RFbnRpdHkoZW50aXR5TGlzdCwgb3JpZ2luVG9wSG9zdCwgcmVxdWVzdFRvcEhvc3QsIG9yaWdpblRvcEhvc3QpXG4gICAgaWYgKHJlcXVlc3RFbnRpdHkuc2FtZUVudGl0eSkge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IHRvIGJsb2NrLWxpc3QgZG9tYWluIHRoYXQgYmVsb25ncyB0byBzYW1lIGVudGl0eSBhcyBvcmlnaW4gZG9tYWluLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBmbGFncy5yZXF1ZXN0SXNUaGlyZFBhcnR5ID0gcmVxdWVzdFRvcEhvc3QgIT09IG9yaWdpblRvcEhvc3RcblxuICAgIGlmIChmbGFncy5yZXF1ZXN0SXNUaGlyZFBhcnR5KSB7XG4gICAgICBmbGFncy5yZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWUgPSAocmVxdWVzdERldGFpbHMuZnJhbWVJZCA+IDAgJiYgcmVxdWVzdFRvcEhvc3QgPT09IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3JlcXVlc3RUYWJJRF0pXG4gICAgICBpZiAoZmxhZ3MucmVxdWVzdEhvc3RNYXRjaGVzTWFpbkZyYW1lKSB7XG4gICAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCB0byBibG9jay1saXN0IGRvbWFpbiB0aGF0IG1hdGNoZXMgdGhlIHRvcC9tYWluIGZyYW1lIGRvbWFpbi4nKVxuICAgICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICAgIH1cblxuICAgICAgbG9nKCdCbG9ja2luZyByZXF1ZXN0OiBvcmlnaW5Ub3BIb3N0OiAnLCBvcmlnaW5Ub3BIb3N0LCAnIG1haW5GcmFtZU9yaWdpblRvcEhvc3Q6ICcsIG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW3JlcXVlc3RUYWJJRF0sICcgcmVxdWVzdFRvcEhvc3Q6ICcsIHJlcXVlc3RUb3BIb3N0LCAnIHJlcXVlc3RIb3N0SW5CbG9ja2xpc3Q6ICcsIGZsYWdzLnJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpXG4gICAgICAvLyBibG9ja2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RUb3BIb3N0KVxuICAgICAgdG90YWxCbG9ja2VkUmVxdWVzdHMrK1xuICAgICAgaWYgKGJsb2NrZWRFbnRpdGllc1tyZXF1ZXN0VGFiSURdLmluZGV4T2YocmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgYmxvY2tlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0ucHVzaChyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpXG4gICAgICAgIHRvdGFsQmxvY2tlZEVudGl0aWVzKytcbiAgICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNldEljb24oe1xuICAgICAgICAgIHRhYklkOiByZXF1ZXN0VGFiSUQsXG4gICAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KCF0b3BGcmFtZUhvc3REaXNhYmxlZCwgYmxvY2tlZFJlcXVlc3RzW3JlcXVlc3RUYWJJRF0ubGVuZ3RoKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgdG90YWxFeGVjVGltZVtyZXF1ZXN0VGFiSURdICs9IERhdGUubm93KCkgLSBibG9ja1RyYWNrZXJSZXF1ZXN0c1N0YXJ0XG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2hvdyhyZXF1ZXN0VGFiSUQpXG4gICAgICByZXR1cm4ge2NhbmNlbDogdHJ1ZX1cbiAgICB9XG5cbiAgICBsb2coJ0RlZmF1bHQgdG8gYWxsb3dpbmcgcmVxdWVzdC4nKVxuICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0UmVxdWVzdExpc3RlbmVyIChibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdCkge1xuICBsZXQgZmlsdGVyID0ge3VybHM6IFsnKjovLyovKiddfVxuXG4gIGJyb3dzZXIud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QuYWRkTGlzdGVuZXIoXG4gICAgYmxvY2tUcmFja2VyUmVxdWVzdHMoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpLFxuICAgIGZpbHRlcixcbiAgICBbJ2Jsb2NraW5nJ11cbiAgKVxuXG4gIGJyb3dzZXIud2ViUmVxdWVzdC5vbkNvbXBsZXRlZC5hZGRMaXN0ZW5lcihcbiAgICAocmVxdWVzdERldGFpbHMpID0+IHtcbiAgICAgIHdpbmRvdy5jdXJyZW50UGFnZUxvYWRUaW1lID0gRGF0ZS5ub3coKSAtIHdpbmRvdy5jdXJyZW50UGFnZUxvYWRTdGFydFxuICAgICAgd2luZG93LnRvdGFsUGFnZUxvYWRUaW1lICs9IHdpbmRvdy5jdXJyZW50UGFnZUxvYWRUaW1lXG4gICAgICAvKiBTaW5jZSB3ZSBjYW4ndCB0aW1lIHRoZSBsb2FkIG9mIGJsb2NrZWQgcmVzb3VyY2VzLCBhc3N1bWUgdGhhdCB0cmFja2luZyBwcm90ZWN0aW9uXG4gICAgICAgICBzYXZlcyB+NDQlIGxvYWQgdGltZTpcbiAgICAgICAgIGh0dHA6Ly9saWZlaGFja2VyLmNvbS90dXJuLW9uLXRyYWNraW5nLXByb3RlY3Rpb24taW4tZmlyZWZveC10by1tYWtlLXBhZ2VzLWxvLTE3MDY5NDYxNjZcbiAgICAgICovXG4gICAgICBpZiAod2luZG93LnNlc3Npb25VUklDb3VudCAmJiB3aW5kb3cudG90YWxQYWdlTG9hZFRpbWUpIHtcbiAgICAgICAgbGV0IHRpbWVTYXZlZCA9ICh3aW5kb3cudG90YWxQYWdlTG9hZFRpbWUgLyAoMSAtIC40NCkpIC0gd2luZG93LnRvdGFsUGFnZUxvYWRUaW1lXG4gICAgICAgIGxldCBtZXNzYWdlID0ge1xuICAgICAgICAgIHRpbWVTYXZlZDogdGltZVNhdmVkLFxuICAgICAgICAgIGJsb2NrZWRSZXF1ZXN0czogd2luZG93LnRvdGFsQmxvY2tlZFJlcXVlc3RzLFxuICAgICAgICAgIGJsb2NrZWRTaXRlczogd2luZG93LnRvdGFsQmxvY2tlZFNpdGVzLFxuICAgICAgICAgIGJsb2NrZWRFbnRpdGllczogd2luZG93LnRvdGFsQmxvY2tlZEVudGl0aWVzXG4gICAgICAgIH1cbiAgICAgICAgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZmlsdGVyXG4gIClcbn1cblxuZnVuY3Rpb24gc3RhcnRXaW5kb3dBbmRUYWJMaXN0ZW5lcnMgKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cykge1xuICBicm93c2VyLndpbmRvd3Mub25Gb2N1c0NoYW5nZWQuYWRkTGlzdGVuZXIoKHdpbmRvd0lEKSA9PiB7XG4gICAgYnJvd3Nlci53aW5kb3dzLmdldCh3aW5kb3dJRCwge30sIChmb2N1c2VkV2luZG93KSA9PiB7XG4gICAgICBpZiAoZm9jdXNlZFdpbmRvdyAmJiBmb2N1c2VkV2luZG93LmluY29nbml0bykge1xuICAgICAgICBwcml2YXRlQnJvd3NpbmdNb2RlID0gdHJ1ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcHJpdmF0ZUJyb3dzaW5nTW9kZSA9IGZhbHNlXG4gICAgICB9XG4gICAgfSlcbiAgICBsb2coJ2Jyb3dzZXIud2luZG93cy5vbkZvY3VzQ2hhbmdlZCwgd2luZG93SUQ6ICcgKyB3aW5kb3dJRClcbiAgICBicm93c2VyLnRhYnMucXVlcnkoe2FjdGl2ZTogdHJ1ZSwgd2luZG93SWQ6IHdpbmRvd0lEfSwgKHRhYnNBcnJheSkgPT4ge1xuICAgICAgbGV0IHRhYiA9IHRhYnNBcnJheVswXVxuICAgICAgaWYgKCF0YWIpXG4gICAgICAgIHJldHVyblxuXG4gICAgICBjdXJyZW50QWN0aXZlVGFiSUQgPSB0YWIuaWRcbiAgICAgIGxldCB0YWJUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHRhYi51cmwpLmhvc3QpXG4gICAgICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4ID0gYWxsb3dlZEhvc3RzLmluZGV4T2YodGFiVG9wSG9zdClcbiAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKHRhYlRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICB9KVxuICB9KVxuXG4gIGJyb3dzZXIudGFicy5vbkFjdGl2YXRlZC5hZGRMaXN0ZW5lcihmdW5jdGlvbiAoYWN0aXZlSW5mbykge1xuICAgIGN1cnJlbnRBY3RpdmVUYWJJRCA9IGFjdGl2ZUluZm8udGFiSWRcbiAgICBicm93c2VyLnRhYnMuZ2V0KGN1cnJlbnRBY3RpdmVUYWJJRCwgZnVuY3Rpb24gKHRhYikge1xuICAgICAgbGV0IHRhYlRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwodGFiLnVybCkuaG9zdClcbiAgICAgIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSBhbGxvd2VkSG9zdHMuaW5kZXhPZih0YWJUb3BIb3N0KVxuICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAodGFiVG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgIH0pXG4gIH0pXG5cbiAgYnJvd3Nlci50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcihmdW5jdGlvbiAodGFiSUQsIGNoYW5nZUluZm8pIHtcbiAgICBpZiAoY2hhbmdlSW5mby5zdGF0dXMgPT09ICdsb2FkaW5nJykge1xuICAgICAgcmVzdGFydEJsb2tGb3JUYWIodGFiSUQpXG4gICAgICBicm93c2VyLnRhYnMuZ2V0KGN1cnJlbnRBY3RpdmVUYWJJRCwgZnVuY3Rpb24gKHRhYikge1xuICAgICAgICBsZXQgdGFiVG9wSG9zdCA9IGNhbm9uaWNhbGl6ZUhvc3QobmV3IFVSTCh0YWIudXJsKS5ob3N0KVxuICAgICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCh0YWJUb3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgICB9KVxuICAgIH0gZWxzZSBpZiAoY2hhbmdlSW5mby5zdGF0dXMgPT09ICdjb21wbGV0ZScpIHtcbiAgICAgIGxvZygnKioqKioqKiogdGFiIGNoYW5nZUluZm8uc3RhdHVzIGNvbXBsZXRlICoqKioqKioqJylcbiAgICAgIGlmIChibG9ja2VkUmVxdWVzdHNbdGFiSURdKSB7XG4gICAgICAgIGxvZygnYmxvY2tlZCAnICsgYmxvY2tlZFJlcXVlc3RzW3RhYklEXS5sZW5ndGggKyAnIHJlcXVlc3RzOiAnLCBibG9ja2VkUmVxdWVzdHNbdGFiSURdKVxuICAgICAgICBsb2coJ2Zyb20gJyArIGJsb2NrZWRFbnRpdGllc1t0YWJJRF0ubGVuZ3RoICsgJyBlbnRpdGllczogJywgYmxvY2tlZEVudGl0aWVzW3RhYklEXSlcbiAgICAgIH1cbiAgICAgIGlmIChhbGxvd2VkUmVxdWVzdHNbdGFiSURdKSB7XG4gICAgICAgIGxvZygnYWxsb3dlZCAnICsgYWxsb3dlZFJlcXVlc3RzW3RhYklEXS5sZW5ndGggKyAnIHJlcXVlc3RzOiAnLCBhbGxvd2VkUmVxdWVzdHNbdGFiSURdKVxuICAgICAgICBsb2coJ2Zyb20gJyArIGFsbG93ZWRFbnRpdGllc1t0YWJJRF0ubGVuZ3RoICsgJyBlbnRpdGllczogJywgYWxsb3dlZEVudGl0aWVzW3RhYklEXSlcbiAgICAgIH1cbiAgICAgIGxvZygndG90YWxFeGVjVGltZTogJyArIHRvdGFsRXhlY1RpbWVbdGFiSURdKVxuICAgICAgbG9nKCcqKioqKioqKiB0YWIgY2hhbmdlSW5mby5zdGF0dXMgY29tcGxldGUgKioqKioqKionKVxuICAgIH1cbiAgfSlcbn1cblxuZnVuY3Rpb24gc3RhcnRNZXNzYWdlTGlzdGVuZXIgKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cywgdGVzdFBpbG90UGluZ0NoYW5uZWwpIHtcbiAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgIGlmIChtZXNzYWdlID09PSAnZGlzYWJsZScpIHtcbiAgICAgIGxldCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0ID0gbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXVxuICAgICAgbGV0IHRlc3RQaWxvdFBpbmdNZXNzYWdlID0ge1xuICAgICAgICBvcmlnaW5Eb21haW46IG1haW5GcmFtZU9yaWdpblRvcEhvc3QsXG4gICAgICAgIHRyYWNrZXJEb21haW5zOiBibG9ja2VkUmVxdWVzdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgZXZlbnQ6ICdibG9rLWRpc2FibGVkJyxcbiAgICAgICAgYnJlYWthZ2U6ICcnLFxuICAgICAgICBub3RlczogJydcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNldEljb24oe1xuICAgICAgICB0YWJJZDogY3VycmVudEFjdGl2ZVRhYklELFxuICAgICAgICBpbWFnZURhdGE6IGRyYXcoZmFsc2UsIDApXG4gICAgICB9KVxuICAgICAgYWxsb3dlZEhvc3RzLnB1c2gobWFpbkZyYW1lT3JpZ2luVG9wSG9zdClcbiAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe2FsbG93ZWRIb3N0czogYWxsb3dlZEhvc3RzfSlcbiAgICAgIGJyb3dzZXIudGFicy5yZWxvYWQoY3VycmVudEFjdGl2ZVRhYklEKVxuICAgIH1cbiAgICBpZiAobWVzc2FnZSA9PT0gJ3JlLWVuYWJsZScpIHtcbiAgICAgIGxldCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0ID0gbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXVxuICAgICAgbGV0IHRlc3RQaWxvdFBpbmdNZXNzYWdlID0ge1xuICAgICAgICBvcmlnaW5Eb21haW46IG1haW5GcmFtZU9yaWdpblRvcEhvc3QsXG4gICAgICAgIHRyYWNrZXJEb21haW5zOiBibG9ja2VkUmVxdWVzdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgZXZlbnQ6ICdibG9rLWVuYWJsZWQnLFxuICAgICAgICBicmVha2FnZTogJycsXG4gICAgICAgIG5vdGVzOiAnJ1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgIHRhYklkOiBjdXJyZW50QWN0aXZlVGFiSUQsXG4gICAgICAgIGltYWdlRGF0YTogZHJhdyh0cnVlLCAwKVxuICAgICAgfSlcbiAgICAgIGFsbG93ZWRIb3N0cy5zcGxpY2UobWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCwgMSlcbiAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe2FsbG93ZWRIb3N0czogYWxsb3dlZEhvc3RzfSlcbiAgICAgIGJyb3dzZXIudGFicy5yZWxvYWQoY3VycmVudEFjdGl2ZVRhYklEKVxuICAgIH1cbiAgICBpZiAobWVzc2FnZS5oYXNPd25Qcm9wZXJ0eSgnZmVlZGJhY2snKSkge1xuICAgICAgbGV0IHRlc3RQaWxvdFBpbmdNZXNzYWdlID0ge1xuICAgICAgICBvcmlnaW5Eb21haW46IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIHRyYWNrZXJEb21haW5zOiBibG9ja2VkUmVxdWVzdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgZXZlbnQ6IG1lc3NhZ2UuZmVlZGJhY2ssXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIHJlcG9ydGVkSG9zdHNbbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXV0gPSBtZXNzYWdlXG4gICAgICBicm93c2VyLnN0b3JhZ2UubG9jYWwuc2V0KHtyZXBvcnRlZEhvc3RzOiByZXBvcnRlZEhvc3RzfSlcbiAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKGN1cnJlbnRBY3RpdmVPcmlnaW4sIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuaGFzT3duUHJvcGVydHkoJ2JyZWFrYWdlJykpIHtcbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiAnc3VibWl0JyxcbiAgICAgICAgYnJlYWthZ2U6IG1lc3NhZ2UuYnJlYWthZ2UsXG4gICAgICAgIG5vdGVzOiBtZXNzYWdlLm5vdGVzXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIHN0YXJ0TGlzdGVuZXJzICh7YmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QsIHJlcG9ydGVkSG9zdHN9LCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbCkge1xuICBzdGFydFJlcXVlc3RMaXN0ZW5lcihibG9ja2xpc3QsIGFsbG93ZWRIb3N0cywgZW50aXR5TGlzdClcblxuICBzdGFydFdpbmRvd0FuZFRhYkxpc3RlbmVycyhhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG5cbiAgc3RhcnRNZXNzYWdlTGlzdGVuZXIoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzLCB0ZXN0UGlsb3RQaW5nQ2hhbm5lbClcbn1cblxuY29uc3Qgc3RhdGUgPSB7XG4gIGJsb2NrbGlzdDogbmV3IE1hcCgpLFxuICBhbGxvd2VkSG9zdHM6IFtdLFxuICByZXBvcnRlZEhvc3RzOiB7fSxcbiAgZW50aXR5TGlzdDoge31cbn1cblxuZnVuY3Rpb24gaW5pdFRlc3RQaWxvdFBpbmdDaGFubmVsICh7QnJvYWRjYXN0Q2hhbm5lbH0pIHtcbiAgLy8gbGV0IFRFU1RQSUxPVF9URUxFTUVUUllfQ0hBTk5FTCA9ICd0ZXN0cGlsb3QtdGVsZW1ldHJ5J1xuICBsZXQgVEVTVFBJTE9UX1RFTEVNRVRSWV9DSEFOTkVMID0gJ2Jsb2stdGVsZW1ldHJ5J1xuICBsZXQgdGVzdFBpbG90UGluZ0NoYW5uZWwgPSBuZXcgQnJvYWRjYXN0Q2hhbm5lbChURVNUUElMT1RfVEVMRU1FVFJZX0NIQU5ORUwpXG4gIHJldHVybiB0ZXN0UGlsb3RQaW5nQ2hhbm5lbFxufVxuXG5sb2FkTGlzdHMoc3RhdGUpLnRoZW4oKCkgPT4ge1xuICBsZXQgdGVzdFBpbG90UGluZ0NoYW5uZWwgPSBpbml0VGVzdFBpbG90UGluZ0NoYW5uZWwod2luZG93KVxuICBzdGFydExpc3RlbmVycyhzdGF0ZSwgdGVzdFBpbG90UGluZ0NoYW5uZWwpXG59LCBjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSkpXG5cbi8qXG4gKiBEcmF3IHBhZ2VBY3Rpb24gaWNvbiB3aXRoIGEgdGV4dCBiYWRnZS5cbiAqL1xuZnVuY3Rpb24gZHJhdyhlbmFibGVkLCBjb3VudGVyKSB7XG4gIGxldCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpXG4gIGNhbnZhcy5zdHlsZS53aWR0aCA9IFwiMTZweFwiXG4gIGNhbnZhcy5zdHlsZS5oZWlnaHQgPSBcIjE2cHhcIlxuICBjYW52YXMuaGVpZ2h0ID0gMzJcbiAgY2FudmFzLndpZHRoID0gMzJcbiAgbGV0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpXG4gIGNvbnRleHQuc2NhbGUoMiwgMilcbiAgbGV0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIilcbiAgaW1nLnNyYyA9IFwiaW1nL2Jsb2stOC5wbmdcIlxuXG4gIGlmIChlbmFibGVkKSB7XG4gICAgY29udGV4dC5maWxsU3R5bGUgPSBcInJnYmEoMCwgMTUwLCAwLCAxKVwiXG4gIH0gZWxzZSB7XG4gICAgY29udGV4dC5maWxsU3R5bGUgPSBcInJnYmEoMzAwLCAyMDAsIDAsIDEpXCJcbiAgfVxuXG4gIGNvbnRleHQuZmlsbFJlY3QoMCwgMCwgMzIsIDMyKVxuICBjb250ZXh0LmRyYXdJbWFnZShpbWcsIDEsIDEpXG4gIGNvbnRleHQuZmlsbFN0eWxlID0gXCJ3aGl0ZVwiXG4gIGNvbnRleHQuZm9udCA9IFwiOHB4IEFyaWFsXCJcbiAgaWYgKGNvdW50ZXIpIHtcbiAgICBjb250ZXh0LmZpbGxUZXh0KGNvdW50ZXIsIDYsIDE0KVxuICB9XG4gIHJldHVybiBjb250ZXh0LmdldEltYWdlRGF0YSgwLCAwLCAzMiwgMzIpXG59XG4iLCJ2YXIgaXA0RGVjaW1hbFBhdHRlcm4gPSAnXig/Oig/OjI1WzAtNV18MlswLTRdWzAtOV18WzAxXT9bMC05XVswLTldPykuKXszfSg/Oig/OjI1WzAtNV18MlswLTRdWzAtOV18WzAxXT9bMC05XVswLTldPykpJCdcbnZhciBpcDRIZXhQYXR0ZXJuID0gJ14oPzooPzoweFswLTlhLWZdezEsMn0pLil7M30oPzoweFswLTlhLWZdezEsMn0pJCdcbnZhciBpcDRPY3RhbFBhdHRlcm4gPSAnXig/Oig/OjAzWzEtN11bMC03XXwwWzEyXVswLTddezEsMn18WzAtN117MSwyfSkuKXszfSg/OjAzWzEtN11bMC03XXwwWzEyXVswLTddezEsMn18WzAtN117MSwyfSkkJ1xuXG4vLyBsaWtlIHRyaW0oKSBoZWxwZXIgZnJvbSB1bmRlcnNjb3JlLnN0cmluZzpcbi8vIHRyaW1zIGNoYXJzIGZyb20gYmVnaW5uaW5nIGFuZCBlbmQgb2Ygc3RyXG5mdW5jdGlvbiB0cmltIChzdHIsIGNoYXJzKSB7XG4gIC8vIGVzY2FwZSBhbnkgcmVnZXhwIGNoYXJzXG4gIGNoYXJzID0gY2hhcnMucmVwbGFjZSgvKFsuKis/Xj0hOiR7fSgpfFtcXF1cXC9cXFxcXSkvZywgJ1xcXFwkMScpXG4gIHJldHVybiBzdHIucmVwbGFjZShuZXcgUmVnRXhwKCdeJyArIGNoYXJzICsgJyt8JyArIGNoYXJzICsgJyskJywgJ2cnKSwgJycpXG59XG5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NhZmUtYnJvd3NpbmcvdjQvdXJscy1oYXNoaW5nI2Nhbm9uaWNhbGl6YXRpb25cbmZ1bmN0aW9uIGNhbm9uaWNhbGl6ZUhvc3QgKGhvc3QpIHtcbiAgLy8gUmVtb3ZlIGFsbCBsZWFkaW5nIGFuZCB0cmFpbGluZyBkb3RzXG4gIHZhciBjYW5vbmljYWxpemVkSG9zdCA9IHRyaW0oaG9zdCwgJy4nKVxuXG4gIC8vIFJlcGxhY2UgY29uc2VjdXRpdmUgZG90cyB3aXRoIGEgc2luZ2xlIGRvdFxuICBjYW5vbmljYWxpemVkSG9zdCA9IGNhbm9uaWNhbGl6ZWRIb3N0LnJlcGxhY2UobmV3IFJlZ0V4cCgnWy5dKycsICdnJyksICcuJylcblxuICAvLyBJZiB0aGUgaG9zdG5hbWUgY2FuIGJlIHBhcnNlZCBhcyBhbiBJUCBhZGRyZXNzLFxuICAvLyBub3JtYWxpemUgaXQgdG8gNCBkb3Qtc2VwYXJhdGVkIGRlY2ltYWwgdmFsdWVzLlxuICAvLyBUaGUgY2xpZW50IHNob3VsZCBoYW5kbGUgYW55IGxlZ2FsIElQLWFkZHJlc3MgZW5jb2RpbmcsXG4gIC8vIGluY2x1ZGluZyBvY3RhbCwgaGV4LCBhbmQgVE9ETzogZmV3ZXIgdGhhbiBmb3VyIGNvbXBvbmVudHNcbiAgdmFyIGJhc2UgPSAxMFxuICB2YXIgaXNJUDREZWNpbWFsLCBpc0lQNEhleCwgaXNJUDRPY3RhbFxuXG4gIGlzSVA0RGVjaW1hbCA9IGNhbm9uaWNhbGl6ZWRIb3N0Lm1hdGNoKGlwNERlY2ltYWxQYXR0ZXJuKSAhPSBudWxsXG4gIGlzSVA0SGV4ID0gY2Fub25pY2FsaXplZEhvc3QubWF0Y2goaXA0SGV4UGF0dGVybikgIT0gbnVsbFxuICBpc0lQNE9jdGFsID0gY2Fub25pY2FsaXplZEhvc3QubWF0Y2goaXA0T2N0YWxQYXR0ZXJuKSAhPSBudWxsXG4gIGlmIChpc0lQNERlY2ltYWwgfHwgaXNJUDRIZXggfHwgaXNJUDRPY3RhbCkge1xuICAgIGlmIChpc0lQNEhleCkge1xuICAgICAgYmFzZSA9IDE2XG4gICAgfSBlbHNlIGlmIChpc0lQNE9jdGFsKSB7XG4gICAgICBiYXNlID0gOFxuICAgIH1cbiAgICBjYW5vbmljYWxpemVkSG9zdCA9IGNhbm9uaWNhbGl6ZWRIb3N0LnNwbGl0KCcuJykubWFwKG51bSA9PiBwYXJzZUludChudW0sIGJhc2UpKS5qb2luKCcuJylcbiAgfVxuXG4gIC8vIExvd2VyY2FzZSB0aGUgd2hvbGUgc3RyaW5nXG4gIGNhbm9uaWNhbGl6ZWRIb3N0ID0gY2Fub25pY2FsaXplZEhvc3QudG9Mb3dlckNhc2UoKVxuICByZXR1cm4gY2Fub25pY2FsaXplZEhvc3Rcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNhbm9uaWNhbGl6ZUhvc3QsXG4gIHRyaW1cbn1cbiIsImZ1bmN0aW9uIGFsbEhvc3RzIChob3N0KSB7XG4gIGNvbnN0IGFsbEhvc3RzID0gW11cbiAgY29uc3QgaG9zdFBhcnRzID0gaG9zdC5zcGxpdCgnLicpXG4gIHdoaWxlIChob3N0UGFydHMubGVuZ3RoID4gMSkge1xuICAgIGFsbEhvc3RzLnB1c2goaG9zdFBhcnRzLmpvaW4oJy4nKSlcbiAgICBob3N0UGFydHMuc3BsaWNlKDAsIDEpXG4gIH1cbiAgcmV0dXJuIGFsbEhvc3RzXG59XG5cbmZ1bmN0aW9uIGxvYWRMaXN0cyAoc3RhdGUpIHtcbiAgY29uc3QgYmxvY2tMaXN0UHJvbWlzZSA9IGxvYWRKU09OKCdqcy9kaXNjb25uZWN0LWJsb2NrbGlzdC5qc29uJykudGhlbigoZGF0YSkgPT4ge1xuICAgIHN0YXRlLmJsb2NrbGlzdCA9IHByb2Nlc3NCbG9ja0xpc3RKU09OKGRhdGEpXG4gIH0pXG5cbiAgY29uc3QgZW50aXR5TGlzdFByb21pc2UgPSBsb2FkSlNPTignanMvZGlzY29ubmVjdC1lbnRpdHlsaXN0Lmpzb24nKS50aGVuKChkYXRhKSA9PiB7XG4gICAgc3RhdGUuZW50aXR5TGlzdCA9IGRhdGFcbiAgfSlcblxuICBjb25zdCBhbGxvd2VkSG9zdHNQcm9taXNlID0gZ2V0QWxsb3dlZEhvc3RzTGlzdCgpLnRoZW4oKGFsbG93ZWRIb3N0cykgPT4ge1xuICAgIHN0YXRlLmFsbG93ZWRIb3N0cyA9IGFsbG93ZWRIb3N0c1xuICB9KVxuXG4gIGNvbnN0IHJlcG9ydGVkSG9zdHNQcm9taXNlID0gZ2V0UmVwb3J0ZWRIb3N0c0xpc3QoKS50aGVuKChyZXBvcnRlZEhvc3RzKSA9PiB7XG4gICAgc3RhdGUucmVwb3J0ZWRIb3N0cyA9IHJlcG9ydGVkSG9zdHNcbiAgfSlcblxuICByZXR1cm4gUHJvbWlzZS5hbGwoW2Jsb2NrTGlzdFByb21pc2UsIGVudGl0eUxpc3RQcm9taXNlLCBhbGxvd2VkSG9zdHNQcm9taXNlLCByZXBvcnRlZEhvc3RzUHJvbWlzZV0pXG59XG5cbmZ1bmN0aW9uIGxvYWRKU09OICh1cmwpIHtcbiAgcmV0dXJuIGZldGNoKHVybClcbiAgICAudGhlbigocmVzKSA9PiByZXMuanNvbigpKVxufVxuXG5mdW5jdGlvbiBwcm9jZXNzQmxvY2tMaXN0SlNPTiAoZGF0YSkge1xuICBjb25zdCBibG9ja2xpc3QgPSBuZXcgTWFwKClcblxuICAvLyByZW1vdmUgdW4tbmVlZGVkIGNhdGVnb3JpZXMgcGVyIGRpc2Nvbm5lY3RcbiAgZGVsZXRlIGRhdGEuY2F0ZWdvcmllc1snQ29udGVudCddXG4gIGRlbGV0ZSBkYXRhLmNhdGVnb3JpZXNbJ0xlZ2FjeSBEaXNjb25uZWN0J11cbiAgZGVsZXRlIGRhdGEuY2F0ZWdvcmllc1snTGVnYWN5IENvbnRlbnQnXVxuXG4gIC8vIHBhcnNlIHRocnUgdGhlIGRpc2Nvbm5lY3QgYmxvY2tsaXN0IGFuZCBjcmVhdGVcbiAgLy8gbG9jYWwgYmxvY2tsaXN0IFwiZ3JvdXBlZFwiIGJ5IG1haW4gZG9tYWluLiBJLmUuLFxuICAvLyBibG9ja2xpc3RbXCJmYWNlYm9vay5jb21cIl0gPSBodHRwOi8vd3d3LmZhY2Vib29rLmNvbVxuICAvLyBibG9ja2xpc3RbXCJmYi5jb21cIl0gPSBodHRwOi8vd3d3LmZhY2Vib29rLmNvbVxuICAvLyBibG9ja2xpc3RbXCJkb3VibGVjbGljay5uZXRcIl0gPSBodHRwOi8vd3d3Lmdvb2dsZS5jb21cbiAgLy8gYmxvY2tsaXN0W1wiZ29vZ2xlLWFuYWx5dGljcy5jb21cIl0gPSBodHRwOi8vd3d3Lmdvb2dsZS5jb21cbiAgLy8gZXRjLlxuICBmb3IgKGxldCBjYXRlZ29yeU5hbWUgaW4gZGF0YS5jYXRlZ29yaWVzKSB7XG4gICAgdmFyIGNhdGVnb3J5ID0gZGF0YS5jYXRlZ29yaWVzW2NhdGVnb3J5TmFtZV1cbiAgICB2YXIgZW50aXR5Q291bnQgPSBjYXRlZ29yeS5sZW5ndGhcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZW50aXR5Q291bnQ7IGkrKykge1xuICAgICAgdmFyIGVudGl0eSA9IGNhdGVnb3J5W2ldXG5cbiAgICAgIGZvciAobGV0IGVudGl0eU5hbWUgaW4gZW50aXR5KSB7XG4gICAgICAgIHZhciB1cmxzID0gZW50aXR5W2VudGl0eU5hbWVdXG5cbiAgICAgICAgZm9yIChsZXQgbWFpbkRvbWFpbiBpbiB1cmxzKSB7XG4gICAgICAgICAgYmxvY2tsaXN0LnNldChtYWluRG9tYWluLCBbXSlcbiAgICAgICAgICB2YXIgZG9tYWlucyA9IHVybHNbbWFpbkRvbWFpbl1cbiAgICAgICAgICB2YXIgZG9tYWluc0NvdW50ID0gZG9tYWlucy5sZW5ndGhcblxuICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZG9tYWluc0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgIGJsb2NrbGlzdC5zZXQoZG9tYWluc1tqXSwgbWFpbkRvbWFpbilcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gYmxvY2tsaXN0XG59XG5cbmZ1bmN0aW9uIGdldEFsbG93ZWRIb3N0c0xpc3QgKCkge1xuICByZXR1cm4gYnJvd3Nlci5zdG9yYWdlLmxvY2FsLmdldCgnYWxsb3dlZEhvc3RzJykudGhlbigoaXRlbSkgPT4ge1xuICAgIGlmIChpdGVtLmFsbG93ZWRIb3N0cykge1xuICAgICAgcmV0dXJuIGl0ZW0uYWxsb3dlZEhvc3RzXG4gICAgfVxuICAgIHJldHVybiBbXVxuICB9KVxufVxuXG5mdW5jdGlvbiBnZXRSZXBvcnRlZEhvc3RzTGlzdCAoKSB7XG4gIHJldHVybiBicm93c2VyLnN0b3JhZ2UubG9jYWwuZ2V0KCdyZXBvcnRlZEhvc3RzJykudGhlbigoaXRlbSkgPT4ge1xuICAgIGlmIChpdGVtLnJlcG9ydGVkSG9zdHMpIHtcbiAgICAgIHJldHVybiBpdGVtLnJlcG9ydGVkSG9zdHNcbiAgICB9XG4gICAgcmV0dXJuIHt9XG4gIH0pXG59XG5cbi8vIGNoZWNrIGlmIGFueSBob3N0IGZyb20gbG93ZXN0LWxldmVsIHRvIHRvcC1sZXZlbCBpcyBpbiB0aGUgYmxvY2tsaXN0XG5mdW5jdGlvbiBob3N0SW5CbG9ja2xpc3QgKGJsb2NrbGlzdCwgaG9zdCkge1xuICBsZXQgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdCA9IGZhbHNlXG4gIHZhciBhbGxIb3N0VmFyaWFudHMgPSBhbGxIb3N0cyhob3N0KVxuICBmb3IgKGxldCBob3N0VmFyaWFudCBvZiBhbGxIb3N0VmFyaWFudHMpIHtcbiAgICByZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gYmxvY2tsaXN0Lmhhcyhob3N0VmFyaWFudClcbiAgICBpZiAocmVxdWVzdEhvc3RJbkJsb2NrbGlzdCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbi8vIGNoZWNrIGlmIGFueSBob3N0IGZyb20gbG93ZXN0LWxldmVsIHRvIHRvcC1sZXZlbCBpcyBpbiB0aGUgZW50aXR5bGlzdFxuZnVuY3Rpb24gaG9zdEluRW50aXR5IChlbnRpdHlIb3N0cywgaG9zdCkge1xuICBsZXQgZW50aXR5SG9zdCA9IGZhbHNlXG4gIGZvciAobGV0IGhvc3RWYXJpYW50IG9mIGFsbEhvc3RzKGhvc3QpKSB7XG4gICAgZW50aXR5SG9zdCA9IGVudGl0eUhvc3RzLmluZGV4T2YoaG9zdFZhcmlhbnQpID4gLTFcbiAgICBpZiAoZW50aXR5SG9zdCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhbGxIb3N0cyxcbiAgbG9hZExpc3RzLFxuICBwcm9jZXNzQmxvY2tMaXN0SlNPTixcbiAgaG9zdEluQmxvY2tsaXN0LFxuICBob3N0SW5FbnRpdHlcbn1cbiIsImlmIChcInByb2R1Y3Rpb25cIiA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gIGV4cG9ydHMubG9nID0gZnVuY3Rpb24gbm9vcCAoKSB7fVxufSBlbHNlIHtcbiAgZXhwb3J0cy5sb2cgPSBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpXG59XG4iLCJjb25zdCB7bG9nfSA9IHJlcXVpcmUoJy4vbG9nJylcbmNvbnN0IHtob3N0SW5FbnRpdHl9ID0gcmVxdWlyZSgnLi9saXN0cycpXG5cbmxldCBob3N0RW50aXR5Q2FjaGUgPSB7fVxuXG5mdW5jdGlvbiByZXF1ZXN0QWxsb3dlciAodGFiSUQsIHRvdGFsRXhlY1RpbWUsIHN0YXJ0RGF0ZVRpbWUpIHtcbiAgdG90YWxFeGVjVGltZVt0YWJJRF0gKz0gRGF0ZS5ub3coKSAtIHN0YXJ0RGF0ZVRpbWVcbiAgcmV0dXJuIHt9XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVlc3RFbnRpdHkgKGVudGl0eUxpc3QsIG9yaWdpblRvcEhvc3QsIHJlcXVlc3RUb3BIb3N0LCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KSB7XG4gIGxldCByZXF1ZXN0RW50aXR5ID0geydlbnRpdHlOYW1lJzogbnVsbCwgJ3NhbWVFbnRpdHknOiBmYWxzZX1cblxuICAvLyBGaXJzdCwgdHJ5IHRvIHJldHVybiBldmVyeXRoaW5nIGZyb20gbWVtby1pemVkIGNhY2hlXG4gIGxldCByZXF1ZXN0RW50aXR5TmFtZSA9IGhvc3RFbnRpdHlDYWNoZVtyZXF1ZXN0VG9wSG9zdF1cbiAgbGV0IG9yaWdpbkVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbb3JpZ2luVG9wSG9zdF1cbiAgbGV0IG1haW5GcmFtZU9yaWdpbkVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbbWFpbkZyYW1lT3JpZ2luVG9wSG9zdF1cbiAgcmVxdWVzdEVudGl0eS5zYW1lRW50aXR5ID0gKFxuICAgIHJlcXVlc3RFbnRpdHlOYW1lICYmIChcbiAgICAgIHJlcXVlc3RFbnRpdHlOYW1lID09PSBvcmlnaW5FbnRpdHlOYW1lIHx8IHJlcXVlc3RFbnRpdHlOYW1lID09PSBtYWluRnJhbWVPcmlnaW5FbnRpdHlOYW1lXG4gICAgKVxuICApXG4gIGlmIChyZXF1ZXN0RW50aXR5LnNhbWVFbnRpdHkpIHtcbiAgICByZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUgPSByZXF1ZXN0RW50aXR5TmFtZVxuICAgIGxvZygncmV0dXJuaW5nIGZyb20gbWVtby1pemVkIGNhY2hlOiAnLCByZXF1ZXN0RW50aXR5KVxuICAgIHJldHVybiByZXF1ZXN0RW50aXR5XG4gIH1cblxuICAvLyBJZiBhIGhvc3Qgd2FzIG5vdCBmb3VuZCBpbiB0aGUgbWVtby1pemVkIGNhY2hlLCBjaGVjayB0aHJ1IHRoZSBlbnRpdHlMaXN0XG4gIGZvciAobGV0IGVudGl0eU5hbWUgaW4gZW50aXR5TGlzdCkge1xuICAgIGxldCBlbnRpdHkgPSBlbnRpdHlMaXN0W2VudGl0eU5hbWVdXG4gICAgbGV0IHJlcXVlc3RJc0VudGl0eVJlc291cmNlID0gZmFsc2VcbiAgICBsZXQgb3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSA9IGZhbHNlXG4gICAgbGV0IG1haW5GcmFtZU9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBmYWxzZVxuXG4gICAgcmVxdWVzdElzRW50aXR5UmVzb3VyY2UgPSBob3N0SW5FbnRpdHkoZW50aXR5LnJlc291cmNlcywgcmVxdWVzdFRvcEhvc3QpXG4gICAgaWYgKHJlcXVlc3RJc0VudGl0eVJlc291cmNlKSB7XG4gICAgICByZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUgPSBlbnRpdHlOYW1lXG4gICAgICBob3N0RW50aXR5Q2FjaGVbcmVxdWVzdFRvcEhvc3RdID0gZW50aXR5TmFtZVxuICAgIH1cblxuICAgIG9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBob3N0SW5FbnRpdHkoZW50aXR5LnByb3BlcnRpZXMsIG9yaWdpblRvcEhvc3QpXG4gICAgaWYgKG9yaWdpbklzRW50aXR5UHJvcGVydHkpIHtcbiAgICAgIGhvc3RFbnRpdHlDYWNoZVtvcmlnaW5Ub3BIb3N0XSA9IGVudGl0eU5hbWVcbiAgICB9XG5cbiAgICBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gaG9zdEluRW50aXR5KGVudGl0eS5wcm9wZXJ0aWVzLCBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0KVxuICAgIGlmIChtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5KSB7XG4gICAgICBob3N0RW50aXR5Q2FjaGVbbWFpbkZyYW1lT3JpZ2luVG9wSG9zdF0gPSBlbnRpdHlOYW1lXG4gICAgfVxuXG4gICAgaWYgKChvcmlnaW5Jc0VudGl0eVByb3BlcnR5IHx8IG1haW5GcmFtZU9yaWdpbklzRW50aXR5UHJvcGVydHkpICYmIHJlcXVlc3RJc0VudGl0eVJlc291cmNlKSB7XG4gICAgICBsb2coYG9yaWdpblRvcEhvc3QgJHtvcmlnaW5Ub3BIb3N0fSBhbmQgcmVzb3VyY2UgcmVxdWVzdFRvcEhvc3QgJHtyZXF1ZXN0VG9wSG9zdH0gYmVsb25nIHRvIHRoZSBzYW1lIGVudGl0eTogJHtlbnRpdHlOYW1lfTsgYWxsb3dpbmcgcmVxdWVzdGApXG4gICAgICByZXF1ZXN0RW50aXR5LnNhbWVFbnRpdHkgPSB0cnVlXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICAvLyBUT0RPOiBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9ibG9rL2lzc3Vlcy8xMTBcbiAgcmV0dXJuIHJlcXVlc3RFbnRpdHlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlcXVlc3RBbGxvd2VyLFxuICBnZXRSZXF1ZXN0RW50aXR5XG59XG4iXX0=
