import { z } from "zod";
import { ok, fail } from "@/lib/mostro/api";
import { MostroService } from "@/lib/mostro/service";
import { ratingSchema, uuidSchema } from "@/lib/mostro/schemas";

export const runtime = "nodejs";

const bodySchema = z.object({ rating: ratingSchema });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = uuidSchema.parse(params.id);
    const body = bodySchema.parse(await request.json());
    return ok(await new MostroService().rate(id, body.rating));
  } catch (error) {
    return fail(error);
  }
}
