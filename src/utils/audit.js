/**
 * Audit logging helpers — write to AuditLog collection from any controller.
 *
 * Usage in a controller:
 *   const before = await Customer.findById(id).lean();
 *   // ... apply update ...
 *   const after = await Customer.findById(id).lean();
 *   await logUpdate(req, 'customer', id, before, after, FIELDS_TO_TRACK.customer);
 */
const { AuditLog } = require('../models');

// Whitelist of fields per entity that we care about. Internal/computed fields are skipped.
const FIELDS_TO_TRACK = {
  customer: ['name', 'monthlyPrice', 'status', 'notes', 'billingDetails.address', 'billingDetails.email', 'billingDetails.phone', 'billingDetails.taxId'],
  branch: ['branchName', 'address', 'city', 'region', 'contactPerson', 'contactPhone', 'visitIntervalDays', 'isActive', 'notes'],
  device: ['deviceType', 'scentId', 'locationInBranch', 'monthlyRate', 'mlPerRefill', 'refillIntervalDays', 'isActive', 'notes'],
  work_order: ['status', 'assignedTo', 'scheduledDate', 'priority', 'type', 'notes', 'estimatedDuration']
};

function getNested(obj, path) {
  return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function isEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Compare ObjectIds and Dates by string
  if (typeof a === 'object' && typeof a.toString === 'function' && a.constructor?.name !== 'Object') {
    return a.toString() === (b?.toString?.() ?? b);
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** Compute the diff between two snapshots, restricted to the tracked fields. */
function computeDiff(before, after, fields) {
  const changes = [];
  for (const f of fields) {
    const fromVal = before ? getNested(before, f) : undefined;
    const toVal = after ? getNested(after, f) : undefined;
    if (!isEqual(fromVal, toVal)) {
      changes.push({ field: f, from: fromVal ?? null, to: toVal ?? null });
    }
  }
  return changes;
}

/** Pull the user info off of req — works with the existing auth middleware. */
function userFromReq(req) {
  if (!req?.user) return {};
  return {
    userId: req.user._id,
    userName: req.user.name || req.user.username || '',
    userRole: req.user.role || ''
  };
}

/**
 * Generic write — fire-and-forget; never throws back to the caller because
 * audit failures shouldn't break the actual business operation.
 */
async function writeLog(entry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error('AuditLog write failed:', err.message);
  }
}

async function logCreate(req, entityType, entityId, entityName, after) {
  const fields = FIELDS_TO_TRACK[entityType] || [];
  const changes = computeDiff(null, after, fields);
  await writeLog({
    entityType,
    entityId,
    entityName,
    action: 'create',
    changes,
    ...userFromReq(req)
  });
}

async function logUpdate(req, entityType, entityId, entityName, before, after, opts = {}) {
  const fields = opts.fields || FIELDS_TO_TRACK[entityType] || [];
  const changes = computeDiff(before, after, fields);
  if (changes.length === 0) return; // nothing meaningful changed
  await writeLog({
    entityType,
    entityId,
    entityName,
    action: opts.action || 'update',
    changes,
    notes: opts.notes,
    ...userFromReq(req)
  });
}

async function logDelete(req, entityType, entityId, entityName, before) {
  await writeLog({
    entityType,
    entityId,
    entityName,
    action: 'delete',
    changes: [],
    ...userFromReq(req)
  });
}

/** Specialized log for status / assignment / completion / cancellation. */
async function logEvent(req, entityType, entityId, entityName, action, opts = {}) {
  await writeLog({
    entityType,
    entityId,
    entityName,
    action,
    changes: opts.changes || [],
    notes: opts.notes,
    ...userFromReq(req)
  });
}

module.exports = {
  FIELDS_TO_TRACK,
  computeDiff,
  logCreate,
  logUpdate,
  logDelete,
  logEvent
};
