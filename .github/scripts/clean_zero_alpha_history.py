#!/usr/bin/env python3
"""EINMALIG: entfernt Alpha-Pressure-Verlaufseinträge, in denen alle Werte 0 sind.

Entstanden, als nach der Taostats-/v1-Umstellung noch keine TAO-Flow-Daten da waren.
Schreibt nur, wenn genau ein solcher Eintrag von heute gefunden wird."""
import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("pth", Path(__file__).with_name("publish_top_history.py"))
pth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pth)

KEY = "alpha_pressure_history"
history = pth.get_from_kv(KEY)
if not isinstance(history, list):
    print("❌ Verlauf nicht lesbar")
    sys.exit(1)


def all_zero(snap):
    entries = snap.get("entries") or []
    return bool(entries) and all(float(e.get("pressure") or 0) == 0 and float(e.get("flow_30d") or 0) == 0 for e in entries)


bad = [i for i, s in enumerate(history) if all_zero(s)]
print(f"Einträge gesamt: {len(history)}, davon nur Nullwerte: {len(bad)}")
for i in bad:
    print("  Nullwert-Eintrag:", history[i].get("_timestamp"))
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
if len(bad) == 1 and str(history[bad[0]].get("_timestamp", "")).startswith(today):
    cleaned = [s for i, s in enumerate(history) if i != bad[0]]
    ok = pth.put_to_kv(KEY, cleaned)
    print("✅ entfernt, neue Länge:", len(cleaned)) if ok else print("❌ Schreiben fehlgeschlagen")
    sys.exit(0 if ok else 1)
print("ℹ️ Nichts geschrieben (erwartet: genau ein Nullwert-Eintrag von heute)")
