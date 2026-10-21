# Marcus OS Design System

Marcus supplied the cream and red portfolio reference on October 20, 2026. This replaces the earlier dark purple direction. Reuse existing components and dashboard layouts.

## Palette
- Background: `#faf7f2`, warm cream with a faint blush wash
- Cards: `#fffefd`
- Recessed surfaces: `#f5efea`
- Border: `#e8ded8`
- Main text: `#201b19`
- Secondary text: `#6e625c`
- Quiet text: `#796b64`
- Primary buttons and active navigation: `#e81725` with white text
- Selected soft backgrounds: `#fde8e7`
- Success: `#176b4c` on `#e7f4ec`
- Warning: `#8b570f` on `#fff3d9`
- Error: `#b91c2b` on `#fce7e7`
- Information: `#2358a5` on `#eaf1fb`

Color supports labels and never carries status alone. Primary controls use red; danger controls use a pale error surface with explicit labels. Keep blush glows outside text-heavy cards. No new UI framework or decorative portfolio sections.

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
