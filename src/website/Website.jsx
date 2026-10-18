import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, CalendarBlank, ChartBar, CheckCircle, EnvelopeSimple, Kanban, Lightning, List,
  ListChecks, MagnifyingGlass, NotePencil, Plus, Quotes, ShieldCheck, Sparkle, Users, X,
} from './icons';
import { prefersReducedMotion, useReveal, useScrollMotion, useSpotlight } from './motion';

const APP_URL = '/';

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#views', label: 'Views' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#faq', label: 'FAQ' },
];

const HERO_TOASTS = [
  { tone: 'success', title: 'Blocker resolved', body: 'Audit color contrast moved to Final' },
  { tone: 'info', title: '3 tasks created', body: 'From Weekly product sync notes' },
  { tone: 'warning', title: 'Due tomorrow', body: 'Polish login flow on mobile' },
];

const FLOW_STAGES = [
  { name: 'Planning', task: 'Polish login flow on mobile', meta: 'Blocker · Due Oct 20', tone: 'danger' },
  { name: 'Review', task: 'Fix kanban card overflow', meta: 'Major · Erlangga', tone: 'warning' },
  { name: 'In progress', task: 'Write onboarding docs', meta: 'Minor · Nadia Putri', tone: 'info' },
  { name: 'Final', task: 'Audit color contrast', meta: 'Major · Raka', tone: 'warning' },
  { name: 'Completed', task: 'Add meeting export to PDF', meta: 'Done · Oct 14', tone: 'success' },
];
// Geometry for the flow illustration, in the SVG's 1000 × 440 viewBox.
const FLOW_Y = [52, 136, 220, 304, 388];
const FLOW_IN = 'M300 220 L444 220';
const flowOut = (y) => `M556 220 C 640 220, 616 ${y}, 700 ${y}`;

const STEPS = [
  {
    key: 'capture',
    title: 'Capture every decision',
    body: 'Log reviews straight from a meeting or the board. Templates keep notes consistent, and action items become tasks in one pass.',
    image: '/site/reviews.webp',
    alt: 'Synqra All Reviews list with priorities and stages',
  },
  {
    key: 'assign',
    title: 'Assign with full context',
    body: 'Open any task to set its phase, priority, team and people. Everyone works from the same source of truth.',
    image: '/site/task-detail.webp',
    alt: 'Synqra task detail panel with status, phase, priority and assignees',
  },
  {
    key: 'track',
    title: 'Track it to done',
    body: 'Reports roll up progress, risk and overdue work across every project, and update as the team moves.',
    image: '/site/reports.webp',
    alt: 'Synqra reports with project status and task overview',
  },
];

const VIEWS = [
  { key: 'board', label: 'Board', icon: Kanban, image: '/site/board.webp', caption: 'Drag work across stages, with blockers and owners visible at a glance.' },
  { key: 'timeline', label: 'Timeline', icon: CalendarBlank, image: '/site/timeline.webp', caption: 'See every task on a Gantt timeline before dates start to slip.' },
  { key: 'overview', label: 'Overview', icon: ListChecks, image: '/site/overview.webp', caption: 'Start the day with what needs attention, upcoming meetings and stage health.' },
  { key: 'sprint', label: 'Scrum reports', icon: ChartBar, image: '/site/reports-scrum.webp', caption: 'Sprint velocity and burndown without exporting a single spreadsheet.' },
];

const BENEFITS = [
  { icon: Sparkle, title: 'Calm by default', body: 'A quiet, focused interface that shows what matters and keeps everything else one click away.' },
  { icon: MagnifyingGlass, title: 'Fast everywhere', body: 'Jump to any task, project or meeting with ⌘K. No hunting through tabs.' },
  { icon: Bell, title: 'Notifications that matter', body: 'Get told when work is assigned, blocked or overdue, scoped to the projects you are in.' },
  { icon: Users, title: 'Built for the whole team', body: 'Invite collaborators per project and give each person the role they need.' },
  { icon: ShieldCheck, title: 'Admin controls', body: 'Manage members, roles and project access from one admin area.' },
  { icon: Lightning, title: 'Works on any screen', body: 'From a wide monitor to a phone between meetings, the workspace adapts.' },
];

// Sample quotes: replace with real customer quotes before promoting the page.
const TESTIMONIALS = [
  { quote: 'Our Monday sync used to end with a wall of notes nobody opened again. Now it ends with tasks that already have owners.', name: 'Project lead', role: 'Digital agency', initials: 'PL' },
  { quote: 'The board, the timeline and the reports all read from the same reviews, so I stopped reconciling three spreadsheets.', name: 'PMO manager', role: 'IT services', initials: 'PM' },
  { quote: 'Blockers finally stay visible. If something is stuck, it is red on the overview before anyone has to ask.', name: 'Engineering manager', role: 'Product team', initials: 'EM' },
  { quote: 'Clients see progress in the report instead of waiting for my weekly email. That alone saved me an afternoon.', name: 'Account director', role: 'Creative studio', initials: 'AD' },
  { quote: 'Templates for design critiques and sprint planning mean every meeting produces the same clean follow-up.', name: 'Design lead', role: 'Mobile app team', initials: 'DL' },
  { quote: 'It is calm. The team actually opens it, which is more than I can say for the last two tools we tried.', name: 'Operations head', role: 'Consulting firm', initials: 'OH' },
];

const FAQS = [
  { q: 'What is Synqra?', a: 'Synqra is a project review tracker. It keeps meetings, review items, boards, timelines and reports in one workspace, so every decision from a meeting becomes a tracked task with an owner and a due date.' },
  { q: 'How do meeting notes become tasks?', a: 'Start a meeting from a template and take notes as usual. Synqra pulls out the action items, and you review them once to turn them into tasks with assignees, priority and dates.' },
  { q: 'Which views can my team use?', a: 'Every project has a list, a kanban board, sprint planning and a Gantt timeline. Reports cover portfolio health, scrum metrics and team workload.' },
  { q: 'Can I invite people outside my company?', a: 'Yes. You can invite collaborators per project and give each person the role they need, while admins manage members and access from one place.' },
  { q: 'Does it work on my phone?', a: 'Yes. The workspace adapts to tablets and phones, so you can check what needs attention or update a task between meetings.' },
  { q: 'How do I get started?', a: 'Create a workspace, set up your first project and bring your team in when you are ready. Your first board and meeting templates are ready straight away.' },
];

function Words({ text, lines, className, id, as: Tag = 'h2', start = 0 }) {
  const rows = lines || [text];
  let index = start;
  return (
    <Tag className={className} id={id} aria-label={rows.join(' ')}>
      {rows.map((row, rowIndex) => (
        <span key={row} className={lines ? 'sq-line-row' : undefined}>
          {row.split(' ').map((word, wordIndex) => {
            const i = index++;
            return (
              <Fragment key={`${word}-${wordIndex}`}>
                <span className="sq-word" aria-hidden="true">
                  <span data-reveal="word" style={{ '--i': i }}>{word}</span>
                </span>{rowIndex < rows.length - 1 || wordIndex < row.split(' ').length - 1 ? ' ' : ''}
              </Fragment>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

function useCycle(length, interval, enabled = true) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return undefined;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % length), interval);
    return () => window.clearTimeout(timer);
  }, [index, length, interval, enabled]);
  return [index, setIndex];
}

function Logo({ className = '' }) {
  return <img className={`sq-logo ${className}`} src="/logo-synqra.png" alt="Synqra — Powered by MULIA" width="113" height="40" />;
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className={`sq-nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="sq-nav-inner">
        <a href="#top" className="sq-nav-brand" aria-label="Synqra home"><Logo /></a>
        <nav className="sq-nav-links" aria-label="Main">
          {NAV.map((item) => <a key={item.href} href={item.href} className="sq-link" onClick={() => setOpen(false)}>{item.label}</a>)}
        </nav>
        <div className="sq-nav-actions">
          <a href={APP_URL} className="sq-link sq-signin">Sign in</a>
          <a href={APP_URL} className="sq-btn sq-btn-light sq-btn-sm">Get started <ArrowRight size={14} weight="bold" className="sq-btn-arrow" /></a>
          <button type="button" className="sq-menu" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroBackdrop() {
  return (
    <div className="sq-backdrop" aria-hidden="true">
      <div className="sq-aurora"><span className="a1" /><span className="a2" /><span className="a3" /></div>
      <div className="sq-grid-lines" />
      <div className="sq-beams">
        {[18, 34, 66, 82].map((x, i) => <span key={x} className="sq-beam-v" style={{ '--x': `${x}%`, '--d': `${i * 1.7}s` }} />)}
        {[22, 46].map((y, i) => <span key={y} className="sq-beam-h" style={{ '--y': `${y}%`, '--d': `${i * 2.3 + 0.8}s` }} />)}
      </div>
      <div className="sq-stars" />
    </div>
  );
}

function Hero() {
  const [toast] = useCycle(HERO_TOASTS.length, 3600);
  const current = HERO_TOASTS[toast];
  return (
    <section className="sq-hero" id="top" data-progress>
      <HeroBackdrop />
      <div className="sq-container sq-hero-copy">
        <a href="#workflow" className="sq-eyebrow sq-eyebrow-link" data-reveal style={{ '--i': 0 }}>
          <Sparkle size={13} weight="fill" /> Meeting notes become tasks automatically <ArrowRight size={12} className="sq-btn-arrow" />
        </a>
        <Words as="h1" className="sq-display" lines={['Turn meeting notes into', 'work your team finishes.']} start={1} />
        <p className="sq-lede" data-reveal style={{ '--i': 9 }}>
          Synqra brings meetings, reviews, boards and reports into one calm workspace, so every decision has an owner, a due date and a finish line.
        </p>
        <div className="sq-hero-ctas" data-reveal style={{ '--i': 10 }}>
          <a href={APP_URL} className="sq-btn sq-btn-light">Get started free <ArrowRight size={15} weight="bold" className="sq-btn-arrow" /></a>
          <a href="#workflow" className="sq-btn sq-btn-ghost">See how it works</a>
        </div>
      </div>

      <div className="sq-container sq-hero-stage">
        <div className="sq-hero-frame-wrap" data-reveal="rise" style={{ '--i': 7 }}>
          <div className="sq-hero-halo" aria-hidden="true" />
          <div className="sq-hero-frame">
            <div className="sq-window-bar" aria-hidden="true"><i /><i /><i /><span>app.synqra / overview</span></div>
            <div className="sq-hero-shot">
              <img src="/site/overview.webp" alt="Synqra overview showing reviews that need attention, meetings and stage progress" width="1440" height="900" fetchpriority="high" />
              <span className="sq-scan" aria-hidden="true" />
              <span className="sq-cursor" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 3l7 17 2.5-7L21 10.5z" fill="#fff" stroke="#0a0f1c" strokeWidth="1.4" strokeLinejoin="round" /></svg></span>
            </div>
          </div>

          <div className="sq-float sq-float-left" data-parallax="0.08" aria-hidden="true">
            <div className="sq-float-card sq-float-bob" data-reveal style={{ '--i': 14 }}>
              <div className="sq-float-head"><span className="sq-chip-icon"><NotePencil size={14} /></span>Weekly product sync</div>
              <p className="sq-float-meta"><span className="sq-typing"><i /><i /><i /></span> Extracting action items</p>
              <ul className="sq-extract">
                <li style={{ '--k': 0 }}><span className="sq-dot is-danger" />Polish login flow on mobile<CheckCircle size={14} weight="fill" className="sq-tick" /></li>
                <li style={{ '--k': 1 }}><span className="sq-dot is-warning" />Fix kanban card overflow<CheckCircle size={14} weight="fill" className="sq-tick" /></li>
                <li style={{ '--k': 2 }}><span className="sq-dot is-info" />Write onboarding docs<CheckCircle size={14} weight="fill" className="sq-tick" /></li>
              </ul>
            </div>
          </div>

          <div className="sq-float sq-float-right" data-parallax="0.14" aria-hidden="true">
            <div className="sq-float-card sq-toast" key={toast}>
              <span className={`sq-chip-icon is-${current.tone}`}><CheckCircle size={15} weight="fill" /></span>
              <div><strong>{current.title}</strong><p>{current.body}</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowIllustration() {
  const [hovered, setHovered] = useState(null);
  const [auto, setAuto] = useCycle(FLOW_STAGES.length, 2600, hovered === null);
  const active = hovered ?? auto;
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  return (
    <div className="sq-flow-art sq-spot" data-reveal="rise" style={{ '--i': 4 }}>
      <div className="sq-flow-glow" aria-hidden="true" />
      <svg className="sq-flow-svg" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="sq-flow-line" gradientUnits="userSpaceOnUse" x1="300" x2="960" y1="0" y2="0">
            <stop offset="0" stopColor="#9db2d3" stopOpacity="0.15" />
            <stop offset="1" stopColor="#9db2d3" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="sq-flow-spark"><stop offset="0" stopColor="#fff" /><stop offset="0.4" stopColor="#c7d6ee" /><stop offset="1" stopColor="#9db2d3" stopOpacity="0" /></radialGradient>
        </defs>
        <path d={FLOW_IN} className="sq-flow-path is-on" />
        {FLOW_Y.map((y, i) => <path key={y} d={flowOut(y)} className={`sq-flow-path${i === active ? ' is-on' : ''}`} />)}
        {!reduced && (
          <g key={active}>
            <circle r="9" fill="url(#sq-flow-spark)"><animateMotion dur="1.1s" repeatCount="indefinite" path={FLOW_IN} /></circle>
            <circle r="9" fill="url(#sq-flow-spark)"><animateMotion dur="1.1s" begin="0.55s" repeatCount="indefinite" path={flowOut(FLOW_Y[active])} /></circle>
          </g>
        )}
      </svg>

      <div className="sq-flow-notes">
        <div className="sq-flow-notes-head"><span className="sq-chip-icon"><NotePencil size={14} /></span>Weekly product sync</div>
        <span className="sq-line w90" /><span className="sq-line w70 is-mark" /><span className="sq-line w80" /><span className="sq-line w60 is-mark" />
        <span className="sq-flow-notes-foot">4 action items found</span>
      </div>

      <div className="sq-flow-core">
        <span className="sq-flow-ring" />
        <span className="sq-flow-ring r2" />
        <Sparkle size={26} weight="fill" />
      </div>
      <span className="sq-flow-core-label">Synqra</span>

      <ol className="sq-flow-stages">
        {FLOW_STAGES.map((stage, i) => (
          <li key={stage.name} style={{ '--y': `${(FLOW_Y[i] / 440) * 100}%` }}>
            <button
              type="button"
              className={`sq-flow-stage${i === active ? ' is-active' : ''}`}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => { setAuto(i); }}
              aria-pressed={i === active}
            >
              <span className={`sq-flow-node is-${stage.tone}`}>{i === FLOW_STAGES.length - 1 ? <CheckCircle size={13} weight="fill" /> : i + 1}</span>
              <span className="sq-flow-stage-text">
                <b>{stage.name}</b>
                <span className="sq-flow-task">{stage.task}<em>{stage.meta}</em></span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageFlow() {
  return (
    <section className="sq-section sq-flow" aria-labelledby="flow-title">
      <div className="sq-container">
        <p className="sq-kicker" data-reveal>One flow</p>
        <Words className="sq-h2" id="flow-title" text="From first note to done, in five clear stages." />
        <p className="sq-sub sq-center" data-reveal style={{ '--i': 6 }}>Hover a stage to follow a task from the meeting where it started.</p>
        <FlowIllustration />
      </div>
    </section>
  );
}

function Bento() {
  const points = [[0, 70], [16, 62], [32, 66], [48, 44], [64, 50], [80, 26], [100, 18]];
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 3} ${y * 1.6}`).join(' ');
  return (
    <section className="sq-section" id="product" aria-labelledby="product-title">
      <div className="sq-container">
        <div className="sq-section-head">
          <p className="sq-kicker" data-reveal>Product</p>
          <Words className="sq-h2" id="product-title" text="Everything a review needs. Nothing it doesn't." />
          <p className="sq-sub" data-reveal style={{ '--i': 6 }}>Meetings, reviews, planning and reporting share one model, so updates in one place show up everywhere else.</p>
        </div>

        <div className="sq-bento">
          <article className="sq-card sq-spot sq-span-2 sq-art-card" data-reveal="card" style={{ '--i': 0 }}>
            <div className="sq-art sq-art-notes" aria-hidden="true">
              <span className="sq-dust" />
              <div className="sq-art-doc">
                <div className="sq-window-dots"><i /><i /><i /></div>
                <span className="sq-art-doc-title">Design critique · Oct 16</span>
                <span className="sq-line w90" /><span className="sq-line w70 is-mark" /><span className="sq-line w80" /><span className="sq-line w60 is-mark" /><span className="sq-line w75" />
              </div>
              <span className="sq-art-streak" />
              <div className="sq-art-chips">
                <div className="sq-art-chip is-hero"><Sparkle size={14} weight="fill" /> Action items <span className="sq-badge">3</span><span className="sq-bar" /></div>
                {['Refine notification menu', 'Improve report filters', 'Settings empty state'].map((task, index) => (
                  <div key={task} className="sq-art-chip" style={{ '--i': index }}><CheckCircle size={13} weight="fill" /> {task}</div>
                ))}
              </div>
            </div>
            <div className="sq-card-copy">
              <h3>Meetings that write the follow-up</h3>
              <p>Pick a template, take notes, and Synqra pulls out the action items so you can turn them into assigned tasks in one review.</p>
            </div>
          </article>

          <article className="sq-card sq-spot sq-art-card" data-reveal="card" style={{ '--i': 1 }}>
            <div className="sq-art sq-art-bell" aria-hidden="true">
              <span className="sq-dust" />
              <div className="sq-bell-orb"><span className="sq-bell-ring" /><Bell size={30} weight="fill" /><span className="sq-badge">3</span></div>
              <div className="sq-bell-panel">
                <div className="sq-bell-row"><span className="sq-dot is-danger" />Blocker on SYN-101<em>now</em></div>
                <div className="sq-bell-row is-dim"><span className="sq-dot is-warning" />Review assigned to you<em>2m</em></div>
              </div>
            </div>
            <div className="sq-card-copy">
              <h3>Reviews with clear owners</h3>
              <p>Status, priority and assignees on every item, and a ping the moment something is blocked.</p>
            </div>
          </article>

          <article className="sq-card sq-spot sq-art-card" data-reveal="card" style={{ '--i': 2 }}>
            <div className="sq-art sq-art-chart" aria-hidden="true">
              <span className="sq-dust" />
              <div className="sq-chart-chips"><span>On track <b>6</b></span><span className="is-warn">At risk <b>1</b></span></div>
              <svg viewBox="0 0 300 130" className="sq-chart" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sq-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7ea7e6" stopOpacity="0.35" /><stop offset="1" stopColor="#7ea7e6" stopOpacity="0" /></linearGradient>
                </defs>
                <path d={`${line} L300 130 L0 130 Z`} fill="url(#sq-chart-fill)" className="sq-chart-area" />
                <path d={line} className="sq-chart-line" pathLength="1" />
                <circle cx="294" cy={18 * 1.6} r="5" className="sq-chart-dot" />
              </svg>
            </div>
            <div className="sq-card-copy">
              <h3>Reports that answer themselves</h3>
              <p>Portfolio health, sprint velocity and team load, always current.</p>
            </div>
          </article>

          <article className="sq-card sq-spot sq-span-2 sq-card-shot" data-reveal="card" style={{ '--i': 3 }}>
            <div className="sq-card-copy">
              <span className="sq-card-icon"><Kanban size={18} /></span>
              <h3>Board, list, sprint and timeline</h3>
              <p>Plan the same work four ways. Switch views without losing filters, and keep blockers visible wherever you look.</p>
            </div>
            <div className="sq-shot-crop" aria-hidden="true">
              <span className="sq-shot-ray" />
              <img src="/site/board.webp" alt="" loading="lazy" width="1440" height="900" data-parallax="0.04" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef([]);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(Number(entry.target.dataset.step));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return (
    <section className="sq-section sq-workflow" id="workflow" aria-labelledby="workflow-title">
      <div className="sq-container">
        <div className="sq-section-head">
          <p className="sq-kicker" data-reveal>How it works</p>
          <Words className="sq-h2" id="workflow-title" text="Three steps. No status meetings about status." />
        </div>
        <div className="sq-steps">
          <ol className="sq-steps-list">
            {STEPS.map((step, index) => (
              <li
                key={step.key}
                ref={(el) => { stepRefs.current[index] = el; }}
                data-step={index}
                className={`sq-step${active === index ? ' is-active' : ''}`}
              >
                <span className="sq-step-num">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                <img className="sq-step-inline" src={step.image} alt={step.alt} loading="lazy" width="1440" height="900" />
              </li>
            ))}
          </ol>
          <div className="sq-steps-media" aria-hidden="true">
            <div className="sq-steps-frame">
              {STEPS.map((step, index) => (
                <img key={step.key} src={step.image} alt="" loading="lazy" width="1440" height="900" className={active === index ? 'is-active' : ''} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const VIEW_DURATION = 6000;

function Views() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const el = sectionRef.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView || reduced.current) return undefined;
    const timer = window.setTimeout(() => setActive((value) => (value + 1) % VIEWS.length), VIEW_DURATION);
    return () => window.clearTimeout(timer);
  }, [active, paused, inView]);

  const running = !paused && inView;
  return (
    <section
      className="sq-section sq-views"
      id="views"
      ref={sectionRef}
      aria-labelledby="views-title"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="sq-container">
        <div className="sq-section-head">
          <p className="sq-kicker" data-reveal>Views</p>
          <Words className="sq-h2" id="views-title" text="One project. Every view you need." />
        </div>
        <div className="sq-tabs" role="tablist" aria-label="Product views" data-reveal style={{ '--i': 4 }}>
          {VIEWS.map((view, index) => {
            const Icon = view.icon;
            const selected = index === active;
            return (
              <button
                key={view.key}
                type="button"
                role="tab"
                id={`view-tab-${view.key}`}
                aria-selected={selected}
                aria-controls="view-panel"
                className={`sq-tab${selected ? ' is-active' : ''}${selected && running ? ' is-running' : ''}`}
                style={{ '--dur': `${VIEW_DURATION}ms` }}
                onClick={() => setActive(index)}
              >
                <Icon size={15} /> {view.label}
                <span className="sq-tab-progress" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="sq-view-stage" data-reveal="rise" style={{ '--i': 5 }}>
          <div className="sq-view-frame sq-spot" id="view-panel" role="tabpanel" aria-labelledby={`view-tab-${VIEWS[active].key}`}>
            <div className="sq-window-bar" aria-hidden="true"><i /><i /><i /><span>app.synqra / {VIEWS[active].key}</span></div>
            <div className="sq-view-images">
              {VIEWS.map((view, index) => (
                <img key={view.key} src={view.image} alt={index === active ? `Synqra ${view.label} view` : ''} aria-hidden={index !== active} loading="lazy" width="1440" height="900" className={index === active ? 'is-active' : ''} />
              ))}
            </div>
          </div>
          <p className="sq-view-caption" aria-live="polite">{VIEWS[active].caption}</p>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="sq-section" id="why" aria-labelledby="why-title">
      <div className="sq-container">
        <div className="sq-section-head">
          <p className="sq-kicker" data-reveal>Why Synqra</p>
          <Words className="sq-h2" id="why-title" text="Quiet software for teams with a lot going on." />
        </div>
        <div className="sq-benefits">
          {BENEFITS.map(({ icon: Icon, title, body }, index) => (
            <article key={title} className="sq-benefit sq-spot" data-reveal="card" style={{ '--i': index }}>
              <span className="sq-card-icon"><Icon size={18} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ item }) {
  return (
    <figure className="sq-quote sq-spot">
      <Quotes size={20} weight="fill" className="sq-quote-mark" />
      <blockquote>{item.quote}</blockquote>
      <figcaption>
        <span className="sq-avatar">{item.initials}</span>
        <span><b>{item.name}</b><em>{item.role}</em></span>
      </figcaption>
    </figure>
  );
}

function Testimonials() {
  const rows = [TESTIMONIALS.slice(0, 3), TESTIMONIALS.slice(3)];
  return (
    <section className="sq-section sq-testimonials" id="testimonials" aria-labelledby="testimonials-title">
      <div className="sq-container sq-section-head sq-center-head">
        <p className="sq-kicker" data-reveal>Testimonials</p>
        <Words className="sq-h2" id="testimonials-title" text="Teams that stopped chasing follow-ups." />
      </div>
      <div className="sq-marquee-wrap" data-reveal style={{ '--i': 5 }}>
        {rows.map((row, r) => (
          <div key={r} className={`sq-marquee${r ? ' is-reverse' : ''}`}>
            <div className="sq-marquee-track">
              {[...row, ...row, ...row].map((item, i) => (
                <div key={`${item.initials}-${i}`} className="sq-marquee-item" aria-hidden={i >= row.length}>
                  <TestimonialCard item={item} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="sq-section sq-faq" id="faq" aria-labelledby="faq-title">
      <div className="sq-container sq-faq-grid">
        <div className="sq-faq-head">
          <p className="sq-kicker" data-reveal>FAQ</p>
          <Words className="sq-h2" id="faq-title" text="Questions, answered." />
          <p className="sq-sub" data-reveal style={{ '--i': 4 }}>Anything else? Sign in and ask your workspace admin, or start a workspace and look around.</p>
        </div>
        <div className="sq-faq-list">
          {FAQS.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q} className={`sq-faq-item${isOpen ? ' is-open' : ''}`} data-reveal="card" style={{ '--i': index }}>
                <h3>
                  <button type="button" aria-expanded={isOpen} aria-controls={`faq-${index}`} id={`faq-q-${index}`} onClick={() => setOpen(isOpen ? -1 : index)}>
                    {item.q}
                    <span className="sq-faq-icon"><Plus size={16} weight="bold" /></span>
                  </button>
                </h3>
                <div className="sq-faq-answer" id={`faq-${index}`} role="region" aria-labelledby={`faq-q-${index}`}>
                  <div><p>{item.a}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const [email, setEmail] = useState('');
  const submit = (event) => {
    event.preventDefault();
    window.location.href = APP_URL;
  };
  return (
    <section className="sq-section sq-final" aria-labelledby="cta-title">
      <div className="sq-container">
        <div className="sq-cta2 sq-spot" data-reveal="rise">
          <div className="sq-cta2-horizon" aria-hidden="true" />
          <div className="sq-cta2-grid" aria-hidden="true" />
          <span className="sq-dust" aria-hidden="true" />
          <div className="sq-cta2-copy">
            <span className="sq-eyebrow"><Sparkle size={13} weight="fill" /> Free to start</span>
            <Words className="sq-h2 sq-cta2-title" id="cta-title" lines={['Give every meeting', 'a finish line.']} />
            <p className="sq-sub" data-reveal style={{ '--i': 6 }}>Set up your first project in minutes. Bring the team in when you are ready.</p>
            <form className="sq-cta2-form" onSubmit={submit} data-reveal style={{ '--i': 7 }}>
              <label className="sq-cta2-field">
                <EnvelopeSimple size={16} />
                <span className="sq-visually-hidden">Work email</span>
                <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <button type="submit" className="sq-btn sq-btn-light">Get started <ArrowRight size={15} weight="bold" className="sq-btn-arrow" /></button>
            </form>
            <p className="sq-cta2-note" data-reveal style={{ '--i': 8 }}>Already have a workspace? <a className="sq-link" href={APP_URL}>Sign in <ArrowUpRight size={12} /></a></p>
          </div>
          <div className="sq-cta2-shot" data-parallax="0.06" aria-hidden="true">
            <img src="/site/board.webp" alt="" loading="lazy" width="1440" height="900" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="sq-footer">
      <div className="sq-container sq-footer-top">
        <div className="sq-footer-brand">
          <Logo />
          <p>Project reviews, meetings and reporting in one calm workspace.</p>
        </div>
        <div className="sq-footer-cols">
          <div>
            <h4>Product</h4>
            <a className="sq-link" href="#product">Features</a>
            <a className="sq-link" href="#workflow">Workflow</a>
            <a className="sq-link" href="#views">Views</a>
          </div>
          <div>
            <h4>Company</h4>
            <a className="sq-link" href="#testimonials">Testimonials</a>
            <a className="sq-link" href="#faq">FAQ</a>
          </div>
          <div>
            <h4>Account</h4>
            <a className="sq-link" href={APP_URL}>Sign in</a>
            <a className="sq-link" href={APP_URL}>Create workspace</a>
          </div>
        </div>
      </div>
      <div className="sq-container sq-footer-mark" aria-hidden="true">
        <span data-reveal="rise">Synqra</span>
      </div>
      <div className="sq-container sq-footer-base">
        <span>© {new Date().getFullYear()} Synqra. Powered by MULIA.</span>
        <a className="sq-link" href="#top">Back to top</a>
      </div>
    </footer>
  );
}

export function Website() {
  const rootRef = useRef(null);
  useReveal(rootRef);
  useScrollMotion(rootRef);
  useSpotlight(rootRef);
  return (
    <div className="sq-site" ref={rootRef}>
      <a href="#main" className="sq-skip">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <StageFlow />
        <Bento />
        <Workflow />
        <Views />
        <Benefits />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
