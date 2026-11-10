/* Iconic Shooter push worker. It does not cache or rewrite page requests. */
self.addEventListener("push", (event) => {
  let payload = { title: "Iconic", body: "New team message", url: "/shooter" };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload.body = event.data ? event.data.text() : payload.body;
  }
  event.waitUntil(self.registration.showNotification(payload.title || "Iconic", {
    body: payload.body || "",
    icon: "/shooter-icon-192.png",
    badge: "/shooter-icon-192.png",
    data: { url: payload.url || "/shooter" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/shooter";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const windowClient of windows) {
      if (windowClient.url.indexOf("/shooter") !== -1 && "focus" in windowClient) {
        return windowClient.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  }));
});
