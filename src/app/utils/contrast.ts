let contrastCache: Record<string, string> = {};

export const computeLuminance = (r: number, g: number, b: number) => {
  const srgb = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

const parseRGBString = (rgb: string) => {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
};

export function getReadableTextClassFor(key: string, fallbackColor?: string): string {
  if (contrastCache[key]) return contrastCache[key];

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    contrastCache[key] = 'text-white';
    return 'text-white';
  }

  if (fallbackColor && fallbackColor.startsWith('#')) {
    const hex = fallbackColor.replace('#', '');
    const bigint = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const lum = computeLuminance(r, g, b);
    const cls = lum > 0.6 ? 'text-black' : 'text-white';
    contrastCache[key] = cls;
    return cls;
  }

  try {
    const el = document.createElement('div');
    el.className = key;
    el.style.position = 'absolute';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.width = '1px';
    el.style.height = '1px';
    document.body.appendChild(el);
    const bg = getComputedStyle(el).backgroundColor;
    document.body.removeChild(el);
    const rgb = parseRGBString(bg);
    if (rgb) {
      const lum = computeLuminance(rgb[0], rgb[1], rgb[2]);
      const cls = lum > 0.6 ? 'text-black' : 'text-white';
      contrastCache[key] = cls;
      return cls;
    }
  } catch (err) {
    // ignore
  }

  contrastCache[key] = 'text-white';
  return 'text-white';
}
