export function openapi() {
  const descriptions: Record<string, string> = {
    context:
      "Read the persisted user request and allowed token context for a compilation job.",
    compile:
      "Validate extracted intent and persist a reviewable mandate. Does not execute transactions.",
    readiness:
      "Check the approved mandate, user balance, agent collateral, chain and 1inch quote.",
    fund: "Create and fund the already user-approved commitment from the agent wallet.",
    prepare:
      "Prepare a bounded 1inch transaction after the agent bond is locked. Does not authorize or submit user transactions.",
    evidence:
      "Collect confirmed blockchain evidence for the already registered execution.",
    settle:
      "Run the deterministic verifier and settle only if evidence is conclusive. No verdict or amount is accepted as input.",
  };
  const nullableString = { type: ["string", "null"] };
  return {
    openapi: "3.1.0",
    info: { title: "CredibleExec Workflow Tools", version: "1.0.0" },
    servers: [{ url: process.env.APP_ORIGIN ?? "http://localhost:3000" }],
    security: [{ gatewayKey: [] }],
    components: {
      securitySchemes: {
        gatewayKey: { type: "apiKey", in: "header", name: "x-bazantic-key" },
      },
    },
    paths: Object.fromEntries(
      Object.entries(descriptions).map(([action, description]) => [
        `/api/tools/${action}`,
        {
          post: {
            operationId: `credibleexec_${action}`,
            description,
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "jobId",
                      ...(action === "compile" ? ["intent"] : []),
                    ],
                    properties: {
                      jobId: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
                      ...(action === "compile"
                        ? {
                            intent: {
                              type: "object",
                              additionalProperties: false,
                              required: [
                                "type",
                                "assetIn",
                                "assetOut",
                                "amountIn",
                                "maxSpend",
                                "minOutput",
                                "recipient",
                                "durationSeconds",
                                "unsupported",
                              ],
                              properties: {
                                type: { const: "SWAP" },
                                assetIn: { const: "USDC" },
                                assetOut: { const: "ETH" },
                                amountIn: nullableString,
                                maxSpend: nullableString,
                                minOutput: nullableString,
                                recipient: nullableString,
                                durationSeconds: { type: ["integer", "null"] },
                                unsupported: { type: "boolean" },
                              },
                            },
                          }
                        : {}),
                    },
                  },
                },
              },
            },
            responses: {
              "200": { description: "Validated workflow result" },
              "409": { description: "Stage precondition not satisfied" },
              "401": { description: "Gateway authentication failed" },
            },
          },
        },
      ]),
    ),
  };
}
