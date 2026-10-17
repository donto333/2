export declare const GUEST_OPEN_ID_PREFIX: string
export declare const GUEST_NAME_RE: RegExp
export declare function validateGuestName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string }
export declare function registerGuestAuthRoutes(app: unknown, deps: Record<string, unknown>): void
