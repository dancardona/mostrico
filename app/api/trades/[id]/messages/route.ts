import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { sinceSchema, uuidSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const url = new URL(request.url);
    const since = sinceSchema.parse(url.searchParams.get("since") ?? 30);
    return ok(await new MostroService().messages(id, since));
  } catch (error) {
    return fail(error);
  }
}
