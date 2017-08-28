document.addEventListener("DOMContentLoaded", event => {
    document.getElementById("enable").onclick = () =>
        browser.runtime.sendMessage("toggle-tracking-enabled");
    document.getElementById("disable").onclick = () =>
        browser.runtime.sendMessage("toggle-tracking-disabled");
    document.getElementById("prefs").addEventListener("click", event =>
        browser.runtime.sendMessage("open-prefs")
    );
});
