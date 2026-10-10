# Hermes Dashboard — Design System

Light-only visual system inspired by Juice Lab’s soft SaaS dashboards.

## Palette
- Background: `#f4f5f7`
- Surface: `#ffffff`
- Surface soft: `#fafbfc`
- Border: `#e8eaee`
- Text: `#1a1d24`
- Text muted: `#6b7280`
- Text soft: `#9ca3af`
- Accent (buttons, active nav): `#1a1d24`
- Green: `#10b981` / soft `#d1fae5`
- Red: `#ef4444` / soft `#fee2e2`
- Blue: `#3b82f6` / soft `#dbeafe`
- Purple: `#8b5cf6` / soft `#ede9fe`
- Amber: `#f59e0b`

## Typography
- Family: Outfit (Google Fonts)
- Weights: 400, 500, 600
- Display: 2xl–4xl, tracking-tight
- Body: sm / base, leading-relaxed

## Radii
- Cards: 20–24px (`rounded-2xl` / `rounded-3xl`)
- Buttons / pills: 14–16px or full pill
- Icons containers: 12px

## Shadows
- Soft: `0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.04)`
- Hover lift only, no harsh drop shadows

## Motion
- Spring sidebar: stiffness 300, damping 30
- Card hover: `y: -2` or shadow deepen
- Button press: `scale(0.98)`
- Page entry: fade + slight y

## Layout
- Desktop: collapsible left sidebar (240 ↔ 72)
- Mobile: top bar + slide-over drawer
- Content max width ~7xl on dashboard, 2xl on chat
