#!/usr/bin/env python3
"""
Net TAO flow per subnet, computed from the chain (replacement for Taostats' retired
`net_flow_*_days`; the Taostats /v1 API has no TAO flow).

Idea: the TAO reserve of a subnet pool (SubtensorModule.SubnetTAO) only changes by
  - staking / unstaking through the pool (= the flow we want), and
  - TAO injected by the chain every block (SubtensorModule.SubnetTaoInEmission, rao/block).
So for two snapshots A -> B:
  flow = (SubnetTAO_B - SubnetTAO_A) - injection,   injection = mean(inj_A, inj_B) * (block_B - block_A)
Increments of consecutive snapshots are summed over 1 / 7 / 30 days.

State (checkpoints every CHECKPOINT_HOURS, kept RETENTION_DAYS) lives in KV `tao_flow_state`,
the result in KV `tao_flow`. If the state is too short, the missing days are back-filled from
the archive node, so the 7d / 30d values are available right from the first run.

Values are estimates: injection between snapshots is interpolated, and the result is not
identical to Taostats' old figures. `_source` says so.

Env: CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID (without them: dry run, nothing is written)
     NETWORK (default finney), MAX_BACKFILL_SECONDS (default 2400)
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

BLOCK_SECONDS = 12
BLOCKS_PER_DAY = 7200
CHECKPOINT_HOURS = 6
RETENTION_DAYS = 36
WINDOWS = {"1d": 1, "7d": 7, "30d": 30}
# Checkpoints are CHECKPOINT_HOURS apart, so the start point is up to half a step off; a window
# counts as covered if the data reaches back at least (window - half a step - 12 min).
COVERAGE_TOLERANCE_DAYS = (CHECKPOINT_HOURS / 2 + 0.2) / 24
RAO = 1e9

STATE_KEY = "tao_flow_state"
RESULT_KEY = "tao_flow"


# ---------------------------------------------------------------- pure calculation
def _ts(p):
    return datetime.fromisoformat(p["ts"])


def pair_increment(a, b):
    """Flow (TAO) per netuid between two checkpoints a -> b (a older). Pure function."""
    out = {}
    dblocks = b["block"] - a["block"]
    if dblocks <= 0:
        return out
    for key, cur in b["subnets"].items():
        prev = a["subnets"].get(key)
        if not prev:
            continue  # subnet did not exist at a
        tao_a, inj_a = prev
        tao_b, inj_b = cur
        injected = (inj_a + inj_b) / 2.0 * dblocks
        out[key] = ((tao_b - tao_a) - injected) / RAO
    return out


def compute_flows(points, now=None):
    """points: checkpoints (+ the current snapshot as last element), sorted by block.

    Returns {netuid: {"net_flow_1d_tao": x|None, ..., "coverage_days_30d": y}} and the
    coverage in days of the data."""
    pts = sorted(points, key=lambda p: p["block"])
    if len(pts) < 2:
        return {}, 0.0
    end = pts[-1]
    end_ts = _ts(end)
    incs = [(pts[i], pts[i + 1], pair_increment(pts[i], pts[i + 1])) for i in range(len(pts) - 1)]
    span_days = (end_ts - _ts(pts[0])).total_seconds() / 86400.0
    result = {}
    for key in end["subnets"]:
        result[key] = {}
    for name, days in WINDOWS.items():
        target = end_ts - timedelta(days=days)
        # start point = the checkpoint closest to (end - window)
        start = min(pts[:-1], key=lambda p: abs((_ts(p) - target).total_seconds()))
        covered = (end_ts - _ts(start)).total_seconds() / 86400.0
        ok = covered >= days - COVERAGE_TOLERANCE_DAYS
        for key in end["subnets"]:
            if not ok:
                result[key][f"net_flow_{name}_tao"] = None
                continue
            total = 0.0
            seen = False
            for a, b, inc in incs:
                if b["block"] <= start["block"]:
                    continue
                if key in inc:
                    total += inc[key]
                    seen = True
            result[key][f"net_flow_{name}_tao"] = round(total, 2) if seen else None
    return result, span_days


# ---------------------------------------------------------------- chain access
def _val(x):
    return x.value if hasattr(x, "value") else x


def _query_map_all(sub, name, **kw):
    out = {}
    for k, v in sub.substrate.query_map("SubtensorModule", name, page_size=200, **kw):
        out[int(_val(k))] = int(_val(v))
    return out


def read_maps(sub, block_hash=None, retries=4):
    """{netuid: (tao_in_rao, injection_rao_per_block)} at a block.

    The archive node limits "historical work"; on that error we wait and retry."""
    kw = {"block_hash": block_hash} if block_hash else {}
    for attempt in range(retries + 1):
        try:
            tao = _query_map_all(sub, "SubnetTAO", **kw)
            inj = _query_map_all(sub, "SubnetTaoInEmission", **kw)
            return {n: (t, inj.get(n, 0)) for n, t in tao.items() if n != 0}
        except Exception as e:  # noqa: BLE001
            if attempt == retries:
                raise
            wait = 20 * (2 ** attempt)
            print(f"   ⏳ {type(e).__name__}: {str(e)[:70]} - waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def read_registered_at(sub):
    out = {}
    for k, v in sub.substrate.query_map("SubtensorModule", "NetworkRegisteredAt"):
        out[int(_val(k))] = int(_val(v))
    return out


def to_checkpoint(block, ts, maps):
    return {"block": block, "ts": ts.isoformat(), "subnets": {str(n): [t, i] for n, (t, i) in maps.items()}}


# ---------------------------------------------------------------- KV
def _kv_url(key):
    return (f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}"
            f"/storage/kv/namespaces/{os.environ['CF_METRICS_NAMESPACE_ID']}/values/{key}")


def kv_enabled():
    return all(os.getenv(k) for k in ("CF_ACCOUNT_ID", "CF_API_TOKEN", "CF_METRICS_NAMESPACE_ID"))


def kv_get(key):
    import requests
    r = requests.get(_kv_url(key), headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}, timeout=60)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def kv_put(key, value):
    import requests
    r = requests.put(_kv_url(key), headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}",
                                            "Content-Type": "application/json"},
                     data=json.dumps(value, separators=(",", ":")), timeout=60)
    r.raise_for_status()


# ---------------------------------------------------------------- main
def main():
    import bittensor as bt

    network = os.getenv("NETWORK", "finney")
    max_backfill = int(os.getenv("MAX_BACKFILL_SECONDS", "2400"))
    now = datetime.now(timezone.utc)

    head = bt.Subtensor(network=network)
    cur_block = head.get_current_block()
    registered_at = read_registered_at(head)
    current = to_checkpoint(cur_block, now, read_maps(head))
    print(f"📸 Snapshot at block {cur_block}: {len(current['subnets'])} subnets", file=sys.stderr)

    state = kv_get(STATE_KEY) if kv_enabled() else None
    checkpoints = (state or {}).get("checkpoints", [])
    checkpoints = [c for c in checkpoints if _ts(c) > now - timedelta(days=RETENTION_DAYS)]

    # ---- back-fill from the archive node (resumable: fixed block grid, newest -> oldest)
    step = CHECKPOINT_HOURS * BLOCKS_PER_DAY // 24
    oldest_block = cur_block - int((max(WINDOWS.values()) + 1) * BLOCKS_PER_DAY)
    have_blocks = {c["block"] for c in checkpoints}
    grid = [b for b in range((cur_block // step) * step, oldest_block, -step) if b not in have_blocks and b < cur_block - step // 2]
    if grid:
        print(f"⏪ Back-filling {len(grid)} checkpoints from the archive node", file=sys.stderr)
        arch = bt.Subtensor(network="archive")
        t0 = time.time()
        done = 0
        for blk in grid:
            if time.time() - t0 > max_backfill:
                print("⚠️ Back-fill time budget used up; the next run continues", file=sys.stderr)
                break
            try:
                h = arch.substrate.get_block_hash(blk)
                maps = read_maps(arch, h)
            except Exception as e:  # noqa: BLE001
                print(f"⚠️ Back-fill stopped at block {blk}: {type(e).__name__}: {str(e)[:100]}", file=sys.stderr)
                break
            ts = now - timedelta(seconds=(cur_block - blk) * BLOCK_SECONDS)
            checkpoints.append(to_checkpoint(blk, ts, maps))
            done += 1
            time.sleep(3)
        checkpoints.sort(key=lambda c: c["block"])
        print(f"   {done} historic checkpoints in {time.time()-t0:.0f}s", file=sys.stderr)

    # ---- keep a new checkpoint every CHECKPOINT_HOURS
    if not checkpoints or _ts(checkpoints[-1]) <= now - timedelta(hours=CHECKPOINT_HOURS) + timedelta(minutes=10):
        checkpoints.append(current)

    # subnets that were re-registered: the current snapshot must not be compared with older data
    for c in checkpoints:
        c["subnets"] = {n: v for n, v in c["subnets"].items() if registered_at.get(int(n), 0) <= c["block"]}

    points = [c for c in checkpoints if c["block"] < cur_block] + [current]
    flows, span_days = compute_flows(points)
    print(f"📊 History covers {span_days:.1f} days, {len(flows)} subnets", file=sys.stderr)

    out_ts = now.isoformat()
    result = {
        "_timestamp": out_ts,
        "last_updated": out_ts,
        "_source": "onchain_pool_delta",
        "_description": "Net TAO flow = change of the pool's TAO reserve minus TAO injected by the chain (estimate).",
        "history_days": round(span_days, 2),
        "block": cur_block,
        "subnets": {n: v for n, v in flows.items()},
    }
    with30 = sum(1 for v in flows.values() if v.get("net_flow_30d_tao") is not None)
    print(f"   subnets with a 30d value: {with30}/{len(flows)}", file=sys.stderr)
    for n in ("1", "51", "64"):
        if n in flows:
            print(f"   SN{n}: {flows[n]}", file=sys.stderr)

    if not kv_enabled():
        print("ℹ️ No Cloudflare credentials: dry run, nothing written", file=sys.stderr)
        return
    kv_put(STATE_KEY, {"version": 1, "updated": out_ts, "checkpoints": checkpoints})
    kv_put(RESULT_KEY, result)
    print(f"✅ Wrote {RESULT_KEY} and {STATE_KEY} ({len(checkpoints)} checkpoints)", file=sys.stderr)


if __name__ == "__main__":
    main()
