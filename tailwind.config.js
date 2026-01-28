/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class', '[data-theme="dark"]'],
    content: ['./src/ui/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                // Chrome (dense toolbar areas)
                chrome: {
                    bg: 'var(--chrome-bg)',
                    border: 'var(--chrome-border)',
                    active: 'var(--chrome-active)',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            spacing: {
                chrome: '32px',
                'density-sm': '4px',
                'density-md': '8px',
                'density-lg': '12px',
            },
            fontSize: {
                'ui-xs': ['11px', '14px'],
                'ui-sm': ['12px', '16px'],
                'ui-base': ['13px', '18px'],
            },
            boxShadow: {
                panel: '0 1px 3px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.06)',
                dropdown: '0 4px 12px rgba(0,0,0,.15)',
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                'slide-in-right': {
                    from: { transform: 'translateX(100%)' },
                    to: { transform: 'translateX(0)' },
                },
                'slide-in-up': {
                    from: { transform: 'translateY(100%)' },
                    to: { transform: 'translateY(0)' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'slide-in-right': 'slide-in-right 200ms ease-out',
                'slide-in-up': 'slide-in-up 200ms ease-out',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};
