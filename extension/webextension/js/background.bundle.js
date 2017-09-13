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
      if (requestTabID in blockedRequests) {
        blockedRequests[requestTabID].push(requestTopHost)
      } else {
        blockedRequests[requestTabID] = [requestTopHost]
      }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvYmFja2dyb3VuZC5qcyIsInNyYy9qcy9jYW5vbmljYWxpemUuanMiLCJzcmMvanMvbGlzdHMuanMiLCJzcmMvanMvbG9nLmpzIiwic3JjL2pzL3JlcXVlc3RzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImNvbnN0IHtjYW5vbmljYWxpemVIb3N0fSA9IHJlcXVpcmUoJy4vY2Fub25pY2FsaXplJylcbmNvbnN0IHtsb2FkTGlzdHMsIGhvc3RJbkJsb2NrbGlzdH0gPSByZXF1aXJlKCcuL2xpc3RzJylcbmNvbnN0IHtyZXF1ZXN0QWxsb3dlciwgZ2V0UmVxdWVzdEVudGl0eX0gPSByZXF1aXJlKCcuL3JlcXVlc3RzJylcbmNvbnN0IHtsb2d9ID0gcmVxdWlyZSgnLi9sb2cnKVxuXG4vLyBTZXQgc29tZSBleHBsaWNpdCB3aW5kb3cgdmFyaWFibGUgZm9yIHBhZ2VBY3Rpb24gdG8gYWNjZXNzXG53aW5kb3cudG9wRnJhbWVIb3N0RGlzYWJsZWQgPSBmYWxzZVxud2luZG93LnRvcEZyYW1lSG9zdFJlcG9ydCA9IHt9XG53aW5kb3cuYmxvY2tlZFJlcXVlc3RzID0ge31cbndpbmRvdy5ibG9ja2VkRW50aXRpZXMgPSB7fVxud2luZG93LmFsbG93ZWRSZXF1ZXN0cyA9IHt9XG53aW5kb3cuYWxsb3dlZEVudGl0aWVzID0ge31cbndpbmRvdy5zZXNzaW9uVVJJQ291bnQgPSAwXG53aW5kb3cudG90YWxQYWdlTG9hZFRpbWUgPSAwXG53aW5kb3cuY3VycmVudFBhZ2VMb2FkVGltZSA9IDBcbndpbmRvdy5jdXJyZW50UGFnZUxvYWRTdGFydCA9IERhdGUubm93KClcbndpbmRvdy50b3RhbEJsb2NrZWRSZXF1ZXN0cyA9IDBcbndpbmRvdy50b3RhbEJsb2NrZWRTaXRlcyA9IDBcbndpbmRvdy50b3RhbEJsb2NrZWRFbnRpdGllcyA9IDBcblxudmFyIHByaXZhdGVCcm93c2luZ01vZGUgPSBmYWxzZVxudmFyIGN1cnJlbnRBY3RpdmVUYWJJRFxudmFyIGN1cnJlbnRBY3RpdmVPcmlnaW5cbnZhciB0b3RhbEV4ZWNUaW1lID0ge31cbnZhciBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZCA9IHt9XG52YXIgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHMgPSB7fVxudmFyIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXggPSAtMVxuXG5mdW5jdGlvbiByZXN0YXJ0Qmxva0ZvclRhYiAodGFiSUQpIHtcbiAgYmxvY2tlZFJlcXVlc3RzW3RhYklEXSA9IFtdXG4gIGJsb2NrZWRFbnRpdGllc1t0YWJJRF0gPSBbXVxuICBhbGxvd2VkUmVxdWVzdHNbdGFiSURdID0gW11cbiAgYWxsb3dlZEVudGl0aWVzW3RhYklEXSA9IFtdXG4gIHRvdGFsRXhlY1RpbWVbdGFiSURdID0gMFxuICBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1t0YWJJRF0gPSBudWxsXG4gIG1haW5GcmFtZU9yaWdpbkRpc2FibGVkW3RhYklEXSA9IGZhbHNlXG59XG5cbmZ1bmN0aW9uIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwICh0b3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpIHtcbiAgaWYgKGlzT3JpZ2luRGlzYWJsZWQodG9wSG9zdCwgYWxsb3dlZEhvc3RzKSkge1xuICAgIHdpbmRvdy50b3BGcmFtZUhvc3REaXNhYmxlZCA9IHRydWVcbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0RGlzYWJsZWQgPSBmYWxzZVxuICB9XG4gIGlmIChyZXBvcnRlZEhvc3RzLmhhc093blByb3BlcnR5KHRvcEhvc3QpKSB7XG4gICAgd2luZG93LnRvcEZyYW1lSG9zdFJlcG9ydCA9IHJlcG9ydGVkSG9zdHNbdG9wSG9zdF1cbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cudG9wRnJhbWVIb3N0UmVwb3J0ID0ge31cbiAgfVxufVxuXG5mdW5jdGlvbiBpc09yaWdpbkRpc2FibGVkIChob3N0LCBhbGxvd2VkSG9zdHMpIHtcbiAgcmV0dXJuIGFsbG93ZWRIb3N0cy5pbmRleE9mKGhvc3QpID4gLTFcbn1cblxuZnVuY3Rpb24gYmxvY2tUcmFja2VyUmVxdWVzdHMgKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KSB7XG4gIHJldHVybiBmdW5jdGlvbiBmaWx0ZXJSZXF1ZXN0IChyZXF1ZXN0RGV0YWlscykge1xuICAgIGlmICghd2luZG93LnRvcEZyYW1lSG9zdERpc2FibGVkKSB7XG4gICAgICB3aW5kb3cuc2Vzc2lvblVSSUNvdW50KytcbiAgICAgIHdpbmRvdy5jdXJyZW50UGFnZUxvYWRTdGFydCA9IERhdGUubm93KClcbiAgICB9XG5cbiAgICB2YXIgYmxvY2tUcmFja2VyUmVxdWVzdHNTdGFydCA9IERhdGUubm93KClcbiAgICB2YXIgcmVxdWVzdFRhYklEID0gcmVxdWVzdERldGFpbHMudGFiSWRcbiAgICB2YXIgb3JpZ2luVG9wSG9zdFxuICAgIHZhciByZXF1ZXN0VG9wSG9zdFxuICAgIHZhciByZXF1ZXN0RW50aXR5XG5cbiAgICB2YXIgZmxhZ3MgPSB7XG4gICAgICBtYWluT3JpZ2luRGlzYWJsZWQ6IGZhbHNlLFxuICAgICAgZmlyZWZveE9yaWdpbjogZmFsc2UsXG4gICAgICBuZXdPcmlnaW46IGZhbHNlLFxuICAgICAgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdDogZmFsc2UsXG4gICAgICByZXF1ZXN0SXNUaGlyZFBhcnR5OiBmYWxzZSxcbiAgICAgIHJlcXVlc3RIb3N0TWF0Y2hlc01haW5GcmFtZTogZmFsc2VcbiAgICB9XG5cbiAgICB2YXIgYWxsb3dSZXF1ZXN0ID0gcmVxdWVzdEFsbG93ZXIuYmluZChudWxsLCByZXF1ZXN0VGFiSUQsIHRvdGFsRXhlY1RpbWUsIGJsb2NrVHJhY2tlclJlcXVlc3RzU3RhcnQpXG5cbiAgICBpZiAocHJpdmF0ZUJyb3dzaW5nTW9kZSkge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGluIHByaXZhdGUgYnJvd3NpbmcgbW9kZSB3aW5kb3c7IFBCTSBUUCB3aWxsIGNhdGNoIHRoZW0uJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgcmVxdWVzdERldGFpbHMub3JpZ2luVXJsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IGZyb20gXCJ1bmRlZmluZWRcIiBvcmlnaW4gLSBhIGJyb3dzZXIgaW50ZXJuYWwgb3JpZ2luLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgYWxsIG9yaWdpbiBmbGFnc1xuICAgIG9yaWdpblRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwocmVxdWVzdERldGFpbHMub3JpZ2luVXJsKS5ob3N0KVxuICAgIGN1cnJlbnRBY3RpdmVPcmlnaW4gPSBvcmlnaW5Ub3BIb3N0XG5cbiAgICBmbGFncy5maXJlZm94T3JpZ2luID0gKHR5cGVvZiBvcmlnaW5Ub3BIb3N0ICE9PSAndW5kZWZpbmVkJyAmJiBvcmlnaW5Ub3BIb3N0LmluY2x1ZGVzKCdtb3otbnVsbHByaW5jaXBhbCcpKVxuICAgIGZsYWdzLm5ld09yaWdpbiA9IG9yaWdpblRvcEhvc3QgPT09ICcnXG4gICAgaWYgKGZsYWdzLmZpcmVmb3hPcmlnaW4gfHwgZmxhZ3MubmV3T3JpZ2luKSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgZnJvbSBGaXJlZm94IGFuZC9vciBuZXcgdGFiL3dpbmRvdyBvcmlnaW5zLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICAvLyBTZXQgbWFpbiAmIHRvcCBmcmFtZSB2YWx1ZXMgaWYgZnJhbWVJZCA9PT0gMFxuICAgIGlmIChyZXF1ZXN0RGV0YWlscy5mcmFtZUlkID09PSAwKSB7XG4gICAgICBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tyZXF1ZXN0VGFiSURdID0gb3JpZ2luVG9wSG9zdFxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKG9yaWdpblRvcEhvc3QpXG4gICAgICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZFtyZXF1ZXN0VGFiSURdID0gbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA+IC0xXG4gICAgfVxuXG4gICAgcmVxdWVzdFRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwocmVxdWVzdERldGFpbHMudXJsKS5ob3N0KVxuXG4gICAgaWYgKG1haW5GcmFtZU9yaWdpbkRpc2FibGVkW3JlcXVlc3RUYWJJRF0pIHtcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IHJlcXVlc3RUYWJJRCxcbiAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KGZhbHNlLCAwKVxuICAgICAgfSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zaG93KHJlcXVlc3RUYWJJRClcblxuICAgICAgaWYgKGhvc3RJbkJsb2NrbGlzdChibG9ja2xpc3QsIHJlcXVlc3RUb3BIb3N0KSkge1xuICAgICAgICBhbGxvd2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RUb3BIb3N0KVxuICAgICAgICBicm93c2VyLnBhZ2VBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgICAgdGFiSWQ6IHRhYklELFxuICAgICAgICAgIGltYWdlRGF0YTogZHJhdyghdG9wRnJhbWVIb3N0RGlzYWJsZWQsIGFsbG93ZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbi8qXG4gICAgICBpZiAoYWxsb3dlZEVudGl0aWVzW3JlcXVlc3RUYWJJRF0uaW5kZXhPZihyZXF1ZXN0RW50aXR5LmVudGl0eU5hbWUpID09PSAtMSkge1xuICAgICAgICBhbGxvd2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5wdXNoKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSlcbiAgICAgIH1cbiovXG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgZnJvbSBvcmlnaW4gZm9yIHdoaWNoIEJsb2sgaXMgZGlzYWJsZWQuJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0RGV0YWlscy50eXBlID09PSAnbWFpbl9mcmFtZScpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgY2xpY2tzIHRvIGxpbmtzLicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICBmbGFncy5yZXF1ZXN0SG9zdEluQmxvY2tsaXN0ID0gaG9zdEluQmxvY2tsaXN0KGJsb2NrbGlzdCwgcmVxdWVzdFRvcEhvc3QpXG5cbiAgICBpZiAoIWZsYWdzLnJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpIHtcbiAgICAgIGxvZygnQWxsb3dpbmcgcmVxdWVzdCB0byBkb21haW4gTk9UIGluIHRoZSBibG9jay1saXN0LicpXG4gICAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgICB9XG5cbiAgICByZXF1ZXN0RW50aXR5ID0gZ2V0UmVxdWVzdEVudGl0eShlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgb3JpZ2luVG9wSG9zdClcbiAgICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgICBsb2coJ0FsbG93aW5nIHJlcXVlc3QgdG8gYmxvY2stbGlzdCBkb21haW4gdGhhdCBiZWxvbmdzIHRvIHNhbWUgZW50aXR5IGFzIG9yaWdpbiBkb21haW4uJylcbiAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgIH1cblxuICAgIGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkgPSByZXF1ZXN0VG9wSG9zdCAhPT0gb3JpZ2luVG9wSG9zdFxuXG4gICAgaWYgKGZsYWdzLnJlcXVlc3RJc1RoaXJkUGFydHkpIHtcbiAgICAgIGZsYWdzLnJlcXVlc3RIb3N0TWF0Y2hlc01haW5GcmFtZSA9IChyZXF1ZXN0RGV0YWlscy5mcmFtZUlkID4gMCAmJiByZXF1ZXN0VG9wSG9zdCA9PT0gbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSlcbiAgICAgIGlmIChmbGFncy5yZXF1ZXN0SG9zdE1hdGNoZXNNYWluRnJhbWUpIHtcbiAgICAgICAgbG9nKCdBbGxvd2luZyByZXF1ZXN0IHRvIGJsb2NrLWxpc3QgZG9tYWluIHRoYXQgbWF0Y2hlcyB0aGUgdG9wL21haW4gZnJhbWUgZG9tYWluLicpXG4gICAgICAgIHJldHVybiBhbGxvd1JlcXVlc3QoKVxuICAgICAgfVxuXG4gICAgICBsb2coJ0Jsb2NraW5nIHJlcXVlc3Q6IG9yaWdpblRvcEhvc3Q6ICcsIG9yaWdpblRvcEhvc3QsICcgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdDogJywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbcmVxdWVzdFRhYklEXSwgJyByZXF1ZXN0VG9wSG9zdDogJywgcmVxdWVzdFRvcEhvc3QsICcgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdDogJywgZmxhZ3MucmVxdWVzdEhvc3RJbkJsb2NrbGlzdClcbiAgICAgIGlmIChyZXF1ZXN0VGFiSUQgaW4gYmxvY2tlZFJlcXVlc3RzKSB7XG4gICAgICAgIGJsb2NrZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLnB1c2gocmVxdWVzdFRvcEhvc3QpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBibG9ja2VkUmVxdWVzdHNbcmVxdWVzdFRhYklEXSA9IFtyZXF1ZXN0VG9wSG9zdF1cbiAgICAgIH1cbiAgICAgIHRvdGFsQmxvY2tlZFJlcXVlc3RzKytcbiAgICAgIGlmIChibG9ja2VkRW50aXRpZXNbcmVxdWVzdFRhYklEXS5pbmRleE9mKHJlcXVlc3RFbnRpdHkuZW50aXR5TmFtZSkgPT09IC0xKSB7XG4gICAgICAgIGJsb2NrZWRFbnRpdGllc1tyZXF1ZXN0VGFiSURdLnB1c2gocmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lKVxuICAgICAgICB0b3RhbEJsb2NrZWRFbnRpdGllcysrXG4gICAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgICB0YWJJZDogcmVxdWVzdFRhYklELFxuICAgICAgICAgIGltYWdlRGF0YTogZHJhdyghdG9wRnJhbWVIb3N0RGlzYWJsZWQsIGJsb2NrZWRSZXF1ZXN0c1tyZXF1ZXN0VGFiSURdLmxlbmd0aClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIHRvdGFsRXhlY1RpbWVbcmVxdWVzdFRhYklEXSArPSBEYXRlLm5vdygpIC0gYmxvY2tUcmFja2VyUmVxdWVzdHNTdGFydFxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNob3cocmVxdWVzdFRhYklEKVxuICAgICAgcmV0dXJuIHtjYW5jZWw6IHRydWV9XG4gICAgfVxuXG4gICAgbG9nKCdEZWZhdWx0IHRvIGFsbG93aW5nIHJlcXVlc3QuJylcbiAgICByZXR1cm4gYWxsb3dSZXF1ZXN0KClcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydFJlcXVlc3RMaXN0ZW5lciAoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpIHtcbiAgbGV0IGZpbHRlciA9IHt1cmxzOiBbJyo6Ly8qLyonXX1cblxuICBicm93c2VyLndlYlJlcXVlc3Qub25CZWZvcmVSZXF1ZXN0LmFkZExpc3RlbmVyKFxuICAgIGJsb2NrVHJhY2tlclJlcXVlc3RzKGJsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0KSxcbiAgICBmaWx0ZXIsXG4gICAgWydibG9ja2luZyddXG4gIClcblxuICBicm93c2VyLndlYlJlcXVlc3Qub25Db21wbGV0ZWQuYWRkTGlzdGVuZXIoXG4gICAgKHJlcXVlc3REZXRhaWxzKSA9PiB7XG4gICAgICB3aW5kb3cuY3VycmVudFBhZ2VMb2FkVGltZSA9IERhdGUubm93KCkgLSB3aW5kb3cuY3VycmVudFBhZ2VMb2FkU3RhcnRcbiAgICAgIHdpbmRvdy50b3RhbFBhZ2VMb2FkVGltZSArPSB3aW5kb3cuY3VycmVudFBhZ2VMb2FkVGltZVxuICAgICAgLyogU2luY2Ugd2UgY2FuJ3QgdGltZSB0aGUgbG9hZCBvZiBibG9ja2VkIHJlc291cmNlcywgYXNzdW1lIHRoYXQgdHJhY2tpbmcgcHJvdGVjdGlvblxuICAgICAgICAgc2F2ZXMgfjQ0JSBsb2FkIHRpbWU6XG4gICAgICAgICBodHRwOi8vbGlmZWhhY2tlci5jb20vdHVybi1vbi10cmFja2luZy1wcm90ZWN0aW9uLWluLWZpcmVmb3gtdG8tbWFrZS1wYWdlcy1sby0xNzA2OTQ2MTY2XG4gICAgICAqL1xuICAgICAgaWYgKHdpbmRvdy5zZXNzaW9uVVJJQ291bnQgJiYgd2luZG93LnRvdGFsUGFnZUxvYWRUaW1lKSB7XG4gICAgICAgIGxldCB0aW1lU2F2ZWQgPSAod2luZG93LnRvdGFsUGFnZUxvYWRUaW1lIC8gKDEgLSAuNDQpKSAtIHdpbmRvdy50b3RhbFBhZ2VMb2FkVGltZVxuICAgICAgICBsZXQgbWVzc2FnZSA9IHtcbiAgICAgICAgICB0aW1lU2F2ZWQ6IHRpbWVTYXZlZCxcbiAgICAgICAgICBibG9ja2VkUmVxdWVzdHM6IHdpbmRvdy50b3RhbEJsb2NrZWRSZXF1ZXN0cyxcbiAgICAgICAgICBibG9ja2VkU2l0ZXM6IHdpbmRvdy50b3RhbEJsb2NrZWRTaXRlcyxcbiAgICAgICAgICBibG9ja2VkRW50aXRpZXM6IHdpbmRvdy50b3RhbEJsb2NrZWRFbnRpdGllc1xuICAgICAgICB9XG4gICAgICAgIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZShtZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGZpbHRlclxuICApXG59XG5cbmZ1bmN0aW9uIHN0YXJ0V2luZG93QW5kVGFiTGlzdGVuZXJzIChhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpIHtcbiAgYnJvd3Nlci53aW5kb3dzLm9uRm9jdXNDaGFuZ2VkLmFkZExpc3RlbmVyKCh3aW5kb3dJRCkgPT4ge1xuICAgIGJyb3dzZXIud2luZG93cy5nZXQod2luZG93SUQsIHt9LCAoZm9jdXNlZFdpbmRvdykgPT4ge1xuICAgICAgaWYgKGZvY3VzZWRXaW5kb3cgJiYgZm9jdXNlZFdpbmRvdy5pbmNvZ25pdG8pIHtcbiAgICAgICAgcHJpdmF0ZUJyb3dzaW5nTW9kZSA9IHRydWVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHByaXZhdGVCcm93c2luZ01vZGUgPSBmYWxzZVxuICAgICAgfVxuICAgIH0pXG4gICAgbG9nKCdicm93c2VyLndpbmRvd3Mub25Gb2N1c0NoYW5nZWQsIHdpbmRvd0lEOiAnICsgd2luZG93SUQpXG4gICAgYnJvd3Nlci50YWJzLnF1ZXJ5KHthY3RpdmU6IHRydWUsIHdpbmRvd0lkOiB3aW5kb3dJRH0sICh0YWJzQXJyYXkpID0+IHtcbiAgICAgIGxldCB0YWIgPSB0YWJzQXJyYXlbMF1cbiAgICAgIGlmICghdGFiKVxuICAgICAgICByZXR1cm5cblxuICAgICAgY3VycmVudEFjdGl2ZVRhYklEID0gdGFiLmlkXG4gICAgICBsZXQgdGFiVG9wSG9zdCA9IGNhbm9uaWNhbGl6ZUhvc3QobmV3IFVSTCh0YWIudXJsKS5ob3N0KVxuICAgICAgbWFpbkZyYW1lT3JpZ2luRGlzYWJsZWRJbmRleCA9IGFsbG93ZWRIb3N0cy5pbmRleE9mKHRhYlRvcEhvc3QpXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cCh0YWJUb3BIb3N0LCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfSlcbiAgfSlcblxuICBicm93c2VyLnRhYnMub25BY3RpdmF0ZWQuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKGFjdGl2ZUluZm8pIHtcbiAgICBjdXJyZW50QWN0aXZlVGFiSUQgPSBhY3RpdmVJbmZvLnRhYklkXG4gICAgYnJvd3Nlci50YWJzLmdldChjdXJyZW50QWN0aXZlVGFiSUQsIGZ1bmN0aW9uICh0YWIpIHtcbiAgICAgIGxldCB0YWJUb3BIb3N0ID0gY2Fub25pY2FsaXplSG9zdChuZXcgVVJMKHRhYi51cmwpLmhvc3QpXG4gICAgICBtYWluRnJhbWVPcmlnaW5EaXNhYmxlZEluZGV4ID0gYWxsb3dlZEhvc3RzLmluZGV4T2YodGFiVG9wSG9zdClcbiAgICAgIHNldFdpbmRvd0ZyYW1lVmFyc0ZvclBvcHVwKHRhYlRvcEhvc3QsIGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cylcbiAgICB9KVxuICB9KVxuXG4gIGJyb3dzZXIudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKHRhYklELCBjaGFuZ2VJbmZvKSB7XG4gICAgaWYgKGNoYW5nZUluZm8uc3RhdHVzID09PSAnbG9hZGluZycpIHtcbiAgICAgIHJlc3RhcnRCbG9rRm9yVGFiKHRhYklEKVxuICAgICAgYnJvd3Nlci50YWJzLmdldChjdXJyZW50QWN0aXZlVGFiSUQsIGZ1bmN0aW9uICh0YWIpIHtcbiAgICAgICAgbGV0IHRhYlRvcEhvc3QgPSBjYW5vbmljYWxpemVIb3N0KG5ldyBVUkwodGFiLnVybCkuaG9zdClcbiAgICAgICAgc2V0V2luZG93RnJhbWVWYXJzRm9yUG9wdXAodGFiVG9wSG9zdCwgYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuICAgICAgfSlcbiAgICB9IGVsc2UgaWYgKGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgICBsb2coJyoqKioqKioqIHRhYiBjaGFuZ2VJbmZvLnN0YXR1cyBjb21wbGV0ZSAqKioqKioqKicpXG4gICAgICBpZiAoYmxvY2tlZFJlcXVlc3RzW3RhYklEXSkge1xuICAgICAgICBsb2coJ2Jsb2NrZWQgJyArIGJsb2NrZWRSZXF1ZXN0c1t0YWJJRF0ubGVuZ3RoICsgJyByZXF1ZXN0czogJywgYmxvY2tlZFJlcXVlc3RzW3RhYklEXSlcbiAgICAgICAgbG9nKCdmcm9tICcgKyBibG9ja2VkRW50aXRpZXNbdGFiSURdLmxlbmd0aCArICcgZW50aXRpZXM6ICcsIGJsb2NrZWRFbnRpdGllc1t0YWJJRF0pXG4gICAgICB9XG4gICAgICBpZiAoYWxsb3dlZFJlcXVlc3RzW3RhYklEXSkge1xuICAgICAgICBsb2coJ2FsbG93ZWQgJyArIGFsbG93ZWRSZXF1ZXN0c1t0YWJJRF0ubGVuZ3RoICsgJyByZXF1ZXN0czogJywgYWxsb3dlZFJlcXVlc3RzW3RhYklEXSlcbiAgICAgICAgbG9nKCdmcm9tICcgKyBhbGxvd2VkRW50aXRpZXNbdGFiSURdLmxlbmd0aCArICcgZW50aXRpZXM6ICcsIGFsbG93ZWRFbnRpdGllc1t0YWJJRF0pXG4gICAgICB9XG4gICAgICBsb2coJ3RvdGFsRXhlY1RpbWU6ICcgKyB0b3RhbEV4ZWNUaW1lW3RhYklEXSlcbiAgICAgIGxvZygnKioqKioqKiogdGFiIGNoYW5nZUluZm8uc3RhdHVzIGNvbXBsZXRlICoqKioqKioqJylcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIHN0YXJ0TWVzc2FnZUxpc3RlbmVyIChhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMsIHRlc3RQaWxvdFBpbmdDaGFubmVsKSB7XG4gIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICBpZiAobWVzc2FnZSA9PT0gJ2Rpc2FibGUnKSB7XG4gICAgICBsZXQgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCA9IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF1cbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0LFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiAnYmxvay1kaXNhYmxlZCcsXG4gICAgICAgIGJyZWFrYWdlOiAnJyxcbiAgICAgICAgbm90ZXM6ICcnXG4gICAgICB9XG4gICAgICBsb2coJ3RlbGVtZXRyeSBwaW5nIHBheWxvYWQ6ICcgKyBKU09OLnN0cmluZ2lmeSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSkpXG4gICAgICB0ZXN0UGlsb3RQaW5nQ2hhbm5lbC5wb3N0TWVzc2FnZSh0ZXN0UGlsb3RQaW5nTWVzc2FnZSlcbiAgICAgIGJyb3dzZXIucGFnZUFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgdGFiSWQ6IGN1cnJlbnRBY3RpdmVUYWJJRCxcbiAgICAgICAgaW1hZ2VEYXRhOiBkcmF3KGZhbHNlLCAwKVxuICAgICAgfSlcbiAgICAgIGFsbG93ZWRIb3N0cy5wdXNoKG1haW5GcmFtZU9yaWdpblRvcEhvc3QpXG4gICAgICBicm93c2VyLnN0b3JhZ2UubG9jYWwuc2V0KHthbGxvd2VkSG9zdHM6IGFsbG93ZWRIb3N0c30pXG4gICAgICBicm93c2VyLnRhYnMucmVsb2FkKGN1cnJlbnRBY3RpdmVUYWJJRClcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UgPT09ICdyZS1lbmFibGUnKSB7XG4gICAgICBsZXQgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCA9IG1haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF1cbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0LFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiAnYmxvay1lbmFibGVkJyxcbiAgICAgICAgYnJlYWthZ2U6ICcnLFxuICAgICAgICBub3RlczogJydcbiAgICAgIH1cbiAgICAgIGxvZygndGVsZW1ldHJ5IHBpbmcgcGF5bG9hZDogJyArIEpTT04uc3RyaW5naWZ5KHRlc3RQaWxvdFBpbmdNZXNzYWdlKSlcbiAgICAgIHRlc3RQaWxvdFBpbmdDaGFubmVsLnBvc3RNZXNzYWdlKHRlc3RQaWxvdFBpbmdNZXNzYWdlKVxuICAgICAgYnJvd3Nlci5wYWdlQWN0aW9uLnNldEljb24oe1xuICAgICAgICB0YWJJZDogY3VycmVudEFjdGl2ZVRhYklELFxuICAgICAgICBpbWFnZURhdGE6IGRyYXcodHJ1ZSwgMClcbiAgICAgIH0pXG4gICAgICBhbGxvd2VkSG9zdHMuc3BsaWNlKG1haW5GcmFtZU9yaWdpbkRpc2FibGVkSW5kZXgsIDEpXG4gICAgICBicm93c2VyLnN0b3JhZ2UubG9jYWwuc2V0KHthbGxvd2VkSG9zdHM6IGFsbG93ZWRIb3N0c30pXG4gICAgICBicm93c2VyLnRhYnMucmVsb2FkKGN1cnJlbnRBY3RpdmVUYWJJRClcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuaGFzT3duUHJvcGVydHkoJ2ZlZWRiYWNrJykpIHtcbiAgICAgIGxldCB0ZXN0UGlsb3RQaW5nTWVzc2FnZSA9IHtcbiAgICAgICAgb3JpZ2luRG9tYWluOiBtYWluRnJhbWVPcmlnaW5Ub3BIb3N0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICB0cmFja2VyRG9tYWluczogYmxvY2tlZFJlcXVlc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF0sXG4gICAgICAgIGV2ZW50OiBtZXNzYWdlLmZlZWRiYWNrLFxuICAgICAgICBicmVha2FnZTogJycsXG4gICAgICAgIG5vdGVzOiAnJ1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgICByZXBvcnRlZEhvc3RzW21haW5GcmFtZU9yaWdpblRvcEhvc3RzW2N1cnJlbnRBY3RpdmVUYWJJRF1dID0gbWVzc2FnZVxuICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7cmVwb3J0ZWRIb3N0czogcmVwb3J0ZWRIb3N0c30pXG4gICAgICBzZXRXaW5kb3dGcmFtZVZhcnNGb3JQb3B1cChjdXJyZW50QWN0aXZlT3JpZ2luLCBhbGxvd2VkSG9zdHMsIHJlcG9ydGVkSG9zdHMpXG4gICAgfVxuICAgIGlmIChtZXNzYWdlLmhhc093blByb3BlcnR5KCdicmVha2FnZScpKSB7XG4gICAgICBsZXQgdGVzdFBpbG90UGluZ01lc3NhZ2UgPSB7XG4gICAgICAgIG9yaWdpbkRvbWFpbjogbWFpbkZyYW1lT3JpZ2luVG9wSG9zdHNbY3VycmVudEFjdGl2ZVRhYklEXSxcbiAgICAgICAgdHJhY2tlckRvbWFpbnM6IGJsb2NrZWRSZXF1ZXN0c1tjdXJyZW50QWN0aXZlVGFiSURdLFxuICAgICAgICBldmVudDogJ3N1Ym1pdCcsXG4gICAgICAgIGJyZWFrYWdlOiBtZXNzYWdlLmJyZWFrYWdlLFxuICAgICAgICBub3RlczogbWVzc2FnZS5ub3Rlc1xuICAgICAgfVxuICAgICAgbG9nKCd0ZWxlbWV0cnkgcGluZyBwYXlsb2FkOiAnICsgSlNPTi5zdHJpbmdpZnkodGVzdFBpbG90UGluZ01lc3NhZ2UpKVxuICAgICAgdGVzdFBpbG90UGluZ0NoYW5uZWwucG9zdE1lc3NhZ2UodGVzdFBpbG90UGluZ01lc3NhZ2UpXG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBzdGFydExpc3RlbmVycyAoe2Jsb2NrbGlzdCwgYWxsb3dlZEhvc3RzLCBlbnRpdHlMaXN0LCByZXBvcnRlZEhvc3RzfSwgdGVzdFBpbG90UGluZ0NoYW5uZWwpIHtcbiAgc3RhcnRSZXF1ZXN0TGlzdGVuZXIoYmxvY2tsaXN0LCBhbGxvd2VkSG9zdHMsIGVudGl0eUxpc3QpXG5cbiAgc3RhcnRXaW5kb3dBbmRUYWJMaXN0ZW5lcnMoYWxsb3dlZEhvc3RzLCByZXBvcnRlZEhvc3RzKVxuXG4gIHN0YXJ0TWVzc2FnZUxpc3RlbmVyKGFsbG93ZWRIb3N0cywgcmVwb3J0ZWRIb3N0cywgdGVzdFBpbG90UGluZ0NoYW5uZWwpXG59XG5cbmNvbnN0IHN0YXRlID0ge1xuICBibG9ja2xpc3Q6IG5ldyBNYXAoKSxcbiAgYWxsb3dlZEhvc3RzOiBbXSxcbiAgcmVwb3J0ZWRIb3N0czoge30sXG4gIGVudGl0eUxpc3Q6IHt9XG59XG5cbmZ1bmN0aW9uIGluaXRUZXN0UGlsb3RQaW5nQ2hhbm5lbCAoe0Jyb2FkY2FzdENoYW5uZWx9KSB7XG4gIC8vIGxldCBURVNUUElMT1RfVEVMRU1FVFJZX0NIQU5ORUwgPSAndGVzdHBpbG90LXRlbGVtZXRyeSdcbiAgbGV0IFRFU1RQSUxPVF9URUxFTUVUUllfQ0hBTk5FTCA9ICdibG9rLXRlbGVtZXRyeSdcbiAgbGV0IHRlc3RQaWxvdFBpbmdDaGFubmVsID0gbmV3IEJyb2FkY2FzdENoYW5uZWwoVEVTVFBJTE9UX1RFTEVNRVRSWV9DSEFOTkVMKVxuICByZXR1cm4gdGVzdFBpbG90UGluZ0NoYW5uZWxcbn1cblxubG9hZExpc3RzKHN0YXRlKS50aGVuKCgpID0+IHtcbiAgbGV0IHRlc3RQaWxvdFBpbmdDaGFubmVsID0gaW5pdFRlc3RQaWxvdFBpbmdDaGFubmVsKHdpbmRvdylcbiAgc3RhcnRMaXN0ZW5lcnMoc3RhdGUsIHRlc3RQaWxvdFBpbmdDaGFubmVsKVxufSwgY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpKVxuXG4vKlxuICogRHJhdyBwYWdlQWN0aW9uIGljb24gd2l0aCBhIHRleHQgYmFkZ2UuXG4gKi9cbmZ1bmN0aW9uIGRyYXcoZW5hYmxlZCwgY291bnRlcikge1xuICBsZXQgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKVxuICBjYW52YXMuc3R5bGUud2lkdGggPSBcIjE2cHhcIlxuICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gXCIxNnB4XCJcbiAgY2FudmFzLmhlaWdodCA9IDMyXG4gIGNhbnZhcy53aWR0aCA9IDMyXG4gIGxldCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKVxuICBjb250ZXh0LnNjYWxlKDIsIDIpXG4gIGxldCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpXG4gIGltZy5zcmMgPSBcImltZy9ibG9rLTgucG5nXCJcblxuICBpZiAoZW5hYmxlZCkge1xuICAgIGNvbnRleHQuZmlsbFN0eWxlID0gXCJyZ2JhKDAsIDE1MCwgMCwgMSlcIlxuICB9IGVsc2Uge1xuICAgIGNvbnRleHQuZmlsbFN0eWxlID0gXCJyZ2JhKDMwMCwgMjAwLCAwLCAxKVwiXG4gIH1cblxuICBjb250ZXh0LmZpbGxSZWN0KDAsIDAsIDMyLCAzMilcbiAgY29udGV4dC5kcmF3SW1hZ2UoaW1nLCAxLCAxKVxuICBjb250ZXh0LmZpbGxTdHlsZSA9IFwid2hpdGVcIlxuICBjb250ZXh0LmZvbnQgPSBcIjhweCBBcmlhbFwiXG4gIGlmIChjb3VudGVyKSB7XG4gICAgY29udGV4dC5maWxsVGV4dChjb3VudGVyLCA2LCAxNClcbiAgfVxuICByZXR1cm4gY29udGV4dC5nZXRJbWFnZURhdGEoMCwgMCwgMzIsIDMyKVxufVxuIiwidmFyIGlwNERlY2ltYWxQYXR0ZXJuID0gJ14oPzooPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT8pLil7M30oPzooPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT8pKSQnXG52YXIgaXA0SGV4UGF0dGVybiA9ICdeKD86KD86MHhbMC05YS1mXXsxLDJ9KS4pezN9KD86MHhbMC05YS1mXXsxLDJ9KSQnXG52YXIgaXA0T2N0YWxQYXR0ZXJuID0gJ14oPzooPzowM1sxLTddWzAtN118MFsxMl1bMC03XXsxLDJ9fFswLTddezEsMn0pLil7M30oPzowM1sxLTddWzAtN118MFsxMl1bMC03XXsxLDJ9fFswLTddezEsMn0pJCdcblxuLy8gbGlrZSB0cmltKCkgaGVscGVyIGZyb20gdW5kZXJzY29yZS5zdHJpbmc6XG4vLyB0cmltcyBjaGFycyBmcm9tIGJlZ2lubmluZyBhbmQgZW5kIG9mIHN0clxuZnVuY3Rpb24gdHJpbSAoc3RyLCBjaGFycykge1xuICAvLyBlc2NhcGUgYW55IHJlZ2V4cCBjaGFyc1xuICBjaGFycyA9IGNoYXJzLnJlcGxhY2UoLyhbLiorP149IToke30oKXxbXFxdXFwvXFxcXF0pL2csICdcXFxcJDEnKVxuICByZXR1cm4gc3RyLnJlcGxhY2UobmV3IFJlZ0V4cCgnXicgKyBjaGFycyArICcrfCcgKyBjaGFycyArICcrJCcsICdnJyksICcnKVxufVxuXG4vLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zYWZlLWJyb3dzaW5nL3Y0L3VybHMtaGFzaGluZyNjYW5vbmljYWxpemF0aW9uXG5mdW5jdGlvbiBjYW5vbmljYWxpemVIb3N0IChob3N0KSB7XG4gIC8vIFJlbW92ZSBhbGwgbGVhZGluZyBhbmQgdHJhaWxpbmcgZG90c1xuICB2YXIgY2Fub25pY2FsaXplZEhvc3QgPSB0cmltKGhvc3QsICcuJylcblxuICAvLyBSZXBsYWNlIGNvbnNlY3V0aXZlIGRvdHMgd2l0aCBhIHNpbmdsZSBkb3RcbiAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC5yZXBsYWNlKG5ldyBSZWdFeHAoJ1suXSsnLCAnZycpLCAnLicpXG5cbiAgLy8gSWYgdGhlIGhvc3RuYW1lIGNhbiBiZSBwYXJzZWQgYXMgYW4gSVAgYWRkcmVzcyxcbiAgLy8gbm9ybWFsaXplIGl0IHRvIDQgZG90LXNlcGFyYXRlZCBkZWNpbWFsIHZhbHVlcy5cbiAgLy8gVGhlIGNsaWVudCBzaG91bGQgaGFuZGxlIGFueSBsZWdhbCBJUC1hZGRyZXNzIGVuY29kaW5nLFxuICAvLyBpbmNsdWRpbmcgb2N0YWwsIGhleCwgYW5kIFRPRE86IGZld2VyIHRoYW4gZm91ciBjb21wb25lbnRzXG4gIHZhciBiYXNlID0gMTBcbiAgdmFyIGlzSVA0RGVjaW1hbCwgaXNJUDRIZXgsIGlzSVA0T2N0YWxcblxuICBpc0lQNERlY2ltYWwgPSBjYW5vbmljYWxpemVkSG9zdC5tYXRjaChpcDREZWNpbWFsUGF0dGVybikgIT0gbnVsbFxuICBpc0lQNEhleCA9IGNhbm9uaWNhbGl6ZWRIb3N0Lm1hdGNoKGlwNEhleFBhdHRlcm4pICE9IG51bGxcbiAgaXNJUDRPY3RhbCA9IGNhbm9uaWNhbGl6ZWRIb3N0Lm1hdGNoKGlwNE9jdGFsUGF0dGVybikgIT0gbnVsbFxuICBpZiAoaXNJUDREZWNpbWFsIHx8IGlzSVA0SGV4IHx8IGlzSVA0T2N0YWwpIHtcbiAgICBpZiAoaXNJUDRIZXgpIHtcbiAgICAgIGJhc2UgPSAxNlxuICAgIH0gZWxzZSBpZiAoaXNJUDRPY3RhbCkge1xuICAgICAgYmFzZSA9IDhcbiAgICB9XG4gICAgY2Fub25pY2FsaXplZEhvc3QgPSBjYW5vbmljYWxpemVkSG9zdC5zcGxpdCgnLicpLm1hcChudW0gPT4gcGFyc2VJbnQobnVtLCBiYXNlKSkuam9pbignLicpXG4gIH1cblxuICAvLyBMb3dlcmNhc2UgdGhlIHdob2xlIHN0cmluZ1xuICBjYW5vbmljYWxpemVkSG9zdCA9IGNhbm9uaWNhbGl6ZWRIb3N0LnRvTG93ZXJDYXNlKClcbiAgcmV0dXJuIGNhbm9uaWNhbGl6ZWRIb3N0XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjYW5vbmljYWxpemVIb3N0LFxuICB0cmltXG59XG4iLCJmdW5jdGlvbiBhbGxIb3N0cyAoaG9zdCkge1xuICBjb25zdCBhbGxIb3N0cyA9IFtdXG4gIGNvbnN0IGhvc3RQYXJ0cyA9IGhvc3Quc3BsaXQoJy4nKVxuICB3aGlsZSAoaG9zdFBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICBhbGxIb3N0cy5wdXNoKGhvc3RQYXJ0cy5qb2luKCcuJykpXG4gICAgaG9zdFBhcnRzLnNwbGljZSgwLCAxKVxuICB9XG4gIHJldHVybiBhbGxIb3N0c1xufVxuXG5mdW5jdGlvbiBsb2FkTGlzdHMgKHN0YXRlKSB7XG4gIGNvbnN0IGJsb2NrTGlzdFByb21pc2UgPSBsb2FkSlNPTignanMvZGlzY29ubmVjdC1ibG9ja2xpc3QuanNvbicpLnRoZW4oKGRhdGEpID0+IHtcbiAgICBzdGF0ZS5ibG9ja2xpc3QgPSBwcm9jZXNzQmxvY2tMaXN0SlNPTihkYXRhKVxuICB9KVxuXG4gIGNvbnN0IGVudGl0eUxpc3RQcm9taXNlID0gbG9hZEpTT04oJ2pzL2Rpc2Nvbm5lY3QtZW50aXR5bGlzdC5qc29uJykudGhlbigoZGF0YSkgPT4ge1xuICAgIHN0YXRlLmVudGl0eUxpc3QgPSBkYXRhXG4gIH0pXG5cbiAgY29uc3QgYWxsb3dlZEhvc3RzUHJvbWlzZSA9IGdldEFsbG93ZWRIb3N0c0xpc3QoKS50aGVuKChhbGxvd2VkSG9zdHMpID0+IHtcbiAgICBzdGF0ZS5hbGxvd2VkSG9zdHMgPSBhbGxvd2VkSG9zdHNcbiAgfSlcblxuICBjb25zdCByZXBvcnRlZEhvc3RzUHJvbWlzZSA9IGdldFJlcG9ydGVkSG9zdHNMaXN0KCkudGhlbigocmVwb3J0ZWRIb3N0cykgPT4ge1xuICAgIHN0YXRlLnJlcG9ydGVkSG9zdHMgPSByZXBvcnRlZEhvc3RzXG4gIH0pXG5cbiAgcmV0dXJuIFByb21pc2UuYWxsKFtibG9ja0xpc3RQcm9taXNlLCBlbnRpdHlMaXN0UHJvbWlzZSwgYWxsb3dlZEhvc3RzUHJvbWlzZSwgcmVwb3J0ZWRIb3N0c1Byb21pc2VdKVxufVxuXG5mdW5jdGlvbiBsb2FkSlNPTiAodXJsKSB7XG4gIHJldHVybiBmZXRjaCh1cmwpXG4gICAgLnRoZW4oKHJlcykgPT4gcmVzLmpzb24oKSlcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc0Jsb2NrTGlzdEpTT04gKGRhdGEpIHtcbiAgY29uc3QgYmxvY2tsaXN0ID0gbmV3IE1hcCgpXG5cbiAgLy8gcmVtb3ZlIHVuLW5lZWRlZCBjYXRlZ29yaWVzIHBlciBkaXNjb25uZWN0XG4gIGRlbGV0ZSBkYXRhLmNhdGVnb3JpZXNbJ0NvbnRlbnQnXVxuICBkZWxldGUgZGF0YS5jYXRlZ29yaWVzWydMZWdhY3kgRGlzY29ubmVjdCddXG4gIGRlbGV0ZSBkYXRhLmNhdGVnb3JpZXNbJ0xlZ2FjeSBDb250ZW50J11cblxuICAvLyBwYXJzZSB0aHJ1IHRoZSBkaXNjb25uZWN0IGJsb2NrbGlzdCBhbmQgY3JlYXRlXG4gIC8vIGxvY2FsIGJsb2NrbGlzdCBcImdyb3VwZWRcIiBieSBtYWluIGRvbWFpbi4gSS5lLixcbiAgLy8gYmxvY2tsaXN0W1wiZmFjZWJvb2suY29tXCJdID0gaHR0cDovL3d3dy5mYWNlYm9vay5jb21cbiAgLy8gYmxvY2tsaXN0W1wiZmIuY29tXCJdID0gaHR0cDovL3d3dy5mYWNlYm9vay5jb21cbiAgLy8gYmxvY2tsaXN0W1wiZG91YmxlY2xpY2submV0XCJdID0gaHR0cDovL3d3dy5nb29nbGUuY29tXG4gIC8vIGJsb2NrbGlzdFtcImdvb2dsZS1hbmFseXRpY3MuY29tXCJdID0gaHR0cDovL3d3dy5nb29nbGUuY29tXG4gIC8vIGV0Yy5cbiAgZm9yIChsZXQgY2F0ZWdvcnlOYW1lIGluIGRhdGEuY2F0ZWdvcmllcykge1xuICAgIHZhciBjYXRlZ29yeSA9IGRhdGEuY2F0ZWdvcmllc1tjYXRlZ29yeU5hbWVdXG4gICAgdmFyIGVudGl0eUNvdW50ID0gY2F0ZWdvcnkubGVuZ3RoXG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVudGl0eUNvdW50OyBpKyspIHtcbiAgICAgIHZhciBlbnRpdHkgPSBjYXRlZ29yeVtpXVxuXG4gICAgICBmb3IgKGxldCBlbnRpdHlOYW1lIGluIGVudGl0eSkge1xuICAgICAgICB2YXIgdXJscyA9IGVudGl0eVtlbnRpdHlOYW1lXVxuXG4gICAgICAgIGZvciAobGV0IG1haW5Eb21haW4gaW4gdXJscykge1xuICAgICAgICAgIGJsb2NrbGlzdC5zZXQobWFpbkRvbWFpbiwgW10pXG4gICAgICAgICAgdmFyIGRvbWFpbnMgPSB1cmxzW21haW5Eb21haW5dXG4gICAgICAgICAgdmFyIGRvbWFpbnNDb3VudCA9IGRvbWFpbnMubGVuZ3RoXG5cbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRvbWFpbnNDb3VudDsgaisrKSB7XG4gICAgICAgICAgICBibG9ja2xpc3Quc2V0KGRvbWFpbnNbal0sIG1haW5Eb21haW4pXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJsb2NrbGlzdFxufVxuXG5mdW5jdGlvbiBnZXRBbGxvd2VkSG9zdHNMaXN0ICgpIHtcbiAgcmV0dXJuIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5nZXQoJ2FsbG93ZWRIb3N0cycpLnRoZW4oKGl0ZW0pID0+IHtcbiAgICBpZiAoaXRlbS5hbGxvd2VkSG9zdHMpIHtcbiAgICAgIHJldHVybiBpdGVtLmFsbG93ZWRIb3N0c1xuICAgIH1cbiAgICByZXR1cm4gW11cbiAgfSlcbn1cblxuZnVuY3Rpb24gZ2V0UmVwb3J0ZWRIb3N0c0xpc3QgKCkge1xuICByZXR1cm4gYnJvd3Nlci5zdG9yYWdlLmxvY2FsLmdldCgncmVwb3J0ZWRIb3N0cycpLnRoZW4oKGl0ZW0pID0+IHtcbiAgICBpZiAoaXRlbS5yZXBvcnRlZEhvc3RzKSB7XG4gICAgICByZXR1cm4gaXRlbS5yZXBvcnRlZEhvc3RzXG4gICAgfVxuICAgIHJldHVybiB7fVxuICB9KVxufVxuXG4vLyBjaGVjayBpZiBhbnkgaG9zdCBmcm9tIGxvd2VzdC1sZXZlbCB0byB0b3AtbGV2ZWwgaXMgaW4gdGhlIGJsb2NrbGlzdFxuZnVuY3Rpb24gaG9zdEluQmxvY2tsaXN0IChibG9ja2xpc3QsIGhvc3QpIHtcbiAgbGV0IHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QgPSBmYWxzZVxuICB2YXIgYWxsSG9zdFZhcmlhbnRzID0gYWxsSG9zdHMoaG9zdClcbiAgZm9yIChsZXQgaG9zdFZhcmlhbnQgb2YgYWxsSG9zdFZhcmlhbnRzKSB7XG4gICAgcmVxdWVzdEhvc3RJbkJsb2NrbGlzdCA9IGJsb2NrbGlzdC5oYXMoaG9zdFZhcmlhbnQpXG4gICAgaWYgKHJlcXVlc3RIb3N0SW5CbG9ja2xpc3QpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG4vLyBjaGVjayBpZiBhbnkgaG9zdCBmcm9tIGxvd2VzdC1sZXZlbCB0byB0b3AtbGV2ZWwgaXMgaW4gdGhlIGVudGl0eWxpc3RcbmZ1bmN0aW9uIGhvc3RJbkVudGl0eSAoZW50aXR5SG9zdHMsIGhvc3QpIHtcbiAgbGV0IGVudGl0eUhvc3QgPSBmYWxzZVxuICBmb3IgKGxldCBob3N0VmFyaWFudCBvZiBhbGxIb3N0cyhob3N0KSkge1xuICAgIGVudGl0eUhvc3QgPSBlbnRpdHlIb3N0cy5pbmRleE9mKGhvc3RWYXJpYW50KSA+IC0xXG4gICAgaWYgKGVudGl0eUhvc3QpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxsSG9zdHMsXG4gIGxvYWRMaXN0cyxcbiAgcHJvY2Vzc0Jsb2NrTGlzdEpTT04sXG4gIGhvc3RJbkJsb2NrbGlzdCxcbiAgaG9zdEluRW50aXR5XG59XG4iLCJpZiAoXCJwcm9kdWN0aW9uXCIgPT09ICdwcm9kdWN0aW9uJykge1xuICBleHBvcnRzLmxvZyA9IGZ1bmN0aW9uIG5vb3AgKCkge31cbn0gZWxzZSB7XG4gIGV4cG9ydHMubG9nID0gY29uc29sZS5sb2cuYmluZChjb25zb2xlKVxufVxuIiwiY29uc3Qge2xvZ30gPSByZXF1aXJlKCcuL2xvZycpXG5jb25zdCB7aG9zdEluRW50aXR5fSA9IHJlcXVpcmUoJy4vbGlzdHMnKVxuXG5sZXQgaG9zdEVudGl0eUNhY2hlID0ge31cblxuZnVuY3Rpb24gcmVxdWVzdEFsbG93ZXIgKHRhYklELCB0b3RhbEV4ZWNUaW1lLCBzdGFydERhdGVUaW1lKSB7XG4gIHRvdGFsRXhlY1RpbWVbdGFiSURdICs9IERhdGUubm93KCkgLSBzdGFydERhdGVUaW1lXG4gIHJldHVybiB7fVxufVxuXG5mdW5jdGlvbiBnZXRSZXF1ZXN0RW50aXR5IChlbnRpdHlMaXN0LCBvcmlnaW5Ub3BIb3N0LCByZXF1ZXN0VG9wSG9zdCwgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdCkge1xuICBsZXQgcmVxdWVzdEVudGl0eSA9IHsnZW50aXR5TmFtZSc6IG51bGwsICdzYW1lRW50aXR5JzogZmFsc2V9XG5cbiAgLy8gRmlyc3QsIHRyeSB0byByZXR1cm4gZXZlcnl0aGluZyBmcm9tIG1lbW8taXplZCBjYWNoZVxuICBsZXQgcmVxdWVzdEVudGl0eU5hbWUgPSBob3N0RW50aXR5Q2FjaGVbcmVxdWVzdFRvcEhvc3RdXG4gIGxldCBvcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW29yaWdpblRvcEhvc3RdXG4gIGxldCBtYWluRnJhbWVPcmlnaW5FbnRpdHlOYW1lID0gaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdXG4gIHJlcXVlc3RFbnRpdHkuc2FtZUVudGl0eSA9IChcbiAgICByZXF1ZXN0RW50aXR5TmFtZSAmJiAoXG4gICAgICByZXF1ZXN0RW50aXR5TmFtZSA9PT0gb3JpZ2luRW50aXR5TmFtZSB8fCByZXF1ZXN0RW50aXR5TmFtZSA9PT0gbWFpbkZyYW1lT3JpZ2luRW50aXR5TmFtZVxuICAgIClcbiAgKVxuICBpZiAocmVxdWVzdEVudGl0eS5zYW1lRW50aXR5KSB7XG4gICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gcmVxdWVzdEVudGl0eU5hbWVcbiAgICBsb2coJ3JldHVybmluZyBmcm9tIG1lbW8taXplZCBjYWNoZTogJywgcmVxdWVzdEVudGl0eSlcbiAgICByZXR1cm4gcmVxdWVzdEVudGl0eVxuICB9XG5cbiAgLy8gSWYgYSBob3N0IHdhcyBub3QgZm91bmQgaW4gdGhlIG1lbW8taXplZCBjYWNoZSwgY2hlY2sgdGhydSB0aGUgZW50aXR5TGlzdFxuICBmb3IgKGxldCBlbnRpdHlOYW1lIGluIGVudGl0eUxpc3QpIHtcbiAgICBsZXQgZW50aXR5ID0gZW50aXR5TGlzdFtlbnRpdHlOYW1lXVxuICAgIGxldCByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSA9IGZhbHNlXG4gICAgbGV0IG9yaWdpbklzRW50aXR5UHJvcGVydHkgPSBmYWxzZVxuICAgIGxldCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gZmFsc2VcblxuICAgIHJlcXVlc3RJc0VudGl0eVJlc291cmNlID0gaG9zdEluRW50aXR5KGVudGl0eS5yZXNvdXJjZXMsIHJlcXVlc3RUb3BIb3N0KVxuICAgIGlmIChyZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgcmVxdWVzdEVudGl0eS5lbnRpdHlOYW1lID0gZW50aXR5TmFtZVxuICAgICAgaG9zdEVudGl0eUNhY2hlW3JlcXVlc3RUb3BIb3N0XSA9IGVudGl0eU5hbWVcbiAgICB9XG5cbiAgICBvcmlnaW5Jc0VudGl0eVByb3BlcnR5ID0gaG9zdEluRW50aXR5KGVudGl0eS5wcm9wZXJ0aWVzLCBvcmlnaW5Ub3BIb3N0KVxuICAgIGlmIChvcmlnaW5Jc0VudGl0eVByb3BlcnR5KSB7XG4gICAgICBob3N0RW50aXR5Q2FjaGVbb3JpZ2luVG9wSG9zdF0gPSBlbnRpdHlOYW1lXG4gICAgfVxuXG4gICAgbWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSA9IGhvc3RJbkVudGl0eShlbnRpdHkucHJvcGVydGllcywgbWFpbkZyYW1lT3JpZ2luVG9wSG9zdClcbiAgICBpZiAobWFpbkZyYW1lT3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSkge1xuICAgICAgaG9zdEVudGl0eUNhY2hlW21haW5GcmFtZU9yaWdpblRvcEhvc3RdID0gZW50aXR5TmFtZVxuICAgIH1cblxuICAgIGlmICgob3JpZ2luSXNFbnRpdHlQcm9wZXJ0eSB8fCBtYWluRnJhbWVPcmlnaW5Jc0VudGl0eVByb3BlcnR5KSAmJiByZXF1ZXN0SXNFbnRpdHlSZXNvdXJjZSkge1xuICAgICAgbG9nKGBvcmlnaW5Ub3BIb3N0ICR7b3JpZ2luVG9wSG9zdH0gYW5kIHJlc291cmNlIHJlcXVlc3RUb3BIb3N0ICR7cmVxdWVzdFRvcEhvc3R9IGJlbG9uZyB0byB0aGUgc2FtZSBlbnRpdHk6ICR7ZW50aXR5TmFtZX07IGFsbG93aW5nIHJlcXVlc3RgKVxuICAgICAgcmVxdWVzdEVudGl0eS5zYW1lRW50aXR5ID0gdHJ1ZVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgLy8gVE9ETzogaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvYmxvay9pc3N1ZXMvMTEwXG4gIHJldHVybiByZXF1ZXN0RW50aXR5XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZXF1ZXN0QWxsb3dlcixcbiAgZ2V0UmVxdWVzdEVudGl0eVxufVxuIl19
