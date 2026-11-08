"use client";
import { createContext } from "react";
/** UI search stays in tab memory, including when the active source is private. */
export const StockSearchContext = createContext<{ query: string; setQuery: (query: string) => void } | null>(null);
