const { getStore } = require('@netlify/blobs');

// Netlify is supposed to auto-inject Blobs credentials into every function
// at runtime. On some sites this silently doesn't happen (a known platform
// quirk, not something wrong in this code), which throws
// MissingBlobsEnvironmentError the moment getStore() is used. Passing the
// site ID + a token explicitly sidesteps that entirely, and is harmless to
// leave in place even on sites where auto-injection works fine.
//
// Requires two environment variables to be set in Netlify (Site
// configuration > Environment variables) for the fallback to kick in:
//   BLOBS_SITE_ID    — Site configuration > General > Site details > Site ID
//   BLOBS_TOKEN      — User settings > Applications > New access token
// If neither is set, this behaves exactly like a normal getStore() call.
function getBlobStore(name) {
  if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
    return getStore({ name, siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
  }
  return getStore(name);
}

module.exports = { getBlobStore };
