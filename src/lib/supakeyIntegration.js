import { createClient } from "@supabase/supabase-js";

// Supakey service configuration from environment variables
const SUPAKEY_URL =
  process.env.REACT_APP_SUPAKEY_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPAKEY_ANON_KEY =
  process.env.REACT_APP_SUPAKEY_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY;
const HASU_APP_IDENTIFIER =
  process.env.REACT_APP_HASU_APP_IDENTIFIER || "github.com/aksanoble/hasu";
// Public URL for migrations so edge functions can fetch them server-side
const HASU_MIGRATIONS_BASE_URL =
  process.env.REACT_APP_HASU_MIGRATIONS_BASE_URL ||
  "https://raw.githubusercontent.com/aksanoble/hasu/main/public/migrations";

// Create Supakey client for authentication
const supakeyClient = createClient(SUPAKEY_URL, SUPAKEY_ANON_KEY, {
  db: { schema: "supakey" },
});

/**
 * Load migration files from sqitch structure in public/migrations directory
 * Returns both the plan text and deploy SQLs so the server can apply in plan order.
 */
async function loadMigrationsDirectory() {
  try {
    // First, load the sqitch plan to get the list of migrations
    const planResponse = await fetch("/migrations/sqitch.plan");
    if (!planResponse.ok) {
      throw new Error(
        "Could not find sqitch.plan file in public/migrations directory"
      );
    }

    const planText = await planResponse.text();
    const deployMigrations = [];

    // Parse sqitch.plan to extract migration names
    const lines = planText.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip comments and empty lines
      if (
        trimmedLine.startsWith("%") ||
        trimmedLine.startsWith("#") ||
        !trimmedLine
      ) {
        continue;
      }

      // Extract migration name (first part before space)
      const migrationName = trimmedLine.split(" ")[0];
      if (migrationName) {
        try {
          // Load the corresponding deploy file
          const deployResponse = await fetch(
            `/migrations/deploy/${migrationName}.sql`
          );
          if (deployResponse.ok) {
            const sql = await deployResponse.text();

            deployMigrations.push({
              name: migrationName,
              sql: sql.trim(),
            });
          } else {
            console.warn(
              `Could not load deploy file for migration: ${migrationName}`
            );
          }
        } catch (error) {
          console.error(`Error loading migration ${migrationName}:`, error);
        }
      }
    }

    if (deployMigrations.length === 0) {
      throw new Error("No migrations found in sqitch plan");
    }

    return { planText, deployMigrations };
  } catch (error) {
    console.error("Error loading migrations:", error);
    throw error;
  }
}

/**
 * Supakey Integration Service
 * Handles authentication with Supakey and deployment of Hasu migrations
 */
export class SupakeyIntegration {
  constructor() {
    this.supakeyClient = supakeyClient;
    this.hasuAppTokens = null;
    this.userDatabaseConfig = null;

    // Load stored tokens on initialization
    this.loadStoredTokens();
  }

  /**
   * Load stored tokens from localStorage
   */
  loadStoredTokens() {
    try {
      const storedTokens = localStorage.getItem("hasu_supakey_tokens");
      const storedConfig = localStorage.getItem("hasu_user_database_config");

      if (storedTokens) {
        this.hasuAppTokens = JSON.parse(storedTokens);
      }

      if (storedConfig) {
        this.userDatabaseConfig = JSON.parse(storedConfig);
      }
    } catch (error) {
      console.error("Error loading stored tokens:", error);
      this.clearStoredTokens();
    }
  }

  /**
   * Save tokens to localStorage
   */
  saveTokens(tokens, config) {
    try {
      this.hasuAppTokens = tokens;
      this.userDatabaseConfig = config;

      localStorage.setItem("hasu_supakey_tokens", JSON.stringify(tokens));
      localStorage.setItem("hasu_user_database_config", JSON.stringify(config));
    } catch (error) {
      console.error("Error saving tokens:", error);
    }
  }

  /**
   * Clear stored tokens
   */
  clearStoredTokens() {
    try {
      this.hasuAppTokens = null;
      this.userDatabaseConfig = null;

      localStorage.removeItem("hasu_supakey_tokens");
      localStorage.removeItem("hasu_user_database_config");
    } catch (error) {
      console.error("Error clearing tokens:", error);
    }
  }

  // Email-based authentication removed. Use OAuth flow only.

  /**
   * Step 2: Deploy Hasu migrations via Supakey's deploy-migrations edge function
   * @param {string} authToken - JWT token from Supakey authentication
   * @returns {Promise<{success: boolean, tokens?: any, error?: string}>}
   */
  async deployHasuMigrations(authToken, options = {}) {
    try {
      const { planText, deployMigrations } = await loadMigrationsDirectory();

      console.log("🚀 Calling deploy-migrations with:", {
        url: `${SUPAKEY_URL}/functions/v1/deploy-migrations`,
        authToken: authToken?.substring(0, 50) + "...",
        appIdentifier: HASU_APP_IDENTIFIER,
        migrationsCount: deployMigrations.length,
      });

      console.log(
        "📦 Migrations to deploy:",
        deployMigrations.map((m) => m.name)
      );

      const response = await fetch(
        `${SUPAKEY_URL}/functions/v1/deploy-migrations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
            apikey: SUPAKEY_ANON_KEY,
          },
          body: JSON.stringify({
            applicationName: "hasu",
            appIdentifier: HASU_APP_IDENTIFIER,
            migrationsBaseUrl: HASU_MIGRATIONS_BASE_URL,
            migrations: deployMigrations,
            migrationsDir: {
              plan: planText,
              deploy: deployMigrations,
            },
            applicationId: options.applicationId,
            userSupabaseUrl: options.userSupabaseUrl,
          }),
        }
      );
      console.log("📡 Deploy-migrations response status:", response.status);
      const responseText = await response.text();
      console.log("📋 Deploy-migrations response body:", responseText);
      console.log(
        "🔍 Response headers:",
        Object.fromEntries(response.headers.entries())
      );
      if (!response.ok) {
        try {
          const errorData = JSON.parse(responseText);
          const details = errorData.details ? `: ${errorData.details}` : "";
          return {
            success: false,
            error: (errorData.error || "Migration deployment failed") + details,
          };
        } catch (e) {
          return {
            success: false,
            error: `Migration deployment failed: ${response.status} - ${responseText}`,
          };
        }
      }

      const resultRaw = JSON.parse(responseText);

      // New behavior: deploy-migrations returns no auth tokens. Only basic metadata.
      const applicationId =
        resultRaw.applicationId || resultRaw.application_id || null;
      const databaseUrl =
        resultRaw.databaseUrl || resultRaw.database_url || SUPAKEY_URL;
      const appIdentifier =
        resultRaw.appIdentifier ||
        resultRaw.app_identifier ||
        HASU_APP_IDENTIFIER;

      return {
        success: true,
        tokens: { applicationId, databaseUrl, appIdentifier },
      };
    } catch (error) {
      console.error("Deploy migrations error:", error);

      // Check if this is a PGRST002 schema cache error
      if (error.message && error.message.includes("PGRST002")) {
        console.log(
          "🔄 PGRST002 error detected in deployHasuMigrations, this will be handled by frontend retry logic"
        );
        return { success: false, error: `PGRST002: ${error.message}` };
      }

      return {
        success: false,
        error: `Migration deployment failed: ${error.message}`,
      };
    }
  }

  /**
   * Retrieve application-specific tokens to connect to the user's database
   * Requires Authorization with Supakey user JWT. Accepts applicationId or appIdentifier.
   */
  async getApplicationTokens(
    authToken,
    { applicationId = null, appIdentifier = null } = {}
  ) {
    try {
      const payload = {};
      if (applicationId) payload.applicationId = applicationId;
      if (appIdentifier) payload.appIdentifier = appIdentifier;
      if (!payload.applicationId && !payload.appIdentifier) {
        return {
          success: false,
          error: "applicationId or appIdentifier required",
        };
      }

      const response = await fetch(
        `${SUPAKEY_URL}/functions/v1/issue-app-tokens`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
            apikey: SUPAKEY_ANON_KEY,
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        result = null;
      }

      if (!response.ok) {
        return {
          success: false,
          error:
            result?.message ||
            result?.error ||
            `Failed to get app tokens: ${response.status}`,
        };
      }

      // Normalize shape similar to deploy-migrations output
      const tokens = {
        jwt: result.jwt,
        refreshToken: result.refreshToken,
        username: result.username,
        userId: result.userId,
        applicationId: result.applicationId,
        databaseUrl: result.databaseUrl,
        anonKey: result.anonKey,
      };

      return { success: true, tokens };
    } catch (error) {
      console.error("getApplicationTokens error:", error);
      return { success: false, error: error.message };
    }
  }

  // Deprecated database config fetch removed; config is provided by deploy/token flow.

  // Legacy non-OAuth integration removed.

  /**
   * Get stored Hasu app tokens
   */
  getHasuAppTokens() {
    return this.hasuAppTokens;
  }

  /**
   * Get stored user database configuration
   */
  getStoredUserDatabaseConfig() {
    return this.userDatabaseConfig;
  }
}

// Export singleton instance
export const supakeyIntegration = new SupakeyIntegration();
