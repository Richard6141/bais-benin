// Délimitation assistée des champs (ADR-0016, phase 3) : segmentation d'une petite fenêtre
// Sentinel-2 autour d'un point, en TypeScript pur. Copernicus calcule les variables par pixel
// (un evalscript ne voit pas les pixels voisins) ; ici, sur 64 × 64 pixels :
// croissance de région depuis le pixel du clic, trous comblés, ouverture d'un pixel, contour
// suivi le long des bords de pixels puis simplifié. Trois seuils donnent trois candidats.
// Fonctions pures, sans réseau ni base : testées sur des images synthétiques.

/** Variables par pixel, rangées ligne par ligne depuis le coin haut gauche (nord-ouest). */
export interface FeatureGrid {
  width: number;
  height: number;
  /** NDVI le plus haut de la saison ; NaN si aucun passage sans nuage. */
  peak: Float32Array;
  /** NDVI le plus bas de la saison (sol nu, saison sèche). */
  low: Float32Array;
  /** Réflectance moyenne dans l'infrarouge moyen (B11), de 0 à 1. */
  swir: Float32Array;
}

export type CandidateLevel = "TIGHT" | "MEDIUM" | "WIDE";

export interface FieldCandidate {
  level: CandidateLevel;
  /** Anneau fermé en coordonnées de coins de pixels (x vers l'est, y vers le sud). */
  ring: [number, number][];
  pixelCount: number;
  /** De 0 à 1 : contraste au bord et compacité de la forme. */
  confidence: number;
  /** La région atteint le bord de la fenêtre : le champ déborde, contour incertain. */
  touchesEdge: boolean;
}

export type SegmentationResult =
  | { ok: true; candidates: FieldCandidate[] }
  | { ok: false; reason: "SEED_INVALID" | "TOO_SMALL" | "NO_FIELD" };

// Distance maximale au profil moyen de la région pour chaque niveau.
const LEVELS: { level: CandidateLevel; threshold: number }[] = [
  { level: "TIGHT", threshold: 0.06 },
  { level: "MEDIUM", threshold: 0.1 },
  { level: "WIDE", threshold: 0.15 },
];

/** Champ le plus petit proposé : 0,5 ha. En dessous, relevé à pied. */
export const MIN_FIELD_M2 = 5000;
/** Champ le plus grand proposé : 20 ha. Au-delà, plusieurs champs se sont fondus. */
export const MAX_FIELD_M2 = 200_000;
/** Tolérance de simplification du contour, en pixels (7 m à 10 m par pixel). */
const SIMPLIFY_PX = 0.7;
// Poids de la réflectance SWIR, plus resserrée que le NDVI, dans la distance entre pixels.
const SWIR_WEIGHT = 2;

function features(grid: FeatureGrid, index: number): [number, number, number] | null {
  const peak = grid.peak[index] ?? Number.NaN;
  const low = grid.low[index] ?? Number.NaN;
  const swir = grid.swir[index] ?? Number.NaN;
  if (!Number.isFinite(peak) || !Number.isFinite(low) || !Number.isFinite(swir)) return null;
  return [peak, peak - low, swir * SWIR_WEIGHT];
}

function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

function neighbours(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const result: number[] = [];
  if (x > 0) result.push(index - 1);
  if (x < width - 1) result.push(index + 1);
  if (y > 0) result.push(index - width);
  if (y < height - 1) result.push(index + width);
  return result;
}

/** Croissance de région : voisins proches du profil moyen et du pixel qui les atteint. */
function growRegion(grid: FeatureGrid, seed: number, threshold: number): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  const seedFeatures = features(grid, seed);
  if (!seedFeatures) return mask;
  const mean = [...seedFeatures];
  let count = 1;
  mask[seed] = 1;
  const queue = [seed];
  const maxPixels = grid.width * grid.height;
  while (queue.length > 0 && count < maxPixels) {
    const current = queue.shift() as number;
    const currentFeatures = features(grid, current);
    if (!currentFeatures) continue;
    for (const next of neighbours(current, grid.width, grid.height)) {
      if (mask[next]) continue;
      const candidate = features(grid, next);
      if (!candidate) continue;
      // Profil de la région et arrêt sur un bord net entre deux pixels voisins.
      if (distance(candidate, mean) > threshold) continue;
      if (distance(candidate, currentFeatures) > threshold * 0.8) continue;
      mask[next] = 1;
      count += 1;
      for (let i = 0; i < mean.length; i += 1) {
        mean[i] = (mean[i] ?? 0) + ((candidate[i] ?? 0) - (mean[i] ?? 0)) / count;
      }
      queue.push(next);
    }
  }
  return mask;
}

/** Comble les trous : tout ce que l'extérieur n'atteint pas appartient à la région. */
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && !mask[i]) {
      outside[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length > 0) {
    const current = queue.pop() as number;
    for (const next of neighbours(current, width, height)) {
      if (!mask[next] && !outside[next]) {
        outside[next] = 1;
        queue.push(next);
      }
    }
  }
  return outside.map((value) => (value ? 0 : 1));
}

/** Voisinage 3 × 3 : l'ouverture qui s'en sert rend les coins droits d'un champ intacts. */
function square(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) result.push(ny * width + nx);
    }
  }
  return result;
}

function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  return mask.map((value, index) =>
    value && square(index, width, height).every((next) => mask[next]) ? 1 : 0,
  );
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  return mask.map((value, index) =>
    value || square(index, width, height).some((next) => mask[next]) ? 1 : 0,
  );
}

/** Composante connexe contenant le pixel, ou la plus grande si l'ouverture l'a retiré. */
function componentOf(mask: Uint8Array, width: number, height: number, seed: number): Uint8Array {
  const label = new Int32Array(mask.length).fill(-1);
  let best = { id: -1, size: 0 };
  let seedId = -1;
  let id = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start] !== -1) continue;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      size += 1;
      if (current === seed) seedId = id;
      for (const next of neighbours(current, width, height)) {
        if (mask[next] && label[next] === -1) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    if (size > best.size) best = { id, size };
    id += 1;
  }
  const keep = seedId >= 0 ? seedId : best.id;
  return mask.map((_, index) => (label[index] === keep ? 1 : 0));
}

/**
 * Contour extérieur le long des bords de pixels, orienté dans le sens horaire à l'écran. Les
 * arêtes frontières sont chaînées ; à un sommet partagé en diagonale, la boucle la plus longue
 * est retenue.
 */
export function traceOutline(mask: Uint8Array, width: number, height: number): [number, number][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const edges = new Map<string, [number, number][]>();
  const add = (from: [number, number], to: [number, number]) => {
    const key = `${from[0]},${from[1]}`;
    const list = edges.get(key) ?? [];
    list.push(to);
    edges.set(key, list);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add([x, y], [x + 1, y]);
      if (!inside(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!inside(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!inside(x - 1, y)) add([x, y + 1], [x, y]);
    }
  }
  let longest: [number, number][] = [];
  while (edges.size > 0) {
    const [startKey, targets] = edges.entries().next().value as [string, [number, number][]];
    const start = startKey.split(",").map(Number) as [number, number];
    const loop: [number, number][] = [start];
    let current = start;
    let next = targets.shift();
    if (targets.length === 0) edges.delete(startKey);
    while (next) {
      loop.push(next);
      current = next;
      const key = `${current[0]},${current[1]}`;
      const list = edges.get(key);
      if (!list || list.length === 0) break;
      next = list.shift();
      if (list.length === 0) edges.delete(key);
      if (next && next[0] === start[0] && next[1] === start[1]) {
        loop.push(next);
        break;
      }
    }
    if (loop.length > longest.length) longest = loop;
  }
  // Anneau toujours fermé, même si une diagonale a coupé la chaîne.
  const first = longest[0];
  const last = longest[longest.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) longest.push(first);
  return longest;
}

function perpendicularDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / length;
}

/** Douglas-Peucker sur une ligne ouverte. */
function simplifyLine(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  const first = points[0] as [number, number];
  const last = points[points.length - 1] as [number, number];
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i] as [number, number], first, last);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [first, last];
  const left = simplifyLine(points.slice(0, index + 1), tolerance);
  const right = simplifyLine(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** Simplifie un anneau fermé en le coupant à son point le plus éloigné du départ. */
export function simplifyRing(ring: [number, number][], tolerance: number): [number, number][] {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  const start = open[0] as [number, number];
  let far = 0;
  let farDistance = 0;
  open.forEach((point, index) => {
    const d = Math.hypot(point[0] - start[0], point[1] - start[1]);
    if (d > farDistance) {
      farDistance = d;
      far = index;
    }
  });
  const first = simplifyLine(open.slice(0, far + 1), tolerance);
  const second = simplifyLine([...open.slice(far), start], tolerance);
  const simplified = [...first.slice(0, -1), ...second];
  return simplified.length >= 4 ? simplified : ring;
}

function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function ringPerimeter(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

/** Contraste moyen entre les pixels du bord et leurs voisins extérieurs. */
function edgeContrast(grid: FeatureGrid, mask: Uint8Array): number {
  let total = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const inner = features(grid, index);
    if (!inner) continue;
    for (const next of neighbours(index, grid.width, grid.height)) {
      if (mask[next]) continue;
      const outer = features(grid, next);
      if (!outer) continue;
      total += distance(inner, outer);
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function touchesBorder(mask: Uint8Array, width: number, height: number): boolean {
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true;
  }
  return false;
}

/** Contours candidats du champ qui contient le pixel `seed` (colonne, ligne). */
export function segmentField(
  grid: FeatureGrid,
  seed: { col: number; row: number },
  pixelAreaM2: number,
): SegmentationResult {
  const { width, height } = grid;
  if (seed.col < 0 || seed.row < 0 || seed.col >= width || seed.row >= height) {
    return { ok: false, reason: "SEED_INVALID" };
  }
  const seedIndex = seed.row * width + seed.col;
  if (!features(grid, seedIndex)) return { ok: false, reason: "SEED_INVALID" };
  const minPixels = Math.ceil(MIN_FIELD_M2 / pixelAreaM2);
  const maxPixels = Math.floor(MAX_FIELD_M2 / pixelAreaM2);

  const candidates: FieldCandidate[] = [];
  let tooSmall = false;
  for (const { level, threshold } of LEVELS) {
    let mask = growRegion(grid, seedIndex, threshold);
    mask = fillHoles(mask, width, height);
    mask = componentOf(dilate(erode(mask, width, height), width, height), width, height, seedIndex);
    const pixelCount = mask.reduce((sum, value) => sum + value, 0);
    if (pixelCount < minPixels) {
      tooSmall = true;
      continue;
    }
    if (pixelCount > maxPixels) continue;
    // Même région qu'au niveau précédent : pas de doublon.
    if (candidates.some((c) => Math.abs(c.pixelCount - pixelCount) <= pixelCount * 0.03)) continue;
    const ring = simplifyRing(traceOutline(mask, width, height), SIMPLIFY_PX);
    const area = ringArea(ring);
    const perimeter = ringPerimeter(ring);
    const compactness = perimeter > 0 ? (4 * Math.PI * area) / perimeter ** 2 : 0;
    const contrast = Math.min(1, edgeContrast(grid, mask) / (threshold * 3));
    const edge = touchesBorder(mask, width, height);
    const score =
      (0.6 * contrast + 0.4 * Math.min(1, compactness / (Math.PI / 4))) * (edge ? 0.5 : 1);
    candidates.push({
      level,
      ring,
      pixelCount,
      confidence: Math.round(score * 100) / 100,
      touchesEdge: edge,
    });
  }
  if (candidates.length > 0) return { ok: true, candidates };
  return { ok: false, reason: tooSmall ? "TOO_SMALL" : "NO_FIELD" };
}
