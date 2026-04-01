// Comprehensive Permissions System
import type { UserRole } from './crmData';

export type PermissionCategory = 
  | 'users_roles'
  | 'contacts_leads'
  | 'jobs_workflows'
  | 'estimates_quotes'
  | 'contracts'
  | 'scheduling_calendar'
  | 'tasks_assignments'
  | 'photos_files'
  | 'materials_inventory'
  | 'invoicing'
  | 'payments'
  | 'reports_dashboards'
  | 'integrations'
  | 'communications'
  | 'settings_configs';

export type PermissionLevel = 
  | 'none'
  | 'read'
  | 'own'
  | 'team'
  | 'assigned'
  | 'create'
  | 'edit'
  | 'delete'
  | 'full'
  | 'approve';

export interface Permission {
  category: PermissionCategory;
  level: PermissionLevel;
  description: string;
}

export interface UserPermissions {
  userId: string;
  role: UserRole;
  customPermissions?: Partial<Record<PermissionCategory, PermissionLevel>>;
}

// Default permission matrix based on the CSV
export const defaultPermissions: Record<UserRole, Record<PermissionCategory, PermissionLevel>> = {
  owner: {
    users_roles: 'full',
    contacts_leads: 'full',
    jobs_workflows: 'full',
    estimates_quotes: 'full',
    contracts: 'full',
    scheduling_calendar: 'full',
    tasks_assignments: 'full',
    photos_files: 'full',
    materials_inventory: 'full',
    invoicing: 'full',
    payments: 'full',
    reports_dashboards: 'full',
    integrations: 'full',
    communications: 'full',
    settings_configs: 'full',
  },
  admin: {
    users_roles: 'full',
    contacts_leads: 'full',
    jobs_workflows: 'full',
    estimates_quotes: 'full',
    contracts: 'full',
    scheduling_calendar: 'full',
    tasks_assignments: 'full',
    photos_files: 'full',
    materials_inventory: 'full',
    invoicing: 'full',
    payments: 'full',
    reports_dashboards: 'full',
    integrations: 'full',
    communications: 'full',
    settings_configs: 'full',
  },
  sales_manager: {
    users_roles: 'team',
    contacts_leads: 'full',
    jobs_workflows: 'full',
    estimates_quotes: 'full',
    contracts: 'full',
    scheduling_calendar: 'full',
    tasks_assignments: 'team',
    photos_files: 'full',
    materials_inventory: 'read',
    invoicing: 'approve',
    payments: 'approve',
    reports_dashboards: 'team',
    integrations: 'read',
    communications: 'full',
    settings_configs: 'edit',
  },
  sales_rep: {
    users_roles: 'none',
    contacts_leads: 'own',
    jobs_workflows: 'own',
    estimates_quotes: 'own',
    contracts: 'own',
    scheduling_calendar: 'team',
    tasks_assignments: 'own',
    photos_files: 'own',
    materials_inventory: 'none',
    invoicing: 'create',
    payments: 'read',
    reports_dashboards: 'own',
    integrations: 'none',
    communications: 'own',
    settings_configs: 'none',
  },
  production_manager: {
    users_roles: 'none',
    contacts_leads: 'assigned',
    jobs_workflows: 'full',
    estimates_quotes: 'approve',
    contracts: 'approve',
    scheduling_calendar: 'full',
    tasks_assignments: 'team',
    photos_files: 'full',
    materials_inventory: 'full',
    invoicing: 'approve',
    payments: 'read',
    reports_dashboards: 'team',
    integrations: 'read',
    communications: 'team',
    settings_configs: 'edit',
  },
  project_manager: {
    users_roles: 'none',
    contacts_leads: 'read',
    jobs_workflows: 'assigned',
    estimates_quotes: 'assigned',
    contracts: 'assigned',
    scheduling_calendar: 'assigned',
    tasks_assignments: 'assigned',
    photos_files: 'assigned',
    materials_inventory: 'assigned',
    invoicing: 'none',
    payments: 'assigned',
    reports_dashboards: 'assigned',
    integrations: 'none',
    communications: 'assigned',
    settings_configs: 'none',
  },
  field_tech: {
    users_roles: 'none',
    contacts_leads: 'assigned',
    jobs_workflows: 'own',
    estimates_quotes: 'none',
    contracts: 'none',
    scheduling_calendar: 'own',
    tasks_assignments: 'own',
    photos_files: 'create',
    materials_inventory: 'edit',
    invoicing: 'none',
    payments: 'none',
    reports_dashboards: 'none',
    integrations: 'none',
    communications: 'own',
    settings_configs: 'none',
  },
  office_staff: {
    users_roles: 'none',
    contacts_leads: 'full',
    jobs_workflows: 'read',
    estimates_quotes: 'create',
    contracts: 'create',
    scheduling_calendar: 'full',
    tasks_assignments: 'create',
    photos_files: 'full',
    materials_inventory: 'create',
    invoicing: 'create',
    payments: 'full',
    reports_dashboards: 'full',
    integrations: 'full',
    communications: 'full',
    settings_configs: 'none',
  },
  subcontractor: {
    users_roles: 'none',
    contacts_leads: 'assigned',
    jobs_workflows: 'assigned',
    estimates_quotes: 'none',
    contracts: 'own',
    scheduling_calendar: 'assigned',
    tasks_assignments: 'own',
    photos_files: 'assigned',
    materials_inventory: 'assigned',
    invoicing: 'none',
    payments: 'own',
    reports_dashboards: 'own',
    integrations: 'none',
    communications: 'assigned',
    settings_configs: 'none',
  },
  // Legacy roles - map to closest equivalent
  manager: {
    users_roles: 'team',
    contacts_leads: 'full',
    jobs_workflows: 'full',
    estimates_quotes: 'full',
    contracts: 'full',
    scheduling_calendar: 'full',
    tasks_assignments: 'team',
    photos_files: 'full',
    materials_inventory: 'full',
    invoicing: 'approve',
    payments: 'approve',
    reports_dashboards: 'team',
    integrations: 'read',
    communications: 'full',
    settings_configs: 'edit',
  },
  sales: {
    users_roles: 'none',
    contacts_leads: 'own',
    jobs_workflows: 'own',
    estimates_quotes: 'own',
    contracts: 'own',
    scheduling_calendar: 'team',
    tasks_assignments: 'own',
    photos_files: 'own',
    materials_inventory: 'none',
    invoicing: 'create',
    payments: 'read',
    reports_dashboards: 'own',
    integrations: 'none',
    communications: 'own',
    settings_configs: 'none',
  },
  production: {
    users_roles: 'none',
    contacts_leads: 'assigned',
    jobs_workflows: 'full',
    estimates_quotes: 'approve',
    contracts: 'approve',
    scheduling_calendar: 'full',
    tasks_assignments: 'team',
    photos_files: 'full',
    materials_inventory: 'full',
    invoicing: 'approve',
    payments: 'read',
    reports_dashboards: 'team',
    integrations: 'read',
    communications: 'team',
    settings_configs: 'edit',
  },
  billing: {
    users_roles: 'none',
    contacts_leads: 'full',
    jobs_workflows: 'read',
    estimates_quotes: 'create',
    contracts: 'create',
    scheduling_calendar: 'full',
    tasks_assignments: 'create',
    photos_files: 'full',
    materials_inventory: 'create',
    invoicing: 'create',
    payments: 'full',
    reports_dashboards: 'full',
    integrations: 'full',
    communications: 'full',
    settings_configs: 'none',
  },
  canvas: {
    users_roles: 'none',
    contacts_leads: 'assigned',
    jobs_workflows: 'own',
    estimates_quotes: 'none',
    contracts: 'none',
    scheduling_calendar: 'own',
    tasks_assignments: 'own',
    photos_files: 'create',
    materials_inventory: 'edit',
    invoicing: 'none',
    payments: 'none',
    reports_dashboards: 'none',
    integrations: 'none',
    communications: 'own',
    settings_configs: 'none',
  },
  // New limited permission roles
  canvasser: {
    users_roles: 'none',
    contacts_leads: 'own', // Only contacts they created
    jobs_workflows: 'none',
    estimates_quotes: 'none',
    contracts: 'none',
    scheduling_calendar: 'create', // Can schedule inspections
    tasks_assignments: 'none',
    photos_files: 'create', // Can take photos
    materials_inventory: 'none',
    invoicing: 'none',
    payments: 'none',
    reports_dashboards: 'none',
    integrations: 'none',
    communications: 'create', // Can add notes
    settings_configs: 'none',
  },
  field_contractor: {
    users_roles: 'none',
    contacts_leads: 'assigned', // Only assigned contacts
    jobs_workflows: 'assigned', // Only assigned jobs
    estimates_quotes: 'none',
    contracts: 'none',
    scheduling_calendar: 'read',
    tasks_assignments: 'assigned', // Only assigned tasks
    photos_files: 'create', // Can upload photos
    materials_inventory: 'read',
    invoicing: 'none',
    payments: 'none',
    reports_dashboards: 'none',
    integrations: 'none',
    communications: 'create', // Can add notes to assigned jobs
    settings_configs: 'none',
  },
};

// Permission category labels for UI
export const permissionCategoryLabels: Record<PermissionCategory, string> = {
  users_roles: 'Users & Roles',
  contacts_leads: 'Contacts/Leads',
  jobs_workflows: 'Jobs/Workflows',
  estimates_quotes: 'Estimates/Quotes',
  contracts: 'Contracts',
  scheduling_calendar: 'Scheduling/Calendar',
  tasks_assignments: 'Tasks/Assignments',
  photos_files: 'Photos/Files',
  materials_inventory: 'Materials/Inventory',
  invoicing: 'Invoicing',
  payments: 'Payments',
  reports_dashboards: 'Reports/Dashboards',
  integrations: 'Integrations',
  communications: 'Communications',
  settings_configs: 'Settings/Configs',
};

// Permission level labels and descriptions
export const permissionLevelLabels: Record<PermissionLevel, string> = {
  none: 'No Access',
  read: 'Read Only',
  own: 'Own Records',
  team: 'Team Access',
  assigned: 'Assigned Only',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  full: 'Full Access',
  approve: 'Approve',
};

export const permissionLevelOrder: PermissionLevel[] = [
  'none',
  'read',
  'assigned',
  'own',
  'team',
  'create',
  'edit',
  'approve',
  'delete',
  'full',
];

/**
 * Get permissions for a user, including custom overrides
 */
export function getUserPermissions(
  role: UserRole,
  customPermissions?: Partial<Record<PermissionCategory, PermissionLevel>>
): Record<PermissionCategory, PermissionLevel> {
  const defaults = defaultPermissions[role];
  
  if (!customPermissions) {
    return defaults;
  }
  
  return {
    ...defaults,
    ...customPermissions,
  };
}

/**
 * Check if a user has permission for a specific category at or above a certain level
 */
export function hasPermission(
  userPermissions: Record<PermissionCategory, PermissionLevel>,
  category: PermissionCategory,
  requiredLevel: PermissionLevel
): boolean {
  const userLevel = userPermissions[category];
  
  if (userLevel === 'full') return true;
  if (userLevel === 'none') return false;
  if (userLevel === requiredLevel) return true;
  
  const userLevelIndex = permissionLevelOrder.indexOf(userLevel);
  const requiredLevelIndex = permissionLevelOrder.indexOf(requiredLevel);
  
  return userLevelIndex >= requiredLevelIndex;
}

/**
 * Check if user can manage other users
 */
export function canManageUsers(role: UserRole): boolean {
  return ['owner', 'admin', 'sales_manager'].includes(role);
}

/**
 * Check if user can edit company settings
 */
export function canEditCompanySettings(role: UserRole): boolean {
  return ['owner'].includes(role);
}

/**
 * Get assignable roles for a user based on their role
 */
export function getAssignableRoles(actorRole: UserRole): UserRole[] {
  const allActiveRoles: UserRole[] = [
    'owner',
    'admin',
    'sales_manager',
    'sales_rep',
    'production_manager',
    'project_manager',
    'field_tech',
    'office_staff',
    'subcontractor',
  ];
  
  if (actorRole === 'owner') {
    return allActiveRoles;
  }
  
  if (actorRole === 'admin') {
    return allActiveRoles.filter(r => r !== 'owner');
  }
  
  if (actorRole === 'sales_manager' || actorRole === 'production_manager') {
    return allActiveRoles.filter(r => !['owner', 'admin'].includes(r));
  }
  
  return [];
}
