import { create } from "zustand";
import type { VaultEvent, WebhookState } from "../types/helius-webhook";

interface WebhookStoreActions {
  processWebhookEvent: (event: VaultEvent) => void;
  setLocked: (locked: boolean) => void;
  reset: () => void;
}

const MAX_EVENTS = 50;

const initialState: WebhookState = {
  lastEvent: null,
  events: [],
  isLocked: false,
  lockoutTimestamp: null,
};

export const useWebhookStore = create<WebhookState & WebhookStoreActions>(
  (set) => ({
    ...initialState,

    processWebhookEvent: (event: VaultEvent) => {
      set((state) => {
        const newEvents = [event, ...state.events].slice(0, MAX_EVENTS);

        let isLocked = state.isLocked;
        let lockoutTimestamp = state.lockoutTimestamp;

        if (event.type === "LOCKOUT_TRIGGERED") {
          isLocked = true;
          lockoutTimestamp = event.timestamp;
        } else if (event.type === "LOCKOUT_CLEARED") {
          isLocked = false;
          lockoutTimestamp = null;
        }

        return {
          lastEvent: event,
          events: newEvents,
          isLocked,
          lockoutTimestamp,
        };
      });
    },

    setLocked: (locked: boolean) => {
      set({ isLocked: locked });
    },

    reset: () => {
      set(initialState);
    },
  })
);
