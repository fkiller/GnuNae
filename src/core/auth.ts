import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface AuthToken {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
}

// Single auth source: Codex CLI's auth.json
// This is shared between the app and Docker containers
const CODEX_CLI_AUTH_FILE = path.join(os.homedir(), '.codex', 'auth.json');

export class AuthService {
    private token: AuthToken | null = null;

    constructor() {
        this.loadToken();
    }

    private loadToken(): void {
        try {
            if (fs.existsSync(CODEX_CLI_AUTH_FILE)) {
                const data = fs.readFileSync(CODEX_CLI_AUTH_FILE, 'utf-8');
                const authData = JSON.parse(data);

                // Parse Codex CLI auth format - tokens can be nested or at top level
                const tokens = authData.tokens || authData;
                const accessToken = tokens.access_token || tokens.accessToken || tokens.token || '';
                const refreshToken = tokens.refresh_token || tokens.refreshToken || '';

                if (accessToken || refreshToken) {
                    this.token = {
                        accessToken,
                        refreshToken,
                        email: authData.email || 'OpenAI User',
                        expiresAt: tokens.expires_at ? tokens.expires_at * 1000 : undefined,
                    };
                    console.log('[Auth] Loaded token from Codex CLI:', this.token.email);
                } else {
                    console.log('[Auth] No valid token found in Codex CLI auth file');
                    this.token = null;
                }
            } else {
                console.log('[Auth] Codex CLI auth file not found:', CODEX_CLI_AUTH_FILE);
                this.token = null;
            }
        } catch (error) {
            console.error('[Auth] Failed to load auth token:', error);
            this.token = null;
        }
    }

    // Reload token from file (useful after CLI login)
    reloadToken(): void {
        this.loadToken();
    }

    isAuthenticated(): boolean {
        // Re-check file in case it was updated by CLI or Docker
        this.loadToken();
        const isAuth = this.token !== null && !!(this.token.accessToken || this.token.refreshToken);
        console.log('[Auth] isAuthenticated:', isAuth);
        return isAuth;
    }

    getToken(): AuthToken | null {
        return this.token;
    }

    getEmail(): string | null {
        return this.token?.email || null;
    }

    clearToken(): void {
        this.token = null;
        try {
            // Ensure .codex directory exists
            const codexDir = path.dirname(CODEX_CLI_AUTH_FILE);
            if (!fs.existsSync(codexDir)) {
                return; // Nothing to clear
            }

            if (fs.existsSync(CODEX_CLI_AUTH_FILE)) {
                fs.unlinkSync(CODEX_CLI_AUTH_FILE);
                console.log('[Auth] Codex CLI auth cleared:', CODEX_CLI_AUTH_FILE);
            }
        } catch (error) {
            console.error('[Auth] Failed to clear auth token:', error);
        }
    }

    // Alias for backward compatibility - now just delegates to isAuthenticated()
    isCodexCliAuthenticated(): boolean {
        return this.isAuthenticated();
    }

    // Get the path to Codex CLI auth file
    getCodexCliAuthPath(): string {
        return CODEX_CLI_AUTH_FILE;
    }

    // Save token in Codex CLI format
    saveToken(token: { accessToken: string; refreshToken?: string; email?: string; expiresAt?: number }): void {
        try {
            // Ensure .codex directory exists
            const codexDir = path.dirname(CODEX_CLI_AUTH_FILE);
            if (!fs.existsSync(codexDir)) {
                fs.mkdirSync(codexDir, { recursive: true });
            }

            // Write in Codex CLI compatible format
            const authData = {
                access_token: token.accessToken,
                refresh_token: token.refreshToken || '',
                email: token.email || 'OpenAI User',
                expires_at: token.expiresAt ? Math.floor(token.expiresAt / 1000) : undefined,
            };

            fs.writeFileSync(CODEX_CLI_AUTH_FILE, JSON.stringify(authData, null, 2), 'utf-8');

            // Update in-memory token
            this.token = {
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                email: token.email || 'OpenAI User',
                expiresAt: token.expiresAt,
            };

            console.log('[Auth] Token saved to Codex CLI:', this.token.email);
        } catch (error) {
            console.error('[Auth] Failed to save auth token:', error);
            throw error;
        }
    }

    // Extract token from ChatGPT/OpenAI cookies after login
    // Note: This creates a session indicator but real Codex CLI auth requires 'codex auth login'
    async extractTokenFromCookies(session: Electron.Session): Promise<boolean> {
        try {
            // Get cookies from both domains (OpenAI changed from openai.com to chatgpt.com)
            const openaiCookies = await session.cookies.get({ domain: '.openai.com' });
            const chatgptCookies = await session.cookies.get({ domain: '.chatgpt.com' });
            const cookies = [...openaiCookies, ...chatgptCookies];

            console.log('[Auth] Found', cookies.length, 'cookies (openai:', openaiCookies.length, 'chatgpt:', chatgptCookies.length, ')');

            // Look for session-related cookies - ChatGPT uses various auth cookies
            const authCookies = cookies.filter(c =>
                c.name.includes('session') ||
                c.name.includes('token') ||
                c.name.includes('auth') ||
                c.name === '__Secure-next-auth.session-token' ||
                c.name === '_puid' ||
                c.name === 'ajs_user_id'
            );

            console.log('[Auth] Auth-related cookies found:', authCookies.length);

            if (authCookies.length > 0) {
                const primaryCookie = authCookies[0];

                this.saveToken({
                    accessToken: primaryCookie.value,
                    email: 'OpenAI User',
                    expiresAt: primaryCookie.expirationDate ? primaryCookie.expirationDate * 1000 : Date.now() + (30 * 24 * 60 * 60 * 1000),
                });
                console.log('[Auth] Successfully extracted token from cookies');
                return true;
            }

            // Fallback: if we have multiple cookies, assume authenticated
            if (cookies.length > 5) {
                console.log('[Auth] Multiple cookies present, assuming authenticated');
                this.saveToken({
                    accessToken: 'session-from-cookies',
                    email: 'OpenAI User',
                    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
                });
                return true;
            }

            console.log('[Auth] No auth cookies found');
            return false;
        } catch (error) {
            console.error('[Auth] Failed to extract token from cookies:', error);
            return false;
        }
    }
}

export const authService = new AuthService();
