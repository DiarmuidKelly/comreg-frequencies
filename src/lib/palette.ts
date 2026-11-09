/**
 * Single source of truth for colour.
 *
 * These are the validated eight categorical slots and chrome tokens. The values
 * are applied to `:root` as custom properties at start-up (see applyTheme), so
 * the stylesheet only ever refers to `var(--series-n)` and the PDF exporter can
 * read the same hexes — no second copy to drift out of step.
 *
 * Validated with the data-viz palette validator on the adjacent pairlist, which
 * is the right list here: bands only ever touch their frequency neighbours.
 *   light  worst adjacent CVD dE 9.1, normal-vision dE 19.6
 *   dark   worst adjacent CVD dE 8.4, normal-vision dE 19.3
 * Three light slots sit below 3:1 against the surface, so the relief rule
 * applies: the ribbon carries direct labels, an always-visible legend, a hover
 * tooltip, an optional texture channel and a full table view.
 */

export type Mode = 'light' | 'dark';

export interface Palette {
  surface: string;
  plane: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  gridline: string;
  axis: string;
  border: string;
  /** Index 0 is the neutral for unallocated spectrum; 1-8 are the categorical slots. */
  series: [string, string, string, string, string, string, string, string, string];
}

export const PALETTES: Record<Mode, Palette> = {
  light: {
    surface: '#fcfcfb',
    plane: '#f9f9f7',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    gridline: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    series: [
      '#c3c2b7', // 0 not allocated
      '#2a78d6', // 1 blue      fixed
      '#eb6834', // 2 orange    mobile
      '#1baf7a', // 3 aqua      broadcasting
      '#eda100', // 4 yellow    aeronautical
      '#e87ba4', // 5 magenta   maritime
      '#008300', // 6 green     radiodetermination
      '#4a3aa7', // 7 violet    space & science
      '#e34948', // 8 red       amateur
    ],
  },
  dark: {
    surface: '#1a1a19',
    plane: '#0d0d0d',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    gridline: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    series: [
      '#383835',
      '#3987e5',
      '#d95926',
      '#199e70',
      '#c98500',
      '#d55181',
      '#008300',
      '#9085e9',
      '#e66767',
    ],
  },
};

/** Writes a palette onto the document root as custom properties. */
export function applyTheme(mode: Mode): void {
  const palette = PALETTES[mode];
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.setProperty('--surface-1', palette.surface);
  root.style.setProperty('--plane', palette.plane);
  root.style.setProperty('--text-primary', palette.textPrimary);
  root.style.setProperty('--text-secondary', palette.textSecondary);
  root.style.setProperty('--muted', palette.muted);
  root.style.setProperty('--gridline', palette.gridline);
  root.style.setProperty('--axis', palette.axis);
  root.style.setProperty('--border', palette.border);
  palette.series.forEach((hex, i) => root.style.setProperty(`--series-${i}`, hex));
}

/** The mode to start in: a previous choice, else the OS preference. */
export function initialMode(): Mode {
  const stored = localStorage.getItem('comreg-freq:theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
