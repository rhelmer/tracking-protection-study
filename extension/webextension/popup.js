function toggleTrackingProtection() {
    console.log("rhelmer debug toggle tp");
    browser.runtime.sendMessage("message-from-webextension").then(reply => {
        if (reply) {
            console.log("response from legacy add-on: " + reply.content);
        }
    });
}

for (let element in document.getElementsByClassName("toggle-tp")) {
    element.addEventListener("click", () => console.log("rhelmer debug"))
}
