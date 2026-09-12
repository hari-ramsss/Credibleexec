"use client";
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useSendTransaction,
} from "@privy-io/react-auth";
import { base } from "viem/chains";
import { Workspace } from "./workspace";
function ConnectedWorkspace() {
  const { ready, authenticated, user, login, logout, getAccessToken } =
    usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  return (
    <Workspace
      key={`${user?.id ?? "guest"}:${wallet?.address ?? ""}`}
      wallet={{
        ready,
        authenticated,
        address: wallet?.address,
        login,
        logout,
        getToken: getAccessToken,
        send: async (tx) => {
          if (!wallet)
            throw new Error("Your embedded wallet is still loading.");
          await wallet.switchChain(tx.chainId);
          const result = await sendTransaction(
            {
              to: tx.to,
              data: tx.data,
              value: BigInt(tx.value),
              chainId: tx.chainId,
              nonce: tx.nonce,
            },
            { address: wallet.address, uiOptions: { showWalletUIs: true } },
          );
          return result.hash;
        },
      }}
    />
  );
}
export default function PrivyWorkspace() {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#445d25",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      <ConnectedWorkspace />
    </PrivyProvider>
  );
}
