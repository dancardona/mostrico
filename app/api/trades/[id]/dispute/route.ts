import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { disputeInputSchema, uuidSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    disputeInputSchema.parse(await request.json());
    return ok(await new MostroService().dispute(id));
  } catch (error) {
    return fail(error);
  }
}
