import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { ssoProviders } from "@/lib/sso-providers";
import { canUserLogin } from "@/lib/auth/login-policy";
// Side-effect import: fails fast in production if AUTH_SECRET/NEXTAUTH_SECRET
// or BCON_VAULT_KEY is missing or a dev/CI placeholder.
import "@/lib/env-guard";

const config: NextAuthConfig = {
  session: {
    strategy: "jwt",
    // Pass-8 audit: the default 30-day session window means a demoted
    // super-admin's JWT keeps claiming superAdmin: true for up to 30 days.
    // 4 hours bounds the privilege-revocation lag; users re-auth at most
    // ~2× per workday. The cookie-based credentials provider has no
    // refresh; longer windows would also extend brute-force exposure on
    // the login endpoint.
    maxAge: 60 * 60 * 4,
  },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Pass-8 hardening: bound brute-force attempts before paying the
        // ~70ms bcrypt cost. Sliding window on (ip, email) — 8 tries per
        // 15 min per (ip, email). The `?` IP fallback catches the
        // edge-runtime case where neither x-forwarded-for nor cf-connecting-
        // ip is set; a missed IP just means we share one bucket across all
        // such callers, which is the safe direction for a fallback.
        const headers = (request as { headers?: Headers })?.headers;
        const ip =
          headers?.get?.("cf-connecting-ip") ??
          headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ??
          "?";
        const key = `login:${ip}:${email}`;
        const limit = consumeRateLimit(key, { limit: 8, windowMs: 15 * 60 * 1000 });
        if (!limit.allowed) {
          console.warn(`[auth] rate-limit hit for ${email} from ${ip}; resetAt=${new Date(limit.resetAt).toISOString()}`);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, password: true, active: true, superAdmin: true },
        });
        if (!user || !user.active) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // Access policy — "provisioned accounts only" unless a tenant opts
        // into external logins (super-admins always allowed). Blocks any
        // valid-credential email that isn't a member of any tenant.
        if (!(await canUserLogin(user.id, user.superAdmin))) {
          console.warn(`[auth] login blocked by access policy for ${email} (no membership; external logins off)`);
          return null;
        }

        // Successful auth — clear the throttle so a user who fat-fingered
        // their password a few times doesn't get locked out post-fix.
        resetRateLimit(key);
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

        return { id: user.id, name: user.name, email: user.email, superAdmin: user.superAdmin };
      },
    }),
    ...ssoProviders(),
  ],
  callbacks: {
    // Gate the SSO/OAuth providers (Okta / Azure AD / Google / Auth0) with
    // the SAME access policy as credentials. The credentials provider runs
    // canUserLogin inside authorize(); OAuth providers bypass authorize, so
    // enforce it here. An OAuth identity is admitted only if it resolves to
    // an existing, active provisioned User (member of some tenant) — or a
    // super-admin, or any provisioned user once a tenant has opted into
    // external logins. No User row → denied (we do NOT auto-create external
    // accounts). The credentials provider returns its own user object and
    // has already been gated, so it short-circuits as authorized here.
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      const email = user?.email?.trim().toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, active: true, superAdmin: true },
      });
      if (!dbUser || !dbUser.active) return false;
      return canUserLogin(dbUser.id, dbUser.superAdmin);
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account && account.provider !== "credentials") {
          // SSO/OAuth sign-in: `user.id` here is the PROVIDER's subject id,
          // not our Prisma User id. Sessions key everything (memberships,
          // tenant scoping, audit) off token.userId, so resolve the
          // provisioned User row by email and link to it. signIn() above
          // already verified the email maps to an active, policy-admitted
          // User, so a miss here only happens on a race — fail closed.
          const email = user.email?.trim().toLowerCase();
          const dbUser = email
            ? await prisma.user.findUnique({
                where: { email },
                select: { id: true, superAdmin: true, active: true },
              })
            : null;
          if (!dbUser || !dbUser.active) return null;
          token.userId = dbUser.id;
          token.superAdmin = dbUser.superAdmin;
          prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
        } else {
          token.userId = (user as { id: string }).id;
          token.superAdmin = (user as { superAdmin?: boolean }).superAdmin ?? false;
        }
        // Stamp issued-at so we can compare against the user's
        // sessionsRevokedAt on every subsequent request.
        token.iat = Math.floor(Date.now() / 1000);
      }
      // Session-revocation enforcement — if User.sessionsRevokedAt has
      // been bumped after this token's iat, the token is treated as
      // revoked even though it hasn't expired. Return null to
      // invalidate. Falls back to current behavior on lookup failures
      // so a transient DB blip doesn't lock everyone out.
      if (token.userId && typeof token.iat === "number") {
        try {
          const u = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { sessionsRevokedAt: true, active: true, superAdmin: true },
          });
          if (!u || !u.active) return null;
          if (u.sessionsRevokedAt && Math.floor(u.sessionsRevokedAt.getTime() / 1000) > (token.iat as number)) {
            return null;
          }
          // Refresh superAdmin claim from DB so demotion takes effect
          // immediately without waiting for token expiry.
          token.superAdmin = u.superAdmin;
        } catch {
          // Don't lock everyone out on a DB blip — let the token through.
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        const augmented = session as { userId?: string; superAdmin?: boolean };
        augmented.userId = token.userId as string | undefined;
        augmented.superAdmin = Boolean(token.superAdmin);
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
