/**
 * Playwright configuration for GnuNae Sandbox
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
    use: {
        // Use CDP to connect to the browser
        connectOptions: {
            wsEndpoint: `ws://127.0.0.1:${process.env.CDP_PORT || 9222}`,
        },

        // Default viewport
        viewport: { width: 1280, height: 720 },

        // Ignore HTTPS errors for testing
        ignoreHTTPSErrors: true,

        // Screenshots on failure
        screenshot: 'only-on-failure',

        // Video recording (if needed)
        video: 'off',
    },

    // Timeout settings
    timeout: 60000,
    expect: {
        timeout: 10000,
    },
});
