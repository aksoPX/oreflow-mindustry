import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Box, Check,
  CheckCheck, ChevronDown, ChevronRight, ChevronsUp, CircleHelp, Clock3,
  Copy, Cpu, Download, Droplets, ExternalLink, FileJson, FolderOpen,
  GitBranch, Code2 as Github, Hammer, Info, Layers3, Lightbulb, Menu, MousePointer2,
  Orbit, Pickaxe, Plus, Radar, Route, Save, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Trash2, TrendingUp, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import MineMap from './components/MineMap';
import PlanReport from './components/PlanReport';
import Downloads from './components/Downloads';
import { createPlan, DEFAULT_CONFIG, DRILLS, generateTerrain, number, ORES } from './lib/planner';
import type { Config, Drill, Ore, Point, SavedPlan } from './lib/planner';
import { IDEAS } from './lib/ideas';
import type { Idea } from './lib/ideas';

type Page = 'planner' | 'blueprints' | 'ideas' | 'guide' | 'downloads';
type ModalType = 'save' | 'suggest' | 'about' | null;
type Toast = { id: number; message: string };
const pageNames: Record<Page, string> = {
  planner: 'Умная добыча', blueprints: 'Мои схемы', ideas: 'Избранные идеи', guide: 'Руководство', downloads: 'Скачать мод',
};
const ideaIcons: Record<Idea['icon'], LucideIcon> = {
  upgrade: ChevronsUp, chart: BarChart3, shield: ShieldCheck, power: Zap,
  route: Route, copy: Copy, radar: Radar, clock: Clock3,
};

function getStored<T,>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    return value as T;
  } catch { return fallback; }
}

function OreLogo() {
  return <svg width="34" height="38" viewBox="0 0 34 38" fill="none" aria-hidden="true"><path d="M17 1 33 10.2v17.6L17 37 1 27.8V10.2L17 1Z" fill="currentColor" /><path d="m17 8 10 5.8v10.5L17 30l-10-5.7V13.8L17 8Z" fill="#1a1e17" /><path d="m7 13.8 10 5.7 10-5.7M17 19.5V30" stroke="currentColor" strokeWidth="3" /><path d="m17 1 1.6 8.1M33 10.2l-6 3.6M1 10.2l6 3.6" stroke="#1a1e17" strokeWidth="1.3" /></svg>;
}

function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex="0"]') ?? []).filter(el => !el.hasAttribute('disabled'));
    const initial = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0];
    initial?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, []);
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.2 }}>
      <div className="modal-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button className="icon-button modal-close" aria-label="Закрыть окно" onClick={onClose}><X size={19} /></button></div>
      {children}
    </motion.div>
  </motion.div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

function IdeaPreview({ idea, onClick, index = 0 }: { idea: Idea; onClick: () => void; index?: number }) {
  const Icon = ideaIcons[idea.icon];
  return <motion.button className={`idea-preview accent-${idea.color}`} onClick={onClick} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07, duration: 0.35 }}>
    <div className="idea-preview-top"><div className="idea-glyph"><Icon size={22} strokeWidth={1.6} /></div><ArrowUpRight size={17} className="idea-arrow" /></div>
    <h3>{idea.title}</h3><p>{idea.description}</p><span className="idea-category">{idea.category}<span className="idea-category-line" /></span>
  </motion.button>;
}

function App() {
  const [page, setPage] = useState<Page>('planner');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [config, setConfig] = useState<Config>({ ...DEFAULT_CONFIG });
  const [applied, setApplied] = useState<Config>({ ...DEFAULT_CONFIG });
  const [ore, setOre] = useState<Ore>('copper');
  const [seed, setSeed] = useState(4);
  const [anchor, setAnchor] = useState<Point>();
  const [appliedAnchor, setAppliedAnchor] = useState<Point>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'before' | 'after'>('after');
  const [modal, setModal] = useState<ModalType>(null);
  const [activeIdea, setActiveIdea] = useState<Idea | null>(null);
  const [saved, setSaved] = useState<SavedPlan[]>(() => getStored<SavedPlan[]>('oreflow-plans', []).filter(item => item && typeof item.name === 'string' && typeof item.id === 'string' && item.config && item.config.drill in DRILLS && item.ore in ORES && Number.isFinite(item.seed)).slice(0, 100));
  const [favorites, setFavorites] = useState<string[]>(() => getStored('oreflow-v2-favorites', ['route']));
  const [customIdeas, setCustomIdeas] = useState<Idea[]>(() => getStored('oreflow-ideas', []));
  const [saveName, setSaveName] = useState('');
  const [suggestName, setSuggestName] = useState('');
  const [suggestDescription, setSuggestDescription] = useState('');
  const [suggestCategory, setSuggestCategory] = useState<Idea['category']>('Строительство');
  const [ideaFilter, setIdeaFilter] = useState('Все идеи');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const calculateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terrain = useMemo(() => generateTerrain(seed), [seed]);
  const plan = useMemo(() => createPlan(applied, ore, terrain, appliedAnchor), [applied, ore, terrain, appliedAnchor]);
  const dirty = JSON.stringify(config) !== JSON.stringify(applied) || JSON.stringify(anchor) !== JSON.stringify(appliedAnchor);
  const ideas = [...IDEAS, ...customIdeas];
  const visibleIdeas = ideas.filter(idea => (ideaFilter === 'Все идеи' || (ideaFilter === 'Избранное' ? favorites.includes(idea.id) : idea.category === ideaFilter)) && `${idea.title} ${idea.description}`.toLowerCase().includes(query.toLowerCase()));
  const notify = (message: string) => setToast({ id: Date.now(), message });

  useEffect(() => { try { localStorage.setItem('oreflow-plans', JSON.stringify(saved)); } catch { notify('Не удалось сохранить данные: хранилище браузера недоступно.'); } }, [saved]);
  useEffect(() => { try { localStorage.setItem('oreflow-v2-favorites', JSON.stringify(favorites)); } catch { /* Favorites remain available for this session. */ } }, [favorites]);
  useEffect(() => { try { localStorage.setItem('oreflow-ideas', JSON.stringify(customIdeas)); } catch { notify('Не удалось сохранить идею в браузере.'); } }, [customIdeas]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 4200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => () => { if (calculateTimer.current) clearTimeout(calculateTimer.current); }, []);
  useEffect(() => { const media = window.matchMedia('(max-width: 760px)'); const change = () => setIsMobile(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => {
    if (!mobileMenu) return;
    const previous = document.activeElement as HTMLElement | null;
    const elements = () => Array.from(document.querySelectorAll<HTMLElement>('.sidebar button'));
    elements()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenu(false);
      if (event.key === 'Tab') { const list = elements(), first = list[0], last = list[list.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [mobileMenu]);

  function navigate(next: Page) { setPage(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function update<K extends keyof Config>(key: K, value: Config[K]) { setConfig(current => ({ ...current, [key]: value })); }
  function calculate(nextAnchor = anchor) {
    if (busy) return;
    setBusy(true);
    calculateTimer.current = setTimeout(() => { setApplied({ ...config }); setAppliedAnchor(nextAnchor); setMode('after'); setBusy(false); notify('Готово. Новая схема рассчитана.'); }, 850);
  }
  function placeDrill(point: Point) {
    setAnchor(point);
    if (config.automatic) calculate(point);
    else notify('Область выбрана. Нажми «Рассчитать схему».');
  }
  function startSave() { setSaveName(`${ORES[ore].name} · ${DRILLS[applied.drill].name.toLowerCase()}`); setModal('save'); }
  function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!saveName.trim()) return;
    setSaved(current => [{ id: crypto.randomUUID(), name: saveName.trim(), created: new Date().toISOString(), config: { ...applied }, ore, seed, anchor: appliedAnchor }, ...current]);
    setModal(null); notify('Схема сохранена в твоей мастерской.');
  }
  function loadPlan(item: SavedPlan) {
    if (calculateTimer.current) clearTimeout(calculateTimer.current);
    setBusy(false); setConfig({ ...DEFAULT_CONFIG, ...item.config }); setApplied({ ...DEFAULT_CONFIG, ...item.config }); setOre(item.ore); setSeed(item.seed); setAnchor(item.anchor); setAppliedAnchor(item.anchor); setMode('after'); navigate('planner'); notify(`Открыта схема «${item.name}».`);
  }
  function exportPlan(item?: SavedPlan) {
    const data = item ?? { name: saveName || `${ORES[ore].name} · Oreflow`, config: applied, ore, seed, anchor: appliedAnchor };
    const payload = { format: 'oreflow-plan', version: 1, note: 'Web planner settings. Not a Mindustry .msch schematic or an installable mod.', ...data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `oreflow-${data.ore}-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Настройки экспортированы в JSON. Это не файл .msch.');
  }
  function submitIdea(event: FormEvent) {
    event.preventDefault();
    if (!suggestName.trim() || !suggestDescription.trim()) return;
    setCustomIdeas(current => [...current, { id: `custom-${crypto.randomUUID()}`, title: suggestName.trim(), description: suggestDescription.trim(), category: suggestCategory, icon: 'copy', color: 'lime', detail: suggestDescription.trim(), features: ['Твоя идея сохранена в этом браузере', 'Концепцию можно уточнить перед разработкой'], limitation: 'Это локальная заметка, она не отправляется разработчикам или на сервер.' }]);
    setModal(null); setSuggestName(''); setSuggestDescription(''); setIdeaFilter('Все идеи'); setQuery(''); navigate('ideas'); notify('Твоя идея добавлена в мастерскую.');
  }
  function toggleFavorite(id: string) { setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }

  const enhancements: { key: 'water' | 'power' | 'overdrive'; icon: LucideIcon; title: string; description: string; hint: string }[] = [
    { key: 'water', icon: Droplets, title: 'Подача воды', description: 'Гидронасосы и жидкостные мосты', hint: 'Гидронасос 2×2 выдаёт 6,6 воды/с на обычном грунте. Рядом с буром ставится напрямую, дальше соединяется настоящими мостами.' },
    { key: 'power', icon: Zap, title: 'Электросеть', description: 'Узлы и соединения', hint: 'Лазерные и воздушные буры требуют питания. Сам источник энергии находится за границей схемы.' },
    { key: 'overdrive', icon: Orbit, title: 'Купол ускорения', description: 'Больше руды с каждой клетки', hint: 'Радиус 25 клеток. Усиление ×2,5 только в зоне действия. Два внешних входа снабжения: фазовая ткань и кремний по 0,2/с.' },
  ];

  const faqs = [
    { q: 'Как установить мод, а не только открыть сайт?', a: 'На странице «Скачать мод» есть готовый oreflow-mod-0.2.0.zip. Mindustry поддерживает нативные JavaScript-моды: импортируй ZIP через «Модификации → Импортировать мод» и перезапусти игру. Компилятор, Java JDK и распаковка не нужны. В полном проекте тот же готовый ZIP лежит отдельно в папке mod/.' },
    { q: 'Почему нельзя честно обещать 100% рабочее покрытие?', a: 'Буры действительно можно ставить вплотную. Но каждому нужен принимающий предметы сосед, а усиленному буру ещё и вода. Полностью замурованный внутренний бур не передаст предметы через соседний бур. Поиск перебирает плотные компоновки, резервирует порты, прокладывает мосты и исключает буры без вывода. Янтарным показаны непокрытые клетки. Это наилучший найденный вариант, не доказательство глобального максимума.' },
    { q: 'Когда лучше гидронасос рядом, а когда трубопроводы?', a: 'На обычном грунте гидронасос 2×2 выдаёт 6,6 воды/с и потребляет 90 энергии/с. Лазерному буру нужно 4,8 воды/с, воздушному 6. Прямое соседство используется, если насос помещается, снабжает выбранный бур и не делит воду с чужим буром. Иначе насос переносится на свободную площадку, а вода подводится отдельными мостовыми или фазовыми трубопроводами. Учитывается водоносность пола и ускорение насоса, а не только бура.' },
    { q: 'Как учитываются купол и его радиус?', a: 'У купола range=200 игровых единиц, то есть 25 клеток, и speedBoost=2,5. Круг рисуется от реальной позиции купола. В игре проверяется расстояние с учётом половины hitSize целевого здания. Купол не ускоряет всё поле просто потому, что он существует; пересекающиеся купола не складываются. Питание 600 энергии/с и расход по 0,2 кремния и фазовой ткани в секунду задаются как внешнее снабжение.' },
    { q: 'Пластановый конвейер: почему два входа, а не боковая загрузка?', a: 'Номинал магистрали — 40 предметов/с. Загрузчик должен смотреть в следующий пластановый блок и не иметь пластанового блока, направленного в него. Он собирает пачки по 10 и из-за recharge=2 пропускает до 20/с без ускорения. Поэтому схема ставит два отдельных загрузчика: шаг вперёд, поворот, объединение в магистраль. Бур не разгружается в середину пластановой ленты. Выходы подключаются к ядру или хранилищам, а не к единственному титановому конвейеру.' },
    { q: 'Когда нужны мосты, фазовые конвейеры и перекрёстки?', a: 'Обычный мост связывает блоки одной строки или колонки на расстоянии до 4 клеток; его пропускная способность в расчёте ограничена консервативными 11/с. Фазовый — до 12 клеток, 30/с номинально, 18 энергии/с на передающую точку. Нельзя соединить обычный мост с фазовым. Перекрёсток разделяет пересекающиеся наземные потоки, но не переносит пачки пластана как есть. Здесь пересечения решаются мостовыми пролётами, поэтому лишние перекрёстки не ставятся ради количества.' },
    { q: 'Что проверено, а что ещё не гарантируется?', a: 'Мод загружен реальными headless-движками v146 и v160.8: проверены законность размещения через Build.validPlace, отсутствие пересечений, мостовые связи, фактическое состояние пластановых загрузчиков и лимит 15 соединений большого узла. Число предметов/с на сайте остаётся расчётом, не измерением устойчивого трафика на всех картах. Совместимость с каждым модпаком, неизвестными сборками и правилами сетевых серверов не гарантируется. Сначала проверь на копии сохранения или в песочнице.' },
  ];

  return (
    <div className="app-root">
      {mobileMenu && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMobileMenu(false)} />}
      <aside id="workshop-navigation" className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} inert={isMobile && !mobileMenu}>
        <button className="brand" onClick={() => navigate('planner')} aria-label="Oreflow, на главную"><OreLogo /><span>oreflow<span className="brand-period">.</span></span></button>
        <div className="brand-caption">МЕНЬШЕ РУТИНЫ. БОЛЬШЕ ИГРЫ.</div>
        <div className="nav-section-label">МАСТЕРСКАЯ</div>
        <nav className="main-navigation" aria-label="Главное меню">
          {([
            { id: 'planner', icon: Pickaxe, name: 'Умная добыча' },
            { id: 'blueprints', icon: Layers3, name: 'Мои схемы', count: saved.length },
            { id: 'ideas', icon: Lightbulb, name: 'Избранные идеи', count: ideas.length },
            { id: 'downloads', icon: Download, name: 'Скачать мод' },
            { id: 'guide', icon: BookOpen, name: 'Руководство' },
          ] as { id: Page; icon: LucideIcon; name: string; count?: number }[]).map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'nav-active' : ''}`} aria-label={item.name} title={item.name} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18} strokeWidth={1.7} /><span>{item.name}</span>{item.count !== undefined && <span className="nav-count">{item.count.toString().padStart(2, '0')}</span>}</button>)}
        </nav>
        <div className="nav-divider" />
        <div className="nav-section-label community-label">ЕСТЬ ИДЕЯ?</div>
        <button className="suggest-nav" aria-label="Предложить мод" title="Предложить мод" onClick={() => setModal('suggest')}><Plus size={16} /><span>Предложить мод</span><ArrowUpRight size={13} /></button>
        <div className="sidebar-bottom">
          <div className="sidebar-art" aria-hidden="true"><div className="art-grid" /><div className="art-cube art-cube-one" /><div className="art-cube art-cube-two" /><div className="art-cube art-cube-three" /><span className="art-cross cross-one">+</span><span className="art-cross cross-two">+</span></div>
          <p className="sidebar-motto">Строй умнее.<br /><span>Играй в своё удовольствие.</span></p>
          <button className="concept-status" onClick={() => setModal('about')}><span className="status-dot" /><span>Мод для ПК</span><span className="mono">v0.2</span><Info size={12} /></button>
          <div className="sidebar-profile"><div className="profile-avatar"><Box size={17} strokeWidth={1.5} /></div><div><span>Твоя мастерская</span><small>Всё остаётся в браузере</small></div><span className="profile-dot" /></div>
        </div>
      </aside>
      <div className="app-shell">
        <header className="topbar">
          <div className="breadcrumbs"><button className="mobile-menu-button icon-button" aria-label="Открыть меню" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><button className="mobile-brand" onClick={() => navigate('planner')}>oreflow<span>.</span></button><span className="breadcrumb-home">Мастерская</span><ChevronRight size={12} /><span className="breadcrumb-current">{pageNames[page]}</span></div>
          <div className="topbar-actions"><button className="help-button" onClick={() => navigate('guide')}><CircleHelp size={16} /><span>Как это работает</span></button><span className="topbar-divider" /><button className="button button-primary save-top-button" aria-label="Сохранить схему" onClick={startSave}><Save size={14} /><span>Сохранить схему</span></button><button className="button button-primary download-top-button" onClick={() => navigate('downloads')}><Download size={14} /><span>Скачать мод</span></button></div>
        </header>
        <main className="main-content">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.23 }}>
              {page === 'planner' && <>
                <div className="page-heading planner-heading"><div><div className="eyebrow"><span className="eyebrow-line" />OREFLOW / МАСТЕРСКАЯ MINDUSTRY</div><h1>Умная добыча<span className="heading-dot">.</span></h1><p>Одна жила. Продуманный план. <span className="text-bright">Ни одного лишнего действия.</span></p></div><div className="heading-meta"><span className="meta-icon"><Cpu size={17} /></span><div><span>СЕРПУЛО</span><small>Планировщик для ПК</small></div><span className="meta-version">0.2.0</span></div></div>
                <div className="workspace-tabs"><div className="workspace-tab-list"><button className="workspace-tab selected"><SlidersHorizontal size={14} />Планировщик</button><button className="workspace-tab" onClick={() => navigate('guide')}>Как работает мод<ArrowUpRight size={12} /></button></div><span className="demo-indicator"><span />Общее ядро с модом</span></div>
                <div className="planner-layout">
                  <div className="planner-main">
                    <MineMap config={applied} ore={ore} plan={plan} terrain={terrain} busy={busy} mode={mode} setMode={setMode} onOreChange={next => { setOre(next); setAnchor(undefined); setAppliedAnchor(undefined); }} onRegenerate={() => { setSeed(s => s + 1); setAnchor(undefined); setAppliedAnchor(undefined); notify('Новая тестовая жила готова.'); }} onPlace={placeDrill} anchor={anchor} />
                    <div className="production-result"><div className="result-text"><span className="result-label"><TrendingUp size={14} />РАСЧЁТНАЯ ДОБЫЧА</span><div className="result-number"><motion.span key={`${mode}-${plan.output}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>{number(mode === 'after' ? plan.output : plan.baseline)}</motion.span><span>предм./с</span>{mode === 'after' && plan.output > plan.baseline && <span className="result-increase"><ArrowUpRight size={13} />{Math.round((plan.output / plan.baseline - 1) * 100)}%</span>}</div></div><div className="coverage-result"><strong>{plan.coverage}%<span>жилы под бурами</span></strong><div className="coverage-track"><span style={{ width: `${plan.coverage}%` }} /></div><small>{plan.covered} / {plan.totalOre} клеток</small></div></div>
                      <div className={`planner-note ${plan.incompatible || plan.unpowered || plan.bottleneck || plan.warnings.includes('power-unreachable') ? 'note-warning' : ''}`}><Info size={13} /><span>{plan.incompatible ? `Этот бур не может добывать ${ORES[ore].name.toLowerCase()}. Выбери бур более высокого уровня.` : plan.unpowered ? 'Нет питания. Включи электросеть для выбранного бура.' : plan.warnings.includes('power-unreachable') ? 'Электросеть не собрана. Мод отклонит план: освободи места под узлы.' : 'Расчёт при внешнем питании, подаче ресурсов и свободных выходах. Не замер в игре и не гарантия 100% покрытия.'}</span></div>
                  </div>
                  <section className="settings-panel" aria-label="Параметры схемы">
                    <div className="settings-heading"><h2>Параметры схемы</h2><SlidersHorizontal size={15} /></div>
                    <div className="settings-body">
                      <label className="field-label" htmlFor="drill-select">Тип бура<span>{DRILLS[config.drill].size} × {DRILLS[config.drill].size}</span></label>
                      <div className="drill-select-wrap"><img src={`/sprites/${DRILLS[config.drill].sprite}.png`} alt="" /><select id="drill-select" value={config.drill} onChange={event => update('drill', event.target.value as Drill)}>{Object.entries(DRILLS).map(([value, d]) => <option key={value} value={value}>{d.name}</option>)}</select><ChevronDown size={14} /></div>
                      <div className="field-label conveyor-label">Вывод ресурсов<Info size={12} aria-label="Пластановые конвейеры имеют более высокую пропускную способность" /></div>
                      <div className="segmented-control conveyor-control" aria-label="Тип конвейеров">{(['titanium', 'plastanium'] as const).map(value => <button key={value} className={config.conveyor === value ? 'selected' : ''} aria-pressed={config.conveyor === value} onClick={() => update('conveyor', value)}><span className={`conveyor-mini ${value}`} />{value === 'titanium' ? 'Титановые' : 'Пластановые'}</button>)}</div>
                      <div className="transport-details"><span>11/с на титан · 40/с на пластан, два входа</span><label>Мосты<select aria-label="Тип мостов" value={config.routing} onChange={event => update('routing', event.target.value as Config['routing'])}><option value="auto">Авто · минимум фазовых</option><option value="bridge">Обычные · до 4 клеток</option><option value="phase">Фазовые · до 12 клеток</option></select></label></div><div className="settings-section-divider" /><div className="section-label">УСИЛЕНИЯ</div>
                      <div className="enhancement-list">{enhancements.map(item => <div key={item.key} className={`enhancement-row ${config[item.key] ? 'enabled' : ''}`}><span className={`enhancement-icon ${item.key}`}><item.icon size={17} strokeWidth={1.6} /></span><div className="enhancement-copy"><span title={item.hint}>{item.title}{item.key === 'overdrive' && <Info size={10} />}</span><small>{item.description}</small></div><Toggle label={item.title} checked={config[item.key]} onChange={value => update(item.key, value)} /></div>)}</div>
                      {config.water && <label className="water-strategy-label">Источник воды<select aria-label="Источник воды" value={config.waterMode} onChange={event => update('waterMode', event.target.value as Config['waterMode'])}><option value="auto">Авто: рядом или через мосты</option><option value="extractors">Только соседние гидронасосы</option><option value="external">Внешняя вода: подключу сам</option></select></label>}<div className="settings-section-divider second-divider" /><div className="field-label optimization-label">Приоритет</div>
                      <div className="segmented-control priority-control"><button className={config.priority === 'output' ? 'selected' : ''} aria-pressed={config.priority === 'output'} onClick={() => update('priority', 'output')}><TrendingUp size={12} />Макс. добыча</button><button className={config.priority === 'compact' ? 'selected' : ''} aria-pressed={config.priority === 'compact'} onClick={() => update('priority', 'compact')}><Box size={12} />Компактность</button></div>
                      <label className="auto-checkbox"><input type="checkbox" checked={config.automatic} onChange={event => update('automatic', event.target.checked)} /><span className="custom-checkbox">{config.automatic && <Check size={10} strokeWidth={3} />}</span><span>Запускать при клике на жилу</span><span className="hint-icon" title="В демо клик по руде выбирает область и запускает расчёт. В игровом моде триггером станет первый бур."><CircleHelp size={12} /></span></label>
                      <button className={`button button-primary calculate-button ${busy ? 'is-loading' : ''}`} disabled={busy} onClick={() => calculate()}>{busy ? <><span className="loading-spinner" />Рассчитываем...</> : <><Sparkles size={15} />Рассчитать схему<ArrowRight size={15} /></>}</button>
                      <div className="calculation-status">{dirty ? <><span className="pending-dot" />Параметры изменены. Пересчитай схему</> : <><CheckCheck size={12} />Все параметры применены</>}</div>
                    </div>
                  </section>
                </div>
                <PlanReport plan={plan} config={applied} /><section className="more-ideas focused-idea"><div className="section-heading"><div><span className="eyebrow">СЛЕДУЮЩИЙ ИНСТРУМЕНТ</span><h2>Хорошим идеям есть место.</h2></div><button className="text-button" onClick={() => navigate('ideas')}>Избранные идеи<ArrowUpRight size={15} /></button></div><div className="idea-preview-grid single-idea-grid">{IDEAS.slice(0, 1).map((idea, i) => <IdeaPreview key={idea.id} idea={idea} index={i} onClick={() => setActiveIdea(idea)} />)}</div></section>
              </>}
              {page === 'downloads' && <Downloads onGuide={() => navigate('guide')} />}
              {page === 'blueprints' && <>
                <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />СОБРАНО В ТВОЕЙ МАСТЕРСКОЙ</div><h1>Мои схемы<span className="heading-dot">.</span></h1><p>Удачные настройки всегда под рукой. И никуда не пропадут.</p></div><button className="button button-secondary" onClick={() => navigate('planner')}><Plus size={15} />Новая схема</button></div>
                <div className="library-info"><FolderOpen size={15} /><span>{saved.length ? `Сохранено схем: ${saved.length}` : 'Пока без лишних блоков. И без схем.'}</span><small>Локальное хранилище</small></div>
                {saved.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Layers3 size={48} strokeWidth={1} /><span>+</span></div><h2>Хорошие планы стоит сохранять</h2><p>Настрой добычу в планировщике и сохрани первую схему.<br />Она появится здесь, в твоём браузере.</p><button className="button button-primary" onClick={() => navigate('planner')}>Открыть планировщик<ArrowRight size={15} /></button></div> : <div className="saved-plan-list">{saved.map(item => {
                  const itemPlan = createPlan(item.config, item.ore, generateTerrain(item.seed), item.anchor);
                  return <article className="saved-plan-row" key={item.id}><button className="saved-plan-main" onClick={() => loadPlan(item)}><div className="saved-plan-image"><img src={`/sprites/${DRILLS[item.config.drill].sprite}.png`} alt="" /><span style={{ background: ORES[item.ore].color }} /></div><div><h3>{item.name}</h3><p>{ORES[item.ore].name} <span>·</span> {DRILLS[item.config.drill].name} <span>·</span> {number(itemPlan.output)} предм./с</p></div><ChevronRight size={17} /></button><div className="saved-plan-actions"><span>{new Date(item.created).toLocaleDateString('ru-RU')}</span><button className="icon-button" aria-label={`Экспортировать ${item.name}`} title="Экспорт настроек JSON" onClick={() => exportPlan(item)}><Download size={16} /></button><button className="icon-button delete-button" aria-label={`Удалить ${item.name}`} title="Удалить схему" onClick={() => { setSaved(current => current.filter(p => p.id !== item.id)); notify('Схема удалена из мастерской.'); }}><Trash2 size={15} /></button></div></article>;
                })}</div>}
                <div className="storage-note"><Info size={14} /><p>Схемы хранятся только в этом браузере. Экспортируй JSON для резервной копии настроек.<br />Файл JSON не является игровой схемой Mindustry (.msch).</p></div>
              </>}
              {page === 'ideas' && <>
                <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />МАЛЕНЬКИЕ МОДЫ. БОЛЬШАЯ РАЗНИЦА.</div><h1>Только то, что пригодится<span className="heading-dot">.</span></h1><p>Конвейер-навигатор в избранном. Остальные старые идеи убраны.</p></div><button className="button button-primary" onClick={() => setModal('suggest')}><Plus size={15} />Своя идея</button></div>
                <div className="ideas-filterbar"><div className="filter-tabs">{['Все идеи', 'Строительство', 'Логистика', 'Контроль', 'Избранное'].map(filter => <button key={filter} className={ideaFilter === filter ? 'selected' : ''} onClick={() => setIdeaFilter(filter)}>{filter === 'Избранное' && <Star size={12} />}{filter}{filter === 'Все идеи' && <span>{ideas.length}</span>}</button>)}</div><div className="search-field"><Search size={14} /><input aria-label="Найти идею" placeholder="Найти идею" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={12} /></button>}</div></div>
                <div className="ideas-catalog">{visibleIdeas.map((idea, i) => <div className="idea-catalog-item" key={idea.id}><IdeaPreview idea={idea} index={i % 3} onClick={() => setActiveIdea(idea)} /><button className={`favorite-quick ${favorites.includes(idea.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(idea.id) ? 'Убрать из избранного' : 'В избранное'}: ${idea.title}`} onClick={() => toggleFavorite(idea.id)}><Star size={14} fill={favorites.includes(idea.id) ? 'currentColor' : 'none'} /></button></div>)}</div>
                {visibleIdeas.length === 0 && <div className="empty-state compact-empty"><Search size={35} strokeWidth={1} /><h2>{ideaFilter === 'Избранное' && !query ? 'Здесь будут любимые идеи' : 'Пока ничего не нашлось'}</h2><p>{ideaFilter === 'Избранное' && !query ? 'Нажми на звезду у идеи, которую хочется воплотить.' : 'Попробуй другой запрос или выбери все категории.'}</p><button className="text-button" onClick={() => { setIdeaFilter('Все идеи'); setQuery(''); }}>Посмотреть все идеи<ArrowRight size={14} /></button></div>}
                <div className="idea-bottom-note"><Lightbulb size={17} /><span>Это концепции будущих модов, не каталог готовых загрузок.</span><button className="text-button" onClick={() => setModal('suggest')}>Добавить свою<ArrowUpRight size={14} /></button></div>
              </>}
              {page === 'guide' && <>
                <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />ПОНЯТНО. ЧЕСТНО. ПО ДЕЛУ.</div><h1>От одного бура до целой жилы<span className="heading-dot">.</span></h1><p>Проверенные механики, установка и границы алгоритма.</p></div></div>
                <div className="guide-intro"><span className="guide-intro-icon"><Pickaxe size={29} strokeWidth={1.4} /></span><div><h2>Ты выбираешь, что строить.<br />Oreflow помогает с рутиной.</h2><p>Готовый клиентский JS-мод анализирует карту, строит плотный план и после подтверждения добавляет обычную очередь строительства.</p></div><GitBranch size={88} strokeWidth={0.7} className="guide-branch-art" /></div>
                <div className="guide-steps">{[{ n: '01', icon: MousePointer2, title: 'Выбери бур и жилу', text: 'Тип первого бура задаёт размер, уровень добычи и требования к питанию.' }, { n: '02', icon: SlidersHorizontal, title: 'Настрой план', text: 'Выбери вывод, воду, электросеть и приоритет. Посмотри результат до строительства.' }, { n: '03', icon: Hammer, title: 'Подтверди очередь', text: 'Импортируй ZIP, нажми F7 и подтверди предпросмотр. Строительство расходует обычные игровые материалы.' }].map(step => <div className="guide-step" key={step.n}><div><span>{step.n}</span><step.icon size={21} strokeWidth={1.4} /></div><h3>{step.title}</h3><p>{step.text}</p></div>)}</div>
                <section className="faq-section"><div className="section-heading"><h2>Важные детали</h2><span className="mono">FAQ / 07</span></div>{faqs.map((faq, i) => <div className={`faq-item ${openFaq === i ? 'faq-open' : ''}`} key={faq.q}><button aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}><span className="faq-number">0{i + 1}</span><span>{faq.q}</span><Plus size={17} /></button><AnimatePresence initial={false}>{openFaq === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="faq-answer"><p>{faq.a}</p></motion.div>}</AnimatePresence></div>)}</section>
                <div className="guide-links"><a href="https://mindustrygame.github.io/wiki/modding/1-modding/" target="_blank" rel="noreferrer"><BookOpen size={16} /><div><span>Официальная документация</span><small>Как устроены моды Mindustry</small></div><ExternalLink size={14} /></a><a href="https://github.com/Anuken/Mindustry" target="_blank" rel="noreferrer"><Github size={17} /><div><span>Исходный код Mindustry</span><small>Механики игры и игровые спрайты</small></div><ExternalLink size={14} /></a></div>
                <button className="button button-primary back-to-planner" onClick={() => navigate('planner')}><ArrowLeft size={15} />Попробовать планировщик</button>
              </>}
            </motion.div>
          </AnimatePresence>
          <footer className="page-footer"><span><span className="footer-brand">oreflow.</span> Сделано для тех, кто любит строить.</span><button onClick={() => setModal('about')}>Независимый проект<ArrowUpRight size={12} /></button></footer>
        </main>
      </div>
      <AnimatePresence>
        {modal === 'save' && <Modal title="Сохраним хороший план" eyebrow="ТВОЯ КОЛЛЕКЦИЯ" onClose={() => setModal(null)}><form onSubmit={savePlan}><p className="modal-description">Настройки и тестовая карта останутся в твоей мастерской, чтобы к ним можно было вернуться.</p><label className="form-label" htmlFor="plan-name">Название схемы</label><input className="form-input" id="plan-name" data-autofocus value={saveName} maxLength={70} required onChange={event => setSaveName(event.target.value)} /><div className="save-summary"><img src={`/sprites/${DRILLS[applied.drill].sprite}.png`} alt="" /><div><strong>{DRILLS[applied.drill].name}</strong><span>{ORES[ore].name} · {plan.drills.length} буров · {number(plan.output)} предм./с</span></div><Check size={17} /></div>{dirty && <p className="form-notice"><Info size={13} />Сохраняем последнюю рассчитанную схему, а не неприменённые настройки.</p>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => exportPlan()}><FileJson size={15} />Экспорт JSON</button><button className="button button-primary" type="submit"><Save size={15} />Сохранить</button></div><small className="modal-footnote">Локальное сохранение. Не игровой файл .msch.</small></form></Modal>}
        {modal === 'suggest' && <Modal title="А какой мод придумал ты?" eyebrow="ДОБАВИМ В МАСТЕРСКУЮ" onClose={() => setModal(null)}><form onSubmit={submitIdea}><p className="modal-description">Самые полезные инструменты начинаются с мысли «вот бы не делать это руками».</p><label className="form-label" htmlFor="idea-name">Название</label><input id="idea-name" data-autofocus className="form-input" placeholder="Например, умный ремонт стен" maxLength={60} required value={suggestName} onChange={event => setSuggestName(event.target.value)} /><label className="form-label" htmlFor="idea-description">Что будет делать мод?</label><textarea id="idea-description" className="form-input form-textarea" placeholder="Какую рутину он поможет убрать?" required maxLength={700} value={suggestDescription} onChange={event => setSuggestDescription(event.target.value)} /><label className="form-label" htmlFor="idea-category">Категория</label><select id="idea-category" className="form-input" value={suggestCategory} onChange={event => setSuggestCategory(event.target.value as Idea['category'])}>{['Строительство', 'Логистика', 'Контроль'].map(category => <option key={category}>{category}</option>)}</select><div className="modal-actions"><span className="modal-footnote">Сохранится только в этом браузере.</span><button className="button button-primary" type="submit"><Plus size={15} />Добавить идею</button></div></form></Modal>}
        {modal === 'about' && <Modal title="Меньше рутины. Больше игры." eyebrow="OREFLOW / EXPERIMENTAL WORKSHOP" onClose={() => setModal(null)}><div className="about-brand"><OreLogo /><span>oreflow.</span><small>v0.2.0</small></div><p className="modal-description">Независимый планировщик добычи для Mindustry с готовым импортируемым модом. Сайт и игровой мод используют одно ядро расчёта.</p><div className="about-notice"><Info size={17} /><p>Мод поставляется в нативном ZIP-формате Mindustry. Импортируй его в игре, перезапусти клиент и нажми F7 на карте. Сайт сам к игре не подключается.</p></div><p className="about-credit">Mindustry и игровые спрайты созданы Anuken и сообществом. Спрайты взяты из открытого репозитория v146 и используются только для наглядного предпросмотра.</p><div className="modal-actions"><a className="text-button" href="https://github.com/Anuken/Mindustry" target="_blank" rel="noreferrer"><Github size={15} />Mindustry на GitHub<ExternalLink size={12} /></a><button className="button button-primary" onClick={() => { setModal(null); navigate('guide'); }}>Подробнее<ArrowRight size={14} /></button></div></Modal>}
        {activeIdea && <Modal title={activeIdea.title} eyebrow={`${activeIdea.category.toUpperCase()} / КОНЦЕПЦИЯ МОДА`} onClose={() => setActiveIdea(null)} wide><div className={`idea-detail-icon accent-${activeIdea.color}`}>{(() => { const Icon = ideaIcons[activeIdea.icon]; return <Icon size={28} strokeWidth={1.4} />; })()}</div><p className="idea-detail-description">{activeIdea.detail}</p><div className="idea-feature-list">{activeIdea.features.map(feature => <div key={feature}><Check size={14} /><span>{feature}</span></div>)}</div><div className="idea-limitation"><Info size={15} /><p>{activeIdea.limitation}</p></div><div className="modal-actions"><span className="modal-footnote">Идея для разработки, не готовая загрузка.</span><button className={`button ${favorites.includes(activeIdea.id) ? 'button-primary' : 'button-secondary'}`} onClick={() => toggleFavorite(activeIdea.id)}><Star size={14} fill={favorites.includes(activeIdea.id) ? 'currentColor' : 'none'} />{favorites.includes(activeIdea.id) ? 'В избранном' : 'В избранное'}</button></div></Modal>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div key={toast.id} className="toast" role="status" initial={{ opacity: 0, y: 15, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><span className="toast-check"><Check size={14} /></span><span>{toast.message}</span><button className="icon-button" aria-label="Закрыть уведомление" onClick={() => setToast(null)}><X size={13} /></button></motion.div>}</AnimatePresence>
    </div>
  );
}

export default App;
