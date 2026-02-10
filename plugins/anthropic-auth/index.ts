import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const { emptyPluginConfigSchema } = require("openclaw/plugin-sdk");

// Anthropic OAuth constants (from pi-ai anthropic OAuth module)
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5";

// Token expiry buffer: refresh 5 minutes before actual expiry
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildAuthUrl(challenge: string, verifier: string): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(
  code: string,
  state: string,
  codeVerifier: string,
) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return {
    access: data.access_token as string,
    refresh: data.refresh_token as string,
    expires: Date.now() + (data.expires_in as number) * 1000 - EXPIRY_BUFFER_MS,
  };
}

async function refreshToken(refreshTokenStr: string) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshTokenStr,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  return {
    access: data.access_token as string,
    refresh: data.refresh_token as string,
    expires: Date.now() + (data.expires_in as number) * 1000 - EXPIRY_BUFFER_MS,
  };
}

const anthropicAuthPlugin = {
  id: "anthropic-auth",
  name: "Anthropic Auth",
  description: "OAuth flow for Anthropic (Claude Pro/Max subscription)",
  configSchema: emptyPluginConfigSchema(),

  register(api: any) {
    api.registerProvider({
      id: "anthropic",
      label: "Anthropic (Claude Pro/Max)",
      docsPath: "/providers/anthropic",
      aliases: ["claude"],

      auth: [
        {
          id: "oauth",
          label: "Claude OAuth (Pro/Max Subscription)",
          hint: "Login with your Claude Pro or Max subscription via OAuth",
          kind: "oauth",

          run: async (ctx: any) => {
            const { verifier, challenge } = generatePKCE();
            const authUrl = buildAuthUrl(challenge, verifier);

            // Display instructions
            await ctx.prompter.note(
              [
                "This will authenticate with your Claude Pro/Max subscription.",
                "You will be redirected to claude.ai to authorize access.",
                "",
                "After authorization, you will see a code on the page.",
                "Copy the ENTIRE code string and paste it below.",
              ].join("\n"),
              "Anthropic OAuth"
            );

            // Try to open the URL in the browser
            const spin = ctx.prompter.progress("Opening authorization page...");
            try {
              await ctx.openUrl(authUrl);
              spin.stop("Browser opened. Please authorize in your browser.");
            } catch {
              spin.stop("Could not open browser automatically.");
              await ctx.prompter.note(
                `Please open this URL in your browser:\n\n${authUrl}`,
                "Manual Authorization"
              );
            }

            // Ask user to paste the authorization code or redirect URL
            const codeInput = await ctx.prompter.text({
              message:
                "Paste the authorization code (code#state) or the full redirect URL:",
              placeholder: "paste the code or URL here...",
              validate: (value: string) => {
                if (!value || !value.trim()) return "Code is required";
                return undefined;
              },
            });

            const trimmed = codeInput.trim();
            let code: string;
            let state: string;

            if (trimmed.startsWith("http")) {
              // User pasted the full redirect URL
              const url = new URL(trimmed);
              code = url.searchParams.get("code") || "";
              state = url.searchParams.get("state") || "";
            } else if (trimmed.includes("#")) {
              // User pasted code#state format
              const hashIndex = trimmed.indexOf("#");
              code = trimmed.substring(0, hashIndex);
              state = trimmed.substring(hashIndex + 1);
            } else {
              throw new Error(
                "Invalid input. Expected code#state or a redirect URL with ?code=...&state=...",
              );
            }

            if (!code || !state) {
              throw new Error("Could not extract code and state from input.");
            }

            // Exchange code for tokens
            const spinExchange = ctx.prompter.progress("Exchanging code for tokens...");
            const tokens = await exchangeCodeForTokens(code, state, verifier);
            spinExchange.stop("Authentication successful!");

            const profileId = "anthropic:oauth";

            return {
              profiles: [
                {
                  profileId,
                  credential: {
                    type: "oauth" as const,
                    provider: "anthropic",
                    access: tokens.access,
                    refresh: tokens.refresh,
                    expires: tokens.expires,
                  },
                },
              ],
              defaultModel: DEFAULT_MODEL,
              notes: [
                `Authenticated with Anthropic OAuth.`,
                `Default model set to ${DEFAULT_MODEL}.`,
                `Token will auto-refresh before expiry.`,
              ],
            };
          },
        },
      ],

      // Token refresh handler - called automatically when token expires
      refreshOAuth: async (cred: any) => {
        const tokens = await refreshToken(cred.refresh);
        return {
          ...cred,
          access: tokens.access,
          refresh: tokens.refresh,
          expires: tokens.expires,
        };
      },

      // Format the API key from credentials (access token IS the API key)
      formatApiKey: (cred: any) => cred.access || cred.key,
    });
  },
};

export default anthropicAuthPlugin;
