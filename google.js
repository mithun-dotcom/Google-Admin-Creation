'use strict';

/**
 * google.js — auth + Reseller/Directory wrappers.
 *
 * Credential source (in priority order):
 *   1. SA_KEY_JSON  — the full service account JSON as a single env var.
 *                     Best for Render: paste the file contents into one var.
 *   2. SA_KEY_PATH  — path to a service account JSON file (best for local dev).
 *
 * The service account impersonates a super-admin (domain-wide delegation):
 *   - Reseller calls  -> impersonate RESELLER_ADMIN, scope apps.order
 *   - Directory calls -> impersonate a super-admin of the target domain,
 *                        scope admin.directory.user
 */

const fs = require('fs');
const { google } = require('googleapis');

const RESELLER_SCOPE = 'https://www.googleapis.com/auth/apps.order';
const DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user';

let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;

  if (process.env.SA_KEY_JSON) {
    try { cachedKey = JSON.parse(process.env.SA_KEY_JSON); }
    catch { throw new Error('SA_KEY_JSON is set but is not valid JSON.'); }
  } else if (process.env.SA_KEY_PATH) {
    const p = process.env.SA_KEY_PATH;
    if (!fs.existsSync(p)) throw new Error(`Service account key not found at: ${p}`);
    cachedKey = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else {
    throw new Error('No credentials. Set SA_KEY_JSON (Render) or SA_KEY_PATH (local).');
  }

  // When the key is stored in an env var, newlines in private_key are often
  // escaped as the two characters \n — turn them back into real newlines.
  if (cachedKey.private_key && cachedKey.private_key.includes('\\n')) {
    cachedKey.private_key = cachedKey.private_key.replace(/\\n/g, '\n');
  }
  if (!cachedKey.client_email || !cachedKey.private_key) {
    throw new Error('That JSON does not look like a service account key (missing client_email / private_key).');
  }
  return cachedKey;
}

function authAs(subject, scopes) {
  const key = loadKey();
  if (!subject) throw new Error('No admin email to act as. Set RESELLER_ADMIN or pass an acting-admin email.');
  return new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes, subject });
}

function reseller() {
  return google.reseller({ version: 'v1', auth: authAs(process.env.RESELLER_ADMIN, [RESELLER_SCOPE]) });
}
function directory(actingAdmin) {
  return google.admin({ version: 'directory_v1', auth: authAs(actingAdmin || process.env.RESELLER_ADMIN, [DIRECTORY_SCOPE]) });
}

// ---- Reseller: customers ----
async function createCustomer({ customerDomain, alternateEmail, organizationName, contactName, countryCode }) {
  const res = await reseller().customers.insert({
    requestBody: {
      customerDomain,
      alternateEmail,
      customerType: 'domain',
      postalAddress: {
        kind: 'customers#address',
        organizationName: organizationName || undefined,
        contactName: contactName || undefined,
        countryCode,
      },
    },
  });
  return res.data;
}
async function getCustomer(customerKey) {
  return (await reseller().customers.get({ customerId: customerKey })).data;
}

// ---- Reseller: subscriptions ----
async function createSubscription({ customerId, skuId, planName, seats, purchaseOrderId }) {
  const seatBlock = planName === 'FLEXIBLE'
    ? { kind: 'subscriptions#seats', maximumNumberOfSeats: Number(seats) }
    : { kind: 'subscriptions#seats', numberOfSeats: Number(seats), licensedNumberOfSeats: Number(seats) };
  const res = await reseller().subscriptions.insert({
    customerId,
    requestBody: {
      kind: 'reseller#subscription',
      customerId, skuId,
      plan: { planName },
      seats: seatBlock,
      purchaseOrderId: purchaseOrderId || undefined,
    },
  });
  return res.data;
}
async function listSubscriptions() {
  const out = [];
  let pageToken;
  do {
    const res = await reseller().subscriptions.list({ maxResults: 100, pageToken });
    if (res.data.subscriptions) out.push(...res.data.subscriptions);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

// ---- Directory: users ----
async function createUser({ actingAdmin, primaryEmail, givenName, familyName, password, makeAdmin }) {
  const dir = directory(actingAdmin);
  const res = await dir.users.insert({
    requestBody: { primaryEmail, name: { givenName, familyName }, password, changePasswordAtNextLogin: true },
  });
  if (makeAdmin) await dir.users.makeAdmin({ userKey: primaryEmail, requestBody: { status: true } });
  return res.data;
}
async function listUsers({ actingAdmin, domain }) {
  const res = await directory(actingAdmin).users.list({ domain, maxResults: 200, orderBy: 'email' });
  return res.data.users || [];
}

module.exports = { createCustomer, getCustomer, createSubscription, listSubscriptions, createUser, listUsers };
