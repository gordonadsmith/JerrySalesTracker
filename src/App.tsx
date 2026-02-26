import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type ProductKey = "auto" | "home" | "renters" | "motorcycle" | "rv" | "umbrella" | "boat";
type LiabilityLimit = "below_50_100" | "50_100" | "100_300_plus";
type CallResult = "sale" | "no_sale" | "voicemail" | "other";

interface CallEntry {
  id: string;
  timestamp: Date;
  result: CallResult;
  products: ProductKey[];
  liabilityLimit?: LiabilityLimit;
  points: number;
  bonusPoints: number;
  bonusReason: string[];
  premium: number;
  notes?: string;
}

interface CommissionTier {
  label: string;
  minPoints: number;
  rate: number;
  color: string;
}

interface TierTarget {
  label: string;
  minPoints: number;
  rate: number;
}

// ── Brand Colors ───────────────────────────────────────────────────────────
const J = {
  purple:      "#6C2BD9",
  purpleLight: "#EDE9FF",
  purpleMid:   "#9061F9",
  blue:        "#1D4ED8",
  blueLight:   "#EFF6FF",
  ink:         "#1E1144",
  inkMid:      "#4B3A6E",
  gray:        "#6B7280",
  grayLight:   "#F3F4F6",
  border:      "#E5E7EB",
  white:       "#FFFFFF",
  green:       "#059669",
  greenLight:  "#ECFDF5",
  amber:       "#D97706",
  amberLight:  "#FFFBEB",
  red:         "#DC2626",
  redLight:    "#FEF2F2",
};

// ── Product Config ─────────────────────────────────────────────────────────
const PRODUCTS: Record<ProductKey, {
  label: string; emoji: string; color: string;
  basePoints: number | "auto_liability"; description: string;
}> = {
  auto:       { label: "Auto",       emoji: "🚗", color: "#6C2BD9", basePoints: "auto_liability", description: "Points based on liability" }, // purple  (Jerry brand)
  home:       { label: "Home",       emoji: "🏠", color: "#E53E3E", basePoints: 3,               description: "3 pts" },  // red
  renters:    { label: "Renters",    emoji: "🏢", color: "#DD6B20", basePoints: 1,               description: "1 pt"  },  // orange
  motorcycle: { label: "Motorcycle", emoji: "🏍️", color: "#059669", basePoints: 2,               description: "2 pts" },  // green
  rv:         { label: "RV",         emoji: "🚐", color: "#D97706", basePoints: 2,               description: "2 pts" },  // amber
  umbrella:   { label: "Umbrella",   emoji: "☂️", color: "#0891B2", basePoints: 2,               description: "2 pts" },  // teal
  boat:       { label: "Boat",       emoji: "⛵", color: "#DB2777", basePoints: 2,               description: "2 pts" },  // pink
};

const LIABILITY_OPTIONS: { key: LiabilityLimit; label: string; points: number; color: string }[] = [
  { key: "below_50_100",  label: "Below 50/100",  points: 1, color: J.gray   },
  { key: "50_100",        label: "50/100",         points: 2, color: J.amber  },
  { key: "100_300_plus",  label: "100/300+",       points: 3, color: J.green  },
];

const TIER_COLORS = ["#B45309", "#6B7280", "#7C3AED"];

const DEFAULT_TIER_TARGETS: TierTarget[] = [
  { label: "Bronze",   minPoints: 10,  rate: 5  },
  { label: "Superior", minPoints: 25,  rate: 8  },
  { label: "Top",      minPoints: 50,  rate: 12 },
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RESULT_META: Record<CallResult, { label: string; color: string; bg: string; emoji: string }> = {
  sale:      { label: "Sale",            color: J.green,  bg: J.greenLight,  emoji: "✅" },
  no_sale:   { label: "No Sale",         color: J.red,    bg: J.redLight,    emoji: "❌" },
  voicemail: { label: "Left Voicemail",  color: J.amber,  bg: J.amberLight,  emoji: "📨" },
  other:     { label: "Other",           color: J.gray,   bg: "#F9FAFB",     emoji: "📋" },
};

// ── Point Calculation ──────────────────────────────────────────────────────
function calculatePoints(products: ProductKey[], liabilityLimit?: LiabilityLimit): {
  base: number; bonus: number; total: number; bonusReasons: string[];
} {
  let base = 0;
  let bonus = 0;
  const bonusReasons: string[] = [];

  const hasAuto     = products.includes("auto");
  const hasHome     = products.includes("home");
  const hasRenters  = products.includes("renters");
  const liability   = liabilityLimit ?? "below_50_100";

  // Base points per product
  for (const p of products) {
    const cfg = PRODUCTS[p];
    if (p === "auto") {
      const liabOpt = LIABILITY_OPTIONS.find(l => l.key === liability)!;
      base += liabOpt.points;
    } else if (cfg.basePoints !== "auto_liability") {
      base += cfg.basePoints as number;
    }
  }

  // Bonus: Auto + Renters bundle → +1
  if (hasAuto && hasRenters) {
    bonus += 1;
    bonusReasons.push("+1 Auto & Renters bundle");
  }

  // Bonus: Auto + Home bundle
  if (hasAuto && hasHome) {
    if (liability === "below_50_100") {
      bonus += 1;
      bonusReasons.push("+1 Home & Auto bundle (below 50/100)");
    } else if (liability === "50_100") {
      bonus += 2;
      bonusReasons.push("+2 Home & Auto bundle (50/100)");
    } else {
      bonus += 3;
      bonusReasons.push("+3 Home & Auto bundle (100/300+)");
    }
  }

  return { base, bonus, total: base + bonus, bonusReasons };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function generateId() { return Math.random().toString(36).slice(2, 10); }

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// Commission = 10% of premium (Jerry's cut) × tier commission rate
// If no tier reached, use Bronze (first tier) rate as estimate
function calcCommission(premium: number, tierRate: number) {
  return premium * 0.10 * tierRate;
}

function getWorkingDaysLeft(workDays: number[]): number {
  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let count = 0;
  for (let d = new Date(today); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
    const idx = (d.getDay() + 6) % 7;
    if (workDays.includes(idx)) count++;
  }
  return count;
}

// ── Sub Components ─────────────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const diff = value - display;
    if (diff === 0) return;
    const step = Math.max(1, Math.ceil(Math.abs(diff) / 18));
    const timer = setInterval(() => {
      setDisplay(prev => {
        const next = prev + (diff > 0 ? step : -step);
        if ((diff > 0 && next >= value) || (diff < 0 && next <= value)) { clearInterval(timer); return value; }
        return next;
      });
    }, 22);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

function DonutChart({ segments, size = 140 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  if (total === 0) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={J.grayLight} strokeWidth={16} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill={J.gray} fontSize="11">No data</text>
    </svg>
  );
  let cumulative = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={J.grayLight} strokeWidth={16} />
      {segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const pct = seg.value / total;
        const dash = pct * circ;
        const offset = circ - cumulative * circ;
        cumulative += pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={16}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
          style={{ transition: "stroke-dasharray 0.5s ease" }} />;
      })}
    </svg>
  );
}

function TierBar({ tier, current }: { tier: CommissionTier; current: number }) {
  const pct = Math.min((current / tier.minPoints) * 100, 100);
  const done = current >= tier.minPoints;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ fontWeight: 700, color: done ? tier.color : J.inkMid }}>
          {tier.label} · {(tier.rate * 100).toFixed(0)}% · {tier.minPoints} pts
        </span>
        <span style={{ color: done ? tier.color : J.gray, fontWeight: 600 }}>
          {done ? "✓ Reached!" : `${tier.minPoints - current} pts to go`}
        </span>
      </div>
      <div style={{ background: J.grayLight, borderRadius: 99, height: 9, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 99,
          background: done
            ? `linear-gradient(90deg, ${tier.color}, ${tier.color}bb)`
            : `linear-gradient(90deg, ${tier.color}88, ${tier.color})`,
          transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: done ? `0 0 6px ${tier.color}66` : "none",
        }} />
      </div>
    </div>
  );
}

// ── useLocalStorage hook ───────────────────────────────────────────────────
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (err) {
      console.warn("localStorage write failed:", err);
    }
  };

  return [storedValue, setValue];
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function JerrySalesTracker() {
  // ── Persisted state (survives refresh) ──
  const [calls, setCalls] = useLocalStorage<CallEntry[]>("jerry_calls", []);

  // Revive timestamp strings → Date objects after loading from localStorage
  const hydratedCalls: CallEntry[] = calls.map(c => ({
    ...c,
    timestamp: c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp),
  }));
  const [agentName, setAgentName] = useLocalStorage<string>("jerry_agent_name", "Agent");
  const [workDays, setWorkDays] = useLocalStorage<number[]>("jerry_work_days", [0, 1, 2, 3, 4]);
  const [tierTargets, setTierTargets] = useLocalStorage<TierTarget[]>("jerry_tier_targets", DEFAULT_TIER_TARGETS);

  // ── Ephemeral UI state (no need to persist) ──
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("Agent");

  // Commission targets modal
  const [showSettings, setShowSettings] = useState(false);
  const [editingTiers, setEditingTiers] = useState<TierTarget[]>(DEFAULT_TIER_TARGETS);

  // Derived commission tiers with colors
  const COMMISSION_TIERS: CommissionTier[] = tierTargets.map((t, i) => ({
    ...t,
    rate: t.rate / 100,
    color: TIER_COLORS[i] ?? "#6C2BD9",
  }));

  // Modal state
  const [showLog, setShowLog] = useState(false);
  const [logResult, setLogResult] = useState<CallResult>("sale");
  const [logProducts, setLogProducts] = useState<ProductKey[]>([]);
  const [logLiability, setLogLiability] = useState<LiabilityLimit>("50_100");
  const [logPremiums, setLogPremiums] = useState<Partial<Record<ProductKey, string>>>({});
  const [logNotes, setLogNotes] = useState("");

  // ── Derived stats ──
  const totalCalls = hydratedCalls.length;
  const saleCalls = hydratedCalls.filter(c => c.result === "sale");
  const totalSales = saleCalls.length;
  const totalPoints = saleCalls.reduce((s, c) => s + c.points + c.bonusPoints, 0);
  const totalBonusPoints = saleCalls.reduce((s, c) => s + c.bonusPoints, 0);
  const totalPremium = saleCalls.reduce((s, c) => s + c.premium, 0);
  const closureRate = totalCalls > 0 ? (totalSales / totalCalls) * 100 : 0;
  const currentTier = [...COMMISSION_TIERS].reverse().find(t => totalPoints >= t.minPoints);
  const nextTier = COMMISSION_TIERS.find(t => totalPoints < t.minPoints);
  // Use current tier rate, or Bronze (first tier) rate as estimate if no tier reached
  const activeTierRate = currentTier ? currentTier.rate : (COMMISSION_TIERS[0]?.rate ?? 0.05);
  const projectedCommission = calcCommission(totalPremium, activeTierRate);
  const workingDaysLeft = getWorkingDaysLeft(workDays);
  const ptsNeeded = nextTier ? nextTier.minPoints - totalPoints : 0;
  const ptsPerShift = workingDaysLeft > 0 && ptsNeeded > 0 ? Math.ceil(ptsNeeded / workingDaysLeft) : 0;

  // Live preview of points in modal
  const preview = calculatePoints(logProducts, logLiability);
  const hasAuto = logProducts.includes("auto");

  const toggleProduct = (p: ProductKey) => {
    setLogProducts(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
    // Clear that product's premium when deselected
    setLogPremiums(prev => {
      if (logProducts.includes(p)) {
        const next = { ...prev };
        delete next[p];
        return next;
      }
      return prev;
    });
  };

  const resetModal = () => {
    setLogResult("sale");
    setLogProducts([]);
    setLogLiability("50_100");
    setLogPremiums({});
    setLogNotes("");
  };

  const openLog = () => { resetModal(); setShowLog(true); };

  const logCall = useCallback(() => {
    const { base, bonus, bonusReasons } = calculatePoints(logProducts, logLiability);
    const premiumVal = Object.values(logPremiums).reduce((s, v) => s + (parseFloat(v || "0") || 0), 0);
    setCalls(prev => [{
      id: generateId(),
      timestamp: new Date(),
      result: logResult,
      products: logResult === "sale" ? logProducts : [],
      liabilityLimit: logResult === "sale" && logProducts.includes("auto") ? logLiability : undefined,
      points: logResult === "sale" ? base : 0,
      bonusPoints: logResult === "sale" ? bonus : 0,
      bonusReason: logResult === "sale" ? bonusReasons : [],
      premium: logResult === "sale" ? premiumVal : 0,
      notes: logNotes || undefined,
    }, ...prev]);
    setShowLog(false);
    resetModal();
  }, [logResult, logProducts, logLiability, logPremiums, logNotes]);

  // ── Style helpers ──
  const card: React.CSSProperties = {
    background: J.white,
    border: `1px solid ${J.border}`,
    borderRadius: 16,
    padding: "20px 24px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  const panelTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
    textTransform: "uppercase", color: J.purple, marginBottom: 16,
  };

  const tag = (active: boolean, color: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
    cursor: "pointer", transition: "all 0.15s",
    border: `1.5px solid ${active ? color : J.border}`,
    background: active ? color + "18" : J.white,
    color: active ? color : J.gray,
  });

  const inputStyle: React.CSSProperties = {
    background: J.grayLight, border: `1.5px solid ${J.border}`,
    borderRadius: 10, color: J.ink, padding: "10px 14px",
    fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: J.gray, marginBottom: 8,
    textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F6FC", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: J.ink }}>

      {/* ── Header ── */}
      <div style={{
        background: J.white, borderBottom: `1px solid ${J.border}`,
        padding: "0 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>⚡</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: J.ink, letterSpacing: "-0.3px" }}>Jerry</span>
          <span style={{ fontSize: 14, color: J.gray, fontWeight: 500 }}>Sales Tracker</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {editingName ? (
            <form onSubmit={e => { e.preventDefault(); setAgentName(tempName); setEditingName(false); }}
              style={{ display: "flex", gap: 8 }}>
              <input value={tempName} onChange={e => setTempName(e.target.value)}
                style={{ ...inputStyle, width: 160, padding: "6px 12px" }} autoFocus />
              <button type="submit" style={{
                background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "6px 14px",
              }}>Save</button>
            </form>
          ) : (
            <button onClick={() => { setTempName(agentName); setEditingName(true); }}
              style={{ background: J.purpleLight, border: `1px solid ${J.border}`, borderRadius: 8,
                color: J.purple, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              👤 {agentName}
            </button>
          )}
          <button
            onClick={() => { setEditingTiers(tierTargets.map(t => ({ ...t }))); setShowSettings(true); }}
            style={{
              background: J.grayLight, border: `1px solid ${J.border}`,
              borderRadius: 10, color: J.inkMid, fontWeight: 700,
              fontSize: 14, cursor: "pointer", padding: "9px 14px",
            }}
            title="Commission Targets"
          >
            ⚙️
          </button>
          <button onClick={openLog} style={{
            background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
            border: "none", borderRadius: 10, color: "#fff", fontWeight: 700,
            fontSize: 14, cursor: "pointer", padding: "9px 20px",
            boxShadow: `0 4px 14px ${J.purple}44`,
          }}>
            + Log Call
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total Calls",   val: totalCalls,   sub: "this period",                        accent: J.blue },
            { label: "Total Sales",   val: totalSales,   sub: "closed calls",                        accent: J.purple },
            { label: "Closure Rate",  val: closureRate,  sub: "% of all calls",                      accent: "#0891B2", pct: true },
            { label: "Total Points",  val: totalPoints,  sub: `incl. ${totalBonusPoints} bonus pts`,  accent: J.green },
            {
              label: "Current Tier",
              val: currentTier?.label ?? "Estimating",
              sub: currentTier
                ? `${(currentTier.rate * 100).toFixed(0)}% commission rate`
                : `Using Bronze rate (${((COMMISSION_TIERS[0]?.rate ?? 0.05) * 100).toFixed(0)}%) as estimate`,
              accent: currentTier ? TIER_COLORS[COMMISSION_TIERS.indexOf(currentTier)] : TIER_COLORS[0],
              text: true,
            },
          ].map((s, i) => (
            <div key={i} style={{ ...card, borderTop: `3px solid ${s.accent}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: J.gray, marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ fontSize: (s as any).text ? 20 : 30, fontWeight: 800, color: (s as any).text ? s.accent : J.ink, lineHeight: 1.15 }}>
                {(s as any).text
                  ? s.val
                  : (s as any).pct
                  ? <><AnimatedNumber value={Math.round(s.val as number)} />%</>
                  : <AnimatedNumber value={s.val as number} />}
              </div>
              <div style={{ fontSize: 12, color: J.gray, marginTop: 5 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Premium & Commission Summary ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          <div style={{ ...card, borderTop: `3px solid ${J.green}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: J.gray, marginBottom: 6 }}>Total Premium Written</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: J.ink }}>{formatCurrency(totalPremium)}</div>
            <div style={{ fontSize: 12, color: J.gray, marginTop: 4 }}>across {totalSales} sale{totalSales !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${J.purple}`, background: totalPremium > 0 ? J.purpleLight : J.white }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: J.gray, marginBottom: 6 }}>
              Projected Commission
              {!currentTier && totalPremium > 0 && (
                <span style={{ fontWeight: 600, marginLeft: 6, fontSize: 10, color: J.amber, textTransform: "none" as const }}>Bronze estimate</span>
              )}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: J.purple }}>{formatCurrency(projectedCommission)}</div>
            <div style={{ fontSize: 12, color: J.gray, marginTop: 4 }}>
              {totalPremium > 0
                ? `10% of premium × ${(activeTierRate * 100).toFixed(0)}% ${currentTier ? currentTier.label : "Bronze"} rate`
                : "Log a sale with premium to see projection"}
            </div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${J.amber}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: J.gray, marginBottom: 6 }}>Avg Premium / Sale</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: J.ink }}>{formatCurrency(totalSales > 0 ? totalPremium / totalSales : 0)}</div>
            <div style={{ fontSize: 12, color: J.gray, marginTop: 4 }}>per closed call</div>
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: 16, marginBottom: 16 }}>

          {/* Commission Tiers */}
          <div style={card}>
            <div style={panelTitle}>Commission Tiers (by Points)</div>
            {COMMISSION_TIERS.map(t => <TierBar key={t.label} tier={t} current={totalPoints} />)}
            {nextTier ? (
              <div style={{
                marginTop: 16, padding: "12px 14px",
                background: J.purpleLight, borderRadius: 10,
                border: `1px solid ${J.purple}33`,
              }}>
                <div style={{ fontSize: 11, color: J.purple, fontWeight: 800, marginBottom: 4, letterSpacing: "0.06em" }}>
                  NEXT: {nextTier.label} ({(nextTier.rate * 100).toFixed(0)}% commission)
                </div>
                <div style={{ fontSize: 13, color: J.inkMid }}>
                  <strong style={{ color: J.ink }}>{ptsNeeded}</strong> more points needed
                </div>
                {ptsPerShift > 0 && (
                  <div style={{ fontSize: 13, color: J.inkMid, marginTop: 3 }}>
                    ≈ <strong style={{ color: J.ink }}>{ptsPerShift}</strong> pts/shift · {workingDaysLeft} shifts left
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                marginTop: 16, padding: "12px 14px", background: J.purpleLight,
                borderRadius: 10, border: `1px solid ${J.purple}33`,
                textAlign: "center", color: J.purple, fontWeight: 700, fontSize: 14,
              }}>
                🏆 Maximum Tier Reached!
              </div>
            )}
          </div>

          {/* Product Breakdown Donut */}
          <div style={card}>
            <div style={panelTitle}>Product Mix</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, position: "relative" }}>
              <DonutChart
                segments={Object.entries(PRODUCTS).map(([k, cfg]) => ({
                  value: saleCalls.filter(c => c.products.includes(k as ProductKey)).length,
                  color: cfg.color,
                }))}
                size={148}
              />
              {totalSales > 0 && (
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none",
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: J.ink }}>{totalPoints}</div>
                  <div style={{ fontSize: 10, color: J.gray, fontWeight: 700, letterSpacing: "0.08em" }}>PTS</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(PRODUCTS).map(([key, cfg]) => {
                const count = saleCalls.filter(c => c.products.includes(key as ProductKey)).length;
                const pts = saleCalls
                  .filter(c => c.products.includes(key as ProductKey))
                  .reduce((s, c) => {
                    if (key === "auto") {
                      const liabOpt = LIABILITY_OPTIONS.find(l => l.key === c.liabilityLimit);
                      return s + (liabOpt?.points ?? 0);
                    }
                    return s + (cfg.basePoints as number);
                  }, 0);
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                    <span style={{ color: J.inkMid, flex: 1 }}>{cfg.emoji} {cfg.label}</span>
                    <span style={{ fontWeight: 700, color: count > 0 ? J.ink : J.gray }}>{count}x</span>
                    <span style={{ fontSize: 11, color: J.purple, fontWeight: 700, width: 44, textAlign: "right" }}>
                      {count > 0 ? `${pts} pts` : "—"}
                    </span>
                  </div>
                );
              })}
              {totalBonusPoints > 0 && (
                <div style={{
                  marginTop: 6, padding: "8px 10px",
                  background: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA",
                  fontSize: 12, color: J.amber, fontWeight: 700,
                }}>
                  🎁 +{totalBonusPoints} bonus pts from bundles
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Work Schedule */}
            <div style={card}>
              <div style={panelTitle}>Work Schedule</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {DAYS_OF_WEEK.map((d, i) => {
                  const active = workDays.includes(i);
                  return (
                    <button key={i} onClick={() =>
                      setWorkDays(prev => active ? prev.filter(x => x !== i) : [...prev, i].sort())
                    } style={tag(active, J.purple)}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: J.inkMid }}>
                <span style={{ color: J.purple, fontWeight: 700 }}>{workDays.length}</span> days/week ·{" "}
                <span style={{ color: J.purple, fontWeight: 700 }}>{workingDaysLeft}</span> shifts left this month
              </div>
            </div>

            {/* Call Outcome Breakdown */}
            <div style={card}>
              <div style={panelTitle}>Call Outcomes</div>
              {(Object.keys(RESULT_META) as CallResult[]).map(r => {
                const meta = RESULT_META[r];
                const count = hydratedCalls.filter(c => c.result === r).length;
                const pct = totalCalls > 0 ? (count / totalCalls) * 100 : 0;
                return (
                  <div key={r} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: J.inkMid, fontWeight: 500 }}>{meta.emoji} {meta.label}</span>
                      <span style={{ fontWeight: 700, color: count > 0 ? meta.color : J.gray }}>{count}</span>
                    </div>
                    <div style={{ background: J.grayLight, borderRadius: 99, height: 6 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: meta.color, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Call Log ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={panelTitle}>Recent Calls</div>
            {hydratedCalls.length > 0 && (
              <button onClick={() => setCalls([])}
                style={{ background: "none", border: `1px solid ${J.border}`, borderRadius: 7,
                  color: J.gray, fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
                Clear All
              </button>
            )}
          </div>
          {hydratedCalls.length === 0 ? (
            <div style={{ textAlign: "center", color: J.gray, padding: "36px 0", fontSize: 14, background: J.grayLight, borderRadius: 10 }}>
              No calls logged yet. Click <strong style={{ color: J.purple }}>+ Log Call</strong> to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {hydratedCalls.slice(0, 80).map(c => {
                const meta = RESULT_META[c.result];
                const totalPts = c.points + c.bonusPoints;
                return (
                  <div key={c.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", background: meta.bg,
                    borderRadius: 10, border: `1px solid ${meta.color}22`,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                    <span style={{ color: meta.color, fontWeight: 700, fontSize: 12, width: 100, flexShrink: 0 }}>{meta.label}</span>

                    {c.products.length > 0 && (
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                        {c.products.map(p => (
                          <span key={p} style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 6, background: PRODUCTS[p].color + "18",
                            color: PRODUCTS[p].color, border: `1px solid ${PRODUCTS[p].color}33`,
                          }}>
                            {PRODUCTS[p].emoji} {PRODUCTS[p].label}
                            {p === "auto" && c.liabilityLimit && (
                              <span style={{ opacity: 0.8 }}>
                                {" "}· {LIABILITY_OPTIONS.find(l => l.key === c.liabilityLimit)?.label}
                              </span>
                            )}
                          </span>
                        ))}
                        {c.bonusPoints > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 6, background: "#FFF7ED", color: J.amber,
                            border: "1px solid #FED7AA",
                          }}>
                            🎁 +{c.bonusPoints} bonus
                          </span>
                        )}
                      </span>
                    )}

                    {c.result === "sale" && (
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: J.purple,
                        background: J.purpleLight, padding: "2px 10px",
                        borderRadius: 6, flexShrink: 0,
                      }}>
                        {totalPts} pts
                      </span>
                    )}

                    {c.premium > 0 && (
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: J.green,
                        background: J.greenLight, padding: "2px 10px",
                        borderRadius: 6, flexShrink: 0,
                      }}>
                        {formatCurrency(c.premium)}
                      </span>
                    )}

                    {c.notes && (
                      <span style={{ fontSize: 11, color: J.gray, fontStyle: "italic", flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.notes}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: J.gray, marginLeft: "auto", flexShrink: 0 }}>
                      {c.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button onClick={() => setCalls(p => p.filter(x => x.id !== c.id))}
                      style={{ background: "none", border: "none", color: J.gray, cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Log Call Modal ── */}
      {showLog && (
        <div onClick={() => setShowLog(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: J.white, borderRadius: 20, padding: 32, width: 520,
            boxShadow: "0 20px 60px rgba(108,43,217,0.15)",
            border: `1px solid ${J.border}`,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>📋</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: J.ink }}>Log a Call</span>
            </div>

            {/* Call Result */}
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabel}>Call Result</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                {(Object.keys(RESULT_META) as CallResult[]).map(r => (
                  <button key={r} onClick={() => setLogResult(r)} style={tag(logResult === r, RESULT_META[r].color)}>
                    {RESULT_META[r].emoji} {RESULT_META[r].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Products — only shown for Sale */}
            {logResult === "sale" && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={sectionLabel}>Products Sold <span style={{ color: J.gray, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(select all that apply)</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(Object.keys(PRODUCTS) as ProductKey[]).map(p => {
                      const cfg = PRODUCTS[p];
                      const active = logProducts.includes(p);
                      const pts = p === "auto"
                        ? `${LIABILITY_OPTIONS.find(l => l.key === logLiability)?.points ?? 0} pts`
                        : `${cfg.basePoints} pt${cfg.basePoints !== 1 ? "s" : ""}`;
                      return (
                        <button key={p} onClick={() => toggleProduct(p)} style={{
                          ...tag(active, cfg.color),
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: 10,
                        }}>
                          <span>{cfg.emoji} {cfg.label}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            background: active ? cfg.color + "22" : J.grayLight,
                            color: active ? cfg.color : J.gray,
                            padding: "2px 6px", borderRadius: 5,
                          }}>
                            {pts}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Liability Limits — shown when Auto is selected */}
                {hasAuto && (
                  <div style={{
                    marginBottom: 20, padding: "16px",
                    background: J.purpleLight, borderRadius: 12,
                    border: `1px solid ${J.purple}33`,
                  }}>
                    <div style={{ ...sectionLabel, color: J.purple, marginBottom: 10 }}>
                      Auto Liability Limits
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {LIABILITY_OPTIONS.map(opt => (
                        <button key={opt.key} onClick={() => setLogLiability(opt.key)} style={{
                          flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                          border: `2px solid ${logLiability === opt.key ? opt.color : J.border}`,
                          background: logLiability === opt.key ? opt.color + "15" : J.white,
                          textAlign: "center" as const,
                          transition: "all 0.15s",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: logLiability === opt.key ? opt.color : J.ink }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: logLiability === opt.key ? opt.color : J.gray, marginTop: 2 }}>
                            {opt.points} pts
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live Points Preview */}
                {logProducts.length > 0 && (
                  <div style={{
                    marginBottom: 20, padding: "14px 16px",
                    background: preview.bonus > 0 ? "#FFF7ED" : J.blueLight,
                    borderRadius: 12,
                    border: `1px solid ${preview.bonus > 0 ? "#FED7AA" : "#BFDBFE"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: preview.bonusReasons.length > 0 ? 8 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: J.inkMid }}>
                        Points for this sale:
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: J.purple }}>
                        {preview.total} pts
                      </span>
                    </div>
                    {preview.base > 0 && (
                      <div style={{ fontSize: 12, color: J.inkMid }}>
                        Base: <strong>{preview.base} pts</strong>
                        {preview.bonus > 0 && (
                          <> + <strong style={{ color: J.amber }}>+{preview.bonus} bonus</strong></>
                        )}
                      </div>
                    )}
                    {preview.bonusReasons.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: J.amber, fontWeight: 600, marginTop: 3 }}>
                        🎁 {r}
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-Product Premium Inputs */}
                {logProducts.length > 0 && (() => {
                  const totalPrem = logProducts.reduce((s, p) => s + (parseFloat(logPremiums[p] || "0") || 0), 0);
                  const hasAnyPremium = totalPrem > 0;
                  const estComm = calcCommission(totalPrem, activeTierRate);
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={sectionLabel}>
                        Policy Premiums
                        <span style={{ color: J.gray, fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }}> (annual premium per product)</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {logProducts.map(p => {
                          const cfg = PRODUCTS[p];
                          return (
                            <div key={p} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px",
                              background: J.grayLight, borderRadius: 10,
                              border: `1.5px solid ${cfg.color}33`,
                            }}>
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{cfg.emoji}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, width: 90, flexShrink: 0 }}>{cfg.label}</span>
                              <div style={{ position: "relative", flex: 1 }}>
                                <span style={{
                                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                                  fontSize: 14, fontWeight: 700, color: J.inkMid, pointerEvents: "none",
                                }}>$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={logPremiums[p] ?? ""}
                                  onChange={e => setLogPremiums(prev => ({ ...prev, [p]: e.target.value }))}
                                  placeholder="0.00"
                                  style={{
                                    ...inputStyle,
                                    paddingLeft: 24, paddingTop: 8, paddingBottom: 8,
                                    background: J.white,
                                    border: `1.5px solid ${logPremiums[p] && parseFloat(logPremiums[p]!) > 0 ? cfg.color + "66" : J.border}`,
                                  }}
                                />
                              </div>
                              {logPremiums[p] && parseFloat(logPremiums[p]!) > 0 && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: J.green, flexShrink: 0 }}>
                                  {formatCurrency(parseFloat(logPremiums[p]!))}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Total + Commission preview */}
                      {hasAnyPremium && (
                        <div style={{
                          marginTop: 10, padding: "12px 16px",
                          background: J.purpleLight, borderRadius: 10,
                          border: `1px solid ${J.purple}33`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: J.inkMid }}>Total Premium</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: J.ink }}>{formatCurrency(totalPrem)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: J.inkMid }}>
                              Projected commission
                              {!currentTier && <span style={{ color: J.amber, marginLeft: 4 }}>(Bronze est.)</span>}
                            </span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: J.purple }}>{formatCurrency(estComm)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: J.gray, marginTop: 4 }}>
                            10% of {formatCurrency(totalPrem)} × {(activeTierRate * 100).toFixed(0)}% {currentTier ? currentTier.label : "Bronze"} rate
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 24 }}>
              <div style={sectionLabel}>Notes (optional)</div>
              <input value={logNotes} onChange={e => setLogNotes(e.target.value)}
                placeholder="e.g. Requested callback, had questions about deductible..."
                style={inputStyle} />
            </div>

            {/* Validation warning */}
            {logResult === "sale" && logProducts.length === 0 && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA",
                fontSize: 13, color: J.red, fontWeight: 600,
              }}>
                ⚠️ Please select at least one product
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowLog(false)}
                style={{ background: J.grayLight, border: "none", borderRadius: 10,
                  color: J.inkMid, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                Cancel
              </button>
              <button
                onClick={logCall}
                disabled={logResult === "sale" && logProducts.length === 0}
                style={{
                  background: logResult === "sale" && logProducts.length === 0
                    ? J.grayLight
                    : `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                  border: "none", borderRadius: 10,
                  color: logResult === "sale" && logProducts.length === 0 ? J.gray : "#fff",
                  fontWeight: 700, fontSize: 14, cursor: logResult === "sale" && logProducts.length === 0 ? "not-allowed" : "pointer",
                  padding: "10px 24px",
                  boxShadow: logResult === "sale" && logProducts.length === 0 ? "none" : `0 4px 14px ${J.purple}44`,
                  transition: "all 0.15s",
                }}>
                Log Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Commission Targets Settings Modal ── */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: J.white, borderRadius: 20, padding: 32, width: 500,
            boxShadow: "0 20px 60px rgba(108,43,217,0.15)",
            border: `1px solid ${J.border}`,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>🎯</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: J.ink }}>Monthly Commission Targets</span>
            </div>
            <p style={{ fontSize: 13, color: J.gray, marginBottom: 24, marginTop: 4 }}>
              Set point thresholds and commission rates for Bronze, Superior, and Top tiers this month.
            </p>

            {/* Tier rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: J.gray, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tier</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: J.gray, textTransform: "uppercase", letterSpacing: "0.08em" }}>Min Points</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: J.gray, textTransform: "uppercase", letterSpacing: "0.08em" }}>Commission %</div>
              </div>

              {editingTiers.map((tier, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 10, alignItems: "center",
                  padding: "12px 14px", background: J.grayLight, borderRadius: 12,
                  border: `1.5px solid ${TIER_COLORS[i]}33`,
                }}>
                  {/* Tier name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: TIER_COLORS[i] }}>{tier.label}</span>
                  </div>

                  {/* Min points */}
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      min={0}
                      value={tier.minPoints}
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setEditingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, minPoints: val } : t));
                      }}
                      style={{
                        ...inputStyle,
                        paddingRight: 36,
                        border: `1.5px solid ${TIER_COLORS[i]}55`,
                        background: J.white,
                      }}
                    />
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: J.gray, fontWeight: 700, pointerEvents: "none" }}>pts</span>
                  </div>

                  {/* Rate */}
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={tier.rate}
                      onChange={e => {
                        const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                        setEditingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, rate: val } : t));
                      }}
                      style={{
                        ...inputStyle,
                        paddingRight: 28,
                        border: `1.5px solid ${TIER_COLORS[i]}55`,
                        background: J.white,
                      }}
                    />
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: J.gray, fontWeight: 700, pointerEvents: "none" }}>%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview of current progress against new targets */}
            <div style={{
              padding: "12px 14px", background: J.purpleLight,
              borderRadius: 10, border: `1px solid ${J.purple}33`, marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: J.purple, letterSpacing: "0.08em", marginBottom: 6 }}>
                PREVIEW WITH CURRENT POINTS ({totalPoints} pts)
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                {editingTiers.map((t, i) => {
                  const reached = totalPoints >= t.minPoints;
                  return (
                    <span key={i} style={{
                      fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                      background: reached ? TIER_COLORS[i] + "20" : J.white,
                      color: reached ? TIER_COLORS[i] : J.gray,
                      border: `1.5px solid ${reached ? TIER_COLORS[i] : J.border}`,
                    }}>
                      {reached ? "✓ " : ""}{t.label} ({t.minPoints} pts)
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => setEditingTiers(DEFAULT_TIER_TARGETS.map(t => ({ ...t })))}
                style={{ background: "none", border: `1px solid ${J.border}`, borderRadius: 10,
                  color: J.gray, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Reset to Defaults
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowSettings(false)}
                  style={{ background: J.grayLight, border: "none", borderRadius: 10,
                    color: J.inkMid, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  Cancel
                </button>
                <button
                  onClick={() => { setTierTargets(editingTiers.map(t => ({ ...t }))); setShowSettings(false); }}
                  style={{
                    background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                    border: "none", borderRadius: 10, color: "#fff", fontWeight: 700,
                    fontSize: 14, cursor: "pointer", padding: "10px 24px",
                    boxShadow: `0 4px 14px ${J.purple}44`,
                  }}>
                  Save Targets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&display=swap" rel="stylesheet" />
    </div>
  );
}