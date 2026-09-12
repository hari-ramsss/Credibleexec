"use client";
import dynamic from "next/dynamic";
import { Workspace } from "./workspace";
const PrivyWorkspace = dynamic(() => import("./privy-workspace"), {
  ssr: false,
  loading: () => <div className="loading-screen">Opening your workspace…</div>,
});
export default function WalletShell() {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <PrivyWorkspace />
  ) : (
    <Workspace />
  );
}
