"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

type BottomBarContextType = {
  actions: React.ReactNode;
  setActions: (node: React.ReactNode) => void;
  clearActions: () => void;
};

const BottomBarContext = createContext<BottomBarContextType>({
  actions: null,
  setActions: () => {},
  clearActions: () => {},
});

export function BottomBarProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActionsState] = useState<React.ReactNode>(null);
  const setActions = useCallback((node: React.ReactNode) => setActionsState(node), []);
  const clearActions = useCallback(() => setActionsState(null), []);
  return (
    <BottomBarContext.Provider value={{ actions, setActions, clearActions }}>
      {children}
    </BottomBarContext.Provider>
  );
}

export function useBottomBar() {
  return useContext(BottomBarContext);
}

/**
 * Hook: register contextual actions in the bottom bar.
 * Automatically clears on unmount.
 */
export function useBottomBarActions(renderActions: () => React.ReactNode, deps: React.DependencyList) {
  const { setActions, clearActions } = useBottomBar();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setActions(renderActions());
    return () => {
      mounted.current = false;
      clearActions();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
