function checkElements(expectPresent, l) {
  for (let id of l) {
    is(!!document.getElementById(id), expectPresent, "element " + id + (expectPresent ? " is" : " is not") + " present");
  }
}
