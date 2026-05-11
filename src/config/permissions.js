/**
 * Single source of truth for what each role can do.
 *
 * The matrix below drives:
 *   - Backend route authorization (used via authorizeCapability middleware)
 *   - GET /api/permissions endpoint that powers the UI matrix
 *   - Frontend UI gating (sidebar items, dashboard redirect, etc.)
 *
 * To add a role: add it to ROLES + give it a row in ROLE_CAPABILITIES.
 * To change what a role can do: just edit the matrix below.
 */

const ROLES = [
  { value: 'admin',      label: 'אדמין',      description: 'גישה מלאה לכל המערכת' },
  { value: 'manager',    label: 'מנהל',       description: 'מנהל בכיר — כל התפעול וגישה לדשבורד הרווחיות' },
  { value: 'secretary',  label: 'מזכירה',     description: 'תפעול וגביה — בלי דשבורד רווחיות וצ\'אט AI' },
  { value: 'technician', label: 'טכנאי',      description: 'גישה רק למשימות ולוז שלו' }
];

// Each capability is a tuple: a key (used in code) + a Hebrew label (for UI).
// Group key drives the section heading in the matrix UI.
const CAPABILITIES = [
  // ראשי
  { key: 'view_dashboard',      group: 'ראשי',     label: 'דשבורד וניתוח רווחיות' },
  { key: 'view_customers',      group: 'ראשי',     label: 'צפייה בלקוחות' },
  { key: 'edit_customers',      group: 'ראשי',     label: 'עריכת לקוחות' },
  { key: 'view_branches',       group: 'ראשי',     label: 'צפייה בסניפים' },
  { key: 'edit_branches',       group: 'ראשי',     label: 'עריכת סניפים' },
  { key: 'view_devices',        group: 'ראשי',     label: 'צפייה במכשירים' },
  { key: 'edit_devices',        group: 'ראשי',     label: 'עריכת מכשירים' },
  { key: 'view_scents',         group: 'ראשי',     label: 'ריחות ומלאי' },

  // תפעול
  { key: 'view_work_orders',    group: 'תפעול',   label: 'צפייה בהזמנות עבודה' },
  { key: 'manage_work_orders',  group: 'תפעול',   label: 'יצירה ועריכת הזמנות עבודה' },
  { key: 'manage_schedule',     group: 'תפעול',   label: 'יצירת יומן שבועי' },
  { key: 'view_my_tasks',       group: 'תפעול',   label: 'המשימות שלי (טכנאי)' },
  { key: 'quick_refill',        group: 'תפעול',   label: 'מילוי מהיר' },
  { key: 'view_service_logs',   group: 'תפעול',   label: 'יומן שירות' },

  // מערכת
  { key: 'manage_users',        group: 'מערכת',   label: 'ניהול משתמשים' },
  { key: 'view_audit_log',      group: 'מערכת',   label: 'יומן פעילות' },
  { key: 'manage_device_types', group: 'מערכת',   label: 'ניהול סוגי מכשירים' },
  { key: 'use_ai_chat',         group: 'מערכת',   label: 'צ\'אט AI' },
];

/**
 * The matrix. ✓ = allowed, ✗ = denied.
 *
 * Notes on intent:
 *   - admin: everything
 *   - manager: full operations + dashboard with profitability
 *   - secretary: full operations including billing/payments BUT no dashboard
 *     profitability and no AI chat
 *   - technician: read-only on the entities (so they can navigate during a
 *     visit), but only writes to their own work orders + quick refill
 */
const ROLE_CAPABILITIES = {
  admin: {
    view_dashboard: true, view_customers: true, edit_customers: true,
    view_branches: true, edit_branches: true, view_devices: true, edit_devices: true,
    view_scents: true,
    view_work_orders: true, manage_work_orders: true, manage_schedule: true,
    view_my_tasks: true, quick_refill: true, view_service_logs: true,
    manage_users: true, view_audit_log: true, manage_device_types: true, use_ai_chat: true,
  },
  manager: {
    view_dashboard: true, view_customers: true, edit_customers: true,
    view_branches: true, edit_branches: true, view_devices: true, edit_devices: true,
    view_scents: true,
    view_work_orders: true, manage_work_orders: true, manage_schedule: true,
    view_my_tasks: false, quick_refill: true, view_service_logs: true,
    manage_users: false, view_audit_log: true, manage_device_types: true, use_ai_chat: true,
  },
  secretary: {
    view_dashboard: false, view_customers: true, edit_customers: true,
    view_branches: true, edit_branches: true, view_devices: true, edit_devices: true,
    view_scents: true,
    view_work_orders: true, manage_work_orders: true, manage_schedule: true,
    view_my_tasks: false, quick_refill: true, view_service_logs: true,
    manage_users: false, view_audit_log: true, manage_device_types: true, use_ai_chat: false,
  },
  technician: {
    view_dashboard: false, view_customers: true, edit_customers: false,
    view_branches: true, edit_branches: false, view_devices: true, edit_devices: false,
    view_scents: true,
    view_work_orders: false, manage_work_orders: false, manage_schedule: false,
    view_my_tasks: true, quick_refill: true, view_service_logs: true,
    manage_users: false, view_audit_log: false, manage_device_types: false, use_ai_chat: false,
  }
};

function can(role, capability) {
  return Boolean(ROLE_CAPABILITIES[role]?.[capability]);
}

/** Express middleware that enforces a single capability. */
function requireCapability(capability) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'לא מחובר' });
    if (!can(req.user.role, capability)) {
      return res.status(403).json({ message: 'אין לך הרשאה לפעולה זו' });
    }
    next();
  };
}

module.exports = {
  ROLES,
  CAPABILITIES,
  ROLE_CAPABILITIES,
  can,
  requireCapability
};
