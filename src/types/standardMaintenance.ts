export interface StandardMaintenanceSettings {
  enabled: boolean;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface StandardMaintenanceInput {
  enabled: boolean;
  revision: number;
}

/** Structural interface: importing the service must not initialize users/JWT. */
export interface StandardMaintenanceUser {
  id: string;
  name?: string;
  username?: string;
  role?: string;
  status?: string;
  permissions?: readonly string[];
}

export interface StandardMaintainerRoster {
  candidates: { id: string; name: string; username: string }[];
  selectedIds: string[];
  revision: string;
}
