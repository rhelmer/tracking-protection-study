const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.importGlobalProperties(["fetch"]);

const EXPORTED_SYMBOLS = ["blocklists"];

const blocklists = {
  allHosts(host) {
    const allHosts = []
    const hostParts = host.split(".")
    while (hostParts.length > 1) {
      allHosts.push(hostParts.join("."))
      hostParts.splice(0, 1)
    }
    return allHosts
  },

  loadLists(state) {
    const blockListPromise = this.loadJSON("resource://tracking-protection-study/disconnect-blocklist.json").then((data) => {
      state.blocklist = this.processBlockListJSON(data)
    })

    const entityListPromise = this.loadJSON("resource://tracking-protection-study/disconnect-entitylist.json").then((data) => {
      state.entityList = data
    })

//    const allowedHostsPromise = this.getAllowedHostsList().then((allowedHosts) => {
//      state.allowedHosts = allowedHosts
//    })

    const reportedHostsPromise = this.getReportedHostsList().then((reportedHosts) => {
      state.reportedHosts = reportedHosts
    })

    // return Promise.all([blockListPromise, entityListPromise, allowedHostsPromise, reportedHostsPromise])
    return Promise.all([blockListPromise, entityListPromise, reportedHostsPromise])
  },

  loadJSON(url) {
    return fetch(url)
      .then((res) => res.json())
  },

  processBlockListJSON(data) {
    const blocklist = new Map()

    // remove un-needed categories per disconnect
    delete data.categories.Content
    delete data.categories["Legacy Disconnect"]
    delete data.categories["Legacy Content"]

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
  },

  async getAllowedHostsList() {
    // TODO retrieve from storage
    return [];
  },

  async getReportedHostsList() {
    // TODO retrieve from storage
    return {};
  },

  // check if any host from lowest-level to top-level is in the blocklist
  hostInBlocklist(blocklist, host) {
    let requestHostInBlocklist = false
    var allHostVariants = this.allHosts(host)
    for (let hostVariant of allHostVariants) {
      requestHostInBlocklist = blocklist.has(hostVariant)
      if (requestHostInBlocklist) {
        return true
      }
    }
    return false
  },

  // check if any host from lowest-level to top-level is in the entitylist
  hostInEntity(entityHosts, host) {
    let entityHost = false
    for (let hostVariant of this.allHosts(host)) {
      entityHost = entityHosts.indexOf(hostVariant) > -1
      if (entityHost) {
        return true
      }
    }
    return false
  }
}
