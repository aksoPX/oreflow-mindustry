import { planMine } from '../../mod/shared/engine';
import type { BlockPlan, MineDrill, Point, Result } from '../../mod/shared/engine';
export type { Point } from '../../mod/shared/engine';
export type Ore = 'copper' | 'titanium' | 'thorium';
export type Drill = 'mechanical' | 'pneumatic' | 'laser' | 'blast';
export type Config = {
  drill: Drill; conveyor: 'titanium' | 'plastanium'; water: boolean; power: boolean;
  overdrive: boolean; priority: 'output' | 'compact'; automatic: boolean;
  waterMode: 'auto' | 'extractors' | 'external'; routing: 'auto' | 'bridge' | 'phase';
};
export const GRID_W = 48, GRID_H = 30, TILE = 20;
export const DRILLS = {
  mechanical: { name: 'Механический бур', sprite: 'mechanical-drill', block: 'mechanical-drill', size: 2, tier: 2, time: 600, hardnessMultiplier: 50, boost: 1.6, water: 3, power: 0 },
  pneumatic: { name: 'Пневматический бур', sprite: 'pneumatic-drill', block: 'pneumatic-drill', size: 2, tier: 3, time: 400, hardnessMultiplier: 50, boost: 1.6, water: 3.6, power: 0 },
  laser: { name: 'Лазерный бур', sprite: 'laser-drill', block: 'laser-drill', size: 3, tier: 4, time: 280, hardnessMultiplier: 50, boost: 1.6, water: 4.8, power: 66 },
  blast: { name: 'Воздушная буровая', sprite: 'blast-drill', block: 'blast-drill', size: 4, tier: 5, time: 280, hardnessMultiplier: 50, boost: 1.8, water: 6, power: 180 },
} as const;
export const ORES = {
  copper: { name: 'Медь', adjective: 'Медная жила', hardness: 1, color: '#d79c69' },
  titanium: { name: 'Титан', adjective: 'Титановая жила', hardness: 3, color: '#8e9cde' },
  thorium: { name: 'Торий', adjective: 'Ториевая жила', hardness: 4, color: '#cb94b4' },
} as const;
export const DEFAULT_CONFIG: Config = {
  drill: 'laser', conveyor: 'plastanium', water: true, power: true, overdrive: true,
  priority: 'output', automatic: false, waterMode: 'auto', routing: 'auto',
};
export type TerrainTile = Point & { variant: number; ore: boolean; wall: boolean; shade: number; waterEfficiency: number };
export type DrillPlacement = MineDrill;
export type Plan = Result & {
  belts: BlockPlan[]; water: BlockPlan[]; routers: BlockPlan[]; nodes: BlockPlan[];
  extractors: BlockPlan[]; domes: BlockPlan[]; baseline: number;
  incompatible: boolean; unpowered: boolean; bottleneck: boolean; cost: number;
};
export function hash(x: number, y: number, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
export function generateTerrain(seed: number): TerrainTile[] {
  const result: TerrainTile[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const dx = (x - 24) / 12.3, dy = (y - 15) / 8.1;
    const irregular = Math.sin(x * 0.82 + seed) * 0.09 + Math.cos(y * 1.3) * 0.07;
    const ore = dx * dx + dy * dy < 0.95 + irregular && hash(x, y, seed) > 0.035;
    const corner = (x < 2 && y < 2) || (x > 45 && y > 27);
    result.push({ x, y, ore, variant: 1 + Math.floor(hash(x, y, seed + 1) * 3), wall: corner, shade: hash(x, y, seed + 2), waterEfficiency: 1 });
  }
  return result;
}
export function createPlan(config: Config, ore: Ore, terrain: TerrainTile[], anchor?: Point): Plan {
  const spec = DRILLS[config.drill];
  const result = planMine({ width: GRID_W, height: GRID_H, ore: terrain.map(t => t.ore ? 1 : 0), blocked: terrain.map(t => t.wall), waterEfficiency: terrain.map(t => t.waterEfficiency), hardness: ORES[ore].hardness, drill: spec, anchor }, { ...config, trials: 64 });
  return {
    ...result, belts: result.placements.filter(p => p.kind === 'belt' || p.kind === 'exit' || p.kind === 'loader'),
    water: result.placements.filter(p => p.kind === 'liquid-bridge' || p.kind === 'liquid-end' || p.kind === 'water-port'),
    routers: result.placements.filter(p => p.kind === 'water-port'), nodes: result.placements.filter(p => p.kind === 'power'),
    extractors: result.placements.filter(p => p.kind === 'extractor'), domes: result.placements.filter(p => p.kind === 'dome'),
    baseline: result.drills.slice(0, 2).reduce((sum, d) => sum + d.oreTiles * 60 / (spec.time + ORES[ore].hardness * 50), 0),
    incompatible: result.warnings.includes('incompatible'), unpowered: result.warnings.includes('no-power'),
    bottleneck: result.output + 0.1 < result.potential, cost: result.placements.length,
  };
}
export function number(value: number, digits = 1) { return value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }); }
export type SavedPlan = { id: string; name: string; created: string; config: Config; ore: Ore; seed: number; anchor?: Point };
