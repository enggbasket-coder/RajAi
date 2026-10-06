import { z } from "zod";
import { optionalDate } from "@/lib/api";

export const projectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().nullable().optional().transform((v) => v || null),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  managerUserId: z.string().nullable().optional().transform((v) => v || null),
  budgetHours: z.number().nullable().optional(),
  billable: z.boolean().optional(),
  hourlyRate: z.number().nullable().optional(),
  startDate: z.any().optional().transform(optionalDate),
  dueDate: z.any().optional().transform(optionalDate),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
});
