// User roles and permissions for mobile app
export type UserRole = 
  | 'owner'
  | 'admin' 
  | 'manager'
  | 'user'
  | 'canvasser'
  | 'field_contractor';

// Limited permission role identifiers  
export const LIMITED_PERMISSION_ROLES = ['canvasser', 'field_contractor'] as const;

export function isLimitedRole(role: string): boolean {
  return LIMITED_PERMISSION_ROLES.includes(role as any);
}

export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

// Role hierarchy for permission checks
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  user: 2,
  field_contractor: 1,
  canvasser: 1
};

export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}