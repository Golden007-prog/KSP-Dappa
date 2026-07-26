"""Render the architecture and process-flow diagrams used in the submission deck.

Drawn programmatically rather than generated, because image models garble the
component names and those names are the whole point of these two slides.
Output: docs/screenshots/diagram-architecture.png, diagram-flow.png
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BG = "#0b1220"
CARD = "#131c30"
EDGE = "#25334d"
AMBER = "#f0b429"
TEAL = "#35c6b4"
TEXT = "#e6edf7"
MUTED = "#93a4c0"

OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots")


def box(ax, x, y, w, h, title, lines, accent=AMBER, title_size=11, body_size=8.4):
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h, boxstyle="round,pad=0.012,rounding_size=0.02",
        linewidth=1.2, edgecolor=EDGE, facecolor=CARD, zorder=2))
    # accent rule down the left edge
    ax.add_patch(FancyBboxPatch(
        (x + 0.008, y + 0.02), 0.006, h - 0.04,
        boxstyle="round,pad=0,rounding_size=0.004",
        linewidth=0, facecolor=accent, zorder=3))
    ax.text(x + 0.032, y + h - 0.052, title, color=TEXT, fontsize=title_size,
            fontweight="bold", va="top", zorder=4)
    ax.text(x + 0.032, y + h - 0.052 - 0.052, "\n".join(lines), color=MUTED,
            fontsize=body_size, va="top", linespacing=1.65, zorder=4)


def arrow(ax, p0, p1, color=TEAL, rad=0.0, lw=1.5):
    ax.add_patch(FancyArrowPatch(
        p0, p1, arrowstyle="-|>", mutation_scale=13, linewidth=lw,
        color=color, connectionstyle=f"arc3,rad={rad}", zorder=1,
        shrinkA=2, shrinkB=2))


def canvas(title, subtitle):
    fig, ax = plt.subplots(figsize=(16, 7.2), dpi=140)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.035, 0.955, title, color=TEXT, fontsize=21, fontweight="bold", va="top")
    ax.text(0.035, 0.905, subtitle, color=MUTED, fontsize=11.5, va="top")
    return fig, ax


def architecture():
    fig, ax = canvas(
        "KSP DAPPA — architecture on Zoho Catalyst",
        "Every runtime component is a Catalyst service. No external AI, hosting or database.")

    box(ax, 0.035, 0.60, 0.28, 0.22, "1 · Client (Web Client Hosting)", [
        "React 18 + Vite + Tailwind, HashRouter",
        "ECharts · Leaflet · Cytoscape",
        "Trilingual: English / Kannada / Hindi",
        "System fonts only — no CDN calls",
    ], AMBER)

    box(ax, 0.355, 0.60, 0.28, 0.22, "2 · API (Advanced I/O Function)", [
        "dappa_api — Node 20 + Express",
        "120+ REST routes, {ok,data,meta}",
        "API Gateway in front · rate limited",
        "789-assertion contract suite",
    ], TEAL)

    box(ax, 0.675, 0.60, 0.29, 0.22, "3 · Async compute", [
        "dappa_nightly (Cron) — risk + anomalies",
        "dappa_event (Signals) — row events",
        "Circuits — nightly refresh orchestration",
        "Cache — KPI + choropleth aggregates",
    ], AMBER)

    box(ax, 0.035, 0.30, 0.28, 0.24, "4 · Data Store (ZCQL)", [
        "35 tables on the official KSP FIR ER",
        "CaseMaster 45,000 · AggMonthly 34,021",
        "ActSection 60,948 · Victim 53,836",
        "NetworkEdge 23,833 · Alerts 665",
        "Search — full-text over cases",
    ], TEAL)

    box(ax, 0.355, 0.30, 0.28, 0.24, "5 · Storage & messaging", [
        "Stratus — CSV, GeoJSON, PDF briefs",
        "NoSQL — network-graph snapshots",
        "File Store — FIR scan uploads",
        "Mail — weekly digest to officers",
        "Push Notifications — alert pings",
    ], AMBER)

    box(ax, 0.675, 0.30, 0.29, 0.24, "6 · AI services (all Catalyst)", [
        "QuickML — Random-Forest endpoint, live",
        "Zia Text Analytics — NER / sentiment, live",
        "Zia OCR · Zia Translate",
        "SmartBrowz — brief PDF rendering",
        "Every AI call has a deterministic fallback",
    ], TEAL)

    box(ax, 0.035, 0.055, 0.92, 0.185, "7 · Offline pipeline (build time, not runtime)", [
        "python3.12  generate.py → 45,000 synthetic FIRs on the official ER schema  ·  analytics.py → Holt-Winters forecasts, Gi* hotspots,",
        "identity resolution, co-accused graph, anomaly scoring  →  loaded once into Data Store via the Catalyst CLI / /admin/bulk-insert.",
        "Caste and religion columns exist in the schema for ER fidelity but are NEVER used as model features and never rendered in the UI.",
    ], AMBER, body_size=9.2)

    for x in (0.175, 0.495, 0.815):
        arrow(ax, (x, 0.60), (x, 0.545))
    arrow(ax, (0.315, 0.71), (0.355, 0.71))
    arrow(ax, (0.635, 0.71), (0.675, 0.71))
    arrow(ax, (0.315, 0.42), (0.355, 0.42), AMBER)
    arrow(ax, (0.635, 0.42), (0.675, 0.42), AMBER)
    arrow(ax, (0.495, 0.30), (0.495, 0.245), AMBER)

    fig.savefig(os.path.join(OUT, "diagram-architecture.png"),
                facecolor=BG, bbox_inches="tight", pad_inches=0.10)
    plt.close(fig)


def flow():
    fig, ax = canvas(
        "KSP DAPPA — process flow, FIR to officer action",
        "From a registered FIR to a ranked patrol decision, with the engine named at every hop.")

    steps = [
        ("Synthetic FIR corpus", ["generate.py builds 45,000 FIRs", "on the official KSP ER diagram",
                                  "18-digit CrimeNo, 31 districts", "Aug 2025 – Jul 2026"]),
        ("Data Store (ZCQL)", ["35 related tables, loaded once", "Search index over BriefFacts",
                               "Cache holds hot aggregates", "Row events fire dappa_event"]),
        ("Nightly analytics", ["dappa_nightly Cron + Circuits", "Holt-Winters per district",
                               "Gi* hotspots · z-score anomalies", "Identity resolution → offenders"]),
        ("dappa_api", ["120+ REST routes", "Each reply names meta.source", "QuickML + Zia when enabled",
                       "Deterministic fallback else"]),
        ("Officer surfaces", ["Dashboard · GeoIntel · Trends", "Network · Offenders · Predict",
                              "Ask DAPPA copilot . Cases", "English / Kannada / Hindi"]),
        ("Action taken", ["Rank stations for next 30 days", "Acknowledge / dismiss alerts",
                          "Export weekly brief PDF", "Mail digest to the unit"]),
    ]

    w, h, y = 0.150, 0.30, 0.44
    for i, (title, lines) in enumerate(steps):
        x = 0.035 + i * 0.157
        accent = AMBER if i % 2 == 0 else TEAL
        ax.text(x + 0.004, y + h + 0.035, f"{i+1}", color=accent, fontsize=13, fontweight="bold")
        box(ax, x, y, w, h, title, lines, accent, title_size=8.6, body_size=6.4)
        if i < len(steps) - 1:
            arrow(ax, (x + w + 0.002, y + h / 2), (x + w + 0.010, y + h / 2), MUTED, lw=1.8)

    box(ax, 0.035, 0.09, 0.44, 0.27, "Verification loop", [
        "789-assertion contract suite over the API surface",
        "34/34 live smoke checks against the deployed URL",
        "/healthz reports real per-table row counts",
        "Every answer can reveal the ZCQL that produced it",
    ], TEAL, title_size=11, body_size=8.6)

    box(ax, 0.52, 0.09, 0.445, 0.27, "Guardrails", [
        "Caste / religion never enter a model or the UI",
        "Synthetic data only — banner shown on every screen",
        "AI answers labelled 'decision support, not decisions'",
        "Model cards publish measured metrics, including AUC 0.500",
    ], AMBER, title_size=11, body_size=8.6)

    fig.savefig(os.path.join(OUT, "diagram-flow.png"),
                facecolor=BG, bbox_inches="tight", pad_inches=0.10)
    plt.close(fig)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    architecture()
    flow()
    print("wrote diagram-architecture.png and diagram-flow.png")
