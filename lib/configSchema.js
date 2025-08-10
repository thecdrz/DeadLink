let z = null;
try {
  z = require('zod');
} catch (_) {
  // optional; skip strict validation if not installed
}

const schema = z ? z.object({
  token: z.string().min(10).optional(),
  password: z.string().min(1).optional(),
  ip: z.string().min(1).optional(),
  port: z.union([z.string(), z.number()]).optional(),
  channel: z.union([z.string(), z.number()]).optional(),
  prefix: z.string().min(1).optional(),
  updates: z.object({
    enabled: z.boolean().optional(),
    intervalHours: z.number().min(1).max(168).optional(),
    prerelease: z.boolean().optional(),
    notifyMode: z.enum(['off','channel']).optional(),
    notifyChannel: z.union([z.string(), z.number()]).optional()
  }).optional()
}) : null;

function validateConfig(cfg) {
  if (!schema) return { ok: true };
  const res = schema.safeParse(cfg || {});
  if (res.success) return { ok: true };
  const msg = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, message: msg };
}

module.exports = { validateConfig };
