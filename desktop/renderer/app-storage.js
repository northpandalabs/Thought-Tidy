// Desktop storage adapter — uses plain storage
window.appGet    = keys => browser.storage.local.get(keys);
window.appSet    = data => browser.storage.local.set(data);
window.appRemove = keys => browser.storage.local.remove(keys);
