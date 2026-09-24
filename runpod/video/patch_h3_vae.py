"""Backport official ComfyUI PR #16485 onto the pinned v0.37.0 source."""
import sys
from pathlib import Path
p = Path(sys.argv[1])
s = p.read_text(encoding="utf-8")
old = "query, key, rotary_pos_emb, self.qk_norm_scale,"
if s.count(old) != 1:
    raise RuntimeError("Unexpected H3 source: refusing to apply patch")
p.write_text(s.replace(old, "query, key, rotary_pos_emb, self.qk_norm_scale.to(query.device),"), encoding="utf-8")
