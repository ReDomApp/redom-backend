from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'anchor missing: {path}: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1))


# Allow + international phone identifiers on the login screen.
replace_once(
    'artifacts/redom-frontend/src/auth/validation.ts',
    '''export function validateLoginIdentifier(\n  identifier: string,\n): string | null {''',
    '''export function validateLoginIdentifier(\n  identifier: string,\n): string | null {''',
)

p = ROOT / 'artifacts/redom-frontend/src/auth/validation.ts'
s = p.read_text()
start = s.index('export function validateLoginIdentifier')
end = s.index('\n\nexport function validatePassword')
fn = '''export function validateLoginIdentifier(\n  identifier: string,\n): string | null {\n  const value = identifier.trim();\n\n  if (!value) return "Enter your mobile number or email.";\n\n  const compactPhone = value.replace(/[\\s().-]/g, "");\n  if (/^\\+[1-9]\\d{7,14}$/.test(compactPhone)) return null;\n\n  if (/^234\\d{12}$/.test(value)) {\n    return "Please use your mobile number or email address to log in.";\n  }\n\n  if (/^\\d+$/.test(value)) {\n    if (value.length < 7 || value.length > 20) return "Enter a valid mobile number.";\n    return null;\n  }\n\n  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {\n    return "Enter a valid mobile number or email address.";\n  }\n\n  return null;\n}'''
p.write_text(s[:start] + fn + s[end:])

# Accept the loading-screen IP as non-authoritative correlation data.
p = ROOT / 'artifacts/redom-backend/src/validators/auth.validator.ts'
s = p.read_text()
old = '''    password: z\n      .string()\n      .min(\n        1,\n        "Password is required.",\n      ),'''
new = old + '''\n\n    networkIp: z\n      .string()\n      .trim()\n      .max(45)\n      .optional(),'''
if old not in s:
    raise SystemExit('login schema anchor missing')
p.write_text(s.replace(old, new, 1))

# Count successful login-history records for the same user and public IP.
p = ROOT / 'artifacts/redom-backend/src/services/auth/login-history.service.ts'
s = p.read_text().replace('import { and, eq } from "drizzle-orm";', 'import { and, eq, sql } from "drizzle-orm";', 1)
old = '''  async getHistory(userId: string) {\n    return db.select().from(loginHistory).where(eq(loginHistory.userId, userId));\n  }'''
new = old + '''\n\n  async countByIp(userId: string, ipAddress?: string): Promise<number> {\n    if (!ipAddress) return 0;\n    const [row] = await db\n      .select({ count: sql<number>`count(*)` })\n      .from(loginHistory)\n      .where(and(eq(loginHistory.userId, userId), eq(loginHistory.ipAddress, ipAddress)));\n    return Number(row?.count ?? 0);\n  }'''
if old not in s:
    raise SystemExit('login history anchor missing')
p.write_text(s.replace(old, new, 1))

# Add the startup IP to the login request context; the authoritative request IP remains server-derived.
p = ROOT / 'artifacts/redom-backend/src/controllers/auth.controller.ts'
s = p.read_text()
old = 'appVersion: req.body?.appVersion, country: req.body?.country,'
new = 'appVersion: req.body?.appVersion, networkIp: req.body?.networkIp, country: req.body?.country,'
if old not in s:
    raise SystemExit('controller context anchor missing')
p.write_text(s.replace(old, new, 1))

# Login flow: normalize + phone lookup, then verify password/account, then apply IP/device checks.
p = ROOT / 'artifacts/redom-backend/src/services/auth/login-flow.service.ts'
s = p.read_text()
s = s.replace(
    'export interface LoginRequest { identifier: string; password: string; ipAddress?: string;',
    'export interface LoginRequest { identifier: string; password: string; networkIp?: string; ipAddress?: string;',
    1,
)
marker = 'function publicUser(user: typeof users.$inferSelect): PublicUser {'
helper = '''function phoneCandidates(identifier: string): string[] {\n  const compact = identifier.trim().replace(/[\\s().-]/g, "");\n  if (!compact.startsWith("+")) return [compact];\n  return [compact, compact.slice(1)];\n}\n\n'''
if marker not in s:
    raise SystemExit('phone helper anchor missing')
s = s.replace(marker, helper + marker, 1)
old = '''    if (/^\\d{15}$/.test(identifier)) throw new Error("Please use your mobile number or email address to log in.");\n    const user = await db.query.users.findFirst({ where: or(eq(users.email, identifier.toLowerCase()), eq(users.phoneNumber, identifier)) });'''
new = '''    if (/^\\d{15}$/.test(identifier)) throw new Error("Please use your mobile number or email address to log in.");\n    const phoneValues = /^\\+/.test(identifier) ? phoneCandidates(identifier) : [identifier];\n    const user = await db.query.users.findFirst({\n      where: or(\n        eq(users.email, identifier.toLowerCase()),\n        ...phoneValues.map((phone) => eq(users.phoneNumber, phone)),\n      ),\n    });'''
if old not in s:
    raise SystemExit('phone lookup anchor missing')
s = s.replace(old, new, 1)
old = '''    const deviceId = data.deviceId?.trim(); const knownDevice = Boolean(deviceId) && Boolean(await db.query.sessions.findFirst({ where: and(eq(sessions.userId, user.id), eq(sessions.deviceId, deviceId!)) }));\n    if (!knownDevice) {'''
new = '''    const deviceId = data.deviceId?.trim();\n    const knownDevice = Boolean(deviceId) && Boolean(await db.query.sessions.findFirst({ where: and(eq(sessions.userId, user.id), eq(sessions.deviceId, deviceId!)) }));\n    const ipHistoryCount = await loginHistoryService.countByIp(user.id, data.ipAddress);\n    const trustedIp = Boolean(data.ipAddress) && ipHistoryCount >= 3;\n\n    // These checks run only after account/password validation above.\n    // Three or more successful logins from this user/IP bypass new-device verification.\n    if (!knownDevice && !trustedIp) {'''
if old not in s:
    raise SystemExit('device verification anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

# Carry the cached IP from the loading screen into the login call and use phone keyboard for + numbers.
p = ROOT / 'artifacts/redom-frontend/src/screens/LoginScreen.tsx'
s = p.read_text()
old = 'appVersion:"1.0.0"});if(result.requiresVerification'
new = 'appVersion:"1.0.0",networkIp:networkSecurity?.ip ?? undefined} as any);if(result.requiresVerification'
if old not in s:
    raise SystemExit('login submit anchor missing')
s = s.replace(old, new, 1)
old = 'keyboardType="email-address" autoComplete="username"'
new = 'keyboardType={/^[+0-9]/.test(identifier) ? "phone-pad" : "email-address"} autoComplete="username"'
if old not in s:
    raise SystemExit('phone keyboard anchor missing')
p.write_text(s.replace(old, new, 1))
