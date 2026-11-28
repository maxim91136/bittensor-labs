import json, sys
import bittensor as bt

sub = bt.Subtensor(network="finney")
print("block", sub.get_current_block())
subs = sub.all_subnets()
print("subnets", len(subs))
for s in subs:
    if s.netuid in (1, 51):
        print("--- DynamicInfo netuid", s.netuid)
        for k in sorted(vars(s)):
            v = getattr(s, k)
            print(f"  {k}: {str(v)[:90]}")
# storage items about flow / injection
try:
    pal = sub.substrate.get_metadata_pallet("SubtensorModule")
    st = pal.storage
    entries = st["entries"] if isinstance(st, dict) else st.value["entries"]
    names = [e["name"] for e in entries]
    print("storage names matching:", [n for n in names if any(x in n for x in ("Flow", "TaoIn", "SubnetTAO", "Emission", "Volume"))])
except Exception as e:
    print("metadata listing failed:", type(e).__name__, e)
for name in ("SubnetTaoFlow", "SubnetEmaTaoFlow", "SubnetTaoInEmission", "SubnetTAO", "SubnetTaoProvided"):
    try:
        r = sub.substrate.query("SubtensorModule", name, [1])
        print(name, "[1] ->", r.value if hasattr(r, "value") else r)
    except Exception as e:
        print(name, "failed:", type(e).__name__, str(e)[:100])
