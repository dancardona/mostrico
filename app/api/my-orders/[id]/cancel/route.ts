import { fail, ok } from "@/lib/mostro/api";
import { cancelOrderInputSchema, uuidSchema } from "@/lib/mostro/schemas";
import { MostroService } from "@/lib/mostro/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    cancelOrderInputSchema.parse(await request.json());
    return ok(await new MostroService().cancelOrder(uuidSchema.parse(id)));
  } catch (error) {
    return fail(error);
  }
}
