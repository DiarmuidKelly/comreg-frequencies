/**
 * Service families, frequency formatting, and the ITU band ladder.
 *
 * ComReg's table names 32 distinct radio services, far past the eight slots a
 * categorical palette can safely carry. They collapse naturally into eight
 * families plus an unallocated neutral, which is what the chart colours by; the
 * individual service names stay visible in the tooltip, the row chips and the
 * detail panel, so colour never carries meaning on its own.
 */
import type { Band } from './types';

export interface Family {
  key: string;
  label: string;
  /** Categorical slot, 1-8; 0 is the neutral used for unallocated spectrum. */
  slot: number;
  /** Content ids of the services that belong to this family. */
  services: number[];
}

export const FAMILIES: Family[] = [
  { key: 'fixed', label: 'Fixed', slot: 1, services: [10, 11] },
  { key: 'mobile', label: 'Mobile', slot: 2, services: [20, 21, 13, 22] },
  { key: 'broadcasting', label: 'Broadcasting', slot: 3, services: [7, 8] },
  { key: 'aeronautical', label: 'Aeronautical', slot: 4, services: [2, 3, 4] },
  { key: 'maritime', label: 'Maritime', slot: 5, services: [14, 15, 16, 17] },
  { key: 'radiodetermination', label: 'Radiodetermination', slot: 6, services: [25, 26, 27, 10166] },
  { key: 'science', label: 'Space & science', slot: 7, services: [9, 12, 18, 19, 23, 29, 30, 31, 32, 10209] },
  { key: 'amateur', label: 'Amateur', slot: 8, services: [5, 6] },
  { key: 'unallocated', label: 'Not allocated', slot: 0, services: [1064] },
];

const FAMILY_BY_SERVICE = new Map<number, Family>();
for (const family of FAMILIES) {
  for (const id of family.services) FAMILY_BY_SERVICE.set(id, family);
}

export const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));

export function familyOfService(serviceId: number): Family | undefined {
  return FAMILY_BY_SERVICE.get(serviceId);
}

/** CSS custom property holding this family's colour in the active theme. */
export function familyColour(family: Family | undefined): string {
  if (!family) return 'var(--series-0)';
  return `var(--series-${family.slot})`;
}

/**
 * The family that colours a band: the first *primary* allocation if the band has
 * one, else the first service mentioned at all. Primary beats secondary because
 * that is the allocation that actually constrains the band.
 */
export function dominantFamily(band: Band): Family | undefined {
  if (band.ps != null) {
    const family = FAMILY_BY_SERVICE.get(band.ps);
    if (family) return family;
  }
  for (const id of band.s) {
    const family = FAMILY_BY_SERVICE.get(id);
    if (family) return family;
  }
  return undefined;
}

/** Every family present in a band, in palette order. */
export function familiesOf(band: Band): Family[] {
  const keys = new Set<string>();
  for (const id of band.s) {
    const family = FAMILY_BY_SERVICE.get(id);
    if (family) keys.add(family.key);
  }
  return FAMILIES.filter((f) => keys.has(f.key));
}

// --- frequency formatting -------------------------------------------------

/**
 * The plan's first band starts at 0 Hz, which a logarithmic axis cannot show, so
 * the axis floor is 3 kHz — the bottom of ITU band 4 (VLF) and the conventional
 * start of the radio spectrum.
 */
export const AXIS_MIN = 3e3;
export const AXIS_MAX = 3e12;

const SCALES: [number, string][] = [
  [1e12, 'THz'],
  [1e9, 'GHz'],
  [1e6, 'MHz'],
  [1e3, 'kHz'],
  [1, 'Hz'],
];

/** Formats hertz with the largest unit that keeps the mantissa >= 1. */
export function formatHz(hz: number, maxDecimals = 4): string {
  if (!Number.isFinite(hz)) return '—';
  if (hz === 0) return '0 Hz';
  const [scale, unit] = SCALES.find(([s]) => Math.abs(hz) >= s) ?? SCALES[SCALES.length - 1];
  const value = hz / scale;
  const decimals = Number.isInteger(value) ? 0 : Math.min(maxDecimals, 4);
  return `${trimZeros(value.toFixed(decimals))} ${unit}`;
}

/** Bandwidth of a span, phrased for a reader rather than an axis. */
export function formatWidth(lo: number, hi: number): string {
  return formatHz(hi - lo, 3);
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** Axis tick label: compact, no trailing noise, e.g. "100 MHz". */
export function formatTick(hz: number): string {
  return formatHz(hz, 1);
}

// --- ITU band ladder ------------------------------------------------------

export interface ItuBand {
  /** ITU band number, 4 (VLF) to 12 (THF). */
  number: number;
  abbr: string;
  name: string;
  lo: number;
  hi: number;
}

/**
 * The band ladder of ITU-R Recommendation V.431 ("Nomenclature of the frequency
 * and wavelength bands used in telecommunications"), bands 4 to 12. Each band
 * spans exactly one decade, which is what lets every stave share a layout.
 */
export const ITU_BANDS: ItuBand[] = [
  { number: 4, abbr: 'VLF', name: 'Very low frequency', lo: 3e3, hi: 3e4 },
  { number: 5, abbr: 'LF', name: 'Low frequency', lo: 3e4, hi: 3e5 },
  { number: 6, abbr: 'MF', name: 'Medium frequency', lo: 3e5, hi: 3e6 },
  { number: 7, abbr: 'HF', name: 'High frequency', lo: 3e6, hi: 3e7 },
  { number: 8, abbr: 'VHF', name: 'Very high frequency', lo: 3e7, hi: 3e8 },
  { number: 9, abbr: 'UHF', name: 'Ultra high frequency', lo: 3e8, hi: 3e9 },
  { number: 10, abbr: 'SHF', name: 'Super high frequency', lo: 3e9, hi: 3e10 },
  { number: 11, abbr: 'EHF', name: 'Extremely high frequency', lo: 3e10, hi: 3e11 },
  { number: 12, abbr: 'THF', name: 'Tremendously high frequency', lo: 3e11, hi: 3e12 },
];

/**
 * Bands 1-3 (ELF 3-30 Hz, SLF 30-300 Hz, ULF 300 Hz - 3 kHz) are omitted: the
 * plan's only entry below 3 kHz is the unallocated lower part of its first band,
 * so a stave apiece would be three empty rows.
 */

export interface Landmark {
  label: string;
  lo: number;
  hi: number;
  /** Placed only after every major landmark has a slot, so crowded decades
   *  keep the headline allocations rather than whichever came first. */
  minor?: boolean;
  /**
   * Extra context shown on hover. Used for amateur power limits, which are
   * conditions of the Irish amateur licence rather than part of the frequency
   * plan — hence a note rather than something stated on the face of the chart.
   */
  note?: string;
}

/**
 * Well-known allocations, annotated on the staves so a reader can orient without
 * knowing the numbers. Every range here was checked against ComReg's own table
 * rather than taken from general knowledge — the amateur edges in particular are
 * the Irish ones, so 4 m is 70.125–70.45 MHz rather than the 70.0–70.5 MHz used
 * elsewhere in CEPT.
 *
 * Kept in ascending frequency order; `placeLandmarks` handles collisions.
 */
export const LANDMARKS: Landmark[] = [
  { label: '2200 m amateur', lo: 135.7e3, hi: 137.8e3, minor: true },
  { label: 'LW broadcast', lo: 148.5e3, hi: 283.5e3 },
  { label: '630 m amateur', lo: 472e3, hi: 479e3, minor: true },
  { label: 'MW broadcast', lo: 526.5e3, hi: 1606.5e3 },
  { label: '160 m amateur', lo: 1.81e6, hi: 1.85e6, minor: true },
  {
    label: '160 m upper',
    lo: 1.85e6,
    hi: 2e6,
    minor: true,
    note: 'Secondary amateur allocation; power limit already lower at 10 W (10 dBW)',
  },
  { label: '80 m amateur', lo: 3.5e6, hi: 3.8e6 },
  {
    label: '60 m amateur',
    lo: 5351.5e3,
    hi: 5366.5e3,
    minor: true,
    note: 'Secondary amateur allocation; power limit already lower at 15 W (12 dBW)',
  },
  { label: '40 m amateur', lo: 7e6, hi: 7.2e6 },
  { label: '20 m amateur', lo: 14e6, hi: 14.35e6 },
  { label: '15 m amateur', lo: 21e6, hi: 21.45e6, minor: true },
  { label: 'CB radio', lo: 26.965e6, hi: 27.405e6 },
  { label: '10 m amateur', lo: 28e6, hi: 29.7e6, minor: true },
  { label: '6 m amateur', lo: 50e6, hi: 52e6, minor: true },
  {
    label: '4 m amateur',
    lo: 70.125e6,
    hi: 70.45e6,
    minor: true,
    note: 'Irish allocation, narrower than the CEPT 70.0–70.5 MHz; land mobile power limit 25 W (14 dBW)',
  },
  { label: 'FM radio', lo: 87.5e6, hi: 108e6 },
  { label: 'Airband', lo: 108e6, hi: 137e6 },
  { label: '2 m amateur', lo: 144e6, hi: 146e6 },
  { label: 'Marine VHF', lo: 156e6, hi: 162.05e6 },
  { label: 'DAB', lo: 174e6, hi: 230e6 },
  { label: '70 cm amateur', lo: 430e6, hi: 440e6 },
  { label: 'PMR446', lo: 446e6, hi: 446.2e6, minor: true },
  { label: 'DTT (UHF TV)', lo: 470e6, hi: 694e6 },
  { label: '700 MHz 5G', lo: 694e6, hi: 790e6 },
  { label: 'GSM 900', lo: 880e6, hi: 960e6 },
  { label: '23 cm amateur', lo: 1240e6, hi: 1300e6, minor: true },
  { label: 'GNSS', lo: 1559e6, hi: 1610e6 },
  { label: 'GSM 1800', lo: 1710e6, hi: 1880e6 },
  { label: 'Wi-Fi 2.4 GHz', lo: 2400e6, hi: 2483.5e6 },
  { label: '3.6 GHz 5G', lo: 3400e6, hi: 3800e6 },
  { label: 'Wi-Fi 5/6 GHz', lo: 5150e6, hi: 5925e6 },
  { label: '3 cm amateur', lo: 10e9, hi: 10.5e9, minor: true },
  { label: 'mmWave 26 GHz', lo: 24.25e9, hi: 27.5e9 },
  { label: '47 GHz amateur', lo: 47e9, hi: 47.2e9, minor: true },
  { label: 'Automotive radar', lo: 76e9, hi: 81e9 },
];

/** Clamps a band's edges into the plottable axis range. */
export function plotRange(band: Band): { lo: number; hi: number } | null {
  if (band.lo == null || band.hi == null) return null;
  const lo = Math.max(band.lo, AXIS_MIN);
  const hi = Math.min(band.hi, AXIS_MAX);
  return hi > lo ? { lo, hi } : null;
}
