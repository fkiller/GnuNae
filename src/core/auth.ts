import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';

interface AuthToken {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
}

const AUTH_FILE = path.join(app.getPath('userData'), 'codex-auth.json');

// Codex CLI stores its auth at ~/.codex/auth.json
const CODEX_CLI_AUTH_FILE = path.join(os.homedir(), '.codex', 'auth.json');

export class AuthService {
    private token: AuthToken | null = null;

    constructor() {
        this.loadToken();
    }

    private loadToken(): void {
        try {
            if (fs.existsSync(AUTH_FILE)) {
                const data = fs.readFileSync(AUTH_FILE, 'utf-8');
                this.token = JSON.parse(data);
                console.log('[Auth] Loaded token from file:', this.token?.email || 'no email');

                // Check if token is expired
                if (this.token?.expiresAt && Date.now() > this.token.expiresAt) {
                    console.log('[Auth] Token expired, clearing');
                    this.token = null;
                }
            }
        } catch (error) {
            console.error('[Auth] Failed to load auth token:', error);
            this.token = null;
        }
    }

    isAuthenticated(): boolean {
        const isAuth = this.token !== null && !!this.token.accessToken;
        console.log('[Auth] isAuthenticated:', isAuth);
        return isAuth;
    }

    getToken(): AuthToken | null {
        return this.token;
    }

    getEmail(): string | null {
        return this.token?.email || null;
    }

    saveToken(token: AuthToken): void {
        try {
            this.token = token;
            fs.writeFileSync(AUTH_FILE, JSON.stringify(token, null, 2), 'utf-8');
            console.log('[Auth] Token saved:', token.email || 'no email');
        } catch (error) {
            console.error('[Auth] Failed to save auth token:', error);
            throw error;
        }
    }

    clearToken(): void {
        this.token = null;
        try {
            if (fs.existsSync(AUTH_FILE)) {
                fs.unlinkSync(AUTH_FILE);
            }
            console.log('[Auth] Token cleared');
        } catch (error) {
            console.error('[Auth] Failed to clear auth token:', error);
        }
    }

    // Check if Codex CLI has valid authentication
    isCodexCliAuthenticated(): boolean {
        try {
            if (!fs.existsSync(CODEX_CLI_AUTH_FILE)) {
                console.log('[Auth] Codex CLI auth file not found:', CODEX_CLI_AUTH_FILE);
                return false;
            }

            const data = fs.readFileSync(CODEX_CLI_AUTH_FILE, 'utf-8');
            const authData = JSON.parse(data);

            // Check if we have valid auth data
            // Tokens can be at top level or nested in 'tokens' object
            const tokens = authData.tokens || authData;
            const hasAuth = tokens && (
                tokens.access_token ||
                tokens.accessToken ||
                tokens.token ||
                tokens.api_key ||
                tokens.refresh_token
            );

            console.log('[Auth] Codex CLI authenticated:', !!hasAuth);
            return !!hasAuth;
        } catch (error) {
            console.error('[Auth] Failed to check Codex CLI auth:', error);
            return false;
        }
    }

    // Get the path to Codex CLI auth file
    getCodexCliAuthPath(): string {
        return CODEX_CLI_AUTH_FILE;
    }

    // Extract token from ChatGPT/OpenAI cookies after login
    async extractTokenFromCookies(session: Electron.Session): Promise<boolean> {
        try {
            // Get cookies from both domains (OpenAI changed from openai.com to chatgpt.com)
            const openaiCookies = await session.cookies.get({ domain: '.openai.com' });
            const chatgptCookies = await session.cookies.get({ domain: '.chatgpt.com' });
            const cookies = [...openaiCookies, ...chatgptCookies];

            console.log('[Auth] Found', cookies.length, 'cookies (openai:', openaiCookies.length, 'chatgpt:', chatgptCookies.length, ')');

            // Log cookie names for debugging
            const cookieNames = cookies.map(c => c.name);
            console.log('[Auth] Cookie names:', cookieNames.join(', '));

            // Look for session-related cookies - ChatGPT uses various auth cookies
            const authCookies = cookies.filter(c =>
                c.name.includes('session') ||
                c.name.includes('token') ||
                c.name.includes('auth') ||
                c.name === '__Secure-next-auth.session-token' ||
                c.name === '_puid' ||  // ChatGPT user ID cookie
                c.name === 'ajs_user_id'
            );

            console.log('[Auth] Auth-related cookies found:', authCookies.length);

            if (authCookies.length > 0) {
                // Use the first auth cookie as our session indicator
                const primaryCookie = authCookies[0];

                this.saveToken({
                    accessToken: primaryCookie.value,
                    email: 'OpenAI User', // Can't get email from cookies directly
                    expiresAt: primaryCookie.expirationDate ? primaryCookie.expirationDate * 1000 : Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
                });
                console.log('[Auth] Successfully extracted token from cookies');
                return true;
            }

            // Fallback: if we have any cookies at all from openai.com after /auth/, consider logged in
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
