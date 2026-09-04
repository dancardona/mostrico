import { z } from "zod";
import { fail, ok } from "@/lib/mostro/api";
import { chatMessageSchema, chatSinceSchema, nostrPubkeySchema, uuidSchema } from "@/lib/mostro/schemas";
import { MostroService } from "@/lib/mostro/service";

export const runtime = "nodejs";

const sendBodySchema = z.object({ message: chatMessageSchema });
const configureBodySchema = z.object({
  pubkey: nostrPubkeySchema,
  confirmed: z.literal(true)
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = uuidSchema.parse(id);
    const url = new URL(request.url);
    const since = chatSinceSchema.parse(url.searchParams.get("since") ?? 60);
    return ok(await new MostroService().chat(orderId, since));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = uuidSchema.parse(id);
    const body = configureBodySchema.parse(await request.json());
    return ok(await new MostroService().configureChat(orderId, body.pubkey));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const orderId = uuidSchema.parse(id);
    const body = sendBodySchema.parse(await request.json());
    return ok(await new MostroService().sendChatMessage(orderId, body.message));
  } catch (error) {
    return fail(error);
  }
}
