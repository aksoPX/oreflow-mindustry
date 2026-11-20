import { mkdirSync, writeFileSync } from 'node:fs';
import { planMine } from '../mod/shared/engine';
import { DRILLS } from '../src/lib/planner';
import type { MineInput, Options } from '../mod/shared/engine';

const width = 38, height = 30;
const input: MineInput = { width, height, ore: Array.from({ length: width * height }, (_, i) => { const x = i % width, y = Math.floor(i / width); return x >= 10 && x < 27 && y >= 9 && y < 23 ? 1 : 0; }), blocked: Array(width * height).fill(false), waterEfficiency: Array(width * height).fill(1), hardness: 1, drill: DRILLS.laser };
const options: Options = { conveyor: 'plastanium', water: true, power: true, overdrive: true, priority: 'output', waterMode: 'auto', routing: 'auto', trials: 12 };
mkdirSync('.cache/parity', { recursive: true });
writeFileSync('.cache/parity/input.json', JSON.stringify({ input, options }));
writeFileSync('.cache/parity/typescript.json', JSON.stringify(planMine(input, options)));