"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type CSSProperties } from "react";

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

/**
 * Standard FAB button for the bottom bar context slot.
 * Ensures consistent size, shape, and styling across all pages.
 */
export function BottomBarButton({
  onClick, icon, accent, active, label, as = "button",
  ...rest
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  accent: string;
  active?: boolean;
  label?: string;
  as?: "button" | "label";
  children?: React.ReactNode;
}) {
  const style: CSSProperties = {
    width: 50, height: 50,
    borderRadius: "50%",
    border: "none",
    background: accent,
    color: "#fff",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    flexShrink: 0,
    position: "relative",
    padding: 0,
  };
  if (active) {
    style.boxShadow = `0 0 0 3px ${accent}40, 0 4px 16px rgba(0,0,0,0.18)`;
  }

  if (as === "label") {
    return (
      <label className="bottom-bar-btn" style={style} aria-label={label}>
        {icon}
        {rest.children}
      </label>
    );
  }

  return (
    <button type="button" className="bottom-bar-btn" onClick={onClick} style={style} aria-label={label}>
      {icon}
    </button>
  );
}
