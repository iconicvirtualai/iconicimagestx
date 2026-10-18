/* Holiday Buy Now.
   Open the checkout tab in the click turn. A Wix iframe is cross-origin and
   about 9000px tall, and it does not allow top navigation. After the order
   request, window.top.location.assign is ignored and does not throw, so the
   old catch never ran and Square never appeared. */
(function (root) {
  function httpsUrl(url) {
    if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) return "";
    try {
      var parsed = new URL(url.trim());
      if (parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (e) {
      return "";
    }
  }

  function openTab() {
    try {
      return root.open("", "_blank");
    } catch (e) {
      return null;
    }
  }

  function closeTab(tab) {
    if (!tab || tab.closed) return;
    try { tab.close(); } catch (e) {}
  }

  function follow(tab, url) {
    var safe = httpsUrl(url);
    if (!safe) {
      closeTab(tab);
      return false;
    }
    if (!tab || tab.closed) return false;
    try {
      tab.opener = null;
    } catch (e) {}
    try {
      tab.location.href = safe;
      return true;
    } catch (e) {
      return false;
    }
  }

  function showResult(el, url) {
    if (!el) return false;
    var doc = el.ownerDocument || root.document;
    var safe = httpsUrl(url);
    el.hidden = false;
    el.textContent = "";
    if (!safe) {
      el.appendChild(doc.createTextNode("We'll text your secure payment link. Call "));
      var phone = doc.createElement("a");
      phone.href = "tel:+12813560965";
      phone.textContent = "281.356.0965";
      el.appendChild(phone);
      el.appendChild(doc.createTextNode("."));
      return false;
    }
    var link = doc.createElement("a");
    link.className = "btn btn-gold checkout-continue";
    link.href = safe;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Continue to secure checkout";
    el.appendChild(link);
    return true;
  }

  root.HolidayCheckout = {
    httpsUrl: httpsUrl,
    openTab: openTab,
    closeTab: closeTab,
    follow: follow,
    showResult: showResult,
  };
})(typeof window !== "undefined" ? window : globalThis);
