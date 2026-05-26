const GUMROAD_PERMALINK = "blur-to-clear";
const GUMROAD_API       = "https://api.gumroad.com/v2/licenses/verify";

// Test-only bypass — active when BUILD_FLAGS.testBuild (extension) or window.__BTC_TEST_BUILD__ (desktop)
const _BYPASS_EMAIL = "aol@aol.com";
const _BYPASS_KEY   = "congratsYouFoundIt";
function _isTestBuild() {
  return (typeof BUILD_FLAGS !== "undefined" && !!BUILD_FLAGS.testBuild) ||
         (typeof window !== "undefined" && !!window.__BTC_TEST_BUILD__);
}

async function verifyWithGumroad(email, licenseKey) {
  if (_isTestBuild() && email.toLowerCase() === _BYPASS_EMAIL && licenseKey === _BYPASS_KEY) {
    return { valid: true };
  }
  try {
    const res = await fetch(GUMROAD_API, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        product_permalink: GUMROAD_PERMALINK,
        license_key:       licenseKey,
      }).toString(),
    });
    const data = await res.json();
    if (!data.success) return { valid: false, error: "Invalid license key" };
    if (data.purchase.email.toLowerCase() !== email.toLowerCase())
      return { valid: false, error: "Wrong email for this license key" };
    return { valid: true };
  } catch {
    return { valid: false, error: "Could not reach Gumroad. Check your connection." };
  }
}

function isProUnlocked(settings) {
  return !!(settings.licenseEmail && settings.licenseKey);
}

if (typeof module !== "undefined") module.exports = { verifyWithGumroad, isProUnlocked };
