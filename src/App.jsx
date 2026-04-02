import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
const today = new Date();
const currentYM = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
const currentDay = today.getDate();
const currentHalf = currentDay < 15 ? "1st" : "15th";

function lastDayOf(ym) { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function monthLabel(ym) { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" }); }
function prevYM(ym) { const [y, m] = ym.split("-").map(Number); return m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0"); }
function nextYM(ym) { const [y, m] = ym.split("-").map(Number); return m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0"); }

function cmpPeriod(a, b) {
  if (a.ym < b.ym) return -1;
  if (a.ym > b.ym) return 1;
  if (a.half === b.half) return 0;
  return a.half === "1st" ? -1 : 1;
}
function isVisible(t, ym, half) {
  const view = { ym, half };
  const created = { ym: t.createdYM || "2000-01", half: t.createdHalf || "1st" };
  if (cmpPeriod(created, view) > 0) return false;
  if (t.deletedYM && cmpPeriod({ ym: t.deletedYM, half: t.deletedHalf }, view) <= 0) return false;
  return true;
}
function catPill(color) { return { background: color + "22", color, border: "1px solid " + color + "55" }; }

// ─── Theme helper — named "pick" to avoid any collision with Babel internals ──
// pick(theme, darkClasses, lightClasses)
function pick(th, dark, light) { return th === "light" ? light : dark; }

const T = {
  text:        function(th) { return pick(th, "text-white/80", "text-gray-800"); },
  textMuted:   function(th) { return pick(th, "text-white/50", "text-gray-500"); },
  textFaint:   function(th) { return pick(th, "text-white/30", "text-gray-400"); },
  textTiny:    function(th) { return pick(th, "text-white/20", "text-gray-400"); },
  heading:     function(th) { return pick(th, "text-white/90", "text-gray-700"); },
  cardBg:      function(th) { return pick(th, "bg-white/5 border-white/10", "bg-white border-gray-200 shadow-sm"); },
  surfaceBg:   function(th) { return pick(th, "bg-white/5 border-white/10", "bg-gray-50 border-gray-200"); },
  inputCls:    function(th) { return pick(th, "bg-white/5 border-white/10 text-white placeholder-white/30", "bg-white border-gray-300 text-gray-900 placeholder-gray-400"); },
  selectCls:   function(th) { return pick(th, "bg-white/5 border-white/10 text-white", "bg-white border-gray-300 text-gray-900"); },
  btnGhost:    function(th) { return pick(th, "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white", "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-900"); },
  btnActive:   function(th) { return pick(th, "bg-sky-500/20 border-sky-500/50 text-sky-300", "bg-sky-100 border-sky-400 text-sky-700"); },
  divider:     function(th) { return pick(th, "border-white/10", "border-gray-200"); },
  dividerFaint:function(th) { return pick(th, "border-white/5", "border-gray-100"); },
  iconBtn:     function(th) { return pick(th, "text-white/25 hover:text-rose-400", "text-gray-400 hover:text-rose-500"); },
  eyeBtn:      function(th) { return pick(th, "text-white/20 hover:text-white/60", "text-gray-400 hover:text-gray-700"); },
  navActive:   function(th) { return pick(th, "bg-sky-500/20 text-sky-300", "bg-sky-50 text-sky-700"); },
  navIdle:     function(th) { return pick(th, "text-white/60 hover:bg-white/5 hover:text-white", "text-gray-600 hover:bg-gray-100 hover:text-gray-900"); },
  editInput:   function(th) { return pick(th, "bg-white/10 text-white border-sky-400/60", "bg-sky-50 text-gray-900 border-sky-400"); },
};

// ─── Default data ─────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "credit",      label: "Credit Cards", color: "#f43f5e" },
  { id: "home",        label: "Home",         color: "#f59e0b" },
  { id: "loans",       label: "Loans",        color: "#8b5cf6" },
  { id: "health",      label: "Health",       color: "#10b981" },
  { id: "investments", label: "Investments",  color: "#3b82f6" },
  { id: "others",      label: "Others",       color: "#6b7280" },
];
const CAT_COLORS = ["#f43f5e","#f59e0b","#8b5cf6","#10b981","#3b82f6","#6b7280","#ec4899","#14b8a6","#f97316","#a855f7"];

const blankHalf  = function() { return { overrides: {}, skipped: [], actualSpent: [], explicitlyShown: [] }; };
const blankMonth = function() { return { "1st": blankHalf(), "15th": blankHalf() }; };

const INITIAL = {
  templates:        { incomes: [], outcomes: [] },
  categories:       DEFAULT_CATEGORIES,
  monthPeriods:     {},
  savings:          { accounts: [] },
  investments:      { accounts: [] },
  household:        { members: [], expenses: [] },
  householdPeriods: {},
  settings:         { theme: "dark", budgetMode: "biweekly", budgetModeHistory: {} },
};

function migrate(p) {
  var mT = function(list) { return (list || []).map(function(t) { return t.createdYM ? t : Object.assign({}, t, { createdYM: "2000-01", createdHalf: "1st" }); }); };
  return Object.assign({}, INITIAL, p, {
    templates:        { incomes: mT(p.templates && p.templates.incomes), outcomes: mT(p.templates && p.templates.outcomes) },
    categories:       p.categories || DEFAULT_CATEGORIES,
    savings:          Object.assign({ accounts: [] }, p.savings),
    investments:      Object.assign({ accounts: [] }, (p.investments && p.investments.holdings) ? {} : p.investments),
    household:        Object.assign({ members: [], expenses: [] }, p.household),
    householdPeriods: p.householdPeriods || {},
    settings:         Object.assign({ theme: "dark", budgetMode: "biweekly", budgetModeHistory: {} }, p.settings),
  });
}
function loadState() {
  try {
    var s = localStorage.getItem("finflow_v2") || localStorage.getItem("financeApp_v5");
    if (!s) return INITIAL;
    return migrate(JSON.parse(s));
  } catch (e) { return INITIAL; }
}
function saveState(s) { try { localStorage.setItem("finflow_v2", JSON.stringify(s)); } catch (e) {} }

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Card(props) {
  var children = props.children, className = props.className || "", th = props.th;
  return React.createElement("div", { className: "rounded-2xl border p-4 " + T.cardBg(th) + " " + className }, children);
}

function MonthNav(props) {
  var viewYM = props.viewYM, setViewYM = props.setViewYM, th = props.th;
  return (
    <div className={"flex items-center justify-between rounded-xl px-3 py-2 border " + T.surfaceBg(th)}>
      <button onClick={function() { setViewYM(prevYM(viewYM)); }} className={"px-2 py-1 rounded-lg text-xl leading-none transition-colors " + T.textFaint(th)}>{"<"}</button>
      <div className="text-center">
        <div className={"text-sm font-medium " + T.text(th)}>{monthLabel(viewYM)}</div>
        {viewYM === currentYM && <div className="text-xs text-sky-500">current month</div>}
      </div>
      <button onClick={function() { setViewYM(nextYM(viewYM)); }} className={"px-2 py-1 rounded-lg text-xl leading-none transition-colors " + T.textFaint(th)}>{">"}</button>
    </div>
  );
}

function EyeIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7C1 7 3 3 7 3C11 3 13 7 13 7C13 7 11 11 7 11C3 11 1 7 1 7Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="7" cy="7" r="1.8" fill="currentColor"/></svg>; }
function EyeOffIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M5.5 4.2C6 3.9 6.5 3.7 7 3.7C9.8 3.7 11.8 7 11.8 7C11.4 7.7 10.9 8.4 10.2 8.9M8.3 8.6C7.9 9 7.5 9.3 7 9.3C4.2 9.3 2.2 7 2.2 7C2.6 6.3 3.1 5.6 3.8 5.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>; }

function Logo(props) {
  var th = props.th;
  return (
    <div className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <rect width="34" height="34" rx="10" fill="#0f172a"/>
        <rect width="34" height="34" rx="10" fill="url(#ffbg)" opacity="0.12"/>
        <line x1="15" y1="9" x2="15" y2="25" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="15" y1="9" x2="7"  y2="9"  stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="15" y1="17" x2="8" y2="17" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="19" y1="9" x2="19" y2="25" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="19" y1="9" x2="27" y2="9"  stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="19" y1="17" x2="26" y2="17" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round"/>
        <defs><linearGradient id="ffbg" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38bdf8"/><stop offset="100%" stopColor="#818cf8"/></linearGradient></defs>
      </svg>
    </div>
  );
}

// ─── Slide Menu ───────────────────────────────────────────────────────────────
var PAGES = [
  { id: "budget", label: "Cash Flow", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        {/* Path-drawn $ — same stroke weight as other icons */}
        <path d="M12.5,6.5 C12.5,3.5 5.5,3.5 5.5,7 C5.5,10.5 12.5,10.5 12.5,11 C12.5,14.5 5.5,14.5 5.5,11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
        <line x1="9" y1="2" x2="9" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    );
  }},
  { id: "savings", label: "Savings", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        {/* Coin stack — top face, two sides, bottom curve, two coin dividers */}
        <ellipse cx="9" cy="5.5" rx="6.5" ry="2" stroke="currentColor" strokeWidth="1.4"/>
        <line x1="2.5" y1="5.5" x2="2.5" y2="12.5" stroke="currentColor" strokeWidth="1.4"/>
        <line x1="15.5" y1="5.5" x2="15.5" y2="12.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.5,12.5 A6.5,2 0 0 0 15.5,12.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.5,8.3 A6.5,2 0 0 0 15.5,8.3" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M2.5,10.5 A6.5,2 0 0 0 15.5,10.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    );
  }},
  { id: "investments", label: "Investments", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <polyline points="3.5,13.5 7,9.5 10,11.5 14.5,5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="11.5,5.5 14.5,5.5 14.5,8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }},
  { id: "household", label: "Household Expenses", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M1 8L9 2l8 6v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V8Z" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M6 17v-6h6v6" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    );
  }},
  { id: "reports", label: "Reports", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="1" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <line x1="5" y1="6"  x2="13" y2="6"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="5" y1="9"  x2="13" y2="9"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="5" y1="12" x2="9"  y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    );
  }},
  { id: "settings", label: "Settings", icon: function(active, th) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        {/* 8-tooth cog: mathematically computed alternating outer/inner points */}
        <path d="M7.7,1.6 L10.3,1.6 L11.1,3.9 L13.3,2.9 L15.1,4.7 L14.1,6.9 L16.4,7.7 L16.4,10.3 L14.1,11.1 L15.1,13.3 L13.3,15.1 L11.1,14.1 L10.3,16.4 L7.7,16.4 L6.9,14.1 L4.7,15.1 L2.9,13.3 L3.9,11.1 L1.6,10.3 L1.6,7.7 L3.9,6.9 L2.9,4.7 L4.7,2.9 L6.9,3.9 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
        <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    );
  }},
];

function SlideMenu(props) {
  var open = props.open, onClose = props.onClose, activePage = props.activePage, setActivePage = props.setActivePage, th = props.th;
  var panelBg = th === "light" ? "#ffffff" : "#0d1117";
  var border   = th === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  var version  = th === "light" ? "#9ca3af" : "rgba(255,255,255,0.2)";
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose}/>}
      <div className={"fixed top-0 right-0 h-full w-80 z-50 flex flex-col transition-transform duration-300 " + (open ? "translate-x-0" : "translate-x-full")} style={{ background: panelBg, borderLeft: "1px solid " + border }}>
        <div className="flex items-center justify-between px-5 pt-6 pb-4" style={{ borderBottom: "1px solid " + border }}>
          <div className="flex items-center gap-2.5">
            <Logo th={th}/>
            <span className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
              <span className={T.heading(th)}>Fin</span><span style={{ color: "#38bdf8" }}>Flow</span>
            </span>
          </div>
          <button onClick={onClose} className={"text-2xl leading-none " + T.textFaint(th)}>x</button>
        </div>
        <nav className="flex-1 px-3 pt-4 space-y-1">
          {PAGES.map(function(p) {
            return (
              <button key={p.id} onClick={function() { setActivePage(p.id); onClose(); }}
                className={"w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left " + (activePage === p.id ? T.navActive(th) : T.navIdle(th))}>
                <span className="flex-shrink-0 w-5 flex items-center justify-center">{p.icon(activePage === p.id, th)}</span>{p.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4" style={{ borderTop: "1px solid " + border }}>
          <p className="text-xs" style={{ color: version }}>FinFlow v2.0</p>
        </div>
      </div>
    </>
  );
}

// ─── Spending Chart ───────────────────────────────────────────────────────────
function SpendingChart(props) {
  var outcomes = props.outcomes, categories = props.categories, periodData = props.periodData, th = props.th;
  var catTotals = {};
  outcomes.forEach(function(t) {
    if (periodData.skipped.includes(t.id)) return;
    if (!periodData.actualSpent.includes(t.id)) return; // only count paid
    var amt = periodData.overrides[t.id] || 0;
    if (amt <= 0) return;
    var cat = t.category || "others";
    catTotals[cat] = (catTotals[cat] || 0) + amt;
  });
  var total = Object.values(catTotals).reduce(function(s, v) { return s + v; }, 0);
  if (total === 0) return null;
  var active = categories.filter(function(cat) { return catTotals[cat.id] > 0; });
  var R = 56, svgCx = 70, svgCy = 70, strokeW = 20, circ = 2 * Math.PI * R;
  var offset = 0;
  var segs = active.map(function(cat) {
    var pct = catTotals[cat.id] / total, dash = pct * circ;
    var seg = { id: cat.id, color: cat.color, dash: dash, offset: offset };
    offset += dash;
    return seg;
  });
  return (
    <Card th={th} className="mt-2">
      <h3 className={"font-semibold text-sm tracking-wide uppercase mb-4 " + T.heading(th)}>Spending by Category</h3>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx={svgCx} cy={svgCy} r={R} fill="none" stroke={th === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)"} strokeWidth={strokeW}/>
            {segs.map(function(seg) {
              return <circle key={seg.id} cx={svgCx} cy={svgCy} r={R} fill="none" stroke={seg.color} strokeWidth={strokeW} strokeDasharray={seg.dash + " " + (circ - seg.dash)} strokeDashoffset={circ / 4 - seg.offset} strokeLinecap="butt"/>;
            })}
            <text x={svgCx} y={svgCy - 6} textAnchor="middle" fill={th === "light" ? "#1e293b" : "rgba(255,255,255,0.9)"} fontSize="11" fontWeight="600">{fmt(total).replace("$", "")}</text>
            <text x={svgCx} y={svgCy + 9} textAnchor="middle" fill={th === "light" ? "#94a3b8" : "rgba(255,255,255,0.35)"} fontSize="8">paid</text>
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          {active.map(function(cat) {
            var amt = catTotals[cat.id], pct = ((amt / total) * 100).toFixed(0);
            return (
              <div key={cat.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }}/>
                    <span className={"text-xs " + T.textMuted(th)}>{cat.label}</span>
                  </div>
                  <div className="text-right">
                    <span className={"text-xs font-mono " + T.text(th)}>{fmt(amt)}</span>
                    <span className={"text-xs ml-1 " + T.textFaint(th)}>{pct}%</span>
                  </div>
                </div>
                <div className={"h-1 rounded-full overflow-hidden " + (th === "light" ? "bg-gray-100" : "bg-white/5")}>
                  <div className="h-full rounded-full" style={{ width: pct + "%", backgroundColor: cat.color + "99" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── Template Item ────────────────────────────────────────────────────────────
// Uses local draft state so typing doesn't trigger parent re-render mid-input.
// Only commits to parent on blur or Enter, keeping the input mounted and focused.
function TemplateItem(props) {
  var template = props.template, override = props.override, checked = props.checked;
  var type = props.type, categories = props.categories, th = props.th;
  var onAmountChange = props.onAmountChange, onTogglePaid = props.onTogglePaid;

  var [draft, setDraft] = useState(override != null ? String(override) : "");

  // Sync local draft when the parent override changes (e.g. navigating to a different period)
  useEffect(function() {
    setDraft(override != null ? String(override) : "");
  }, [override]);

  function commit() {
    var v = parseFloat(draft);
    onAmountChange(!isNaN(v) && v >= 0 ? v : null);
  }

  var hasAmt = override != null && override > 0;
  var cat = type === "outcome" && template.category ? categories.find(function(x) { return x.id === template.category; }) : null;
  var checkboxCls = "w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all " + (checked ? "bg-emerald-500 border-emerald-500 text-white" : pick(th, "border-white/20 hover:border-white/40", "border-gray-300 hover:border-gray-500"));
  var inputBase = "w-20 rounded-lg px-2 py-1 text-sm font-mono text-right outline-none flex-shrink-0 border transition-colors ";
  var inputCls  = inputBase + (hasAmt ? T.editInput(th) : pick(th, "bg-transparent border-dashed border-white/20 text-white/30 focus:border-sky-400 focus:text-white focus:bg-white/5", "bg-transparent border-dashed border-gray-300 text-gray-400 focus:border-sky-500 focus:text-gray-900 focus:bg-white"));

  return (
    <div className="flex items-center gap-2 py-2 px-2 rounded-xl">
      {type !== "income" && (
        <button onClick={onTogglePaid} className={checkboxCls}>
          {checked && <span style={{ fontSize: 10 }}>&#10003;</span>}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className={"text-sm truncate " + (checked ? "line-through opacity-40" : T.text(th))}>{template.label}</div>
        {cat && <span className="text-xs px-1.5 py-0.5 rounded-full inline-block mt-0.5" style={catPill(cat.color)}>{cat.label}</span>}
      </div>
      <input
        type="number" inputMode="decimal" min="0" step="0.01"
        value={draft}
        placeholder="0.00"
        onChange={function(e) { setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={function(e) { if (e.key === "Enter") { commit(); e.target.blur(); } }}
        className={inputCls}
      />
    </div>
  );
}

// ─── Template List ────────────────────────────────────────────────────────────
function TemplateList(props) {
  var list = props.list, type = props.type, periodData = props.periodData;
  var categories = props.categories, th = props.th;
  var onAmountChange = props.onAmountChange, onTogglePaid = props.onTogglePaid;
  var onToggleSkip = props.onToggleSkip, onRemove = props.onRemove, onUnhideAll = props.onUnhideAll;
  var active = list.filter(function(t) { return !periodData.skipped.includes(t.id); });
  var hidden = list.filter(function(t) { return periodData.skipped.includes(t.id); });
  return (
    <>
      {active.map(function(t) {
        return (
          <div key={t.id} className="flex items-center">
            <button onClick={function() { onToggleSkip(t.id); }} className={"flex-shrink-0 px-1.5 transition-colors " + T.eyeBtn(th)}><EyeIcon/></button>
            <div className="flex-1 min-w-0">
              <TemplateItem template={t} override={periodData.overrides[t.id] != null ? periodData.overrides[t.id] : null} checked={periodData.actualSpent.includes(t.id)} type={type} categories={categories} th={th} onAmountChange={function(v) { onAmountChange(t.id, v); }} onTogglePaid={function() { onTogglePaid(t.id); }}/>
            </div>
            <button onClick={function() { onRemove(t.id); }} className={"flex-shrink-0 px-1.5 text-lg leading-none font-light transition-colors " + T.iconBtn(th)}>x</button>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <div className={"mt-2 pt-2 border-t " + T.dividerFaint(th)}>
          <div className="flex items-center justify-between mb-1">
            <span className={"text-xs " + T.textTiny(th)}>Hidden this period</span>
            <button onClick={onUnhideAll} className={"text-xs transition-colors " + T.textFaint(th)}>unhide all</button>
          </div>
          {hidden.map(function(t) {
            return (
              <div key={t.id} className="flex items-center opacity-50 hover:opacity-80 transition-opacity">
                <button onClick={function() { onToggleSkip(t.id); }} className={"flex-shrink-0 px-1.5 transition-colors " + T.eyeBtn(th)}><EyeOffIcon/></button>
                <span className={"flex-1 text-sm px-2 py-1.5 truncate " + T.textMuted(th)}>{t.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Add Forms ────────────────────────────────────────────────────────────────
function AddIncomeForm(props) {
  var onAdd = props.onAdd, th = props.th;
  var ref = useRef(null);
  function submit() {
    var val = ref.current ? ref.current.value.trim() : "";
    if (!val) return;
    onAdd({ id: uid(), label: val });
    if (ref.current) ref.current.value = "";
  }
  return (
    <div className="flex gap-2 mt-3">
      <input ref={ref} className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-colors " + T.inputCls(th)} placeholder="e.g. Salary, Freelance..." onKeyDown={function(e) { if (e.key === "Enter") submit(); }}/>
      <button onClick={submit} className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">Add</button>
    </div>
  );
}

function AddExpenseForm(props) {
  var onAdd = props.onAdd, categories = props.categories, th = props.th;
  var labelRef = useRef(null);
  var catRef   = useRef(categories[0] ? categories[0].id : "others");
  var [selCat, setSelCat] = useState(categories[0] ? categories[0].id : "others");
  function submit() {
    var val = labelRef.current ? labelRef.current.value.trim() : "";
    if (!val) return;
    onAdd({ id: uid(), label: val, category: selCat });
    if (labelRef.current) labelRef.current.value = "";
  }
  return (
    <div className="space-y-2 mt-3">
      <div className="flex gap-2">
        <input ref={labelRef} className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-400 transition-colors " + T.inputCls(th)} placeholder="e.g. Rent, Netflix..." onKeyDown={function(e) { if (e.key === "Enter") submit(); }}/>
        <button onClick={submit} className="bg-rose-500 hover:bg-rose-400 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {categories.map(function(cat) {
          return (
            <button key={cat.id} onClick={function() { setSelCat(cat.id); }}
              className={"text-xs px-2.5 py-1 rounded-full border transition-all " + (selCat === cat.id ? "font-semibold" : T.textFaint(th) + " border-white/10 hover:opacity-80")}
              style={selCat === cat.id ? catPill(cat.color) : {}}>
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Budget Panel ─────────────────────────────────────────────────────────────
function BudgetPanel(props) {
  var viewYM = props.viewYM, viewHalf = props.viewHalf, templates = props.templates;
  var categories = props.categories, periodData = props.periodData, th = props.th;
  var onPeriodChange = props.onPeriodChange, onAddTemplate = props.onAddTemplate, onRemoveTemplate = props.onRemoveTemplate;

  var visInc  = templates.incomes.filter(function(t)  { return isVisible(t, viewYM, viewHalf); });
  var visOut  = templates.outcomes.filter(function(t) { return isVisible(t, viewYM, viewHalf); });
  var activeInc = visInc.filter(function(t)  { return !periodData.skipped.includes(t.id); });
  var activeOut = visOut.filter(function(t) { return !periodData.skipped.includes(t.id); });

  var carryover   = periodData.carryover || 0;
  var totalIncome = activeInc.reduce(function(s, t) { return s + (periodData.overrides[t.id] || 0); }, 0) + carryover;
  var totalPaid   = activeOut.filter(function(t) { return periodData.actualSpent.includes(t.id); }).reduce(function(s, t) { return s + (periodData.overrides[t.id] || 0); }, 0);
  var totalUnpaid = activeOut.filter(function(t) { return !periodData.actualSpent.includes(t.id); }).reduce(function(s, t) { return s + (periodData.overrides[t.id] || 0); }, 0);
  var totalExp    = totalPaid + totalUnpaid;
  var balance     = totalIncome - totalPaid; // only paid expenses count against balance
  var projected   = totalIncome - totalExp;

  var missingInc = activeInc.filter(function(t) { return !periodData.overrides[t.id]; });
  var missingOut = activeOut.filter(function(t) { return !periodData.overrides[t.id]; });

  function setOverride(id, val)  { var o = Object.assign({}, periodData.overrides); o[id] = val; onPeriodChange(Object.assign({}, periodData, { overrides: o })); }
  function clearOverride(id)     { var o = Object.assign({}, periodData.overrides); delete o[id]; onPeriodChange(Object.assign({}, periodData, { overrides: o })); }
  function togglePaid(id)        { var ns = periodData.actualSpent.includes(id) ? periodData.actualSpent.filter(function(x) { return x !== id; }) : periodData.actualSpent.concat([id]); onPeriodChange(Object.assign({}, periodData, { actualSpent: ns })); }
  function toggleSkip(id) {
    var isSkipped = periodData.skipped.includes(id);
    var ns = isSkipped ? periodData.skipped.filter(function(x) { return x !== id; }) : periodData.skipped.concat([id]);
    var shown = periodData.explicitlyShown || [];
    var nsh   = isSkipped ? shown.concat([id]).filter(function(v, i, a) { return a.indexOf(v) === i; }) : shown.filter(function(x) { return x !== id; });
    onPeriodChange(Object.assign({}, periodData, { skipped: ns, explicitlyShown: nsh }));
  }
  function unhideAll(type) {
    var ls = type === "income" ? visInc : visOut;
    var ids = ls.filter(function(t) { return periodData.skipped.includes(t.id); }).map(function(t) { return t.id; });
    var shown = (periodData.explicitlyShown || []).concat(ids).filter(function(v, i, a) { return a.indexOf(v) === i; });
    var ns = periodData.skipped.filter(function(id) { return !ls.find(function(t) { return t.id === id; }); });
    onPeriodChange(Object.assign({}, periodData, { skipped: ns, explicitlyShown: shown }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card th={th} className="text-center">
          <div className={"text-xs mb-1 " + T.textFaint(th)}>Income</div>
          <div className={"font-mono text-lg " + (totalIncome > 0 ? "text-emerald-500" : T.textTiny(th))}>{fmt(totalIncome)}</div>
        </Card>
        <Card th={th} className="text-center">
          <div className={"text-xs mb-1 " + T.textFaint(th)}>Paid out</div>
          <div className={"font-mono text-lg " + (totalPaid > 0 ? "text-rose-500" : T.textTiny(th))}>{fmt(totalPaid)}</div>
        </Card>
        <Card th={th} className={"text-center " + (balance < 0 ? "border-rose-500/40" : "")}>
          <div className={"text-xs mb-1 " + T.textFaint(th)}>Balance</div>
          <div className={"font-mono text-lg " + (balance >= 0 ? "text-sky-500" : "text-rose-500")}>{fmt(balance)}</div>
        </Card>
      </div>

      {totalUnpaid > 0 && (
        <Card th={th} className="bg-amber-500/5 border-amber-500/20">
          <div className="flex justify-between items-center text-sm">
            <span className={T.textMuted(th)}>Upcoming (not yet paid)</span>
            <span className="font-mono text-amber-500">-{fmt(totalUnpaid)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className={T.textFaint(th)}>Projected balance</span>
            <span className={"font-mono " + (projected >= 0 ? "text-sky-500" : "text-rose-500")}>{fmt(projected)}</span>
          </div>
        </Card>
      )}

      {(missingInc.length > 0 || missingOut.length > 0) && (
        <Card th={th} className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">!</span>
            <div>
              <p className="text-xs text-amber-600 font-medium mb-1">Amounts not filled in:</p>
              {missingInc.map(function(t) { return <p key={t.id} className="text-xs text-amber-600/70">- {t.label} (income)</p>; })}
              {missingOut.map(function(t) { return <p key={t.id} className="text-xs text-amber-600/70">- {t.label} (expense)</p>; })}
            </div>
          </div>
        </Card>
      )}

      {carryover > 0 && (
        <Card th={th} className="bg-sky-500/5 border-sky-500/20">
          <div className="flex justify-between items-center text-sm">
            <span className={T.textMuted(th)}>Carryover from previous period</span>
            <span className="font-mono text-sky-500">{fmt(carryover)}</span>
          </div>
        </Card>
      )}

      <Card th={th}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={"font-semibold text-sm tracking-wide uppercase " + T.heading(th)}>Income</h3>
          <div className="flex gap-1.5">
            {missingInc.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30">{missingInc.length} pending</span>}
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">{activeInc.length} items</span>
          </div>
        </div>
        {visInc.length === 0 && <p className={"text-xs py-2 " + T.textTiny(th)}>No recurring incomes yet.</p>}
        <TemplateList list={visInc} type="income" periodData={periodData} categories={categories} th={th}
          onAmountChange={function(id, v) { if (v !== null) setOverride(id, v); else clearOverride(id); }}
          onTogglePaid={togglePaid} onToggleSkip={toggleSkip}
          onRemove={function(id) { onRemoveTemplate("income", id, viewYM, viewHalf); }}
          onUnhideAll={function() { unhideAll("income"); }}/>
        <div className={"border-t mt-3 pt-3 " + T.dividerFaint(th)}>
          <p className={"text-xs mb-1 " + T.textTiny(th)}>Add recurring income — appears in this and future periods</p>
          <AddIncomeForm onAdd={function(item) { onAddTemplate("income", item, viewYM, viewHalf); }} th={th}/>
        </div>
      </Card>

      <Card th={th}>
        <div className="flex items-center justify-between mb-2">
          <h3 className={"font-semibold text-sm tracking-wide uppercase " + T.heading(th)}>Expenses</h3>
          <div className="flex gap-1.5">
            {missingOut.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30">{missingOut.length} pending</span>}
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 border border-rose-500/30">{activeOut.length} items</span>
          </div>
        </div>
        <p className={"text-xs mb-2 " + T.textTiny(th)}>Check the box next to expenses you have already paid</p>
        {visOut.length === 0 && <p className={"text-xs py-2 " + T.textTiny(th)}>No recurring expenses yet.</p>}
        <TemplateList list={visOut} type="outcome" periodData={periodData} categories={categories} th={th}
          onAmountChange={function(id, v) { if (v !== null) setOverride(id, v); else clearOverride(id); }}
          onTogglePaid={togglePaid} onToggleSkip={toggleSkip}
          onRemove={function(id) { onRemoveTemplate("outcome", id, viewYM, viewHalf); }}
          onUnhideAll={function() { unhideAll("outcome"); }}/>
        <div className={"border-t mt-3 pt-3 " + T.dividerFaint(th)}>
          <p className={"text-xs mb-1 " + T.textTiny(th)}>Add recurring expense — appears in this and future periods</p>
          <AddExpenseForm onAdd={function(item) { onAddTemplate("outcome", item, viewYM, viewHalf); }} categories={categories} th={th}/>
        </div>
      </Card>

      <SpendingChart outcomes={visOut} categories={categories} periodData={periodData} th={th}/>
    </div>
  );
}

// ─── Category Manager ─────────────────────────────────────────────────────────
function CategoryManager(props) {
  var categories = props.categories, viewYM = props.viewYM, viewHalf = props.viewHalf, th = props.th;
  var onAdd = props.onAdd, onRemove = props.onRemove;
  var [newLabel, setNewLabel] = useState("");
  var [newColor, setNewColor] = useState(CAT_COLORS[0]);
  var visCats = categories.filter(function(cat) { return isVisible(cat, viewYM, viewHalf); });
  function add() {
    if (!newLabel.trim()) return;
    onAdd({ id: uid(), label: newLabel.trim(), color: newColor, createdYM: viewYM, createdHalf: viewHalf });
    setNewLabel("");
  }
  return (
    <Card th={th}>
      <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Expense Categories</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {visCats.map(function(cat) {
          return (
            <div key={cat.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border" style={catPill(cat.color)}>
              {cat.label}
              <button onClick={function() { onRemove(cat.id, viewYM, viewHalf); }} className="opacity-50 hover:opacity-100 transition-opacity">x</button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors " + T.inputCls(th)} placeholder="New category..." value={newLabel} onChange={function(e) { setNewLabel(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") add(); }}/>
        <div className="flex gap-1 items-center">
          {CAT_COLORS.slice(0, 5).map(function(col) {
            return <button key={col} onClick={function() { setNewColor(col); }} className={"w-5 h-5 rounded-full transition-all " + (newColor === col ? "ring-2 ring-offset-1 scale-110" : "")} style={{ backgroundColor: col }}/>;
          })}
        </div>
        <button onClick={add} className={"border rounded-xl px-3 py-2 text-sm font-semibold transition-colors " + T.btnGhost(th)}>+</button>
      </div>
    </Card>
  );
}

// ─── Savings Panel ────────────────────────────────────────────────────────────
function SavingsPanel(props) {
  var data = props.data, onChange = props.onChange, th = props.th;
  var [newName,  setNewName]  = useState("");
  var [expanded, setExpanded] = useState(null);
  var [txAccId,  setTxAccId]  = useState("");
  var [txType,   setTxType]   = useState("add");
  var [txAmt,    setTxAmt]    = useState("");
  var [txNote,   setTxNote]   = useState("");
  var [txDate,   setTxDate]   = useState(new Date().toISOString().slice(0, 10));
  var [viewYM,   setViewYM]   = useState(currentYM);

  function inMonth(iso) { return iso && iso.slice(0, 7) === viewYM; }
  function bal(acc) { return acc.transactions.reduce(function(s, t) { return t.type === "add" ? s + t.amount : s - t.amount; }, 0); }
  var total = data.accounts.reduce(function(s, a) { return s + bal(a); }, 0);

  function addAcc() {
    if (!newName.trim()) return;
    var id = uid();
    onChange(Object.assign({}, data, { accounts: data.accounts.concat([{ id: id, name: newName.trim(), transactions: [] }]) }));
    setNewName(""); setTxAccId(id);
  }
  function remAcc(id) { onChange(Object.assign({}, data, { accounts: data.accounts.filter(function(a) { return a.id !== id; }) })); }
  function remTx(aId, tId) {
    onChange(Object.assign({}, data, { accounts: data.accounts.map(function(a) { return a.id === aId ? Object.assign({}, a, { transactions: a.transactions.filter(function(t) { return t.id !== tId; }) }) : a; }) }));
  }
  function addTx() {
    if (!txAccId || !txAmt || isNaN(parseFloat(txAmt))) return;
    var amt = parseFloat(txAmt);
    var acc = data.accounts.find(function(a) { return a.id === txAccId; });
    if (!acc) return;
    if (txType === "remove" && amt > bal(acc)) { alert("Exceeds balance"); return; }
    var parts = txDate.split("-");
    var disp = new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    var tx = { id: uid(), type: txType, amount: amt, note: txNote.trim(), date: disp, isoDate: txDate };
    onChange(Object.assign({}, data, { accounts: data.accounts.map(function(a) { return a.id === txAccId ? Object.assign({}, a, { transactions: a.transactions.concat([tx]) }) : a; }) }));
    setTxAmt(""); setTxNote("");
  }

  return (
    <div className="space-y-4">
      <MonthNav viewYM={viewYM} setViewYM={setViewYM} th={th}/>
      <Card th={th} className="text-center bg-sky-500/5 border-sky-500/20">
        <div className={"text-xs mb-1 " + T.textFaint(th)}>Total Savings (all time)</div>
        <div className="font-mono text-3xl text-sky-500 font-bold">{fmt(total)}</div>
        <div className={"text-xs mt-1 " + T.textFaint(th)}>{data.accounts.length} account{data.accounts.length !== 1 ? "s" : ""}</div>
      </Card>
      {data.accounts.map(function(a) {
        var b = bal(a), isOpen = expanded === a.id;
        var mTxs = a.transactions.filter(function(t) { return inMonth(t.isoDate); }).sort(function(x, y) { return y.isoDate.localeCompare(x.isoDate); });
        return (
          <Card key={a.id} th={th} className={isOpen ? "border-sky-500/30" : ""}>
            <div className="flex items-center justify-between">
              <button onClick={function() { setExpanded(isOpen ? null : a.id); }} className="flex items-center gap-3 flex-1 text-left">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-600 font-bold text-sm flex-shrink-0">{a.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className={"text-sm font-semibold " + T.heading(th)}>{a.name}</div>
                  <div className={"text-xs " + T.textFaint(th)}>{a.transactions.length} transactions</div>
                </div>
              </button>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg text-sky-500">{fmt(b)}</span>
                <button onClick={function() { remAcc(a.id); }} className={"transition-colors px-1 " + T.iconBtn(th)}>x</button>
              </div>
            </div>
            {isOpen && (
              <div className={"mt-3 pt-3 border-t " + T.dividerFaint(th)}>
                <p className={"text-xs mb-2 " + T.textFaint(th)}>{monthLabel(viewYM)}</p>
                {mTxs.length === 0 ? <p className={"text-xs italic py-1 " + T.textTiny(th)}>No transactions this month.</p> : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {mTxs.map(function(t) {
                      return (
                        <div key={t.id} className="flex items-center justify-between py-1.5">
                          <div>
                            <div className={"text-xs " + T.textMuted(th)}>{t.note || (t.type === "add" ? "Deposit" : "Withdrawal")}</div>
                            <div className={"text-xs " + T.textTiny(th)}>{t.date}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={"font-mono text-sm " + (t.type === "add" ? "text-emerald-500" : "text-rose-500")}>{t.type === "add" ? "+" : "-"}{fmt(t.amount)}</span>
                            <button onClick={function() { remTx(a.id, t.id); }} className={"text-xs transition-colors " + T.iconBtn(th)}>x</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {a.transactions.length > mTxs.length && <p className={"text-xs mt-2 " + T.textTiny(th)}>{a.transactions.length - mTxs.length} more in other months</p>}
              </div>
            )}
          </Card>
        );
      })}
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Add Account</h3>
        <div className="flex gap-2">
          <input className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors " + T.inputCls(th)} placeholder="e.g. Chase, Ally..." value={newName} onChange={function(e) { setNewName(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addAcc(); }}/>
          <button onClick={addAcc} className="bg-sky-500 hover:bg-sky-400 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">Add</button>
        </div>
      </Card>
      {data.accounts.length > 0 && (
        <Card th={th}>
          <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Record Transaction</h3>
          <div className="space-y-2">
            <select className={"w-full border rounded-xl px-3 py-2 text-sm outline-none " + T.selectCls(th)} value={txAccId} onChange={function(e) { setTxAccId(e.target.value); }}>
              <option value="">Select account...</option>
              {data.accounts.map(function(a) { return <option key={a.id} value={a.id}>{a.name} — {fmt(bal(a))}</option>; })}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={function() { setTxType("add"); }} className={"py-2 rounded-xl text-sm font-semibold border transition-all " + (txType === "add" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-600" : T.btnGhost(th))}>+ Add</button>
              <button onClick={function() { setTxType("remove"); }} className={"py-2 rounded-xl text-sm font-semibold border transition-all " + (txType === "remove" ? "bg-rose-500/20 border-rose-500/50 text-rose-600" : T.btnGhost(th))}>- Remove</button>
            </div>
            <input className={"w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono " + T.inputCls(th)} placeholder="Amount" type="number" inputMode="decimal" min="0" step="0.01" value={txAmt} onChange={function(e) { setTxAmt(e.target.value); }}/>
            <div className={"flex items-center gap-2 border rounded-xl px-3 py-2 " + T.surfaceBg(th)}>
              <span className={"text-xs flex-shrink-0 " + T.textFaint(th)}>Date</span>
              <input type="date" value={txDate} onChange={function(e) { setTxDate(e.target.value); }} className={"flex-1 bg-transparent text-sm outline-none text-right " + T.text(th)} style={{ colorScheme: th === "light" ? "light" : "dark" }}/>
            </div>
            <input className={"w-full border rounded-xl px-3 py-2 text-sm outline-none " + T.inputCls(th)} placeholder="Note (optional)" value={txNote} onChange={function(e) { setTxNote(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addTx(); }}/>
            <button onClick={addTx} className={"w-full text-white rounded-xl py-2.5 text-sm font-semibold transition-colors " + (txType === "add" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-rose-500 hover:bg-rose-400")}>{txType === "add" ? "Record Deposit" : "Record Withdrawal"}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Investments Panel ────────────────────────────────────────────────────────
function InvestmentsPanel(props) {
  var data = props.data, onChange = props.onChange, th = props.th;
  var [newName,  setNewName]  = useState("");
  var [expanded, setExpanded] = useState(null);
  var [depAccId, setDepAccId] = useState("");
  var [depAmt,   setDepAmt]   = useState("");
  var [depDate,  setDepDate]  = useState(new Date().toISOString().slice(0, 10));
  var [depNote,  setDepNote]  = useState("");
  var [viewYM,   setViewYM]   = useState(currentYM);

  function inMonth(iso) { return iso && iso.slice(0, 7) === viewYM; }
  function totalDep(acc) { return acc.deposits.reduce(function(s, d) { return s + d.amount; }, 0); }
  function monthDep(acc) { return acc.deposits.filter(function(d) { return inMonth(d.isoDate); }).reduce(function(s, d) { return s + d.amount; }, 0); }
  var grandAll = data.accounts.reduce(function(s, a) { return s + totalDep(a); }, 0);
  var grandMon = data.accounts.reduce(function(s, a) { return s + monthDep(a); }, 0);

  function addAcc() {
    if (!newName.trim()) return;
    var id = uid();
    onChange(Object.assign({}, data, { accounts: data.accounts.concat([{ id: id, name: newName.trim(), deposits: [] }]) }));
    setNewName(""); setDepAccId(id);
  }
  function remAcc(id) { onChange(Object.assign({}, data, { accounts: data.accounts.filter(function(a) { return a.id !== id; }) })); }
  function remDep(aId, dId) {
    onChange(Object.assign({}, data, { accounts: data.accounts.map(function(a) { return a.id === aId ? Object.assign({}, a, { deposits: a.deposits.filter(function(d) { return d.id !== dId; }) }) : a; }) }));
  }
  function addDep() {
    if (!depAccId || !depAmt || isNaN(parseFloat(depAmt))) return;
    var parts = depDate.split("-");
    var disp = new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    var dep = { id: uid(), amount: parseFloat(depAmt), date: disp, isoDate: depDate, note: depNote.trim() };
    onChange(Object.assign({}, data, { accounts: data.accounts.map(function(a) { return a.id === depAccId ? Object.assign({}, a, { deposits: a.deposits.concat([dep]) }) : a; }) }));
    setDepAmt(""); setDepNote("");
  }

  return (
    <div className="space-y-4">
      <MonthNav viewYM={viewYM} setViewYM={setViewYM} th={th}/>
      <div className="grid grid-cols-2 gap-3">
        <Card th={th} className="text-center"><div className={"text-xs mb-1 " + T.textFaint(th)}>This Month</div><div className={"font-mono text-xl " + (grandMon > 0 ? "text-violet-500" : T.textTiny(th))}>{fmt(grandMon)}</div></Card>
        <Card th={th} className="text-center"><div className={"text-xs mb-1 " + T.textFaint(th)}>All Time</div><div className={"font-mono text-xl " + (grandAll > 0 ? "text-violet-500" : T.textTiny(th))}>{fmt(grandAll)}</div></Card>
      </div>
      {data.accounts.map(function(a) {
        var isOpen = expanded === a.id, mDep = monthDep(a), aDep = totalDep(a);
        var mTxs = a.deposits.filter(function(d) { return inMonth(d.isoDate); }).sort(function(x, y) { return y.isoDate.localeCompare(x.isoDate); });
        return (
          <Card key={a.id} th={th} className={isOpen ? "border-violet-500/30" : ""}>
            <div className="flex items-center justify-between">
              <button onClick={function() { setExpanded(isOpen ? null : a.id); }} className="flex items-center gap-3 flex-1 text-left">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-600 font-bold text-xs flex-shrink-0">{a.name.slice(0, 3).toUpperCase()}</div>
                <div>
                  <div className={"text-sm font-semibold " + T.heading(th)}>{a.name}</div>
                  <div className={"text-xs " + T.textFaint(th)}>{mDep > 0 ? <span className="text-violet-500">{fmt(mDep)} this month</span> : <span>no transfers this month</span>}{aDep > 0 && <span className={"ml-1 " + T.textTiny(th)}> - {fmt(aDep)} total</span>}</div>
                </div>
              </button>
              <button onClick={function() { remAcc(a.id); }} className={"text-sm transition-colors px-1 " + T.iconBtn(th)}>x</button>
            </div>
            {isOpen && (
              <div className={"mt-4 pt-3 border-t space-y-2 " + T.dividerFaint(th)}>
                <p className={"text-xs " + T.textFaint(th)}>{monthLabel(viewYM)}</p>
                {mTxs.length === 0 ? <p className={"text-xs italic py-1 " + T.textTiny(th)}>No transfers this month.</p> : (
                  <div className="space-y-1">
                    {mTxs.map(function(d) {
                      return (
                        <div key={d.id} className="flex items-center justify-between py-1.5">
                          <div><div className={"text-xs " + T.textMuted(th)}>{d.note || "Transfer"}</div><div className={"text-xs " + T.textTiny(th)}>{d.date}</div></div>
                          <div className="flex items-center gap-2"><span className="font-mono text-sm text-violet-500">+{fmt(d.amount)}</span><button onClick={function() { remDep(a.id, d.id); }} className={"text-xs transition-colors " + T.iconBtn(th)}>x</button></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {aDep > 0 && <div className={"flex justify-between items-center rounded-xl px-3 py-2 text-xs border " + T.surfaceBg(th)}><span className={T.textFaint(th)}>All-time transferred</span><span className="font-mono text-violet-500 font-semibold">{fmt(aDep)}</span></div>}
              </div>
            )}
          </Card>
        );
      })}
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Add Investment Account</h3>
        <div className="flex gap-2">
          <input className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors " + T.inputCls(th)} placeholder="e.g. FidelityGo..." value={newName} onChange={function(e) { setNewName(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addAcc(); }}/>
          <button onClick={addAcc} className="bg-violet-500 hover:bg-violet-400 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">Add</button>
        </div>
      </Card>
      {data.accounts.length > 0 && (
        <Card th={th}>
          <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Record Transfer</h3>
          <div className="space-y-2">
            <select className={"w-full border rounded-xl px-3 py-2 text-sm outline-none " + T.selectCls(th)} value={depAccId} onChange={function(e) { setDepAccId(e.target.value); }}>
              <option value="">Select account...</option>
              {data.accounts.map(function(a) { return <option key={a.id} value={a.id}>{a.name}</option>; })}
            </select>
            <input className={"w-full border rounded-xl px-3 py-2 text-sm outline-none font-mono " + T.inputCls(th)} placeholder="Amount ($)" type="number" inputMode="decimal" min="0" step="0.01" value={depAmt} onChange={function(e) { setDepAmt(e.target.value); }}/>
            <div className={"flex items-center gap-2 border rounded-xl px-3 py-2 " + T.surfaceBg(th)}>
              <span className={"text-xs flex-shrink-0 " + T.textFaint(th)}>Date</span>
              <input type="date" value={depDate} onChange={function(e) { setDepDate(e.target.value); }} className={"flex-1 bg-transparent text-sm outline-none text-right " + T.text(th)} style={{ colorScheme: th === "light" ? "light" : "dark" }}/>
            </div>
            <input className={"w-full border rounded-xl px-3 py-2 text-sm outline-none " + T.inputCls(th)} placeholder="Note (optional)" value={depNote} onChange={function(e) { setDepNote(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addDep(); }}/>
            <button onClick={addDep} className="w-full bg-violet-500 hover:bg-violet-400 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">Record Transfer</button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────
function ExpenseRow(props) {
  var exp = props.exp, th = props.th;
  var getExpData = props.getExpData, setExpAmount = props.setExpAmount;
  var toggleSkipExp = props.toggleSkipExp, removeExpense = props.removeExpense;
  var d = getExpData(exp.id);

  var [draft, setDraft] = useState(d.amount != null ? String(d.amount) : "");

  useEffect(function() {
    setDraft(d.amount != null ? String(d.amount) : "");
  }, [d.amount]);

  function commit() {
    var v = parseFloat(draft);
    setExpAmount(exp.id, !isNaN(v) && v >= 0 ? v : null);
  }

  var hasAmt = d.amount != null && d.amount > 0;
  var inputBase = "w-20 rounded-lg px-2 py-1 text-sm font-mono text-right outline-none flex-shrink-0 border transition-colors ";
  var inputCls  = inputBase + (hasAmt ? T.editInput(th) : pick(th, "bg-transparent border-dashed border-white/20 text-white/30 focus:border-sky-400 focus:text-white focus:bg-white/5", "bg-transparent border-dashed border-gray-300 text-gray-400 focus:border-sky-500 focus:text-gray-900 focus:bg-white"));
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-xl group">
      <button onClick={function() { toggleSkipExp(exp); }} className={"flex-shrink-0 transition-colors " + T.eyeBtn(th)}><EyeIcon/></button>
      <span className={"flex-1 text-sm truncate " + T.text(th)}>{exp.label}</span>
      <input
        type="number" inputMode="decimal" min="0" step="0.01"
        value={draft}
        placeholder="0.00"
        onChange={function(e) { setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={function(e) { if (e.key === "Enter") { commit(); e.target.blur(); } }}
        className={inputCls}
      />
      <button onClick={function() { removeExpense(exp.id); }} className={"flex-shrink-0 text-lg leading-none font-light transition-colors opacity-0 group-hover:opacity-100 " + T.iconBtn(th)}>x</button>
    </div>
  );
}

// ─── Household Panel ──────────────────────────────────────────────────────────
function HouseholdPanel(props) {
  var household = props.household, householdPeriods = props.householdPeriods;
  var onChange = props.onChange, onChangePeriods = props.onChangePeriods, th = props.th;
  var [viewYM,         setViewYM]         = useState(currentYM);
  var [newMemberName,  setNewMemberName]  = useState("");
  var [expandedMember, setExpandedMember] = useState(null);
  var [addExpState,    setAddExpState]    = useState({});

  var visMembers  = (household.members  || []).filter(function(m) { return isVisible(m, viewYM, "1st"); });
  var visExpenses = (household.expenses || []).filter(function(e) { return isVisible(e, viewYM, "1st"); });

  function getExpData(expId) { return (householdPeriods[viewYM] && householdPeriods[viewYM][expId]) || { amount: null, skipped: false, explicitlyShown: false }; }
  function setExpData(expId, d) {
    var ym = Object.assign({}, householdPeriods[viewYM] || {});
    ym[expId] = d;
    onChangePeriods(Object.assign({}, householdPeriods, { [viewYM]: ym }));
  }
  function isExpSkipped(exp) {
    var d = getExpData(exp.id);
    if (d.explicitlyShown) return false;
    if (d.skipped) return true;
    var created = { ym: exp.createdYM || "2000-01", half: "1st" };
    return exp.skippedByDefault && cmpPeriod(created, { ym: viewYM, half: "1st" }) < 0;
  }
  function toggleSkipExp(exp) {
    var d = getExpData(exp.id), wasSkipped = isExpSkipped(exp);
    setExpData(exp.id, Object.assign({}, d, { skipped: !wasSkipped, explicitlyShown: wasSkipped }));
  }
  function setExpAmount(expId, val) { var d = getExpData(expId); setExpData(expId, Object.assign({}, d, { amount: val })); }
  function addMember() {
    if (!newMemberName.trim()) return;
    var m = { id: uid(), name: newMemberName.trim(), createdYM: viewYM, createdHalf: "1st" };
    onChange(Object.assign({}, household, { members: (household.members || []).concat([m]) }));
    setNewMemberName(""); setExpandedMember(m.id);
  }
  function removeMember(id) {
    onChange(Object.assign({}, household, { members: (household.members || []).map(function(m) { return m.id === id ? Object.assign({}, m, { deletedYM: viewYM, deletedHalf: "1st" }) : m; }) }));
  }
  function addExpense(memberId) {
    var form = addExpState[memberId] || { label: "", amount: "" };
    if (!form.label.trim()) return;
    var amt = parseFloat(form.amount), expId = uid();
    var exp = { id: expId, memberId: memberId, label: form.label.trim(), createdYM: viewYM, createdHalf: "1st", skippedByDefault: true };
    onChange(Object.assign({}, household, { expenses: (household.expenses || []).concat([exp]) }));
    if (!isNaN(amt) && amt >= 0) {
      var ym = Object.assign({}, householdPeriods[viewYM] || {});
      ym[expId] = { amount: amt, skipped: false, explicitlyShown: true };
      onChangePeriods(Object.assign({}, householdPeriods, { [viewYM]: ym }));
    }
    setAddExpState(function(s) { return Object.assign({}, s, { [memberId]: { label: "", amount: "" } }); });
  }
  function removeExpense(id) {
    onChange(Object.assign({}, household, { expenses: (household.expenses || []).map(function(e) { return e.id === id ? Object.assign({}, e, { deletedYM: viewYM, deletedHalf: "1st" }) : e; }) }));
  }
  function unhideAll(memberId) {
    var exps = visExpenses.filter(function(e) { return e.memberId === memberId && isExpSkipped(e); });
    var updates = {};
    exps.forEach(function(e) { updates[e.id] = Object.assign({}, getExpData(e.id), { skipped: false, explicitlyShown: true }); });
    var ym = Object.assign({}, householdPeriods[viewYM] || {}, updates);
    onChangePeriods(Object.assign({}, householdPeriods, { [viewYM]: ym }));
  }

  var memberSummaries = visMembers.map(function(m) {
    var exps = visExpenses.filter(function(e) { return e.memberId === m.id && !isExpSkipped(e); });
    var total = exps.reduce(function(s, e) { return s + (getExpData(e.id).amount || 0); }, 0);
    return Object.assign({}, m, { total: total });
  });
  var grandTotal = memberSummaries.reduce(function(s, m) { return s + m.total; }, 0);
  var perShare   = visMembers.length > 0 ? grandTotal / visMembers.length : 0;

  return (
    <div className="space-y-4">
      <MonthNav viewYM={viewYM} setViewYM={setViewYM} th={th}/>
      {visMembers.length > 0 && grandTotal > 0 && (
        <Card th={th} className="bg-sky-500/5 border-sky-500/20">
          <div className={"text-xs mb-2 " + T.textFaint(th)}>Household Summary — {monthLabel(viewYM)}</div>
          <div className="flex justify-between text-sm mb-1"><span className={T.textMuted(th)}>Total expenses</span><span className={"font-mono " + T.text(th)}>{fmt(grandTotal)}</span></div>
          <div className="flex justify-between text-sm mb-3"><span className={T.textMuted(th)}>Equal share per member</span><span className="font-mono text-sky-500">{fmt(perShare)}</span></div>
          <div className="space-y-1.5">
            {memberSummaries.map(function(m) {
              var diff = m.total - perShare;
              return (
                <div key={m.id} className={"flex items-start justify-between text-xs rounded-lg px-3 py-2 border " + T.surfaceBg(th)}>
                  <span className={"font-medium " + T.text(th)}>{m.name}</span>
                  <div className="text-right">
                    <div className={"font-mono " + T.textMuted(th)}>{fmt(m.total)} paid</div>
                    {Math.abs(diff) > 0.01 && <div className={"font-mono text-xs " + (diff > 0 ? "text-emerald-500" : "text-rose-500")}>{diff > 0 ? "receives " + fmt(Math.abs(diff)) : "owes " + fmt(Math.abs(diff))}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {visMembers.map(function(m) {
        var isOpen    = expandedMember === m.id;
        var memberExps = visExpenses.filter(function(e) { return e.memberId === m.id; });
        var activeExps = memberExps.filter(function(e) { return !isExpSkipped(e); });
        var hiddenExps = memberExps.filter(function(e) { return isExpSkipped(e); });
        var memberTotal = activeExps.reduce(function(s, e) { return s + (getExpData(e.id).amount || 0); }, 0);
        var expForm = addExpState[m.id] || { label: "", amount: "" };
        return (
          <Card key={m.id} th={th} className={isOpen ? "border-sky-500/30" : ""}>
            <div className="flex items-center justify-between">
              <button onClick={function() { setExpandedMember(isOpen ? null : m.id); }} className="flex items-center gap-3 flex-1 text-left">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-600 font-bold text-sm flex-shrink-0">{m.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className={"text-sm font-semibold " + T.heading(th)}>{m.name}</div>
                  <div className={"text-xs " + T.textFaint(th)}>{memberTotal > 0 ? <span className="text-sky-500">{fmt(memberTotal)} this month</span> : <span>no expenses this month</span>}{hiddenExps.length > 0 && <span className={"ml-1 " + T.textTiny(th)}>- {hiddenExps.length} hidden</span>}</div>
                </div>
              </button>
              <button onClick={function() { removeMember(m.id); }} className={"text-sm transition-colors px-1 " + T.iconBtn(th)}>x</button>
            </div>
            {isOpen && (
              <div className={"mt-3 pt-3 border-t space-y-1 " + T.dividerFaint(th)}>
                {activeExps.length === 0 && hiddenExps.length === 0 && <p className={"text-xs italic py-2 " + T.textTiny(th)}>No expenses yet. Add one below.</p>}
                {activeExps.map(function(e) {
                  return <ExpenseRow key={e.id} exp={e} th={th} getExpData={getExpData} setExpAmount={setExpAmount} toggleSkipExp={toggleSkipExp} removeExpense={removeExpense}/>;
                })}
                {hiddenExps.length > 0 && (
                  <div className={"mt-2 pt-2 border-t " + T.dividerFaint(th)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={"text-xs " + T.textTiny(th)}>Hidden this month</span>
                      <button onClick={function() { unhideAll(m.id); }} className={"text-xs transition-colors " + T.textFaint(th)}>unhide all</button>
                    </div>
                    {hiddenExps.map(function(e) {
                      return (
                        <div key={e.id} className="flex items-center opacity-50 hover:opacity-80 transition-opacity py-1 px-2 group">
                          <button onClick={function() { toggleSkipExp(e); }} className={"flex-shrink-0 transition-colors mr-2 " + T.eyeBtn(th)}><EyeOffIcon/></button>
                          <span className={"flex-1 text-sm truncate " + T.textMuted(th)}>{e.label}</span>
                          <button onClick={function() { removeExpense(e.id); }} className={"flex-shrink-0 text-lg leading-none font-light transition-colors opacity-0 group-hover:opacity-100 " + T.iconBtn(th)}>x</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={"mt-3 pt-3 border-t " + T.dividerFaint(th)}>
                  <p className={"text-xs mb-2 " + T.textTiny(th)}>Add expense for {m.name}</p>
                  <div className="flex gap-2">
                    <input className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors " + T.inputCls(th)} placeholder="e.g. Groceries..."
                      value={expForm.label} onChange={function(x) { setAddExpState(function(s) { return Object.assign({}, s, { [m.id]: Object.assign({}, expForm, { label: x.target.value }) }); }); }} onKeyDown={function(x) { if (x.key === "Enter") addExpense(m.id); }}/>
                    <input className={"w-24 border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-sky-400 transition-colors " + T.inputCls(th)} placeholder="$" type="number" inputMode="decimal" min="0" step="0.01"
                      value={expForm.amount} onChange={function(x) { setAddExpState(function(s) { return Object.assign({}, s, { [m.id]: Object.assign({}, expForm, { amount: x.target.value }) }); }); }} onKeyDown={function(x) { if (x.key === "Enter") addExpense(m.id); }}/>
                    <button onClick={function() { addExpense(m.id); }} className="bg-sky-500 hover:bg-sky-400 text-white rounded-xl px-3 py-2 text-sm font-semibold transition-colors">+</button>
                  </div>
                  <p className={"text-xs mt-1.5 " + T.textTiny(th)}>Appears hidden in future months — unhide when relevant.</p>
                </div>
              </div>
            )}
          </Card>
        );
      })}
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Add Household Member</h3>
        <div className="flex gap-2">
          <input className={"flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 transition-colors " + T.inputCls(th)} placeholder="Member name..." value={newMemberName} onChange={function(e) { setNewMemberName(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addMember(); }}/>
          <button onClick={addMember} className="bg-sky-500 hover:bg-sky-400 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">Add</button>
        </div>
      </Card>
    </div>
  );
}

// ─── Reports Panel ────────────────────────────────────────────────────────────
function ReportsPanel(props) {
  var state = props.state, th = props.th;
  var [fromYM,   setFromYM]   = useState(currentYM);
  var [toYM,     setToYM]     = useState(currentYM);
  var [include,  setInclude]  = useState({ budget: true, savings: true, investments: true, household: true });
  var [generated,setGenerated]= useState(false);

  var monthsInRange = useMemo(function() {
    var r = [], cur = fromYM;
    while (cur <= toYM && r.length < 36) { r.push(cur); cur = nextYM(cur); }
    return r;
  }, [fromYM, toYM]);

  function toggleInclude(k) { setInclude(function(p) { var n = Object.assign({}, p); n[k] = !n[k]; return n; }); setGenerated(false); }
  function generate() { if (fromYM > toYM) { alert("'From' must be before or equal to 'To'."); return; } setGenerated(true); }

  function getMonthBudget(ym) {
    return [["1st", "1-14"], ["15th", "15-" + lastDayOf(ym)]].map(function(pair) {
      var half = pair[0], label = pair[1];
      var pd = (state.monthPeriods && state.monthPeriods[ym] && state.monthPeriods[ym][half]) || blankHalf();
      var visInc = (state.templates.incomes  || []).filter(function(t) { return isVisible(t, ym, half) && !pd.skipped.includes(t.id); });
      var visOut = (state.templates.outcomes || []).filter(function(t) { return isVisible(t, ym, half) && !pd.skipped.includes(t.id); });
      var carryover = pd.carryover || 0;
      var income   = visInc.reduce(function(s, t) { return s + (pd.overrides[t.id] || 0); }, 0) + carryover;
      var expenses = visOut.reduce(function(s, t) { return s + (pd.overrides[t.id] || 0); }, 0);
      return { half: half, label: label, visInc: visInc, visOut: visOut, income: income, expenses: expenses, balance: income - expenses, pd: pd, carryover: carryover };
    });
  }
  var savingsTotal = (state.savings && state.savings.accounts || []).reduce(function(s, a) { return s + a.transactions.reduce(function(x, t) { return t.type === "add" ? x + t.amount : x - t.amount; }, 0); }, 0);
  var investTotal  = (state.investments && state.investments.accounts || []).reduce(function(s, a) { return s + a.deposits.reduce(function(x, d) { return x + d.amount; }, 0); }, 0);
  function getMonthInvest(ym) { return (state.investments && state.investments.accounts || []).reduce(function(s, a) { return s + a.deposits.filter(function(d) { return d.isoDate && d.isoDate.slice(0, 7) === ym; }).reduce(function(x, d) { return x + d.amount; }, 0); }, 0); }
  function getMonthHH(ym) {
    var members  = (state.household && state.household.members  || []).filter(function(m) { return isVisible(m, ym, "1st"); });
    var expenses = (state.household && state.household.expenses || []).filter(function(e) { return isVisible(e, ym, "1st"); });
    var rows = members.map(function(m) {
      var paid = expenses.filter(function(e) { return e.memberId === m.id; }).reduce(function(s, e) {
        var d = (state.householdPeriods && state.householdPeriods[ym] && state.householdPeriods[ym][e.id]) || {};
        return (!d.skipped && d.amount) ? s + d.amount : s;
      }, 0);
      return { name: m.name, paid: paid };
    });
    var grand = rows.reduce(function(s, r) { return s + r.paid; }, 0);
    return { rows: rows, grand: grand, share: rows.length > 0 ? grand / rows.length : 0 };
  }

  return (
    <div className="space-y-4">
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-4 " + T.heading(th)}>Generate Report</h3>
        <div className="space-y-4">
          <div>
            <p className={"text-xs mb-2 font-medium " + T.textMuted(th)}>Period</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={"text-xs mb-1 " + T.textTiny(th)}>From</p><MonthNav viewYM={fromYM} setViewYM={function(ym) { setFromYM(ym); setGenerated(false); }} th={th}/></div>
              <div><p className={"text-xs mb-1 " + T.textTiny(th)}>To</p><MonthNav viewYM={toYM} setViewYM={function(ym) { setToYM(ym); setGenerated(false); }} th={th}/></div>
            </div>
            {fromYM <= toYM && <p className={"text-xs mt-1.5 " + T.textTiny(th)}>{monthsInRange.length === 1 ? monthLabel(fromYM) : monthLabel(fromYM) + " to " + monthLabel(toYM) + " (" + monthsInRange.length + " months)"}</p>}
            {fromYM > toYM && <p className="text-xs mt-1.5 text-rose-500">From must be before or equal to To.</p>}
          </div>
          <div>
            <p className={"text-xs mb-2 font-medium " + T.textMuted(th)}>Include</p>
            {[["budget","Cash Flow"],["savings","Savings"],["investments","Investments"],["household","Household Expenses"]].map(function(pair) {
              return (
                <label key={pair[0]} className="flex items-center gap-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={include[pair[0]]} onChange={function() { toggleInclude(pair[0]); }} className="w-4 h-4 rounded accent-sky-500"/>
                  <span className={"text-sm " + T.text(th)}>{pair[1]}</span>
                </label>
              );
            })}
          </div>
          <button onClick={generate} className="w-full bg-sky-500 hover:bg-sky-400 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">Generate Report</button>
        </div>
      </Card>
      {generated && (
        <div className="space-y-4">
          <div className={"text-xs px-1 " + T.textMuted(th)}>Report: {monthsInRange.length === 1 ? monthLabel(fromYM) : monthLabel(fromYM) + " - " + monthLabel(toYM)}</div>
          {include.budget && monthsInRange.map(function(ym) {
            return (
              <Card key={ym} th={th}>
                <h4 className={"font-semibold text-sm mb-3 " + T.heading(th)}>{monthLabel(ym)} — Cash Flow</h4>
                {getMonthBudget(ym).map(function(h) {
                  return (
                    <div key={h.half} className="mb-3">
                      <p className={"text-xs mb-1.5 font-medium " + T.textMuted(th)}>{monthLabel(ym).split(" ")[0]} {h.label}</p>
                      {h.carryover > 0 && <div className={"flex justify-between py-1 text-sm border-b " + T.divider(th)}><span className={T.textMuted(th)}>Carryover</span><span className="font-mono text-emerald-500">+{fmt(h.carryover)}</span></div>}
                      {h.visInc.map(function(t) { return <div key={t.id} className={"flex justify-between py-1 text-sm border-b " + T.divider(th)}><span className={T.textMuted(th)}>{t.label}</span><span className={"font-mono " + T.text(th)}>{fmt(h.pd.overrides[t.id] || 0)}</span></div>; })}
                      {h.visOut.map(function(t) { return <div key={t.id} className={"flex justify-between py-1 text-sm border-b " + T.divider(th)}><span className={T.textMuted(th)}>{t.label}</span><span className="font-mono text-rose-500">-{fmt(h.pd.overrides[t.id] || 0)}</span></div>; })}
                      <div className={"flex justify-between py-1.5 text-sm font-semibold " + T.text(th)}><span>Balance</span><span className={"font-mono " + (h.balance >= 0 ? "text-emerald-500" : "text-rose-500")}>{fmt(h.balance)}</span></div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
          {include.savings && (
            <Card th={th}>
              <h4 className={"font-semibold text-sm mb-3 " + T.heading(th)}>Savings — All Accounts</h4>
              {(state.savings && state.savings.accounts || []).map(function(a) {
                var b = a.transactions.reduce(function(s, t) { return t.type === "add" ? s + t.amount : s - t.amount; }, 0);
                return <div key={a.id} className={"flex justify-between py-1.5 text-sm border-b " + T.divider(th)}><span className={T.textMuted(th)}>{a.name}</span><span className={"font-mono " + T.text(th)}>{fmt(b)}</span></div>;
              })}
              <div className={"flex justify-between py-1.5 text-sm font-semibold mt-1 " + T.text(th)}><span>Total</span><span className="font-mono text-sky-500">{fmt(savingsTotal)}</span></div>
            </Card>
          )}
          {include.investments && (
            <Card th={th}>
              <h4 className={"font-semibold text-sm mb-3 " + T.heading(th)}>Investments</h4>
              {monthsInRange.map(function(ym) { var mi = getMonthInvest(ym); return mi > 0 ? <div key={ym} className={"flex justify-between py-1.5 text-sm border-b " + T.divider(th)}><span className={T.textMuted(th)}>{monthLabel(ym)}</span><span className="font-mono text-violet-500">{fmt(mi)}</span></div> : null; })}
              <div className={"flex justify-between py-1.5 text-sm font-semibold mt-1 " + T.text(th)}><span>All-time total</span><span className="font-mono text-violet-500">{fmt(investTotal)}</span></div>
            </Card>
          )}
          {include.household && monthsInRange.map(function(ym) {
            var hh = getMonthHH(ym);
            if (hh.rows.length === 0 || hh.grand === 0) return null;
            return (
              <Card key={ym} th={th}>
                <h4 className={"font-semibold text-sm mb-3 " + T.heading(th)}>{monthLabel(ym)} — Household</h4>
                {hh.rows.map(function(r) {
                  return (
                    <div key={r.name} className={"flex justify-between py-1.5 text-sm border-b " + T.divider(th)}>
                      <span className={T.textMuted(th)}>{r.name}</span>
                      <div className="text-right">
                        <span className={"font-mono " + T.text(th)}>{fmt(r.paid)} paid</span>
                        {Math.abs(r.paid - hh.share) > 0.01 && <span className={"ml-2 text-xs font-mono " + (r.paid > hh.share ? "text-emerald-500" : "text-rose-500")}>{r.paid > hh.share ? "receives " + fmt(r.paid - hh.share) : "owes " + fmt(hh.share - r.paid)}</span>}
                      </div>
                    </div>
                  );
                })}
                <div className={"flex justify-between py-1.5 text-sm font-semibold mt-1 " + T.text(th)}><span>Total / Share</span><span className={"font-mono " + T.textMuted(th)}>{fmt(hh.grand)} / {fmt(hh.share)}</span></div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel(props) {
  var settings = props.settings, onChangeSettings = props.onChangeSettings;
  var fullState = props.fullState, onRestoreState = props.onRestoreState, th = props.th;
  var fileRef = useRef();
  var [resetConfirm,  setResetConfirm]  = useState(false);
  var [resetDone,     setResetDone]     = useState(false);
  var [budgetWarning, setBudgetWarning] = useState(false);
  var [pendingMode,   setPendingMode]   = useState(null);
  var [exportJson,    setExportJson]    = useState(null);
  var [viewingJson,   setViewingJson]   = useState(false);
  var [copied,        setCopied]        = useState(false);

  function doExport() {
    var hasData = (fullState.templates && fullState.templates.incomes && fullState.templates.incomes.length > 0) ||
                 (fullState.templates && fullState.templates.outcomes && fullState.templates.outcomes.length > 0) ||
                 (fullState.savings && fullState.savings.accounts && fullState.savings.accounts.length > 0) ||
                 (fullState.investments && fullState.investments.accounts && fullState.investments.accounts.length > 0) ||
                 (fullState.household && fullState.household.members && fullState.household.members.length > 0);
    if (!hasData) { setExportJson("EMPTY"); return; }
    var json = JSON.stringify(fullState, null, 2);
    setExportJson(json);
    setViewingJson(false);
    setCopied(false);
    // Attempt file download (works on GitHub Pages, silently fails in sandboxed iframe)
    try {
      var blob = new Blob([json], { type: "application/json" });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url; a.download = "finflow-backup-" + currentYM + ".json"; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { /* sandboxed — user can still copy manually via View file */ }
  }
  function copyToClipboard() {
    if (!exportJson || exportJson === "EMPTY") return;
    var ta = document.getElementById("finflow-export-ta");
    // Try modern clipboard API first (works on HTTPS / GitHub Pages)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(exportJson).then(function() {
        setCopied(true); setTimeout(function() { setCopied(false); }, 2500);
      }).catch(function() {
        // Blocked (sandboxed iframe) — fall back to selecting the text
        if (ta) { ta.focus(); ta.select(); }
        setCopied("select");
      });
    } else {
      // Legacy fallback
      if (ta) {
        ta.focus(); ta.select();
        try { document.execCommand("copy"); setCopied(true); setTimeout(function() { setCopied(false); }, 2500); }
        catch (e) { setCopied("select"); }
      }
    }
  }
  var [restoreMsg, setRestoreMsg] = useState(null); // null | {ok: bool, text: string}

  function importJSON(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var raw = ev.target.result;
        var d = JSON.parse(raw);

        // Must be an object
        if (typeof d !== "object" || d === null || Array.isArray(d)) {
          setRestoreMsg({ ok: false, text: "Invalid file: not a valid FinFlow backup." }); return;
        }

        // Must have at least one recognisable FinFlow key
        var knownKeys = ["templates","categories","monthPeriods","savings","investments","household","householdPeriods","settings"];
        var found = knownKeys.filter(function(k) { return k in d; });
        if (found.length === 0) {
          setRestoreMsg({ ok: false, text: "Invalid file: this does not appear to be a FinFlow backup. No recognised data found." }); return;
        }

        // templates must be an object with incomes/outcomes arrays if present
        if (d.templates !== undefined) {
          if (typeof d.templates !== "object" || Array.isArray(d.templates) ||
              (d.templates.incomes  !== undefined && !Array.isArray(d.templates.incomes)) ||
              (d.templates.outcomes !== undefined && !Array.isArray(d.templates.outcomes))) {
            setRestoreMsg({ ok: false, text: "Invalid file: the templates data is corrupted." }); return;
          }
        }

        onRestoreState(migrate(d));
        setRestoreMsg({ ok: true, text: "Data restored successfully!" });
      } catch (err) {
        setRestoreMsg({ ok: false, text: "Invalid file: " + (err.message || "could not parse JSON.") });
      }
    };
    reader.onerror = function() { setRestoreMsg({ ok: false, text: "Could not read the file. Please try again." }); };
    reader.readAsText(file); e.target.value = "";
  }
  function requestModeChange(mode) { if (mode === settings.budgetMode) return; setPendingMode(mode); setBudgetWarning(true); }
  function confirmModeChange() {
    var history = Object.assign({}, settings.budgetModeHistory || {});
    history[currentYM] = pendingMode;
    onChangeSettings(Object.assign({}, settings, { budgetMode: pendingMode, budgetModeHistory: history }));
    setBudgetWarning(false); setPendingMode(null);
  }
  function resetAll() {
    onRestoreState(Object.assign({}, INITIAL));
    localStorage.removeItem("finflow_v2");
    setResetConfirm(false); setResetDone(true);
  }

  return (
    <div className="space-y-4">
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Appearance</h3>
        <div className="grid grid-cols-2 gap-2">
          {[["dark","Moon Dark"],["light","Sun Light"]].map(function(pair) {
            return <button key={pair[0]} onClick={function() { onChangeSettings(Object.assign({}, settings, { theme: pair[0] })); }} className={"py-2.5 rounded-xl text-sm border transition-all " + (settings.theme === pair[0] ? T.btnActive(th) : T.btnGhost(th))}>{pair[1]}</button>;
          })}
        </div>
      </Card>
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-1 " + T.heading(th)}>Budget Frequency</h3>
        <p className={"text-xs mb-3 " + T.textMuted(th)}>Current: <span className="text-sky-500 font-medium">{settings.budgetMode === "biweekly" ? "Bi-weekly" : "Monthly"}</span></p>
        <div className="grid grid-cols-2 gap-2">
          {[["biweekly","Bi-weekly"],["monthly","Monthly"]].map(function(pair) {
            return <button key={pair[0]} onClick={function() { requestModeChange(pair[0]); }} className={"py-2 rounded-xl text-sm border transition-all " + (settings.budgetMode === pair[0] ? T.btnActive(th) : T.btnGhost(th))}>{pair[1]}</button>;
          })}
        </div>
        {budgetWarning && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-xs text-amber-600 font-medium mb-2">Switch to {pendingMode === "monthly" ? "Monthly" : "Bi-weekly"}?</p>
            <p className={"text-xs mb-3 " + T.textMuted(th)}>Only affects {monthLabel(currentYM)} and future months. Past months stay unchanged.</p>
            <div className="flex gap-2">
              <button onClick={confirmModeChange} className="flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-xl py-2 text-xs font-semibold transition-colors">Confirm</button>
              <button onClick={function() { setBudgetWarning(false); setPendingMode(null); }} className={"flex-1 rounded-xl py-2 text-xs font-medium transition-colors border " + T.btnGhost(th)}>Cancel</button>
            </div>
          </div>
        )}
      </Card>
      <Card th={th}>
        <h3 className={"font-semibold text-sm tracking-wide uppercase mb-3 " + T.heading(th)}>Backup and Restore</h3>
        <div className="space-y-2">
          <button onClick={doExport} className={"w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors border " + T.btnGhost(th)}>Export Backup</button>

          {exportJson === "EMPTY" && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
              <p className="text-xs text-amber-600">Nothing to export yet — add some data first.</p>
            </div>
          )}

          {exportJson && exportJson !== "EMPTY" && (
            <div className="space-y-2">
              <div className={"flex items-center justify-between rounded-xl px-3 py-2.5 border " + T.surfaceBg(th)}>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500 text-sm">&#10003;</span>
                  <span className={"text-xs font-medium " + T.textMuted(th)}>finflow-backup-{currentYM}.json</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={function() { setViewingJson(function(v) { return !v; }); setCopied(false); }} className={"text-xs px-2.5 py-1 rounded-lg border transition-colors " + (viewingJson ? T.btnActive(th) : T.btnGhost(th))}>
                    {viewingJson ? "Hide" : "View file"}
                  </button>
                  <button onClick={function() { setExportJson(null); setViewingJson(false); }} className={"text-base leading-none " + T.textFaint(th)}>x</button>
                </div>
              </div>

              {viewingJson && (
                <div className={"rounded-xl border p-3 space-y-2 " + T.surfaceBg(th)}>
                  <p className={"text-xs " + T.textMuted(th)}>Copy this text and paste it into a text editor, then save as <span className="font-mono">finflow-backup-{currentYM}.json</span></p>
                  <textarea
                    id="finflow-export-ta"
                    readOnly
                    value={exportJson}
                    rows={8}
                    className={"w-full rounded-lg px-3 py-2 text-xs font-mono outline-none resize-none border " + T.inputCls(th)}
                    onFocus={function(e) { e.target.select(); }}
                  />
                  <button onClick={copyToClipboard} className={"w-full rounded-xl py-2 text-sm font-semibold transition-colors " + (copied === true ? "bg-emerald-500 text-white" : copied === "select" ? "bg-sky-500 text-white" : "bg-sky-500 hover:bg-sky-400 text-white")}>
                    {copied === true ? "Copied!" : copied === "select" ? "Text selected — press Cmd+C / Ctrl+C" : "Copy to clipboard"}
                  </button>
                </div>
              )}
            </div>
          )}

          <button onClick={function() { if (fileRef.current) fileRef.current.click(); }} className={"w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors border " + T.btnGhost(th)}>Restore from Backup</button>
          <input ref={fileRef} type="file" accept=".json" onChange={importJSON} className="hidden"/>

          {restoreMsg && (
            <div className={"rounded-xl px-3 py-2.5 border " + (restoreMsg.ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30")}>
              <p className={"text-xs font-medium " + (restoreMsg.ok ? "text-emerald-600" : "text-rose-600")}>{restoreMsg.text}</p>
              <button onClick={function() { setRestoreMsg(null); }} className={"text-xs mt-1 " + T.textFaint(th)}>Dismiss</button>
            </div>
          )}

          <div className={"rounded-xl border px-3 py-2.5 space-y-1 " + T.surfaceBg(th)}>
            <p className={"text-xs font-medium " + T.textMuted(th)}>How backup works</p>
            <p className={"text-xs " + T.textFaint(th)}>Exporting generates a JSON file with all your data. Save it in a secure place like iCloud Drive or Google Drive so you don't lose it.</p>
            <p className={"text-xs " + T.textFaint(th)}>To restore, tap "Restore from Backup" and select your saved .json file. Your data will be fully replaced with the backup.</p>
          </div>
        </div>
      </Card>
      <Card th={th} className="border-rose-500/20">
        <h3 className="font-semibold text-rose-500 text-sm tracking-wide uppercase mb-2">Reset All Data</h3>
        <p className={"text-xs mb-3 " + T.textMuted(th)}>Permanently deletes all incomes, expenses, savings, investments, household data, and settings.</p>
        {resetDone ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
            <p className="text-sm text-emerald-600 font-semibold mb-1">All data cleared</p>
            <p className={"text-xs " + T.textMuted(th)}>FinFlow has been reset to a clean state.</p>
          </div>
        ) : !resetConfirm ? (
          <button onClick={function() { setResetConfirm(true); }} className="w-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-500 rounded-xl py-2.5 text-sm font-medium transition-colors">Reset All Data</button>
        ) : (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
            <p className="text-xs text-rose-600 font-medium mb-3">Are you absolutely sure? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={resetAll} className="flex-1 bg-rose-500 hover:bg-rose-400 text-white rounded-xl py-2 text-xs font-semibold transition-colors">Yes, reset everything</button>
              <button onClick={function() { setResetConfirm(false); }} className={"flex-1 rounded-xl py-2 text-xs font-medium transition-colors border " + T.btnGhost(th)}>Cancel</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  var [state,       setState]       = useState(loadState);
  var [activePage,  setActivePage]  = useState("budget");
  var [menuOpen,    setMenuOpen]    = useState(false);
  var [viewYM,      setViewYM]      = useState(currentYM);
  var [viewHalf,    setViewHalf]    = useState(currentHalf);

  useEffect(function() { saveState(state); }, [state]);
  useEffect(function() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
  }, []);

  var th = (state.settings && state.settings.theme) || "dark";
  var isLight = th === "light";

  var getBudgetMode = useCallback(function(ym) {
    var hist = (state.settings && state.settings.budgetModeHistory) || {};
    var keys = Object.keys(hist).filter(function(k) { return k <= ym; }).sort();
    if (keys.length === 0) return (state.settings && state.settings.budgetMode) || "biweekly";
    return hist[keys[keys.length - 1]];
  }, [state.settings]);

  var isMonthly = getBudgetMode(viewYM) === "monthly";

  var getHalfData = useCallback(function(ym, half) {
    var stored = state.monthPeriods && state.monthPeriods[ym] && state.monthPeriods[ym][half];
    var base   = stored || blankHalf();
    var allT   = (state.templates.incomes || []).concat(state.templates.outcomes || []);
    var autoSkip = allT.filter(function(t) {
      if (!t.skippedByDefault || !isVisible(t, ym, half)) return false;
      var created = { ym: t.createdYM || "2000-01", half: t.createdHalf || "1st" };
      if (cmpPeriod(created, { ym: ym, half: half }) >= 0) return false;
      if (stored && (stored.skipped.includes(t.id) || stored.overrides[t.id] != null || stored.actualSpent.includes(t.id) || (stored.explicitlyShown || []).includes(t.id))) return false;
      return true;
    }).map(function(t) { return t.id; });
    if (autoSkip.length === 0) return base;
    var ns = base.skipped.concat(autoSkip).filter(function(v, i, a) { return a.indexOf(v) === i; });
    return Object.assign({}, base, { skipped: ns });
  }, [state.monthPeriods, state.templates]);

  var computeCarryover = useCallback(function doCarry(ym, half, depth) {
    depth = depth || 0;
    if (depth > 48) return 0;
    var pym, phalf;
    if (half === "15th") { phalf = "1st"; pym = ym; }
    else { phalf = "15th"; pym = prevYM(ym); }
    if (getBudgetMode(pym) === "monthly") phalf = "1st";
    var storedPrev = state.monthPeriods && state.monthPeriods[pym] && state.monthPeriods[pym][phalf];
    var prevCarry  = storedPrev ? (storedPrev.carryover > 0 ? storedPrev.carryover : doCarry(pym, phalf, depth + 1)) : doCarry(pym, phalf, depth + 1);
    var base       = storedPrev || blankHalf();
    var visInc = (state.templates.incomes  || []).filter(function(t) { return isVisible(t, pym, phalf) && !base.skipped.includes(t.id); });
    var visOut = (state.templates.outcomes || []).filter(function(t) { return isVisible(t, pym, phalf) && !base.skipped.includes(t.id); });
    var income = visInc.reduce(function(s, t) { return s + (base.overrides[t.id] || 0); }, 0) + prevCarry;
    var exp    = visOut.reduce(function(s, t) { return s + (base.overrides[t.id] || 0); }, 0);
    return Math.max(0, income - exp);
  }, [state.monthPeriods, state.templates, getBudgetMode]);

  var rawHalf  = getHalfData(viewYM, viewHalf);
  var periodData = Object.assign({}, rawHalf, { carryover: rawHalf.carryover > 0 ? rawHalf.carryover : computeCarryover(viewYM, viewHalf) });

  function updateHalfData(ym, half, data) {
    setState(function(s) {
      var mp  = Object.assign({}, s.monthPeriods);
      mp[ym]  = Object.assign({}, mp[ym] || blankMonth());
      mp[ym][half] = data;
      return Object.assign({}, s, { monthPeriods: mp });
    });
  }
  function addTemplate(type, item, ym, half) {
    var key = type === "income" ? "incomes" : "outcomes";
    var stamped = Object.assign({}, item, { createdYM: ym, createdHalf: half, skippedByDefault: true });
    setState(function(s) { var t = Object.assign({}, s.templates); t[key] = t[key].concat([stamped]); return Object.assign({}, s, { templates: t }); });
  }
  function removeTemplate(type, id, ym, half) {
    var key = type === "income" ? "incomes" : "outcomes";
    setState(function(s) { var t = Object.assign({}, s.templates); t[key] = t[key].map(function(x) { return x.id === id ? Object.assign({}, x, { deletedYM: ym, deletedHalf: half }) : x; }); return Object.assign({}, s, { templates: t }); });
  }
  function addCategory(cat) { setState(function(s) { return Object.assign({}, s, { categories: (s.categories || DEFAULT_CATEGORIES).concat([cat]) }); }); }
  function removeCategory(id, ym, half) { setState(function(s) { return Object.assign({}, s, { categories: (s.categories || DEFAULT_CATEGORIES).map(function(x) { return x.id === id ? Object.assign({}, x, { deletedYM: ym, deletedHalf: half }) : x; }) }); }); }

  var visCategories = useMemo(function() {
    return (state.categories || DEFAULT_CATEGORIES).filter(function(cat) { return isVisible(cat, viewYM, viewHalf); });
  }, [state.categories, viewYM, viewHalf]);

  function periodLabel() {
    var parts = viewYM.split("-"), y = parts[0], m = parts[1];
    var mo = new Date(+y, +m - 1, 1).toLocaleString("default", { month: "long" });
    if (isMonthly) return mo + " " + y;
    var last = lastDayOf(viewYM);
    return viewHalf === "1st" ? mo + " 1-14, " + y : mo + " 15-" + last + ", " + y;
  }

  var appBg      = isLight ? "linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 40%,#f8fafc 100%)" : "radial-gradient(ellipse at top left,#0f1f3d 0%,#090d1a 50%,#0d1117 100%)";
  var headerBg   = isLight ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.3)";
  var headerBord = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)";
  var navBg      = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
  var curPage    = PAGES.find(function(p) { return p.id === activePage; });

  return (
    <div style={{ minHeight: "100vh", background: appBg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: isLight ? "#0f172a" : "white" }}>
      <SlideMenu open={menuOpen} onClose={function() { setMenuOpen(false); }} activePage={activePage} setActivePage={setActivePage} th={th}/>
      <div className="sticky top-0 z-30 backdrop-blur-md border-b" style={{ background: headerBg, borderColor: headerBord }}>
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Logo th={th}/>
              <div>
                <div className="text-base font-semibold" style={{ letterSpacing: "-0.02em", lineHeight: 1 }}>
                  <span className={T.heading(th)}>Fin</span><span style={{ color: "#38bdf8" }}>Flow</span>
                </div>
                <div className={"text-xs font-bold mt-0.5 " + T.text(th)} style={{ lineHeight: 1 }}>{curPage ? curPage.label : "Cash Flow"}</div>
              </div>
            </div>
            <button onClick={function() { setMenuOpen(true); }} className="flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded-xl transition-colors" style={{ background: navBg, border: "1px solid " + headerBord }}>
              <span className="w-4 h-0.5 rounded-full" style={{ background: isLight ? "#475569" : "rgba(255,255,255,0.6)" }}/>
              <span className="w-4 h-0.5 rounded-full" style={{ background: isLight ? "#475569" : "rgba(255,255,255,0.6)" }}/>
              <span className="w-4 h-0.5 rounded-full" style={{ background: isLight ? "#475569" : "rgba(255,255,255,0.6)" }}/>
            </button>
          </div>
          {activePage === "budget" && (
            <>
              <div className="flex items-center justify-between mt-2 rounded-xl px-3 py-1.5" style={{ background: navBg, border: "1px solid " + headerBord }}>
                <button onClick={function() { setViewYM(prevYM(viewYM)); }} className={"px-2 py-1 rounded-lg text-xl leading-none transition-colors " + T.textFaint(th)}>{"<"}</button>
                <div className="text-center">
                  <div className={"text-xs font-medium " + T.text(th)}>{monthLabel(viewYM)}</div>
                  {viewYM === currentYM && <div className="text-xs text-sky-500">current month</div>}
                </div>
                <button onClick={function() { setViewYM(nextYM(viewYM)); }} className={"px-2 py-1 rounded-lg text-xl leading-none transition-colors " + T.textFaint(th)}>{">"}</button>
              </div>
              {!isMonthly && (
                <div className="flex gap-1 mt-1.5 rounded-xl p-1" style={{ background: navBg }}>
                  {["1st","15th"].map(function(h) {
                    return (
                      <button key={h} onClick={function() { setViewHalf(h); }}
                        className={"flex-1 text-xs py-1.5 rounded-lg font-medium transition-all " + (viewHalf === h ? T.btnActive(th) : T.textFaint(th))}>
                        {h === "1st" ? "1st-14th" : "15th-" + lastDayOf(viewYM) + "th"}
                        {h === currentHalf && viewYM === currentYM && <span className="ml-1 text-sky-500"> *</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 pb-16">
        {activePage === "budget" && (
          <div className="space-y-4">
            <BudgetPanel viewYM={viewYM} viewHalf={isMonthly ? "1st" : viewHalf} templates={state.templates} categories={visCategories} periodData={periodData} th={th}
              onPeriodChange={function(d) { updateHalfData(viewYM, isMonthly ? "1st" : viewHalf, d); }}
              onAddTemplate={addTemplate} onRemoveTemplate={removeTemplate}/>
            <CategoryManager categories={state.categories || DEFAULT_CATEGORIES} viewYM={viewYM} viewHalf={isMonthly ? "1st" : viewHalf} th={th} onAdd={addCategory} onRemove={removeCategory}/>
          </div>
        )}
        {activePage === "savings"     && <SavingsPanel     data={state.savings}      onChange={function(d) { setState(function(s) { return Object.assign({}, s, { savings: d }); }); }}      th={th}/>}
        {activePage === "investments" && <InvestmentsPanel data={state.investments}   onChange={function(d) { setState(function(s) { return Object.assign({}, s, { investments: d }); }); }}  th={th}/>}
        {activePage === "household"   && <HouseholdPanel   household={state.household} householdPeriods={state.householdPeriods} onChange={function(d) { setState(function(s) { return Object.assign({}, s, { household: d }); }); }} onChangePeriods={function(d) { setState(function(s) { return Object.assign({}, s, { householdPeriods: d }); }); }} th={th}/>}
        {activePage === "reports"     && <ReportsPanel     state={state} th={th}/>}
        {activePage === "settings"    && <SettingsPanel    settings={state.settings}  onChangeSettings={function(d) { setState(function(s) { return Object.assign({}, s, { settings: d }); }); }} fullState={state} onRestoreState={setState} th={th}/>}
      </div>
    </div>
  );
}