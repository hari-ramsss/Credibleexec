import { api } from "@/lib/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return api(request, (await context.params).path);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return api(request, (await context.params).path);
}
