import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Info } from 'lucide-react';
import { DRILLS, number } from '../lib/planner';
import type { Config, Plan } from '../lib/planner';

const warningLabels: Record<string, string> = {
  'water-shortfall': 'Часть буров не получила достаточной воды. Для них посчитана сухая добыча.',
  'unrouted-drill': 'Буры без допустимого вывода исключены, а не оставлены декоративными блоками.',
  'power-unreachable': 'Не все потребители соединены узлами. Питание необходимо проверить в игре.',
  'no-dome-space': 'Для купола и входов снабжения не найдено свободного места.',
  'external-water': 'Режим внешней воды: подключи воду к каждому отмеченному жидкостному порту.',
  'water-needs-power': 'Без электросети гидронасосы не работают. Вода не учитывается как усиление.',
  'no-power': 'Этому буру требуется электричество. Выход сейчас равен нулю.',
  incompatible: 'Выбранный бур не достигает твёрдости этой руды.',
};

export default function PlanReport({ plan, config }: { plan: Plan; config: Config }) {
  const [open, setOpen] = useState(false);
  const groups = new Set(plan.ports.filter(p => p.kind === 'items').map(p => p.group)).size;
  return <section className="plan-report">
    <button className="report-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span><Check size={14} />Проверка схемы<span className="report-trials">{plan.tried} компоновок</span></span><ChevronDown size={14} className={open ? 'rotate-180' : ''} /></button>
    {open && <div className="report-details"><dl className="report-values">
      <div><dt>Руда под бурами</dt><dd>{plan.covered} / {plan.totalOre} клеток <span>{plan.coverage}%</span></dd></div>
      <div><dt>Независимые выходы</dt><dd>{groups} × {config.conveyor === 'plastanium' ? '40' : '11'} предм./с <span>до ускорения</span></dd></div>
      <div><dt>Вода: спрос / производство</dt><dd>{number(plan.waterDemand)} / {number(plan.waterSupply)} ед./с</dd></div>
      <div><dt>Питание извне</dt><dd>{number(plan.power, 0)} ед./с</dd></div>
      {config.overdrive && <div><dt>Буры в радиусе купола</dt><dd>{plan.domeCoverage} / {plan.drills.length}<span>25 клеток, ×2,5</span></dd></div>}
    </dl><p className="report-explanation">Оставшиеся {plan.uncovered.length} клеток отмечены янтарным. Это доступ к разгрузке, воде или клетки, для которых поиск не нашёл допустимого бура. Полное покрытие и абсолютный максимум не заявлены.</p>
    <div className="report-conditions"><Info size={14} /><p>Подключи выходы к ядру или хранилищу и подай энергию на узлы.{plan.domes.length > 0 && ' Для купола нужны два внешних входа: по 0,2 фазовой ткани и кремния в секунду.'} Производительность учитывает воду ×{number(DRILLS[config.drill].boost ** 2, 2)} только у снабжённых буров. Это модель, не замер реального трафика.</p></div>
    {plan.warnings.map(w => <p className="report-warning" key={w}><Info size={12} />{warningLabels[w] || w}</p>)}
    <a className="text-button" href="https://github.com/Anuken/Mindustry/blob/v146/core/src/mindustry/content/Blocks.java" target="_blank" rel="noreferrer">Параметры из исходников Mindustry<ArrowUpRight size={13} /></a>
    </div>}
  </section>;
}