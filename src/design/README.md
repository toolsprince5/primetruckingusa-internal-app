# Prime Trucking USA Design System

## Purpose

This system makes the driver app, dispatcher tools, and admin dashboard feel like one secure, operational product. It uses the public website's navy and Prime-red identity, with blue limited to informational/live-map actions.

## Rules

- Use the `color`, `space`, `radius`, `type`, `shadow`, and `touchTarget` tokens from `tokens.ts`; do not introduce new one-off colors or arbitrary spacing values.
- Main action: Prime red. Informational/link/map action: blue. Success: green. Attention: amber. Problem/stop: red.
- All task buttons are at least 48px high. Never communicate state by color alone: pair it with a label or icon.
- Driver screens default to light surfaces for daylight legibility. Long-reading and admin-monitoring surfaces may use the dark token set.
- Show payments in tabular figures; show a label with every amount and every status.

## Component decisions

| Component | Variants | Required behavior |
| --- | --- | --- |
| Button | Primary, secondary, danger, text | 48px minimum height; clear disabled and loading states |
| Card | Standard, metric, attention | 16px padding; 12-16px radius; one clear purpose per card |
| Input | Default, focused, error, disabled | Visible label; 2px blue focus outline; error text beneath |
| Status pill | Info, success, warning, danger | Text label plus color; never color only |
| Metric | Operational, money, exception | Large tabular number, supporting label, optional trend/status |
| Empty state | No data, offline, permission needed | Plain-English explanation and one recovery action |

## Role rules

- **Driver:** one clear next action, low-distraction language, no surveillance wording.
- **Dispatcher:** prioritize accepted/pending loads, driver messages, and required documents.
- **Admin:** dense-but-readable tablet/web information, dark monitoring canvas, auditable controls and confirmation before tracking changes.

## Accessibility

- Minimum 4.5:1 text contrast.
- Native system fonts and scalable text.
- Buttons/controls meet 48 × 48px touch target minimum.
- Pair color with text, icons, or both; provide descriptive labels for images and map controls.
