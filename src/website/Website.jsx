import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, CalendarBlank, ChartBar, CheckCircle, Kanban, Lightning, List,
  ListChecks, MagnifyingGlass, NotePencil, ShieldCheck, Sparkle, Users, X,
} from './icons';
import { prefersReducedMotion, useReveal, useScrollMotion, useSpotlight } from './motion';

const APP_URL = '/';

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#views', label: 'Views' },
  { href: '#why', label: 'Why Synqra' },
];

const STAGES = ['Planning', 'Review', 'In progress', 'Final', 'Completed'];

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

function Words({ text, className, id, as: Tag = 'h2', start = 0 }) {
  return (
    <Tag className={className} id={id} aria-label={text}>
      {text.split(' ').map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="sq-word" aria-hidden="true">
            <span data-reveal="word" style={{ '--i': start + index }}>{word}</span>
          </span>{' '}
        </Fragment>
      ))}
    </Tag>
  );
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

function Hero() {
  return (
    <section className="sq-hero" id="top" data-progress>
      <div className="sq-hero-glow" aria-hidden="true" />
      <div className="sq-grid-lines" aria-hidden="true" />
      <div className="sq-container sq-hero-copy">
        <a href="#workflow" className="sq-eyebrow sq-eyebrow-link" data-reveal style={{ '--i': 0 }}>
          <Sparkle size={13} weight="fill" /> Meeting notes become tasks automatically <ArrowRight size={12} className="sq-btn-arrow" />
        </a>
        <Words as="h1" className="sq-display" text="Turn meeting notes into work your team finishes." start={1} />
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
          <div className="sq-hero-frame">
            <div className="sq-window-bar" aria-hidden="true"><i /><i /><i /><span>app.synqra / overview</span></div>
            <img src="/site/overview.webp" alt="Synqra overview showing reviews that need attention, meetings and stage progress" width="1440" height="900" fetchpriority="high" />
          </div>

          <div className="sq-float sq-float-left" data-parallax="0.08" aria-hidden="true">
            <div className="sq-float-card" data-reveal style={{ '--i': 14 }}>
              <div className="sq-float-head"><span className="sq-chip-icon"><NotePencil size={14} /></span>Weekly product sync</div>
              <p className="sq-float-meta">4 action items extracted</p>
              <ul className="sq-extract">
                <li><span className="sq-dot is-danger" />Polish login flow on mobile</li>
                <li><span className="sq-dot is-warning" />Fix kanban card overflow</li>
                <li><span className="sq-dot is-info" />Write onboarding docs</li>
              </ul>
            </div>
          </div>

          <div className="sq-float sq-float-right" data-parallax="0.14" aria-hidden="true">
            <div className="sq-float-card sq-toast" data-reveal style={{ '--i': 16 }}>
              <span className="sq-chip-icon is-success"><CheckCircle size={15} weight="fill" /></span>
              <div><strong>Blocker resolved</strong><p>Audit color contrast moved to Final</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageFlow() {
  return (
    <section className="sq-section sq-flow" aria-labelledby="flow-title">
      <div className="sq-container">
        <p className="sq-kicker" data-reveal>One flow</p>
        <Words className="sq-h2" id="flow-title" text="From first note to done, in five clear stages." />
        <ol className="sq-stages" data-reveal="line">
          {STAGES.map((stage, index) => (
            <li key={stage} className="sq-stage" data-reveal style={{ '--i': index * 2 + 2 }}>
              <span className="sq-stage-node">{index === STAGES.length - 1 ? <CheckCircle size={16} weight="fill" /> : String(index + 1).padStart(2, '0')}</span>
              <span className="sq-stage-label">{stage}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Bento() {
  const bars = [38, 56, 44, 72, 60, 86, 68];
  return (
    <section className="sq-section" id="product" aria-labelledby="product-title">
      <div className="sq-container">
        <div className="sq-section-head">
          <p className="sq-kicker" data-reveal>Product</p>
          <Words className="sq-h2" id="product-title" text="Everything a review needs. Nothing it doesn't." />
          <p className="sq-sub" data-reveal style={{ '--i': 6 }}>Meetings, reviews, planning and reporting share one model, so updates in one place show up everywhere else.</p>
        </div>

        <div className="sq-bento">
          <article className="sq-card sq-spot sq-span-2" data-reveal="card" style={{ '--i': 0 }}>
            <div className="sq-card-copy">
              <span className="sq-card-icon"><NotePencil size={18} /></span>
              <h3>Meetings that write the follow-up</h3>
              <p>Pick a template, take notes, and Synqra pulls out the action items so you can turn them into assigned tasks in one review.</p>
            </div>
            <div className="sq-notes" aria-hidden="true">
              <div className="sq-notes-doc">
                <span className="sq-notes-title">Design critique · Oct 16</span>
                <span className="sq-line w90" /><span className="sq-line w70" /><span className="sq-line w80 is-mark" /><span className="sq-line w60" /><span className="sq-line w75 is-mark" />
              </div>
              <div className="sq-notes-out">
                {['Refine notification menu', 'Improve report filters', 'Settings empty state'].map((task, index) => (
                  <div key={task} className="sq-task-chip" style={{ '--i': index }}>
                    <Sparkle size={12} weight="fill" /> {task}
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="sq-card sq-spot" data-reveal="card" style={{ '--i': 1 }}>
            <div className="sq-card-copy">
              <span className="sq-card-icon"><ListChecks size={18} /></span>
              <h3>Reviews with clear owners</h3>
              <p>Status, priority, assignees and due date on every item, so nothing waits on "who has this?"</p>
            </div>
            <ul className="sq-rows" aria-hidden="true">
              <li><span>SYN-101</span><b>Polish login flow</b><em className="is-danger">Blocker</em></li>
              <li><span>SYN-102</span><b>Fix card overflow</b><em className="is-warning">Major</em></li>
              <li><span>SYN-103</span><b>Onboarding docs</b><em className="is-info">Minor</em></li>
            </ul>
          </article>

          <article className="sq-card sq-spot" data-reveal="card" style={{ '--i': 2 }}>
            <div className="sq-card-copy">
              <span className="sq-card-icon"><ChartBar size={18} /></span>
              <h3>Reports that answer themselves</h3>
              <p>Portfolio health, sprint velocity and team load, always current.</p>
            </div>
            <div className="sq-bars" aria-hidden="true">
              {bars.map((height, index) => <span key={index} style={{ '--h': `${height}%`, '--i': index }} />)}
            </div>
          </article>

          <article className="sq-card sq-spot sq-span-2 sq-card-shot" data-reveal="card" style={{ '--i': 3 }}>
            <div className="sq-card-copy">
              <span className="sq-card-icon"><Kanban size={18} /></span>
              <h3>Board, list, sprint and timeline</h3>
              <p>Plan the same work four ways. Switch views without losing filters, and keep blockers visible wherever you look.</p>
            </div>
            <div className="sq-shot-crop" aria-hidden="true">
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

function FinalCta() {
  return (
    <section className="sq-section sq-final" aria-labelledby="cta-title">
      <div className="sq-container">
        <div className="sq-cta sq-spot" data-reveal="rise">
          <div className="sq-cta-orb" data-parallax="0.12" aria-hidden="true" />
          <div className="sq-cta-copy">
            <Words className="sq-h2" id="cta-title" text="Give every meeting a finish line." />
            <p className="sq-sub" data-reveal style={{ '--i': 6 }}>Set up your first project in minutes. Bring the team in when you are ready.</p>
            <div className="sq-hero-ctas" data-reveal style={{ '--i': 7 }}>
              <a href={APP_URL} className="sq-btn sq-btn-light">Get started free <ArrowRight size={15} weight="bold" className="sq-btn-arrow" /></a>
              <a href={APP_URL} className="sq-btn sq-btn-ghost">Sign in <ArrowUpRight size={14} className="sq-btn-arrow-up" /></a>
            </div>
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
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
