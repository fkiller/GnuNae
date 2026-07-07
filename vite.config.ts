import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
);

export default defineConfig({
    plugins: [react()],
    root: './src/ui',
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version || '0.0.0'),
    },
    publicDir: '../../assets',
    build: {
        outDir: '../../dist/ui',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
    },
});
