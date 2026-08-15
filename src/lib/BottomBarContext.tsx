"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";

export type BottomBarAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  accent: string;
  onClick: () => void;
  /** For file input actions */
  fileAccept?: string;
  onFileChange?: (file: File) => void;
};

type BottomBarContextType = {
  actions: BottomBarAction[];
  setActions: (actions: BottomBarAction[]) => void;
  clearActions: () => void;
};

const BottomBarContext = createContext<BottomBarContextType>({
  actions: [],
  setActions: () => {},
  clearActions: () => {},
});

export function BottomBarProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActionsState] = useState<BottomBarAction[]>([]);
  const setActions = useCallback((a: BottomBarAction[]) => setActionsState(a), []);
  const clearActions = useCallback(() => setActionsState([]), []);
  const value = useMemo(() => ({ actions, setActions, clearActions }), [actions, setActions, clearActions]);
  return (
    <BottomBarContext.Provider value={value}>
      {children}
    </BottomBarContext.Provider>
  );
}

export function useBottomBar() {
  return useContext(BottomBarContext);
}

/**
 * Hook: register contextual actions in the bottom bar.
 * Pass an array of action descriptors. Automatically clears on unmount.
 */
export function useBottomBarActions(buildActions: () => BottomBarAction[], deps: React.DependencyList) {
  const { setActions, clearActions } = useBottomBar();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setActions(buildActions());
    return () => {
      mounted.current = false;
      clearActions();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
