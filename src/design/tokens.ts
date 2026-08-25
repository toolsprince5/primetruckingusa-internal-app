/**
 * Prime Trucking USA design foundation.
 * Native system fonts are intentionally used for best readability on iOS/Android.
 */
export const color = {
  brand: {
    navy: '#102A43',
    navyDark: '#081A2D',
    navyLight: '#213E6C',
    red: '#B51F2B',
    redDark: '#8F1620',
    redSoft: '#FDE8EA',
    blue: '#1769E0',
    blueSoft: '#E8F0FE',
  },
  neutral: {
    0: '#FFFFFF',
    25: '#FCFDFE',
    50: '#F7F9FC',
    100: '#F4F7FA',
    200: '#E8EDF3',
    300: '#DCE4EF',
    400: '#98A2B3',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1D2939',
    900: '#172B4D',
  },
  status: {
    success: '#087443',
    successSoft: '#E2F7EC',
    warning: '#B54708',
    warningSoft: '#FFF3D6',
    danger: '#9F1724',
    dangerSoft: '#FDE8EA',
    info: '#145DA0',
    infoSoft: '#E5F1FB',
  },
  dark: {
    canvas: '#101828',
    surface: '#172B4D',
    surfaceRaised: '#213E6C',
    text: '#F7F9FC',
    textMuted: '#B8C4D4',
    border: '#344A63',
  },
} as const;

/** The app uses an 8-point spacing system. */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const type = {
  overline: { fontSize: 11, lineHeight: 16, fontWeight: '900' as const, letterSpacing: 1.2 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900' as const },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '800' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '800' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '600' as const },
  money: { fontSize: 30, lineHeight: 36, fontWeight: '900' as const },
} as const;

export const shadow = {
  card: { shadowColor: '#1F2933', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  elevated: { shadowColor: '#101828', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

export const motion = { fast: 120, standard: 200, slow: 300 } as const;
export const touchTarget = { minimum: 48, comfortable: 52 } as const;

export const layout = { screenPadding: space.md, cardPadding: space.md, sectionGap: space.lg } as const;
