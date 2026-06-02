// Extension popup storage adapter — uses encrypted storage
window.appGet    = keys => cryptoGet(keys);
window.appSet    = data => cryptoSet(data);
window.appRemove = keys => browser.storage.local.remove(keys);
