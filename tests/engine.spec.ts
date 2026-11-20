import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { planMine } from '../mod/shared/engine';
import { createPlan, DEFAULT_CONFIG, DRILLS, generateTerrain, GRID_H, GRID_W } from '../src/lib/planner';
import type { Config } from '../src/lib/planner';

test('dense layouts have no overlaps, valid links, real docks and bounded flows', () => {
  let checked = 0;
  for (const drill of ['laser', 'blast', 'pneumatic'] as const) {
    for (const conveyor of ['titanium', 'plastanium'] as const) {
      for (const water of [false, true]) {
        const config: Config = { ...DEFAULT_CONFIG, drill, conveyor, water };
        const plan = createPlan(config, 'copper', generateTerrain(4));
        const occupied = new Set<string>();
        for (const p of plan.placements) {
          for (let y = p.y; y < p.y + p.size; y++) for (let x = p.x; x < p.x + p.size; x++) {
            assert(x >= 0 && x < GRID_W && y >= 0 && y < GRID_H, 'within map');
            const cell = `${x},${y}`;
            assert(!occupied.has(cell), `${drill}/${conveyor}/${water}: overlap ${cell}`);
            occupied.add(cell); checked++;
          }
          if (p.link) {
            assert(p.x === p.link.x || p.y === p.link.y, 'bridge axis');
            assert(Math.abs(p.x - p.link.x) + Math.abs(p.y - p.link.y) <= (p.block.includes('phase') ? 12 : 4), 'bridge range');
            assert.equal(plan.placements.find(t => t.x === p.link!.x && t.y === p.link!.y)?.block, p.block, 'matching bridge block type');
          }
          if (p.kind === 'power') assert(p.links!.length <= 15, 'node link cap');
          if (p.kind === 'loader') assert(!plan.placements.some(other => other.block === p.block && other.x + [1, 0, -1, 0][other.rotation] === p.x && other.y + [0, -1, 0, 1][other.rotation] === p.y), 'no stack input into a loading dock');
        }
        for (const port of plan.ports.filter(p => p.kind === 'items')) assert(port.load <= port.capacity + 0.001, 'dock capacity');
        for (const group of new Set(plan.ports.filter(p => p.kind === 'items').map(p => p.group))) {
          const load = plan.ports.filter(p => p.kind === 'items' && p.group === group).reduce((sum, p) => sum + p.load, 0);
          assert(load <= (conveyor === 'titanium' ? 11.001 : 40.001), 'trunk capacity');
        }
        for (const d of plan.drills) if (d.boosted) assert(plan.domes.some(p => Math.hypot(d.x + d.size / 2 - p.x - 1.5, d.y + d.size / 2 - p.y - 1.5) <= 25 + d.size / 2), 'actual dome radius');
        assert.equal(plan.covered + plan.uncovered.length, plan.totalOre);
        assert(plan.output <= plan.upperBound + 0.001, 'upper bound');
        assert(plan.drills.length > 8, 'dense packing');
      }
    }
  }
  expect(checked).toBeGreaterThan(2000);
});

test('airblast boost and water demand differ from laser, input is immutable', () => {
  const terrain = generateTerrain(6), snapshot = JSON.stringify(terrain);
  expect(DRILLS.blast.boost ** 2).toBeCloseTo(3.24);
  expect(DRILLS.laser.boost ** 2).toBeCloseTo(2.56);
  const result = planMine({ width: GRID_W, height: GRID_H, ore: terrain.map(t => t.ore ? 1 : 0), blocked: terrain.map(t => t.wall), waterEfficiency: terrain.map(() => 0), hardness: 1, drill: DRILLS.blast }, { ...DEFAULT_CONFIG, waterMode: 'auto' });
  expect(result.drills.every(d => !d.watered)).toBe(true);
  expect(result.waterSupply).toBe(0);
  expect(result.warnings).toContain('water-shortfall');
  expect(JSON.stringify(terrain)).toBe(snapshot);
});
