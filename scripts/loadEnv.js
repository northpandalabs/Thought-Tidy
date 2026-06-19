const fs   = require("fs");
const path = require("path");

// ETC/ folder in project root — gitignored, never committed
const ETC_FILE = path.join(__dirname, "..", "ETC", "brainfix-ai.env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}

module.exports = async () => {
  loadEnvFile(path.join(__dirname, "..", ".env")); // project-local .env (gitignored)
  loadEnvFile(ETC_FILE);                           // machine-level secrets folder
};
