"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";
import { TournamentProvider } from "./TournamentProvider";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <TournamentProvider>
          {children}
          <ServiceWorkerRegistrar />
        </TournamentProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
