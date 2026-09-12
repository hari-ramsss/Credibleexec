import { timingSafeEqual } from "node:crypto";
import { PrivyClient } from "@privy-io/server-auth";
import { addressSchema, AppError, sameAddress } from "@credibleexec/domain";
import { readinessConfig } from "./config";
export async function authenticate(request: Request) {
  const auth = request.headers.get("authorization");
  if (readinessConfig().mode === "local") {
    if (
      process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(request.url).hostname,
      )
    )
      throw new AppError(
        "UNAUTHORIZED",
        "Local development access is restricted to localhost.",
        401,
      );
    const wallet = addressSchema.parse(process.env.LOCAL_USER_ADDRESS);
    return { id: "local-user", wallet };
  }
  if (!auth?.startsWith("Bearer "))
    throw new AppError("UNAUTHORIZED", "Sign in to continue.", 401);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret)
    throw new AppError(
      "NOT_CONFIGURED",
      "Wallet authorization has not been configured.",
      503,
    );
  const privy = new PrivyClient(appId, secret);
  try {
    const claims = await privy.verifyAuthToken(auth.slice(7));
    const user = await privy.getUser(claims.userId);
    const requested = request.headers.get("x-wallet-address");
    const wallet = user.linkedAccounts.find(
      (a) =>
        a.type === "wallet" &&
        a.chainType === "ethereum" &&
        a.walletClientType === "privy" &&
        (!requested || sameAddress(a.address, requested)),
    );
    if (!wallet || wallet.type !== "wallet")
      throw new Error("No embedded wallet");
    return { id: user.id, wallet: addressSchema.parse(wallet.address) };
  } catch {
    throw new AppError(
      "UNAUTHORIZED",
      "Sign in with your Privy embedded wallet to continue.",
      401,
    );
  }
}
export function authenticateGateway(request: Request) {
  const expected = process.env.BAZANTIC_TOOL_SECRET;
  const actual = request.headers.get("x-bazantic-key") ?? "";
  if (
    !expected ||
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    throw new AppError("UNAUTHORIZED", "Gateway authentication required.", 401);
}
