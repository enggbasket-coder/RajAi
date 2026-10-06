import { z } from "zod";
import { OrganizationService } from "@trackwise/core";
import { json, parseBody, withActor } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  defaultManagementChannel: z.enum(["WEB", "WHATSAPP", "TELEGRAM"]).optional(),
  defaultBillable: z.boolean().optional(),
  manualTimeEnabled: z.boolean().optional(),
  idleTimeoutMinutes: z.number().int().optional(),
  allowChannelFallback: z.boolean().optional(),
  managersCreateClients: z.boolean().optional(),
  managersCreateProjects: z.boolean().optional(),
  notificationSettings: z.record(z.boolean()).optional(),
});

export const GET = withActor(async (_req, actor) => json({ organization: await OrganizationService.get(actor), role: actor.role }));
export const PATCH = withActor(async (req, actor) => json({ organization: await OrganizationService.update(actor, await parseBody(req, schema)) }));
