import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { planMine } from '../mod/shared/engine';
import type { MineInput, Options } from '../mod/shared/engine';
import { DRILLS } from '../src/lib/planner';

const opts: Options = { conveyor: 'plastanium', water: true, power: true, overdrive: true, priority: 'output', waterMode: 'auto', routing: 'auto', trials: 12 };
function fixture(): MineInput {
  const width = 38, height = 30;
  return { width, height, ore: Array.from({ length: width * height }, (_, i) => { const x = i % width, y = Math.floor(i / width); return x >= 10 && x < 27 && y >= 9 && y < 23 ? 1 : 0; }), blocked: Array(width * height).fill(false), waterEfficiency: Array(width * height).fill(1), hardness: 1, drill: DRILLS.laser };
}

test('core: footprints never overlap or replace blocked cells', () => {
  const input = fixture(); input.blocked[18 + 15 * input.width] = true;
  const result = planMine(input, opts), used = new Set<number>();
  for (const p of result.placements) for (let y = p.y; y < p.y + p.size; y++) for (let x = p.x; x < p.x + p.size; x++) {
    const at = x + y * input.width;
    expect(x >= 0 && y >= 0 && x < input.width && y < input.height).toBe(true);
    expect(input.blocked[at]).toBe(false); expect(used.has(at)).toBe(false); used.add(at);
  }
});

test('core: bridge limits and identical endpoint types', () => {
  const result = planMine(fixture(), opts);
  for (const p of result.placements) if (p.link) {
    expect(p.x === p.link.x || p.y === p.link.y).toBe(true);
    expect(Math.abs(p.x - p.link.x) + Math.abs(p.y - p.link.y)).toBeLessThanOrEqual(p.block.startsWith('phase') ? 12 : 4);
    expect(result.placements.find(t => t.x === p.link!.x && t.y === p.link!.y)?.block).toBe(p.block);
  }
});

test('core: two un-fed plastanium loading docks per trunk', () => {
  const result = planMine(fixture(), opts), loaders = result.placements.filter(p => p.kind === 'loader');
  expect(loaders.length).toBeGreaterThan(0); expect(loaders.length % 2).toBe(0);
  for (const p of loaders) expect(result.placements.some(other => other.block === 'plastanium-conveyor' && other.x + [1, 0, -1, 0][other.rotation] === p.x && other.y + [0, -1, 0, 1][other.rotation] === p.y)).toBe(false);
});

test('core: one power entry and no node exceeds 15 links', () => {
  const result = planMine(fixture(), opts);
  expect(result.ports.filter(p => p.kind === 'power')).toHaveLength(1);
  for (const p of result.placements.filter(p => p.kind === 'power')) expect(p.links!.length).toBeLessThanOrEqual(14);
});

test('core: actual dome radius, separate filtered fuel lines', () => {
  const result = planMine(fixture(), opts), dome = result.placements.find(p => p.kind === 'dome')!;
  expect(dome).toBeTruthy();
  for (const d of result.drills) expect(d.boosted).toBe(Math.hypot(d.x + d.size / 2 - dome.x - 1.5, d.y + d.size / 2 - dome.y - 1.5) <= 25);
  expect(result.placements.filter(p => p.block === 'sorter').map(p => p.item).sort()).toEqual(['phase-fabric', 'silicon']);
  expect(result.warnings).toContain('dome-needs-fuel');
});

test('core: zero ground water never gives free water boost', () => {
  const input = fixture(); input.waterEfficiency.fill(0);
  const result = planMine(input, opts);
  expect(result.waterSupply).toBe(0); expect(result.drills.every(d => !d.watered)).toBe(true);
  expect(result.warnings).toContain('water-shortfall');
});

test('core: sealed drill is excluded and occupied ore stays uncovered', () => {
  const input = fixture(); input.blocked.fill(true);
  for (let y = 13; y < 16; y++) for (let x = 17; x < 20; x++) input.blocked[x + y * input.width] = false;
  const result = planMine(input, opts);
  expect(result.drills).toHaveLength(0); expect(result.output).toBe(0); expect(result.covered).toBe(0);
  expect(result.uncovered).toHaveLength(result.totalOre); expect(result.warnings).toContain('no-connected-drills');
});

test('core: missing power and insulating barriers cannot produce ore', () => {
  expect(planMine(fixture(), { ...opts, power: false }).output).toBe(0);
  const input = fixture(); input.insulated = Array(input.width * input.height).fill(true);
  const isolated = planMine(input, opts);
  expect(isolated.warnings).toContain('power-unreachable'); expect(isolated.output).toBe(0);
});

test('core: individual item ports and external exits cannot overload', () => {
  const input = fixture(); input.drill = DRILLS.blast;
  const result = planMine(input, { ...opts, conveyor: 'titanium' });
  for (const d of result.drills) { expect(d.outletFlows.length).toBeGreaterThan(0); for (const p of d.outletFlows) expect(p.load).toBeLessThanOrEqual(p.capacity + 1e-8); }
  for (const p of result.ports.filter(p => p.kind === 'items')) expect(p.load).toBeLessThanOrEqual(p.capacity + 1e-8);
  expect(result.output).toBeLessThanOrEqual(result.potential + 1e-8);
});

test('core: ordinary routing has zero phases; every automatic phase is justified', () => {
  const basic = planMine(fixture(), { ...opts, routing: 'bridge' });
  expect(basic.phaseConnections).toBe(0);
  const automatic = planMine(fixture(), opts);
  for (const p of automatic.placements) if (p.link && p.block.startsWith('phase')) expect(p.reason).toBe('obstacle-no-basic-route');
});

test('core: one external water input and a conditional supply warning', () => {
  const result = planMine(fixture(), { ...opts, waterMode: 'external' });
  expect(result.ports.filter(p => p.kind === 'water')).toHaveLength(1);
  expect(result.waterSupply).toBe(0); expect(result.externalWaterDemand).toBeGreaterThan(0);
  expect(result.warnings).toContain('external-water');
});

test('core: ES5 CommonJS equals TypeScript and never mutates input', () => {
  const input = fixture(), before = JSON.stringify(input), options = { ...opts, trials: 4 };
  const sandbox = { exports: {} as { planMine: typeof planMine } };
  runInNewContext(readFileSync('mod/scripts/engine.js', 'utf8'), sandbox);
  expect(JSON.stringify(sandbox.exports.planMine(input, options))).toBe(JSON.stringify(planMine(input, options)));
  expect(JSON.stringify(input)).toBe(before);
  expect(readFileSync('mod/scripts/main.js', 'utf8')).not.toMatch(/\.plans\s*\(/);
});