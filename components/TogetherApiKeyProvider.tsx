"use client";

import React, { useEffect, useState, useContext, createContext } from "react";

// Context for Together API Key
const TogetherApiKeyContext = createContext<
  | {
      apiKey: string | undefined;
      setApiKey: (key: string | undefined) => void;
    }
  | undefined
>(undefined);

export function TogetherApiKeyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [apiKey, setApiKeyState] = useState<string | undefined>(undefined);

  useEffect(() => {
    setApiKeyState(localStorage.getItem("togetherApiKey") || undefined);
  }, []);

  const setApiKey = (key: string | undefined) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem("togetherApiKey", key);
    } else {
      localStorage.removeItem("togetherApiKey");
    }
  };

  return (
    <TogetherApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </TogetherApiKeyContext.Provider>
  );
}

export function useTogetherApiKey() {
  const context = useContext(TogetherApiKeyContext);
  if (!context) {
    throw new Error(
      "useTogetherApiKey must be used within a TogetherApiKeyProvider"
    );
  }
  return context;
}
