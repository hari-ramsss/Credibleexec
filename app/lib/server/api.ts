import { z } from "zod";
import {
  AppError,
  addressSchema,
  hashObject,
  type Commitment,
} from "@credibleexec/domain";
import { authenticate, authenticateGateway } from "./auth";
import { config, readinessConfig } from "./config";
import { read, put, list, save, locked, rateLimit, type Draft } from "./store";
import { chainClients } from "./chain";
import {
  activate,
  cancel,
  newId,
  newJob,
  registerExecution,
  tool,
} from "./workflow";
import { runRecipe } from "./bazantic";
import { approvalTransaction } from "./execution";
import { intentSchema } from "@credibleexec/mandate";
import { openapi } from "./openapi";
const hex = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v as `0x${string}`);
async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("CONTENT_TYPE", "Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_BODY", "Request body required.");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new AppError(
        "REQUEST_TOO_LARGE",
        "Keep the request under 16 KB.",
        413,
      );
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AppError("INVALID_JSON", "Send valid JSON.");
  }
}
const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function api(request: Request, path: string[]): Promise<Response> {
  try {
    if (request.method === "GET" && path.join("/") === "health")
      return response(readinessConfig());
    if (request.method === "GET" && path.join("/") === "tools/openapi")
      return response(openapi());
    if (request.method === "POST" && path[0] === "tools") {
      authenticateGateway(request);
      const input = z
        .object({ jobId: hex, intent: intentSchema.optional() })
        .strict()
        .parse(await body(request));
      rateLimit(`gateway:${input.jobId}`, 30);
      return response(await tool(input.jobId, path[1], input.intent));
    }
    const user = await authenticate(request);
    rateLimit(
      `${user.id}:${request.method}`,
      request.method === "GET" ? 120 : 30,
    );
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      const allowed = process.env.APP_ORIGIN ?? new URL(request.url).origin;
      if (origin && origin !== allowed)
        throw new AppError(
          "ORIGIN",
          "This request came from an unapproved origin.",
          403,
        );
    }
    if (
      path.length === 1 &&
      path[0] === "commitments" &&
      request.method === "GET"
    )
      return response({ commitments: list(user.id) });
    if (
      path[0] === "mandates" &&
      path.length === 1 &&
      request.method === "POST"
    ) {
      const input = z
        .object({
          request: z.string().trim().min(10).max(2000),
          recipient: addressSchema.optional(),
        })
        .strict()
        .parse(await body(request));
      const { c, rpc } = chainClients();
      const draft: Draft = {
        id: newId(),
        userId: user.id,
        request: input.request,
        createdAt: Date.now(),
        context: {
          chainId: c.chain.id,
          usdc: c.usdc,
          userWallet: user.wallet,
          defaultRecipient: input.recipient,
          now: Math.max(
            Math.floor(Date.now() / 1000),
            Number((await rpc.getBlock()).timestamp),
          ),
        },
      };
      put(draft.id, user.id, "draft", draft);
      await runRecipe(newJob("compile", draft.id, user.id));
      return response({
        draftId: draft.id,
        ...read<Draft>(draft.id, user.id).result,
      });
    }
    if (
      path[0] === "commitments" &&
      path.length === 1 &&
      request.method === "POST"
    ) {
      const input = z
        .object({ draftId: hex, mandateHash: hex })
        .strict()
        .parse(await body(request));
      const d = read<Draft>(input.draftId, user.id);
      if (
        d.result?.status !== "SUCCESS" ||
        input.mandateHash !== d.result.mandateHash
      )
        throw new AppError(
          "NOT_APPROVED",
          "Approve the exact reviewed mandate.",
        );
      const approved = d.result;
      const id = hashObject({ draftId: d.id, kind: "commitment" });
      return await locked(`create:${id}`, async () => {
        try {
          return response(read<Commitment>(id, user.id));
        } catch {}
        const cfg = config();
        if (approved.mandate.userWallet !== user.wallet)
          throw new AppError(
            "WRONG_WALLET",
            "Use the wallet that reviewed this mandate.",
            409,
          );
        if (approved.mandate.deadline <= Math.floor(Date.now() / 1000) + 15)
          throw new AppError(
            "EXPIRED",
            "The reviewed deadline is too close. Create a new commitment.",
            409,
          );
        const c: Commitment = {
          id,
          userId: user.id,
          mandate: approved.mandate,
          mandateHash: input.mandateHash,
          request: d.request,
          agent: cfg.agent.address,
          bondAmount: cfg.bondAmount,
          bondStatus: "PENDING",
          status: "CREATED",
          executionStatus: "PREPARING",
          createdAt: Date.now(),
          timeline: [
            {
              stage: "APPROVED",
              message: "You approved the exact financial commitment.",
              at: Date.now(),
            },
          ],
        };
        save(c);
        return response(c, 201);
      });
    }
    if (path[0] === "commitments" && path[1]) {
      const id = hex.parse(path[1]);
      let c = read<Commitment>(id, user.id);
      if (request.method === "GET" && path.length === 2) return response(c);
      if (request.method === "GET" && path[2] === "events") {
        let timer: ReturnType<typeof setInterval> | undefined;
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        const stream = new ReadableStream({
          start(controller) {
            const send = () => {
              try {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify(read<Commitment>(id, user.id))}\n\n`,
                  ),
                );
              } catch {
                clearInterval(timer);
              }
            };
            send();
            timer = setInterval(send, 1500);
            closeTimer = setTimeout(() => {
              clearInterval(timer);
              controller.close();
            }, 20000);
          },
          cancel() {
            clearInterval(timer);
            clearTimeout(closeTimer);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
      if (request.method === "POST") {
        const input = await body(request);
        if (path[2] === "fund" || path[2] === "settle") {
          z.object({}).strict().parse(input);
          try {
            await runRecipe(newJob(path[2], id, user.id));
          } catch (e) {
            c = read<Commitment>(id, user.id);
            c.error =
              e instanceof AppError
                ? e.message
                : "A service is temporarily unavailable. Your saved workflow can be resumed.";
            save(c);
            throw e;
          }
          return response(read<Commitment>(id, user.id));
        }
        return await locked(`commitment:${id}`, async () => {
          c = read<Commitment>(id, user.id);
          if (path[2] === "approval") {
            z.object({}).strict().parse(input);
            if (c.status !== "FUNDED")
              throw new AppError(
                "NOT_FUNDED",
                "Fund the agent bond first.",
                409,
              );
            return response({
              transaction: (await approvalTransaction(c.mandate)) ?? null,
            });
          }
          if (path[2] === "activate") {
            z.object({}).strict().parse(input);
            return response(await activate(c));
          }
          if (path[2] === "execute") {
            const { hash } = z.object({ hash: hex }).strict().parse(input);
            return response(await registerExecution(c, hash));
          }
          if (path[2] === "cancel") {
            z.object({}).strict().parse(input);
            return response(await cancel(c));
          }
          throw new AppError("NOT_FOUND", "Endpoint not found.", 404);
        });
      }
    }
    throw new AppError("NOT_FOUND", "Endpoint not found.", 404);
  } catch (error) {
    if (error instanceof AppError)
      return response(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof z.ZodError)
      return response(
        {
          error: {
            code: "INVALID_INPUT",
            message: error.issues[0]?.message ?? "Check your request fields.",
          },
        },
        400,
      );
    // Do not expose provider URLs, credentials, raw wallet errors, or stack traces.
    console.error(
      "CredibleExec request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return response(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "A required service is unavailable. Your saved commitment can be resumed.",
        },
      },
      503,
    );
  }
}
