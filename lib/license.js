const GUMROAD_PRODUCT_ID = "kViVsaIZ0LyVZ8cWuZNG2g==";
const GUMROAD_API        = "https://api.gumroad.com/v2/licenses/verify";
const DEVICE_LIMIT       = 5;
const SUPPORT_EMAIL      = "northportlabs@gmail.com";
const DAY_MS             = 24 * 60 * 60 * 1000;
const HOUR_MS            =      60 * 60 * 1000;

// Test-only bypass — active when BUILD_FLAGS.testBuild (extension) or window.__BTC_TEST_BUILD__ (desktop)
const _BYPASS_EMAIL = "aol@aol.com";
const _BYPASS_KEY   = "congratsYouFoundIt";
function _isTestBuild() {
  return (typeof BUILD_FLAGS !== "undefined" && !!BUILD_FLAGS.testBuild) ||
         (typeof window !== "undefined" && !!window.__BTC_TEST_BUILD__);
}

// Build body manually — URLSearchParams percent-encodes = as %3D which
// breaks Gumroad's base64 product_id matching on their end.
async function _callGumroad(licenseKey, increment) {
  const body = `product_id=${GUMROAD_PRODUCT_ID}&license_key=${encodeURIComponent(licenseKey)}&increment_uses_count=${increment}`;
  const res = await fetch(GUMROAD_API, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.json();
}

async function verifyWithGumroad(email, licenseKey, _storage = {}) {
  if (_isTestBuild() && email.toLowerCase() === _BYPASS_EMAIL && licenseKey === _BYPASS_KEY) {
    return { valid: true };
  }
  try {
    const appGet = _storage.appGet ?? (typeof window !== "undefined" ? window.appGet : null);
    const appSet = _storage.appSet ?? (typeof window !== "undefined" ? window.appSet : null);

    // Check whether this exact key was already activated on this device so we
    // don't burn an extra slot on re-verification (e.g. opening Settings again).
    let alreadyActivated = false;
    if (appGet) {
      const stored = await appGet(["deviceActivated"]);
      alreadyActivated = stored.deviceActivated === licenseKey;
    }

    // First call — never increment, just read current state.
    const check = await _callGumroad(licenseKey, false);
    console.log("[license] Gumroad response:", JSON.stringify(check, null, 2));

    if (!check.success)
      return { valid: false, error: `Invalid license key${_isTestBuild() ? ` [Gumroad: ${check.message || "no message"}]` : ""}` };
    if (check.purchase.email.toLowerCase() !== email.toLowerCase())
      return { valid: false, error: `Wrong email for this license key${_isTestBuild() ? ` [expected: ${check.purchase.email}]` : ""}` };
    if (check.purchase.refunded)
      return { valid: false, error: "This license has been refunded and is no longer valid." };
    if (check.purchase.chargebacked)
      return { valid: false, error: `This license has a chargeback on record. Contact ${SUPPORT_EMAIL}.` };

    // Device already counted — skip the activation call.
    if (alreadyActivated) return { valid: true };

    // New device — enforce the per-license device limit.
    if (check.uses >= DEVICE_LIMIT) {
      return {
        valid: false,
        error: `Maximum devices reached. Please contact ${SUPPORT_EMAIL} to reset your license or purchase a new one.`
      };
    }

    // Second call — activate this device by incrementing the uses counter.
    const activate = await _callGumroad(licenseKey, true);
    if (!activate.success)
      return { valid: false, error: "Could not activate this device. Please try again." };

    // Persist the activated key so future verifications skip the increment,
    // and stamp check/attempt times so the daily check doesn't fire immediately.
    if (appSet) {
      await appSet({
        deviceActivated:    licenseKey,
        lastLicenseCheck:   Date.now(),
        lastLicenseAttempt: Date.now(),
      });
    }

    return { valid: true };
  } catch (err) {
    console.error("[license] Gumroad fetch error:", err);
    return { valid: false, error: `Could not reach Gumroad. Check your connection.${_isTestBuild() ? ` [${err.message}]` : ""}` };
  }
}

// Called once on popup open. Timing rules:
//   • Skip if Gumroad was reached successfully within the last 24 hours.
//   • If the last attempt was a network failure, retry every hour until connected.
//   • Never revoke the license on a network error — benefit of the doubt.
// Returns { revoked: true } when Gumroad explicitly says the key is invalid/refunded.
// Returns null in all other cases (skip, network error, still valid).
// _storage: optional { appGet, appSet } for testing; defaults to window.appGet / window.appSet.
async function checkLicensePeriodically(email, licenseKey, _storage = {}) {
  if (!email || !licenseKey) return null;
  const appGet = _storage.appGet ?? (typeof window !== "undefined" ? window.appGet : null);
  const appSet = _storage.appSet ?? (typeof window !== "undefined" ? window.appSet : null);
  if (!appGet || !appSet) return null;
  try {
    const stored    = await appGet(["lastLicenseCheck", "lastLicenseAttempt"]);
    const now       = Date.now();
    const lastCheck   = stored.lastLicenseCheck   || 0;
    const lastAttempt = stored.lastLicenseAttempt || 0;

    // Already confirmed within 24 hours — nothing to do.
    if (now - lastCheck < DAY_MS) return null;
    // Last attempt was a network failure; wait 1 hour before retrying.
    if (now - lastAttempt < HOUR_MS) return null;

    // Record this attempt before the fetch (so a crash still counts as an attempt).
    await appSet({ lastLicenseAttempt: now });

    const data = await _callGumroad(licenseKey, false);

    // Got a definitive response — reset to full 24-hour cycle.
    await appSet({ lastLicenseCheck: now, lastLicenseAttempt: now });

    if (!data.success || data.purchase?.refunded || data.purchase?.chargebacked) {
      return { revoked: true };
    }
    return { valid: true };
  } catch {
    // Network unreachable — lastLicenseAttempt was stamped above, retry in 1 hour.
    return null;
  }
}

function isProUnlocked(settings) {
  return !!(settings.licenseEmail && settings.licenseKey);
}

if (typeof module !== "undefined") module.exports = { verifyWithGumroad, checkLicensePeriodically, isProUnlocked };
