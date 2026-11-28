import time
import bittensor as bt

sub = bt.Subtensor(network="finney")
cur = sub.get_current_block()
print("finney block", cur)
for net in ("finney", "archive"):
    try:
        s = bt.Subtensor(network=net)
        print(net, "endpoint", getattr(s, "chain_endpoint", "?"))
        for days in (1, 7, 30):
            blk = cur - 7200 * days
            t0 = time.time()
            h = s.substrate.get_block_hash(blk)
            r = s.substrate.query("SubtensorModule", "SubnetTAO", [1], block_hash=h)
            e = s.substrate.query("SubtensorModule", "SubnetTaoInEmission", [1], block_hash=h)
            print(f"  {net} {days}d ago block {blk}: SubnetTAO[1]={r.value}, TaoInEmission[1]={e.value} ({time.time()-t0:.1f}s)")
    except Exception as ex:
        print(f"  {net} failed:", type(ex).__name__, str(ex)[:150])
# how fast is a full subnet sweep at one historical block?
try:
    s = bt.Subtensor(network="archive")
    h = s.substrate.get_block_hash(cur - 7200 * 10)
    t0 = time.time()
    res = s.substrate.query_map("SubtensorModule", "SubnetTAO", block_hash=h)
    n = sum(1 for _ in res)
    print(f"query_map SubnetTAO at -10d: {n} entries in {time.time()-t0:.1f}s")
except Exception as ex:
    print("query_map failed:", type(ex).__name__, str(ex)[:150])
