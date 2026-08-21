import { fail, ok } from "@/lib/mostro/api";
import { uuidSchema } from "@/lib/mostro/schemas";
import { MostroService } from "@/lib/mostro/service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return ok(await new MostroService().localOrder(uuidSchema.parse(id)));
  } catch (error) {
    return fail(error);
  }
}
