import { create } from "zustand";

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
}

const STORAGE_KEY = "teao_tabs";

function loadTabs(): { tabs: Tab[]; activeKey: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { tabs: [{ key: "/", label: "首页" }], activeKey: "/" };
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
    const next = [home, current].filter(Boolean) as Tab[];
    set({ tabs: next, activeKey: key });
    saveTabs(next, key);
  },

  closeAll: () => {
    const next = [{ key: "/", label: "首页" }];
    set({ tabs: next, activeKey: "/" });
    saveTabs(next, "/");
  },

  setActiveKey: (key) => {
    set({ activeKey: key });
    saveTabs(get().tabs, key);
  },
}));
