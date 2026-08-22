import { create } from "zustand";
import { getNavigationItem } from "./navigation";

export interface Tab {
  key: string;
  label: string;
}

interface TabState {
  tabs: Tab[];
  activeKey: string;
  openTab: (tab: Tab) => void;
  closeTab: (key: string) => void;
  closeOthers: (key: string) => void;
  closeAll: () => void;
  setActiveKey: (key: string) => void;
  resetForAuthentication: () => void;
}

const STORAGE_KEY = "teao_tabs_v2";
const LEGACY_STORAGE_KEY = "teao_tabs";
const HOME_TAB = { key: "/", label: "首页" };

function loadTabs(): { tabs: Tab[]; activeKey: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { tabs?: Tab[]; activeKey?: string };
      const tabs = (parsed.tabs || []).flatMap((tab) => {
        const item = getNavigationItem(tab.key);
        return item ? [{ key: tab.key, label: item.title }] : [];
      });
      const withHome = tabs.some((tab) => tab.key === "/") ? tabs : [HOME_TAB, ...tabs];
      const activeKey = withHome.some((tab) => tab.key === parsed.activeKey) ? parsed.activeKey! : "/";
      return { tabs: withHome, activeKey };
    }
  } catch { /* ignore */ }
  return { tabs: [HOME_TAB], activeKey: "/" };
}

function saveTabs(tabs: Tab[], activeKey: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeKey }));
  } catch { /* ignore */ }
}

export const useTabStore = create<TabState>((set, get) => ({
  ...loadTabs(),

  openTab: (tab) => {
    const { tabs } = get();
    const exists = tabs.find((t) => t.key === tab.key);
    if (!exists) {
      const next = [...tabs, tab];
      set({ tabs: next, activeKey: tab.key });
      saveTabs(next, tab.key);
    } else {
      set({ activeKey: tab.key });
      saveTabs(tabs, tab.key);
    }
  },

  closeTab: (key) => {
    const { tabs, activeKey } = get();
    if (key === "/") return; // 首页不可关
    const idx = tabs.findIndex((t) => t.key === key);
    if (idx < 0) return;
    const next = tabs.filter((t) => t.key !== key);
    let nextActive = activeKey;
    if (activeKey === key) {
      // 关闭当前标签 → 切到右边，没有则左边
      const target = next[Math.min(idx, next.length - 1)];
      nextActive = target?.key || "/";
    }
    set({ tabs: next, activeKey: nextActive });
    saveTabs(next, nextActive);
  },

  closeOthers: (key) => {
    const { tabs } = get();
    const current = tabs.find((t) => t.key === key);
    const home = tabs.find((t) => t.key === "/");
    const next = key === "/" ? [HOME_TAB] : [home, current].filter(Boolean) as Tab[];
    set({ tabs: next, activeKey: key });
    saveTabs(next, key);
  },

  closeAll: () => {
    const next = [HOME_TAB];
    set({ tabs: next, activeKey: "/" });
    saveTabs(next, "/");
  },

  setActiveKey: (key) => {
    set({ activeKey: key });
    saveTabs(get().tabs, key);
  },

  resetForAuthentication: () => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
    const next = [HOME_TAB];
    set({ tabs: next, activeKey: "/" });
    saveTabs(next, "/");
  },
}));
