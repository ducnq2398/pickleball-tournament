"use client";

/**
 * Đăng ký service worker cho PWA (chỉ cache static asset — KHÔNG cache dữ liệu
 * Firestore, vì Firestore đã có cơ chế offline riêng và là nguồn sự thật).
 */
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.warn("[pwa] Không đăng ký được service worker:", error));
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
