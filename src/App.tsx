import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, writeBatch, getDoc,
} from "firebase/firestore";

// ── Brand Colors ────────────────────────────────────────────────────────────
const J = {
  purple:      "#6C2BD9",
  purpleLight: "#EDE9FF",
  blue:        "#1D4ED8",
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

const TIER_COLORS = ["#B45309", "#6B7280", "#7C3AED"];

// ── Types ───────────────────────────────────────────────────────────────────
interface TierTarget {
  label: string;
  minPoints: number;
  rate: number;
}

const DEFAULT_TIER_TARGETS: TierTarget[] = [
  { label: "Bronze",   minPoints: 10,  rate: 5  },
  { label: "Superior", minPoints: 25,  rate: 8  },
  { label: "Top",      minPoints: 50,  rate: 12 },
];

interface AgentRecord {
  period: string;
  name: string;
  opPct: number;
  calls: number;
  ops: number;
  points: number;
  conversion: number;
  attributed: number;
  premium: number;
  csat: number;
  ota: number;
  renters: number;
  nno: number;
  ho: number;
  fiftyHundred: number;
  hundredThreeHundred: number;
  minLiab: number;
  auto: number;
  geico: number;
  rentersAuto: number;
  homeStateMin: number;
  homeFiftyHundred: number;
  homeHundredThreeHundred: number;
  homeHundredThreeHundredOta: number;
  recentAuto: number;
  talk: number;
  hold: number;
  wrap: number;
  onHrs: number;
  days: number;
  rawSales: number;
  wrapPct: number;
  breakPct: number;
  meetingPct: number;
  trainingPct: number;
  otherPct: number;
  awayPct: number;
  projectPct: number;
  bindsPct: number;
  frontPct: number;
  cph: number;
  cpah: number;
  icph: number;
  psalesHr: number;
  shrinkage: number;
  hrsWorked: number;
  inCalls: number;
  outCalls: number;
  ncCalls: number;
  transfers: number;
  missedPct: number;
  missed: number;
  hoursOff: number;
  valueRate: number;
}

// ── CSV Parsing ─────────────────────────────────────────────────────────────
function parsePct(s: string): number {
  if (!s || s === "-∞%" || s === "N/A" || s === "") return 0;
  return parseFloat(s.replace("%", "").replace(/,/g, "")) || 0;
}
function parseNum(s: string): number {
  if (!s || s === "-∞%" || s === "N/A" || s === "") return 0;
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text: string): AgentRecord[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const col = (name: string) => headers.indexOf(name);

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = splitCSVLine(line);
    const g = (name: string) => cells[col(name)] ?? "";
    return {
      period:                    g("Period"),
      name:                      g("Agent Name"),
      opPct:                     parsePct(g("OP %")),
      calls:                     parseNum(g("Calls")),
      ops:                       parseNum(g("OPS")),
      points:                    parseNum(g("Points")),
      conversion:                parsePct(g("Conversion")),
      attributed:                parsePct(g("Attributed")),
      premium:                   parseNum(g("Premium")),
      csat:                      parseNum(g("CSAT")),
      ota:                       parseNum(g("OTA")),
      renters:                   parseNum(g("Renters")),
      nno:                       parseNum(g("NNO")),
      ho:                        parseNum(g("HO")),
      fiftyHundred:              parseNum(g("50/100")),
      hundredThreeHundred:       parseNum(g("100/300")),
      minLiab:                   parseNum(g("Min")),
      auto:                      parseNum(g("Auto")),
      geico:                     parseNum(g("GEICO")),
      rentersAuto:               parseNum(g("Renters + Auto")),
      homeStateMin:              parseNum(g("Home + State Min")),
      homeFiftyHundred:          parseNum(g("Home + 50/100")),
      homeHundredThreeHundred:   parseNum(g("Home + 100/300")),
      homeHundredThreeHundredOta:parseNum(g("Home + 100/300 + OTA")),
      recentAuto:                parseNum(g("Recent Auto")),
      talk:                      parseNum(g("Talk")),
      hold:                      parseNum(g("Hold")),
      wrap:                      parseNum(g("Wrap")),
      onHrs:                     parseNum(g("On Hrs")),
      days:                      parseNum(g("Days")),
      rawSales:                  parseNum(g("Raw Sales")),
      wrapPct:                   parsePct(g("Wrap%")),
      breakPct:                  parsePct(g("Break%")),
      meetingPct:                parsePct(g("Meeting%")),
      trainingPct:               parsePct(g("Training%")),
      otherPct:                  parsePct(g("Other%")),
      awayPct:                   parsePct(g("Away%")),
      projectPct:                parsePct(g("Project%")),
      bindsPct:                  parsePct(g("Binds%")),
      frontPct:                  parsePct(g("Front%")),
      cph:                       parseNum(g("CPH")),
      cpah:                      parseNum(g("CPAH")),
      icph:                      parseNum(g("ICPH")),
      psalesHr:                  parseNum(g("PSales/Hr")),
      shrinkage:                 parsePct(g("Shrinkage")),
      hrsWorked:                 parseNum(g("Hrs Worked")),
      inCalls:                   parseNum(g("InCalls")),
      outCalls:                  parseNum(g("OutCalls")),
      ncCalls:                   parseNum(g("N/C Calls")),
      transfers:                 parseNum(g("Transfers")),
      missedPct:                 parsePct(g("Missed %")),
      missed:                    parseNum(g("Missed")),
      hoursOff:                  parseNum(g("Hours Off")),
      valueRate:                 parsePct(g("Value Rate")),
    };
  });
}

// ── Format helpers ──────────────────────────────────────────────────────────
function fmt(n: number, dec = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(n: number) { return `${fmt(n, 1)}%`; }
function fmtCur(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function tierFor(points: number, tiers: TierTarget[]) {
  return [...tiers].reverse().find(t => points >= t.minPoints) ?? null;
}

// ── Shared styles ───────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: J.white, border: `1px solid ${J.border}`,
  borderRadius: 16, padding: "20px 24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const panelTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
  textTransform: "uppercase", color: J.purple, marginBottom: 14,
};

// ── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div style={{ ...card, borderTop: `3px solid ${accent}`, padding: "16px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: J.gray, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: J.ink, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: J.gray, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── TierBar ─────────────────────────────────────────────────────────────────
function TierBar({ tier, current, color }: { tier: TierTarget; current: number; color: string }) {
  const pct = Math.min((current / tier.minPoints) * 100, 100);
  const done = current >= tier.minPoints;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: done ? color : J.inkMid }}>
          {tier.label} · {tier.rate}% · {tier.minPoints} pts
        </span>
        <span style={{ color: done ? color : J.gray, fontWeight: 600 }}>
          {done ? "✓ Reached!" : `${tier.minPoints - current} to go`}
        </span>
      </div>
      <div style={{ background: J.grayLight, borderRadius: 99, height: 8, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 99,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: done ? `0 0 6px ${color}66` : "none",
        }} />
      </div>
    </div>
  );
}

// ── DonutChart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 130 }: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  if (total === 0) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={J.grayLight} strokeWidth={14} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill={J.gray} fontSize="10">No data</text>
    </svg>
  );
  let cum = 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={J.grayLight} strokeWidth={14} />
      {segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const pct = seg.value / total;
        const dash = pct * circ, offset = circ - cum * circ;
        cum += pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={14}
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
            style={{ transition: "stroke-dasharray 0.5s ease" }} />
        );
      })}
    </svg>
  );
}

// ── Agent Page ──────────────────────────────────────────────────────────────
function AgentPage({ agent, tiers, onBack }: {
  agent: AgentRecord;
  tiers: TierTarget[];
  onBack: () => void;
}) {
  const tier = tierFor(agent.points, tiers);
  const tierIdx = tier ? tiers.indexOf(tier) : -1;
  const nextTier = tiers.find(t => agent.points < t.minPoints) ?? null;
  const activeTierRate = tier ? tier.rate / 100 : tiers[0].rate / 100;
  const projCommission = agent.premium * 0.10 * activeTierRate;

  const productSegments = [
    { label: "Auto",    value: agent.auto,    color: "#6C2BD9" },
    { label: "Home",    value: agent.ho,      color: "#E53E3E" },
    { label: "Renters", value: agent.renters, color: "#DD6B20" },
    { label: "Min",     value: agent.minLiab, color: "#059669" },
    { label: "OTA",     value: agent.ota,     color: "#D97706" },
    { label: "NNO",     value: agent.nno,     color: "#0891B2" },
    { label: "GEICO",   value: agent.geico,   color: "#DB2777" },
  ];

  const tableGroups: { title: string; rows: { label: string; value: string }[] }[] = [
    {
      title: "Liability Mix",
      rows: [
        { label: "Min Liability", value: fmt(agent.minLiab) },
        { label: "50/100",        value: fmt(agent.fiftyHundred) },
        { label: "100/300",       value: fmt(agent.hundredThreeHundred) },
      ],
    },
    {
      title: "Bundles",
      rows: [
        { label: "Renters + Auto",       value: fmt(agent.rentersAuto) },
        { label: "Home + State Min",     value: fmt(agent.homeStateMin) },
        { label: "Home + 50/100",        value: fmt(agent.homeFiftyHundred) },
        { label: "Home + 100/300",       value: fmt(agent.homeHundredThreeHundred) },
        { label: "Home + 100/300 + OTA", value: fmt(agent.homeHundredThreeHundredOta) },
      ],
    },
    {
      title: "Call Activity",
      rows: [
        { label: "Raw Sales",      value: fmt(agent.rawSales) },
        { label: "Inbound Calls",  value: fmt(agent.inCalls) },
        { label: "Outbound Calls", value: fmt(agent.outCalls) },
        { label: "N/C Calls",      value: fmt(agent.ncCalls) },
        { label: "Transfers",      value: fmt(agent.transfers) },
        { label: "Missed",         value: fmt(agent.missed) },
        { label: "Missed %",       value: fmtPct(agent.missedPct) },
        { label: "Recent Auto",    value: fmt(agent.recentAuto) },
      ],
    },
    {
      title: "Time Metrics",
      rows: [
        { label: "Avg Talk (min)", value: fmt(agent.talk, 2) },
        { label: "Avg Hold (min)", value: fmt(agent.hold, 2) },
        { label: "Avg Wrap (min)", value: fmt(agent.wrap, 2) },
        { label: "On Hours",       value: fmt(agent.onHrs, 2) },
        { label: "Hours Worked",   value: fmt(agent.hrsWorked, 2) },
        { label: "Hours Off",      value: fmt(agent.hoursOff, 2) },
        { label: "Days Worked",    value: fmt(agent.days) },
      ],
    },
    {
      title: "Efficiency",
      rows: [
        { label: "CPH",       value: fmt(agent.cph, 2) },
        { label: "CPAH",      value: fmt(agent.cpah, 2) },
        { label: "ICPH",      value: fmt(agent.icph, 2) },
        { label: "PSales/Hr", value: fmt(agent.psalesHr, 2) },
        { label: "Shrinkage", value: fmtPct(agent.shrinkage) },
      ],
    },
    {
      title: "Time Allocation",
      rows: [
        { label: "Wrap %",     value: fmtPct(agent.wrapPct) },
        { label: "Break %",    value: fmtPct(agent.breakPct) },
        { label: "Meeting %",  value: fmtPct(agent.meetingPct) },
        { label: "Training %", value: fmtPct(agent.trainingPct) },
        { label: "Away %",     value: fmtPct(agent.awayPct) },
        { label: "Other %",    value: fmtPct(agent.otherPct) },
        { label: "Project %",  value: fmtPct(agent.projectPct) },
        { label: "Binds %",    value: fmtPct(agent.bindsPct) },
        { label: "Front %",    value: fmtPct(agent.frontPct) },
      ],
    },
  ];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Agent header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: J.grayLight, border: `1px solid ${J.border}`, borderRadius: 10,
          color: J.inkMid, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700,
        }}>← Team</button>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color: "#fff",
        }}>{initials(agent.name)}</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: J.ink }}>{agent.name}</div>
          <div style={{ fontSize: 13, color: J.gray }}>Period: {agent.period} · {agent.days} days worked</div>
        </div>
        {tier && (
          <div style={{
            marginLeft: "auto", padding: "6px 18px", borderRadius: 20,
            background: TIER_COLORS[tierIdx] + "18",
            border: `1.5px solid ${TIER_COLORS[tierIdx]}`,
            color: TIER_COLORS[tierIdx], fontWeight: 800, fontSize: 14,
          }}>🏆 {tier.label}</div>
        )}
      </div>

      {/* Stat row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 14 }}>
        <StatCard label="Total Points"     value={fmt(agent.points)}        sub="pts this period"             accent={J.purple} />
        <StatCard label="OPS"              value={fmt(agent.ops)}           sub={`of ${fmt(agent.calls)} calls`} accent={J.blue} />
        <StatCard label="Conversion"       value={fmtPct(agent.conversion)} sub="call → sale rate"            accent={J.green} />
        <StatCard label="Premium"          value={fmtCur(agent.premium)}    sub="total written"               accent={J.green} />
        <StatCard label="Proj. Commission" value={fmtCur(projCommission)}
          sub={`10% × ${tier ? tier.rate : tiers[0].rate}% ${tier ? tier.label : "Bronze est."}`} accent={J.purple} />
      </div>

      {/* Stat row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="OP %"       value={fmtPct(agent.opPct)}    sub="on-phone efficiency" accent={J.blue} />
        <StatCard label="CSAT"       value={agent.csat > 0 ? fmt(agent.csat, 2) : "—"} sub="satisfaction score" accent={J.amber} />
        <StatCard label="Attributed" value={fmtPct(agent.attributed)} sub="attributed rate"   accent="#0891B2" />
        <StatCard label="Value Rate" value={fmtPct(agent.valueRate)}  sub="value rate"        accent={J.amber} />
        <StatCard label="CPH"        value={fmt(agent.cph, 2)}        sub="calls per hour"    accent={J.inkMid} />
      </div>

      {/* 3-col panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: 16, marginBottom: 16 }}>

        <div style={card}>
          <div style={panelTitle}>Commission Tiers</div>
          {tiers.map((t, i) => (
            <TierBar key={t.label} tier={t} current={agent.points} color={TIER_COLORS[i]} />
          ))}
          {nextTier ? (
            <div style={{ marginTop: 14, padding: "10px 14px", background: J.purpleLight, borderRadius: 10, border: `1px solid ${J.purple}33` }}>
              <div style={{ fontSize: 11, color: J.purple, fontWeight: 800, marginBottom: 3 }}>
                NEXT: {nextTier.label} ({nextTier.rate}%)
              </div>
              <div style={{ fontSize: 13, color: J.inkMid }}>
                <strong>{nextTier.minPoints - agent.points}</strong> more pts needed
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: "10px 14px", background: J.purpleLight, borderRadius: 10, textAlign: "center", color: J.purple, fontWeight: 700 }}>
              🏆 Maximum Tier Reached!
            </div>
          )}
        </div>

        <div style={card}>
          <div style={panelTitle}>Product Mix</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, position: "relative" }}>
            <DonutChart segments={productSegments} size={130} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: J.ink }}>{agent.ops}</div>
              <div style={{ fontSize: 9, color: J.gray, fontWeight: 700, letterSpacing: "0.08em" }}>OPS</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {productSegments.filter(s => s.value > 0).map(seg => (
              <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                <span style={{ color: J.inkMid, flex: 1 }}>{seg.label}</span>
                <span style={{ fontWeight: 700, color: J.ink }}>{seg.value}</span>
                <span style={{ color: J.gray, fontSize: 11, width: 34, textAlign: "right" }}>
                  {agent.ops > 0 ? Math.round((seg.value / agent.ops) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={panelTitle}>Commission Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Total Premium",     value: fmtCur(agent.premium),                                          color: J.green  },
              { label: "Jerry's Cut (10%)", value: fmtCur(agent.premium * 0.10),                                   color: J.blue   },
              { label: "Proj. Commission",  value: fmtCur(projCommission),                                         color: J.purple },
              { label: "Avg Premium / OPS", value: agent.ops > 0 ? fmtCur(agent.premium / agent.ops) : "—",        color: J.amber  },
            ].map(row => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: J.grayLight, borderRadius: 10,
              }}>
                <span style={{ fontSize: 13, color: J.inkMid }}>{row.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: row.color }}>{row.value}</span>
              </div>
            ))}
            {!tier && (
              <div style={{ fontSize: 11, color: J.amber, fontWeight: 600, padding: "8px 12px", background: J.amberLight, borderRadius: 8 }}>
                ⚠️ No tier reached — using Bronze ({tiers[0].rate}%) as estimate
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div style={card}>
        <div style={panelTitle}>Detailed Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
          {tableGroups.map(group => (
            <div key={group.title}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: J.blue,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
                paddingBottom: 6, borderBottom: `2px solid ${J.blue}22`,
              }}>
                {group.title}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? J.grayLight : J.white }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: J.inkMid, borderRadius: "6px 0 0 6px" }}>{row.label}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 700, color: J.ink, textAlign: "right", borderRadius: "0 6px 6px 0" }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Team Dashboard ──────────────────────────────────────────────────────────
function TeamDashboard({ agents, tiers, onSelectAgent }: {
  agents: AgentRecord[];
  tiers: TierTarget[];
  onSelectAgent: (name: string) => void;
}) {
  const [sortBy, setSortBy] = useState<keyof AgentRecord>("points");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sorted = [...agents].sort((a, b) => {
    const av = a[sortBy] as number, bv = b[sortBy] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const totalPremium  = agents.reduce((s, a) => s + a.premium, 0);
  const totalOps      = agents.reduce((s, a) => s + a.ops, 0);
  const avgConversion = agents.length > 0 ? agents.reduce((s, a) => s + a.conversion, 0) / agents.length : 0;
  const csatAgents    = agents.filter(a => a.csat > 0);
  const avgCsat       = csatAgents.length > 0 ? csatAgents.reduce((s, a) => s + a.csat, 0) / csatAgents.length : 0;

  const toggleSort = (col: keyof AgentRecord) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortTh = ({ col, label }: { col: keyof AgentRecord; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      color: sortBy === col ? J.purple : J.gray,
      cursor: "pointer", textAlign: "right" as const, whiteSpace: "nowrap" as const,
      background: sortBy === col ? J.purpleLight : J.grayLight,
      userSelect: "none" as const,
    }}>
      {label} {sortBy === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Agents"         value={fmt(agents.length)}    sub="on team this period"   accent={J.blue} />
        <StatCard label="Total OPS"      value={fmt(totalOps)}         sub="team sales"            accent={J.purple} />
        <StatCard label="Total Premium"  value={fmtCur(totalPremium)}  sub="written this period"   accent={J.green} />
        <StatCard label="Avg Conversion" value={fmtPct(avgConversion)} sub={avgCsat > 0 ? `Avg CSAT: ${fmt(avgCsat, 2)}` : "team average"} accent={J.amber} />
      </div>

      <div style={{ background: J.white, border: `1px solid ${J.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${J.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ ...panelTitle, marginBottom: 0 }}>Agent Leaderboard</span>
          <span style={{ fontSize: 12, color: J.gray }}>Click any row for full agent profile · Click columns to sort</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: J.gray, textAlign: "left", background: J.grayLight, whiteSpace: "nowrap" }}>Agent</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: J.gray, textAlign: "center", background: J.grayLight }}>Tier</th>
                <SortTh col="points"     label="Points" />
                <SortTh col="ops"        label="OPS" />
                <SortTh col="calls"      label="Calls" />
                <SortTh col="conversion" label="Conv %" />
                <SortTh col="premium"    label="Premium" />
                <SortTh col="csat"       label="CSAT" />
                <SortTh col="opPct"      label="OP %" />
                <SortTh col="attributed" label="Attr %" />
                <SortTh col="cph"        label="CPH" />
                <SortTh col="valueRate"  label="Value Rate" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent, rank) => {
                const tier = tierFor(agent.points, tiers);
                const tierIdx = tier ? tiers.indexOf(tier) : -1;
                const rankColors = ["#F59E0B", "#9CA3AF", "#B45309"];
                return (
                  <tr key={agent.name}
                    onClick={() => onSelectAgent(agent.name)}
                    style={{ cursor: "pointer", borderBottom: `1px solid ${J.border}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = J.purpleLight)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: rank < 3 ? rankColors[rank] : J.gray, width: 16, textAlign: "center", flexShrink: 0 }}>
                          {rank + 1}
                        </span>
                        <div style={{
                          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                          background: `linear-gradient(135deg, ${J.purple}33, ${J.blue}33)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: J.purple,
                        }}>{initials(agent.name)}</div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: J.ink }}>{agent.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      {tier ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                          background: TIER_COLORS[tierIdx] + "18",
                          color: TIER_COLORS[tierIdx],
                          border: `1px solid ${TIER_COLORS[tierIdx]}44`,
                        }}>{tier.label}</span>
                      ) : <span style={{ fontSize: 11, color: J.gray }}>—</span>}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 800, color: J.purple }}>{fmt(agent.points)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, color: J.ink }}>{fmt(agent.ops)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{fmt(agent.calls)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.green, fontWeight: 700 }}>{fmtPct(agent.conversion)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, color: J.ink }}>{fmtCur(agent.premium)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{agent.csat > 0 ? fmt(agent.csat, 2) : "—"}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{fmtPct(agent.opPct)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{fmtPct(agent.attributed)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{fmt(agent.cph, 2)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", color: J.inkMid }}>{fmtPct(agent.valueRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function JerrySalesTracker() {
  const [agents, setAgents]             = useState<AgentRecord[]>([]);
  const [tierTargets, setTierTargets]   = useState<TierTarget[]>(DEFAULT_TIER_TARGETS);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [editingTiers, setEditingTiers]   = useState<TierTarget[]>(DEFAULT_TIER_TARGETS);
  const [importStatus, setImportStatus]   = useState("");
  const [loading, setLoading]             = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeAgent = agents.find(a => a.name === selectedAgent) ?? null;

  // ── Firebase: real-time listeners ──
  useEffect(() => {
    // Listen to agents collection
    const unsubAgents = onSnapshot(collection(db, "agents"), snapshot => {
      const data = snapshot.docs.map(d => d.data() as AgentRecord);
      setAgents(data);
      setLoading(false);
    });

    // Listen to settings doc
    const unsubSettings = onSnapshot(doc(db, "config", "tierTargets"), snapshot => {
      if (snapshot.exists()) {
        setTierTargets(snapshot.data().tiers as TierTarget[]);
      }
    });

    return () => { unsubAgents(); unsubSettings(); };
  }, []);

  // ── Firebase: save tier targets ──
  const saveTierTargets = async (tiers: TierTarget[]) => {
    await setDoc(doc(db, "config", "tierTargets"), { tiers });
    setTierTargets(tiers);
    setShowSettings(false);
  };

  // ── Firebase: write agents from CSV (batch upsert) ──
  const handleCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setImportStatus("⚠️ No valid rows found — check CSV format.");
        return;
      }
      // Batch write — Firestore limit is 500 per batch
      const batch = writeBatch(db);
      parsed.forEach(agent => {
        const ref = doc(db, "agents", agent.name); // agent name as doc ID
        batch.set(ref, agent);                      // overwrites on re-import
      });
      await batch.commit();
      setImportStatus(`✅ ${parsed.length} agent${parsed.length !== 1 ? "s" : ""} updated · ${parsed[0]?.period ?? ""}`);
      setTimeout(() => setImportStatus(""), 6000);
    };
    reader.readAsText(file);
  };

  // ── Firebase: clear all agents ──
  const clearAllAgents = async () => {
    if (!window.confirm("Clear all agent data from the server? This cannot be undone.")) return;
    const batch = writeBatch(db);
    agents.forEach(agent => {
      batch.delete(doc(db, "agents", agent.name));
    });
    await batch.commit();
    setSelectedAgent(null);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCSV(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleCSV(file);
  };

  const inputStyle: React.CSSProperties = {
    background: J.grayLight, border: `1.5px solid ${J.border}`,
    borderRadius: 10, color: J.ink, padding: "10px 14px",
    fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none",
  };

  return (
    <div
      style={{ minHeight: "100vh", background: "#F7F6FC", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: J.ink }}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >

      {/* ── Header ── */}
      <div style={{
        background: J.white, borderBottom: `1px solid ${J.border}`,
        padding: "0 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => setSelectedAgent(null)}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>⚡</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: J.ink, letterSpacing: "-0.3px" }}>Jerry</span>
          <span style={{ fontSize: 14, color: J.gray, fontWeight: 500 }}>Team Tracker</span>
          {selectedAgent && (
            <>
              <span style={{ color: J.border, fontSize: 18, margin: "0 2px" }}>/</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: J.purple }}>{selectedAgent}</span>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {importStatus && (
            <span style={{ fontSize: 13, fontWeight: 600, color: importStatus.startsWith("✅") ? J.green : J.amber }}>
              {importStatus}
            </span>
          )}

          <input ref={fileRef} type="file" accept=".csv" onChange={handleFilePick} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={{
            background: J.grayLight, border: `1.5px dashed ${J.border}`,
            borderRadius: 10, color: J.inkMid, fontWeight: 700,
            fontSize: 13, cursor: "pointer", padding: "8px 16px",
            display: "flex", alignItems: "center", gap: 6,
          }}>📂 Import CSV</button>

          <button
            onClick={() => { setEditingTiers(tierTargets.map(t => ({ ...t }))); setShowSettings(true); }}
            style={{
              background: J.grayLight, border: `1px solid ${J.border}`,
              borderRadius: 10, color: J.inkMid, fontWeight: 700,
              fontSize: 14, cursor: "pointer", padding: "9px 14px",
            }}
            title="Commission Targets"
          >⚙️</button>

          {agents.length > 0 && (
            <button onClick={clearAllAgents} style={{
              background: J.redLight, border: `1px solid ${J.red}44`,
              borderRadius: 10, color: J.red, fontWeight: 700,
              fontSize: 13, cursor: "pointer", padding: "8px 14px",
            }}>Clear Data</button>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "calc(100vh - 64px)", flexDirection: "column", gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: `3px solid ${J.purpleLight}`,
            borderTopColor: J.purple,
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 14, color: J.gray }}>Connecting to database…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && agents.length === 0 && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "calc(100vh - 64px)", gap: 16,
        }}>
          <div style={{ fontSize: 56 }}>📊</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: J.ink }}>No data yet</div>
          <div style={{ fontSize: 14, color: J.gray, maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
            Import your monthly CSV productivity report to generate the team leaderboard and individual agent pages.
          </div>
          <button onClick={() => fileRef.current?.click()} style={{
            background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
            border: "none", borderRadius: 12, color: "#fff", fontWeight: 700,
            fontSize: 15, cursor: "pointer", padding: "13px 30px",
            boxShadow: `0 4px 16px ${J.purple}44`,
          }}>📂 Import CSV Report</button>
          <div style={{ fontSize: 12, color: J.gray }}>or drag & drop a .csv file anywhere on this page</div>
        </div>
      )}

      {/* ── Team or Agent view ── */}
      {!loading && agents.length > 0 && !activeAgent && (
        <TeamDashboard agents={agents} tiers={tierTargets} onSelectAgent={setSelectedAgent} />
      )}
      {!loading && activeAgent && (
        <AgentPage agent={activeAgent} tiers={tierTargets} onBack={() => setSelectedAgent(null)} />
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, backdropFilter: "blur(2px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: J.white, borderRadius: 20, padding: 32, width: 500,
            boxShadow: "0 20px 60px rgba(108,43,217,0.15)", border: `1px solid ${J.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>🎯</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: J.ink }}>Monthly Commission Targets</span>
            </div>
            <p style={{ fontSize: 13, color: J.gray, marginBottom: 24, marginTop: 4 }}>
              Set point thresholds and commission rates. Changes save to the server and update for everyone instantly.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 10 }}>
                {["Tier", "Min Points", "Commission %"].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 700, color: J.gray, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
                ))}
              </div>
              {editingTiers.map((tier, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 10, alignItems: "center",
                  padding: "12px 14px", background: J.grayLight, borderRadius: 12,
                  border: `1.5px solid ${TIER_COLORS[i]}33`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: TIER_COLORS[i] }}>{tier.label}</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input type="number" min={0} value={tier.minPoints}
                      onChange={e => {
                        const v = Math.max(0, parseInt(e.target.value) || 0);
                        setEditingTiers(p => p.map((t, j) => j === i ? { ...t, minPoints: v } : t));
                      }}
                      style={{ ...inputStyle, paddingRight: 36, border: `1.5px solid ${TIER_COLORS[i]}55`, background: J.white }} />
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: J.gray, fontWeight: 700, pointerEvents: "none" }}>pts</span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input type="number" min={0} max={100} step={0.5} value={tier.rate}
                      onChange={e => {
                        const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                        setEditingTiers(p => p.map((t, j) => j === i ? { ...t, rate: v } : t));
                      }}
                      style={{ ...inputStyle, paddingRight: 28, border: `1.5px solid ${TIER_COLORS[i]}55`, background: J.white }} />
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: J.gray, fontWeight: 700, pointerEvents: "none" }}>%</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => setEditingTiers(DEFAULT_TIER_TARGETS.map(t => ({ ...t })))}
                style={{ background: "none", border: `1px solid ${J.border}`, borderRadius: 10, color: J.gray, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Reset to Defaults
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowSettings(false)}
                  style={{ background: J.grayLight, border: "none", borderRadius: 10, color: J.inkMid, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  Cancel
                </button>
                <button onClick={() => saveTierTargets(editingTiers.map(t => ({ ...t })))}
                  style={{
                    background: `linear-gradient(135deg, ${J.purple}, ${J.blue})`,
                    border: "none", borderRadius: 10, color: "#fff", fontWeight: 700,
                    fontSize: 14, cursor: "pointer", padding: "10px 24px",
                    boxShadow: `0 4px 14px ${J.purple}44`,
                  }}>
                  Save to Server
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