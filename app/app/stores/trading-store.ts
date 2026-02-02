"use client";

import { create } from "zustand";

export interface Position {
  id: string;
  token: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  timestamp: number;
}

export interface Order {
  id: string;
  token: string;
  side: "long" | "short";
  size: number;
  leverage: number;
  triggerPrice: number;
  status: "pending" | "filled" | "cancelled";
  timestamp: number;
}

export interface TriggerOrder {
  id: string;
  positionId: string;
  token: string;
  side: "long" | "short";
  type: "stop_loss" | "take_profit";
  source?: "drift" | "ghost";
  triggerPrice: number;
  sizeAmount: string;
  status: "active" | "triggered" | "cancelled";
  onChainOrderId?: number;
  marketPubkey?: string;
  timestamp: number;
}

interface TradingStore {
  positions: Position[];
  orders: Order[];
  triggerOrders: TriggerOrder[];
  isLoading: boolean;
  selectedMarket: string;

  addPosition: (position: Position) => void;
  removePosition: (id: string) => void;
  updatePositionPnl: (id: string, pnl: number) => void;
  clearPositions: () => void;

  addOrder: (order: Order) => void;
  removeOrder: (id: string) => void;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
  clearOrders: () => void;

  addTriggerOrder: (order: TriggerOrder) => void;
  removeTriggerOrder: (id: string) => void;
  updateTriggerOrderStatus: (id: string, status: TriggerOrder["status"]) => void;
  getTriggerOrdersForPosition: (positionId: string) => TriggerOrder[];
  clearTriggerOrders: () => void;

  setLoading: (loading: boolean) => void;
  setSelectedMarket: (market: string) => void;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  positions: [],
  orders: [],
  triggerOrders: [],
  isLoading: false,
  selectedMarket: "SOL",

  addPosition: (position) =>
    set((state) => ({
      positions: [...state.positions, position],
    })),

  removePosition: (id) =>
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== id),
      triggerOrders: state.triggerOrders.filter((o) => o.positionId !== id),
    })),

  updatePositionPnl: (id, pnl) =>
    set((state) => ({
      positions: state.positions.map((p) =>
        p.id === id ? { ...p, unrealizedPnl: pnl } : p
      ),
    })),

  clearPositions: () => set({ positions: [], triggerOrders: [] }),

  addOrder: (order) =>
    set((state) => ({
      orders: [...state.orders, order],
    })),

  removeOrder: (id) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== id),
    })),

  updateOrderStatus: (id, status) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, status } : o)),
    })),

  clearOrders: () => set({ orders: [] }),

  addTriggerOrder: (order) =>
    set((state) => ({
      triggerOrders: [...state.triggerOrders, order],
    })),

  removeTriggerOrder: (id) =>
    set((state) => ({
      triggerOrders: state.triggerOrders.filter((o) => o.id !== id),
    })),

  updateTriggerOrderStatus: (id, status) =>
    set((state) => ({
      triggerOrders: state.triggerOrders.map((o) =>
        o.id === id ? { ...o, status } : o
      ),
    })),

  getTriggerOrdersForPosition: (positionId) => {
    return get().triggerOrders.filter((o) => o.positionId === positionId);
  },

  clearTriggerOrders: () => set({ triggerOrders: [] }),

  setLoading: (loading) => set({ isLoading: loading }),
  setSelectedMarket: (market) => set({ selectedMarket: market }),
}));
