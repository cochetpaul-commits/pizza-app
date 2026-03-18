"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type TopBarState = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
};

type TopBarCtx = {
  state: TopBarState;
  set: (s: TopBarState) => void;
  clear: () => void;
};

const TopBarContext = createContext<TopBarCtx>({
  state: {},
  set: () => {},
  clear: () => {},
});

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TopBarState>({});

  const set = useCallback((s: TopBarState) => setState(s), []);
  const clear = useCallback(() => setState({}), []);

  return (
    <TopBarContext.Provider value={{ state, set, clear }}>
      {children}
    </TopBarContext.Provider>
  );
}

/** Pages call this hook to set their topbar title/actions */
export function useTopBar() {
  return useContext(TopBarContext);
}

/** Read-only access to current topbar state (used by TopBar component) */
export function useTopBarState() {
  return useContext(TopBarContext).state;
}

/** Imperative setter for topbar (used by pages) */
export function useTopBarSetter() {
  const { set, clear } = useContext(TopBarContext);
  return { setTopBar: set, clearTopBar: clear };
}
