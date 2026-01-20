import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			'8': '8px',
  			'12': '12px',
  			'16': '16px'
  		},
  		fontSize: {
  			'xs': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
  			'sm': ['14px', { lineHeight: '20px', letterSpacing: '0.01em' }],
  			'base': ['16px', { lineHeight: '24px', letterSpacing: '0' }],
  			'lg': ['18px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
  			'xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
  			'2xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }]
  		},
  		spacing: {
  			'0.5': '2px',
  			'1': '4px',
  			'1.5': '6px',
  			'2': '8px',
  			'3': '12px',
  			'4': '16px',
  			'6': '24px',
  			'8': '32px',
  			'12': '48px',
  			'16': '64px'
  		},
  		boxShadow: {
  			'sm': '0 1px 2px 0 hsl(var(--foreground) / 0.05)',
  			'DEFAULT': '0 1px 3px 0 hsl(var(--foreground) / 0.1), 0 1px 2px -1px hsl(var(--foreground) / 0.1)',
  			'md': '0 4px 6px -1px hsl(var(--foreground) / 0.1), 0 2px 4px -2px hsl(var(--foreground) / 0.1)',
  			'lg': '0 10px 15px -3px hsl(var(--foreground) / 0.1), 0 4px 6px -4px hsl(var(--foreground) / 0.1)',
  			'xl': '0 20px 25px -5px hsl(var(--foreground) / 0.1), 0 8px 10px -6px hsl(var(--foreground) / 0.1)',
  			'card': '0 1px 3px 0 hsl(var(--foreground) / 0.08), 0 1px 2px -1px hsl(var(--foreground) / 0.08)',
  			'modal': '0 20px 25px -5px hsl(var(--foreground) / 0.15), 0 8px 10px -6px hsl(var(--foreground) / 0.1), 0 0 0 1px hsl(var(--border) / 0.5)',
  			'dropdown': '0 10px 15px -3px hsl(var(--foreground) / 0.12), 0 4px 6px -4px hsl(var(--foreground) / 0.08), 0 0 0 1px hsl(var(--border) / 0.5)'
  		},
  		transitionDuration: {
  			'150': '150ms',
  			'200': '200ms',
  			'250': '250ms'
  		},
  		transitionTimingFunction: {
  			'ease-out': 'cubic-bezier(0, 0, 0.2, 1)'
  		},
  		fontFamily: {
  			sans: [
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'"Apple Color Emoji"',
  				'"Segoe UI Emoji"',
  				'"Segoe UI Symbol"',
  				'"Noto Color Emoji"'
  			],
  			mono: [
  				'var(--font-inconsolata)',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'"Liberation Mono"',
  				'"Courier New"',
  				'monospace'
  			]
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'shimmer': {
  				'0%': {
  					backgroundPosition: '-1000px 0'
  				},
  				'100%': {
  					backgroundPosition: '1000px 0'
  				}
  			},
  			'fade-in': {
  				'0%': {
  					opacity: '0'
  				},
  				'100%': {
  					opacity: '1'
  				}
  			},
  			'slide-up': {
  				'0%': {
  					transform: 'translateY(10px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			'scale-in': {
  				'0%': {
  					transform: 'scale(0.95)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'shimmer': 'shimmer 2s infinite linear',
  			'fade-in': 'fade-in 150ms ease-out',
  			'slide-up': 'slide-up 200ms ease-out',
  			'scale-in': 'scale-in 150ms ease-out'
  		}
  	}
  },
  plugins: [tailwindAnimate],
} satisfies Config;

