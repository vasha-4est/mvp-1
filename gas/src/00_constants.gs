/**
 * MVP-1 Phase A constants.
 *
 * Правило: этот файл НЕ содержит бизнес-логики. Только константы.
 */

// --- Spreadsheet logical names
const DB = {
  OPS: 'OPS_DB',
  CTRL: 'CONTROL_MODEL',
  CFO: 'CEO_FINANCE_CORE',
};

// --- Tabs (sheet names) across spreadsheets
const SHEET = {
  // CONTROL_MODEL (настройки / доступы / справочники)
  SYSTEM_CONFIG: 'system_config',
  USERS_DIRECTORY: 'users_directory',
  USERS_ROLES: 'users_roles',
  USERS_DIRECTORY_CACHE: 'users_directory_cache',
  ROLES_CATALOG: 'roles_catalog',
  ZONES_CATALOG: 'zones_catalog',
  EVENTS_CATALOG: 'events_catalog',
  RBAC_PERMISSIONS: 'rbac_permissions',
  STOP_ACTIONS: 'stop_actions',

  // OPS_DB (операционные данные)
  CONFIG_FLAGS: 'config_flags',
  EMPLOYEES: 'employees',
  STATIONS: 'stations',
  ZONES: 'zones',
  LOCATIONS: 'locations',
  SKU: 'products_sku',
  INVENTORY: 'inventory_balances',
  BATCHES: 'batches',
  PICKING_LISTS: 'picking_lists',
  PICKING_LINES: 'picking_lines',
  SHIPMENTS: 'shipments',
  SHIPMENT_LINES: 'shipment_lines',
  SHIPMENTS_AGG: 'shipments_aggregates',
  EVENTS: 'events_log',
  IDEMP: 'idempotency_log',
  OUTBOX: 'notification_outbox',
};

// --- Where each sheet lives
const SHEET_DB = {
  // CONTROL_MODEL
  [SHEET.SYSTEM_CONFIG]: DB.CTRL,
  [SHEET.USERS_DIRECTORY]: DB.CTRL,
  [SHEET.USERS_ROLES]: DB.CTRL,
  [SHEET.USERS_DIRECTORY_CACHE]: DB.OPS,
  [SHEET.ROLES_CATALOG]: DB.CTRL,
  [SHEET.ZONES_CATALOG]: DB.CTRL,
  [SHEET.EVENTS_CATALOG]: DB.CTRL,
  [SHEET.RBAC_PERMISSIONS]: DB.CTRL,
  [SHEET.STOP_ACTIONS]: DB.CTRL,

  // OPS_DB
  [SHEET.CONFIG_FLAGS]: DB.OPS,
  [SHEET.EMPLOYEES]: DB.OPS,
  [SHEET.STATIONS]: DB.OPS,
  [SHEET.ZONES]: DB.OPS,
  [SHEET.LOCATIONS]: DB.OPS,
  [SHEET.SKU]: DB.OPS,
  [SHEET.INVENTORY]: DB.OPS,
  [SHEET.BATCHES]: DB.OPS,
  [SHEET.PICKING_LISTS]: DB.OPS,
  [SHEET.PICKING_LINES]: DB.OPS,
  [SHEET.SHIPMENTS]: DB.OPS,
  [SHEET.SHIPMENT_LINES]: DB.OPS,
  [SHEET.SHIPMENTS_AGG]: DB.OPS,
  [SHEET.EVENTS]: DB.OPS,
  [SHEET.IDEMP]: DB.OPS,
  [SHEET.OUTBOX]: DB.OPS,
};

// --- Feature flags
const FLAG = {
  PHASE_A_CORE: 'PHASE_A_CORE',
  DEMO_MODE: 'DEMO_MODE',
  AUTH_TELEGRAM: 'AUTH_TELEGRAM',
  EVENT_LOG: 'EVENT_LOG',
  IDEMPOTENCY_REQUEST_ID: 'IDEMPOTENCY_REQUEST_ID',
  LOCKS_MIN_OPTIMISTIC: 'LOCKS_MIN_OPTIMISTIC',

  SKU_CATALOG: 'SKU_CATALOG',
  INVENTORY_CORE: 'INVENTORY_CORE',
  LOCATIONS_ADDRESSING: 'LOCATIONS_ADDRESSING',
  BATCH_CORE: 'BATCH_CORE',
  DRYING_TIMERS: 'DRYING_TIMERS',
  PICKING_CORE: 'PICKING_CORE',
  PICKING_FOCUS_MODE: 'PICKING_FOCUS_MODE',
  SCAN_MODE_SINGLE_SCAN_QTY_INPUT: 'SCAN_MODE_SINGLE_SCAN_QTY_INPUT',
  MANUAL_ENTRY_FALLBACK: 'MANUAL_ENTRY_FALLBACK',
  BASIC_NOTIFICATIONS: 'BASIC_NOTIFICATIONS',
  NOTIF_CRITICAL: 'NOTIF_CRITICAL',

  // Phase B
  KANBAN_VIEW: 'KANBAN_VIEW',
  PAYROLL_ENGINE: 'PAYROLL_ENGINE',
};

// --- Error codes (must match spec)
const ERROR = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  FLAG_DISABLED: 'FLAG_DISABLED',
  LOCK_CONFLICT: 'LOCK_CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  QTY_EXCEEDS_REMAINING: 'QTY_EXCEEDS_REMAINING',
  SHORT_REASON_REQUIRED: 'SHORT_REASON_REQUIRED',
};

// --- Minimal roles for Phase A (RBAC расширим позднее)
const ROLE = {
  OWNER: 'owner',
  CEO: 'ceo',
  SHIFT_LEAD: 'shift_lead',
  WORKER: 'worker',
};

function nowIso_() {
  return new Date().toISOString();
}

function uuid_() {
  return Utilities.getUuid();
}
