import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Crosshair, Grid2X2, Layers3, Maximize2, Minus, Plus, RotateCcw, X, Zap, Droplets, ArrowUpRight } from 'lucide-react';
import { DRILLS, GRID_H, GRID_W, ORES, TILE, number } from '../lib/planner';
import type { Config, Ore, Plan, Point, TerrainTile } from '../lib/planner';
import type { BlockPlan } from '../../mod/shared/engine';

type Props = {
  config: Config; ore: Ore; plan: Plan; terrain: TerrainTile[]; busy: boolean;
  mode: 'before' | 'after'; setMode: (mode: 'before' | 'after') => void;
  onOreChange: (ore: Ore) => void; onRegenerate: () => void; onPlace: (point: Point) => void; anchor?: Point;
};
const labels: Record<string, string> = { 'phase-conveyor': 'Фазовый конвейер', 'bridge-conveyor': 'Мостовой конвейер', 'phase-conduit': 'Фазовый трубопровод', 'bridge-conduit': 'Мостовой трубопровод', 'water-extractor': 'Гидронасос', 'power-node-large': 'Большой силовой узел', 'overdrive-dome': 'Купол ускорения' };

export default function MineMap({ config, ore, plan, terrain, busy, mode, setMode, onOreChange, onRegenerate, onPlace, anchor }: Props) {
  const [zoom, setZoom] = useState(100), [grid, setGrid] = useState(false), [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState<Point | null>(null), [layersOpen, setLayersOpen] = useState(false);
  const [showPower, setShowPower] = useState(true), [showRange, setShowRange] = useState(true), [showWater, setShowWater] = useState(true), [showBridges, setShowBridges] = useState(true), [showUncovered, setShowUncovered] = useState(true);
  const frameRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null), uid = useId().replace(/:/g, '');
  const after = mode === 'after', drill = DRILLS[config.drill], W = GRID_W * TILE, H = GRID_H * TILE;
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(frameRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select') || []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
      if (event.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [fullscreen]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setLayersOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const texture = useMemo(() => terrain.map(t => <g key={`${t.x}-${t.y}`}><image href={`/sprites/basalt${t.variant}.png`} x={t.x * TILE} y={t.y * TILE} width={TILE} height={TILE} opacity={0.4 + t.shade * 0.12} />{t.ore && <image href={`/sprites/ore-${ore}${t.variant}.png`} x={t.x * TILE} y={t.y * TILE} width={TILE} height={TILE} opacity="0.9" />}{t.wall && <image href="/sprites/stone-wall1.png" x={t.x * TILE} y={t.y * TILE} width={TILE} height={TILE} />}</g>), [terrain, ore]);
  function getPoint(event: { clientX: number; clientY: number }): Point | null {
    const matrix = svgRef.current?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = Math.floor((p.x - W / 2) / (zoom / 100) / TILE + GRID_W / 2), y = Math.floor((p.y - H / 2) / (zoom / 100) / TILE + GRID_H / 2);
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H ? { x, y } : null;
  }
  function renderBlock(p: BlockPlan, index: number) {
    if (!showWater && (p.kind.includes('liquid') || p.kind === 'water-port' || p.kind === 'extractor')) return null;
    if (!showPower && p.kind === 'power') return null;
    const x = p.x * TILE, y = p.y * TILE, size = p.size * TILE;
    const belt = p.block.includes('conveyor') && !p.block.includes('phase') && !p.block.includes('bridge');
    return <g key={`${p.block}-${p.x}-${p.y}`} className={`map-block block-${p.kind}`}>
      <title>{labels[p.block] || (p.kind === 'drill' ? `${drill.name}: ${number(plan.drills.find(d => d.x === p.x && d.y === p.y)?.rate || 0)} предм./с` : p.kind === 'loader' ? 'Отдельный загрузчик: не более 20 предм./с без ускорения' : p.block)} · {p.x}, {p.y}{p.reason && ` · ${p.reason === 'explicit-phase-mode' ? 'Фазовый режим выбран вручную' : 'Обычный путь не найден: препятствия или нет свободных посадок в пределах 4 клеток'}`}</title>
      <rect x={x + 1} y={y + 2} width={size} height={size} fill="#070d06" opacity="0.55" />
      {belt ? <g transform={`translate(${x + TILE / 2} ${y + TILE / 2}) rotate(${-p.rotation * 90})`}><rect x="-9" y="-9" width="18" height="18" fill={p.block === 'plastanium-conveyor' ? '#536748' : '#4e6077'} stroke={p.block === 'plastanium-conveyor' ? '#8da876' : '#8cadd0'} strokeWidth="0.8" /><path d="m-4-5 5 5-5 5m5-10 5 5-5 5" fill="none" stroke="#c1d9a6" strokeWidth="1.5" opacity="0.8" />{p.kind === 'loader' && <circle cx="-4" cy="0" r="4" fill="#d9edb6" stroke="#41552b" strokeWidth="1.2" />}{p.kind === 'exit' && <path d="m-3-3 6 6m0-6-6 6" stroke="#f1f6cc" strokeWidth="1.2" />}</g> : <>
        <image href={`/sprites/${p.block}.png`} x={x} y={y} width={size} height={size} />
        {p.kind === 'drill' && <><g className={after && !plan.unpowered && !plan.incompatible ? 'drill-rotator' : ''} style={{ transformOrigin: `${x + size / 2}px ${y + size / 2}px`, animationDelay: `${index * -0.3}s` }}><image href={`/sprites/${drill.sprite}-rotator.png`} x={x} y={y} width={size} height={size} /></g><image href={`/sprites/${drill.sprite}-top.png`} x={x} y={y} width={size} height={size} /><rect x={x + size / 2 - 2} y={y + size / 2 - 2} width="4" height="4" fill={ORES[ore].color} /></>}
        {p.kind === 'extractor' && <><image href="/sprites/water-extractor-rotator.png" x={x} y={y} width={size} height={size} /><image href="/sprites/water-extractor-top.png" x={x} y={y} width={size} height={size} /></>}
      </>}
      {p.kind === 'drill' && showRange && plan.drills.find(d => d.x === p.x && d.y === p.y)?.boosted && <circle cx={x + size - 5} cy={y + 5} r="2" fill="#e4edb2" />}
    </g>;
  }
  const placements = after ? plan.placements : plan.placements.filter(p => p.kind === 'drill').slice(0, 2);
  return <section ref={frameRef} className={`map-frame ${fullscreen ? 'map-fullscreen' : ''}`} aria-label="Интерактивная карта жилы" role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen ? true : undefined}>
    <div className="map-toolbar"><div className="map-title"><Grid2X2 size={15} /><span>Карта жилы</span><span className="map-title-divider" /><span className="map-dimensions">{GRID_W} × {GRID_H}</span></div><div className="map-toolbar-right"><div className="comparison-switch" aria-label="Сравнение схемы"><button className={!after ? 'selected' : ''} onClick={() => setMode('before')}>До</button><button className={after ? 'selected' : ''} onClick={() => setMode('after')}>После<span className="small-dot" /></button></div>{fullscreen && <button className="icon-button" aria-label="Закрыть полноэкранную карту" onClick={() => setFullscreen(false)}><X size={17} /></button>}</div></div>
    <div className="map-viewport dense-map-viewport"><svg ref={svgRef} className="mine-svg" viewBox={`-26 -48 ${W + 52} ${H + 74}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${ORES[ore].adjective}. Покрыто ${plan.coverage}% руды. Нажми на руду, чтобы выбрать первый бур.`} onPointerMove={event => setHover(getPoint(event))} onPointerLeave={() => setHover(null)} onClick={event => { const point = getPoint(event); if (point && terrain.some(t => t.x === point.x && t.y === point.y && t.ore)) onPlace(point); }}>
      <defs><pattern id={`${uid}-grid`} width={TILE} height={TILE} patternUnits="userSpaceOnUse"><path d={`M${TILE} 0H0V${TILE}`} fill="none" stroke="#a9bf8e" strokeWidth="0.5" opacity="0.3" /></pattern><radialGradient id={`${uid}-shade`}><stop offset="45%" stopColor="#15200e" stopOpacity="0" /><stop offset="100%" stopColor="#0d1508" stopOpacity="0.5" /></radialGradient></defs>
      <rect width={W} height={H} fill="#1b2516" /><g transform={`translate(${W / 2} ${H / 2}) scale(${zoom / 100}) translate(${-W / 2} ${-H / 2})`} style={{ transition: 'transform 300ms ease' }}>{texture}
        {grid && <rect width={W} height={H} fill={`url(#${uid}-grid)`} />}
        {after && showUncovered && plan.uncovered.map(p => <rect key={`uncovered-${p.x}-${p.y}`} x={p.x * TILE + 2} y={p.y * TILE + 2} width={TILE - 4} height={TILE - 4} fill="#e0ae6316" stroke="#d0a66b" strokeWidth="0.8" opacity="0.7"><title>Руда без бура: служебный доступ или неподходящее место</title></rect>)}
        {after && showRange && plan.domes.map(d => <g key={`range-${d.x}-${d.y}`}><circle cx={(d.x + 1.5) * TILE} cy={(d.y + 1.5) * TILE} r={25 * TILE} fill="#d7eaa305" stroke="#c7df92" strokeDasharray="7 7" strokeWidth="1.4" className="range-circle" /><path d={`M${(d.x + 1.5) * TILE} ${(d.y + 1.5) * TILE}h${25 * TILE}`} stroke="#bfdb8335" strokeDasharray="3 6" /><text x={(d.x + 3.5) * TILE} y={(d.y + 1.3) * TILE} fill="#c7df92" fontSize="10" fontFamily="monospace">R = 25</text></g>)}
        {after && plan.connections.filter(c => c.kind === 'power' ? showPower : c.kind === 'liquid-bridge' ? showWater : showBridges).map((c, i) => { const power = c.kind === 'power', water = c.kind === 'liquid-bridge', offset = power ? 0 : 0.5; return <path key={`link-${i}`} d={`M${(c.from.x + offset) * TILE} ${(c.from.y + offset) * TILE}L${(c.to.x + offset) * TILE} ${(c.to.y + offset) * TILE}`} fill="none" stroke={power ? '#e3c575' : water ? '#73bccb' : '#c1cf9c'} strokeWidth={power ? 1 : water ? 2.1 : 2.5} strokeDasharray={power ? '3 5' : water ? '4 3' : '7 3'} opacity={power ? 0.25 : 0.45} />; })}
        <AnimatePresence>{placements.map(renderBlock)}</AnimatePresence>
        {after && plan.ports.map((port, i) => {
          const color = port.kind === 'power' ? '#f0cf77' : port.kind === 'water' ? '#7dccdf' : port.kind === 'fuel' ? '#cdb4ec' : '#d5e9a4';
          const label = port.kind === 'power' ? 'ВХОД ЭНЕРГИИ СЮДА' : port.kind === 'water' ? 'ВХОД ВОДЫ СЮДА' : port.kind === 'fuel' ? port.item === 'silicon' ? 'ВХОД КРЕМНИЯ' : 'ВХОД ФАЗОВОЙ ТКАНИ' : `ВЫХОД РУДЫ · ${number(port.load)} / ${port.capacity} предм./с`;
          const x = (port.x + 0.5) * TILE, y = (port.y + 0.5) * TILE, outward = port.direction === 2 ? -1 : 1;
          return <g key={`port-${i}`} className="service-marker" data-kind={port.kind} fill={color} stroke={color}><title>{label}</title><circle cx={x} cy={y} r={port.kind === 'items' ? 6 : 11} fill="#121a12" strokeWidth="1.5" />{port.kind === 'items' ? <path d={`M${x - outward * 4} ${y}h${outward * 8}m${-outward * 3}-3 ${outward * 3} 3 ${-outward * 3} 3`} fill="none" strokeWidth="1.5" /> : <><path d={`M${x} ${y - 32}v18m-3-4 3 4 3-4`} fill="none" strokeWidth="1.5" />{port.kind === 'power' ? <path d={`m${x + 2} ${y - 6}-6 7h5l-2 5 6-8h-5Z`} strokeWidth="0.5" /> : port.kind === 'water' ? <path d={`M${x} ${y - 6}q-9 12 0 12q9 0 0-12`} strokeWidth="0.5" /> : <image href={`/sprites/${port.item}.png`} x={x - 6} y={y - 6} width="12" height="12" />}<text x={x} y={-14 - (i % 2) * 15} textAnchor="middle" fontSize="9" stroke="none" fontFamily="Manrope, sans-serif" fontWeight="700">{port.kind === 'power' ? 'ЭНЕРГИЯ' : port.kind === 'water' ? 'ВОДА' : port.item === 'silicon' ? 'КРЕМНИЙ' : 'ФАЗ. ТКАНЬ'}</text></>}</g>;
        })}
        {anchor && <rect x={anchor.x * TILE} y={anchor.y * TILE} width={drill.size * TILE} height={drill.size * TILE} fill="none" stroke="#f1eaa8" strokeWidth="1.6" strokeDasharray="5 3" />}
        {hover && <rect x={hover.x * TILE} y={hover.y * TILE} width={drill.size * TILE} height={drill.size * TILE} fill="#d6efa315" stroke="#e6f3b9" strokeWidth="1" pointerEvents="none" />}
      </g><rect width={W} height={H} fill={`url(#${uid}-shade)`} pointerEvents="none" /></svg>
      <div className="map-location"><span className="map-location-cross">+</span><span>ДЕМО-ЖИЛА <span className="faint">/</span> SECTOR {ore === 'copper' ? '024' : ore === 'titanium' ? '078' : '164'}</span></div>
      <div className="map-resource"><span style={{ background: ORES[ore].color }} /><select aria-label="Ресурс жилы" value={ore} onChange={event => onOreChange(event.target.value as Ore)}>{Object.entries(ORES).map(([value, item]) => <option key={value} value={value}>{item.adjective}</option>)}</select><ChevronDown size={12} /></div>
      <div className="map-controls-left"><button className={`map-control ${grid ? 'active' : ''}`} title="Показать сетку" aria-label="Показать сетку" aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid2X2 size={15} /></button><button className="map-control" title="Другая жила" aria-label="Сгенерировать другую жилу" onClick={onRegenerate}><RotateCcw size={14} /></button><div className="layer-control-wrap"><button className={`map-control ${layersOpen ? 'active' : ''}`} title="Слои карты" aria-label="Слои карты" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><Layers3 size={15} /></button>{layersOpen && <div className="layers-popover"><span>Слои и диагностика</span>{[{ label: 'Энергосеть', value: showPower, set: setShowPower }, { label: 'Радиус купола', value: showRange, set: setShowRange }, { label: 'Вода и насосы', value: showWater, set: setShowWater }, { label: 'Мостовые связи', value: showBridges, set: setShowBridges }, { label: 'Оставшаяся руда', value: showUncovered, set: setShowUncovered }].map(layer => <button key={layer.label} onClick={() => layer.set(!layer.value)}><span>{layer.label}</span>{layer.value && <Check size={13} />}</button>)}</div>}</div></div>
      <div className="map-zoom"><button aria-label="Уменьшить масштаб" onClick={() => setZoom(Math.max(75, zoom - 25))} disabled={zoom === 75}><Minus size={13} /></button><span>{zoom}%</span><button aria-label="Увеличить масштаб" onClick={() => setZoom(Math.min(200, zoom + 25))} disabled={zoom === 200}><Plus size={13} /></button><span className="zoom-divider" /><button aria-label="Сбросить масштаб" onClick={() => setZoom(100)}><Crosshair size={14} /></button></div>
      {busy && <motion.div className="map-scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="scan-line" /><div className="scanning-label"><span className="loading-spinner" />Плотная расстановка и проверка маршрутов</div></motion.div>}
    </div><div className="map-footer"><div className="map-legend"><span><i className="legend-drill" />{plan.drills.length} буров</span><span><i className="legend-water" />{plan.extractors.length} насосов</span><span><i className="legend-range" />{plan.covered}/{plan.totalOre} клеток</span><span className="phase-count">Фазовых: {plan.phaseConnections}</span></div><button className="icon-button" aria-label="Развернуть карту" onClick={() => setFullscreen(!fullscreen)}><Maximize2 size={15} /></button></div>
    <div className="service-key"><span><Zap size={11} />Энергия извне</span>{plan.ports.some(p => p.kind === 'water') && <span><Droplets size={11} />Вход воды</span>}{plan.domes.length > 0 && <span><i />Два входа купола</span>}<span><ArrowUpRight size={11} />Выходы руды</span></div>
  </section>;
}
