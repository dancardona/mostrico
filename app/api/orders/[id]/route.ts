import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { uuidSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    return ok(await new MostroService().orderInfo(id));
  } catch (error) {
    return fail(error);
  }
}
