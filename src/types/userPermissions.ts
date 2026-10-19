export interface UserPermissionDefinition {
  key: string;
  label: string;
  description: string;
  requires?: string;
}

export interface UserPermissionSection {
  key: "pages" | "actions";
  title: string;
  description: string;
  permissions: UserPermissionDefinition[];
}
