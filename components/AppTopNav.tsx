"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/components/AppTopNav.module.css";

type AuthMeResponse = {
  ok?: boolean;
  user?: {
    login?: string;
    roles?: string[];
  };
};

const LINKS = [
  { href: "/batches", label: "Batches" },
  { href: "/owner", label: "Owner" },
  { href: "/drying", label: "Drying" },
  { href: "/packaging", label: "Packaging" },
  { href: "/control-tower", label: "Control Tower" },
  { href: "/live-floor", label: "Live Floor" },
  { href: "/kpi", label: "KPI Dashboard" },
  { href: "/kpi/deficit", label: "Deficit KPI" },
  { href: "/kpi/throughput", label: "Throughput KPI" },
  { href: "/kpi/throughput-shifts", label: "Throughput Shifts KPI" },
  { href: "/kpi/shipment-sla", label: "KPI Shipment SLA" },
  { href: "/shipments/readiness", label: "Shipments" },
  { href: "/shipments/import", label: "Shipment Import" },
  { href: "/production/plan", label: "Production Plan" },
  { href: "/daily/summary", label: "Daily Summary" },
] as const;

export default function AppTopNav() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!isMounted || !response.ok) {
          return;
        }

        const payload = (await response.json()) as AuthMeResponse;
        if (!payload?.ok || !payload.user?.login) {
          return;
        }

        const roles = Array.isArray(payload.user.roles) ? payload.user.roles.join(", ") : "";
        const nextLabel = roles ? `${payload.user.login} (${roles})` : payload.user.login;
        setUserLabel(nextLabel);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading || !userLabel) {
    return null;
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <header className={styles.header}>
      <nav className={styles.links} aria-label="Primary">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className={styles.link}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.right}>
        <span className={styles.userLabel}>{userLabel}</span>
        <button type="button" className={styles.logoutButton} onClick={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    </header>
  );
}
