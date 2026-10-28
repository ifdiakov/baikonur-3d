#!/usr/bin/env python3
"""Render the imported geographic layout; not a render of the 3D scene."""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection
from matplotlib.lines import Line2D
from matplotlib import patheffects

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "osm"
ORIGIN = (63.4598, 45.9256)
KM_LAT = 111.1950802335
KM_LON = KM_LAT * math.cos(math.radians(ORIGIN[1]))


def xy(p):
    return [(p[0] - ORIGIN[0]) * KM_LON, (p[1] - ORIGIN[1]) * KM_LAT]


def load(name):
    return json.loads((DATA / (name + ".geojson")).read_text())["features"]


def paths(g):
    if g["type"] == "LineString":
        return [g["coordinates"]]
    if g["type"] == "Polygon":
        return g["coordinates"]
    if g["type"] == "MultiPolygon":
        return [r for polygon in g["coordinates"] for r in polygon]
    return []


def center(g):
    if g["type"] == "Point":
        return xy(g["coordinates"])
    ring = paths(g)[0]
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    return xy([sum(p[i] for p in ring) / len(ring) for i in range(2)])


def main():
    plt.rcParams.update({"font.family": "DejaVu Sans", "svg.fonttype": "none"})
    fig = plt.figure(figsize=(16, 11), facecolor="#111f2c")
    ax = fig.add_axes([.035, .075, .93, .79], facecolor="#b7b5a4")
    roads, rails, facilities, airports, places = [load(n) for n in ["roads", "railways", "facilities", "airports", "places"]]
    all_features = {f["id"]: f for group in [roads, rails, facilities, airports, places] for f in group}
    boundary = all_features["relation/6725906"]
    ax.add_collection(PolyCollection([[xy(p) for p in ring] for ring in paths(boundary["geometry"])],
                                     facecolors="#c9c5b3", edgecolors="#767868", linewidths=.7, alpha=.38, zorder=1))
    site_rings = [ring for f in facilities if f["id"] != boundary["id"] for ring in paths(f["geometry"])]
    ax.add_collection(PolyCollection([[xy(p) for p in ring] for ring in site_rings],
                                     facecolors="#36aec3", edgecolors="#237b88", linewidths=.5, alpha=.25, zorder=2))
    road_lines = [p for f in roads for p in paths(f["geometry"])]
    ax.add_collection(LineCollection([[xy(p) for p in line] for line in road_lines], colors="#5d5e54", linewidths=.5, alpha=.8, zorder=3))
    for abandoned in [False, True]:
        lines = [p for f in rails if (f["properties"]["tags"].get("railway") in {"abandoned", "disused", "razed"}) == abandoned for p in paths(f["geometry"])]
        ax.add_collection(LineCollection([[xy(p) for p in line] for line in lines], colors="#a8532c", linewidths=.8 if not abandoned else .5,
                                        alpha=.9 if not abandoned else .55, linestyles="solid" if not abandoned else "dashed", zorder=4))
    airport_lines = [p for f in airports for p in paths(f["geometry"])]
    ax.add_collection(LineCollection([[xy(p) for p in line] for line in airport_lines], colors="#edf3ef", linewidths=.85, zorder=5))

    labels = [
        ("way/169401250", "81 · Протон", (-7, 3.7)),
        ("way/169401766", "200 · Протон", (4, 2.2)),
        ("way/241008130", "251 · Юбилейный", (-1.5, 4.0)),
        ("way/172571675", "250 · УКСС", (4, 3)),
        ("way/172571676", "110 · Энергия — Буран", (-9, 2)),
        ("way/454775309", "112 · МИК", (-8.3, -1.4)),
        ("way/169400814", "1 · Гагаринский старт", (4.8, -2.8)),
        ("way/392622243", "31 · Союз", (-2, 5.2)),
        ("way/454782178", "42", (4.5, 3.2)),
        ("way/454782596", "43", (6, 1.6)),
        ("way/221132591", "45 · Зенит", (7.5, -1.6)),
        ("way/172514544", "23 · Сатурн", (6.5, -1.5)),
        ("way/46410994", "Аэродром Крайний", (-8, -3.2)),
        ("node/271092323", "Байконур", (5.5, -1.7)),
    ]
    for key, title, offset in labels:
        pos = center(all_features[key]["geometry"])
        ax.scatter([pos[0]], [pos[1]], s=18, c="#153647", edgecolors="#b5eff5", linewidths=.8, zorder=7)
        text = ax.annotate(title, pos, xytext=(pos[0] + offset[0], pos[1] + offset[1]),
                          ha="center", va="center", fontsize=8.7, color="#f4f7f7", weight="bold",
                          bbox={"boxstyle": "round,pad=.35", "facecolor": "#102b3b", "edgecolor": "#75a9b4", "linewidth": .6, "alpha": .96},
                          arrowprops={"arrowstyle": "-", "color": "#254c58", "linewidth": .8}, zorder=8)
    ax.set_xlim(*[xy([lon, ORIGIN[1]])[0] for lon in [62.80, 64.10]])
    ax.set_ylim(*[xy([ORIGIN[0], lat])[1] for lat in [45.57, 46.125]])
    ax.set_aspect("equal", adjustable="box")
    ax.set_xticks([]); ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_color("#60757c"); spine.set_linewidth(.6)
    left, right = ax.get_xlim(); bottom, top = ax.get_ylim()
    ax.annotate("С", (right - 4, top - 3), color="#213e49", fontsize=11, weight="bold", ha="center")
    ax.annotate("", (right - 4, top - 3.5), (right - 4, top - 8), arrowprops={"arrowstyle": "-|>", "color": "#213e49", "linewidth": 1.8})
    bx, by = left + 4, bottom + 4
    ax.plot([bx, bx + 10], [by, by], color="#233b46", lw=2)
    ax.plot([bx, bx, bx + 10, bx + 10], [by + .5, by - .5, by - .5, by + .5], color="#233b46", lw=.9)
    ax.text(bx + 5, by + .8, "10 км", ha="center", fontsize=9, color="#233b46")
    fig.text(.045, .945, "БАЙКОНУР / ГЕОГРАФИЧЕСКАЯ ОСНОВА", color="#f1f6fa", fontsize=22, weight="bold")
    fig.text(.045, .91, "Объекты, автомобильные дороги и железнодорожные пути из OpenStreetMap", color="#b4cbd6", fontsize=12)
    legend = [Line2D([0], [0], color="#92998c", lw=2, label="Автодороги"),
              Line2D([0], [0], color="#d88855", lw=2, label="Железнодорожные пути"),
              Line2D([0], [0], color="#45bfd0", lw=5, label="Территории объектов"),
              Line2D([0], [0], color="#edf3ef", lw=2, label="Аэродромы")]
    lg = fig.legend(handles=legend, loc="lower center", bbox_to_anchor=(.5, .038), ncol=4, frameon=False, fontsize=10)
    for text in lg.get_texts(): text.set_color("#d9e3e7")
    fig.text(.045, .022, "© OpenStreetMap contributors · ODbL 1.0 · openstreetmap.org/copyright", color="#a4bdc8", fontsize=8.5)
    fig.text(.955, .022, "Данные: 28.10.2026 · Географическая схема, не кадр 3D-музея", color="#a4bdc8", fontsize=8.5, ha="right")
    fig.savefig(DATA / "source-overview.png", dpi=160, facecolor=fig.get_facecolor())
    fig.savefig(DATA / "source-overview.svg", facecolor=fig.get_facecolor())
    plt.close(fig)


if __name__ == "__main__":
    main()
