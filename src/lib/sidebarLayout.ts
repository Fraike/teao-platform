export interface SidebarLayout {
  expandedWidth: number;
  collapsedWidth: number;
}

export function getSidebarLayout(isMobile: boolean): SidebarLayout {
  return {
    expandedWidth: 180,
    collapsedWidth: isMobile ? 0 : 64,
  };
}
