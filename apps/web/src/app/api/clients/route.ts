import { z } from "zod";
import { ClientService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

export const GET = withActor(async (req, actor) => json({ clients: await ClientService.list(actor, { includeInactive: req.nextUrl.searchParams.get("all") === "1" }) }));
export const POST = withActor(async (req, actor) => json({ client: await ClientService.create(actor, await parseBody(req, z.object({ name: z.string().min(1), code: z.string().optional().nullable(), notes: z.string().optional().nullable() }))) }, { status: 201 }));
