// Node-side wrapper — re-exports lib/api.js for use in the main process.
// Node 18+ has native fetch so all provider calls work identically.
module.exports = require("../../lib/api.js");
