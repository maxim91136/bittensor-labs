#!/usr/bin/env python3
"""Compare two ISO timestamps from environment variables.

Environment:
  NEW_UPDATED
  EXISTING_UPDATED

Exit codes:
  0 -> NEW_UPDATED > EXISTING_UPDATED (newer)
  1 -> NEW_UPDATED <= EXISTING_UPDATED (not newer)
  2 -> parse error / missing
"""
import os
import sys
from datetime import datetime


def to_ts(s: str):
    if not s:
        raise ValueError('empty')
    # normalize trailing Z to +00:00 for fromisoformat
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    try:
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        # fallback without fractional seconds
        try:
            return datetime.strptime(s, '%Y-%m-%dT%H:%M:%S%z').timestamp()
        except Exception:
            raise


def main():
    new = os.environ.get('NEW_UPDATED')
    ex = os.environ.get('EXISTING_UPDATED')
    try:
        n = to_ts(new)
        e = to_ts(ex)
    except Exception:
        sys.exit(2)
    sys.exit(0 if n > e else 1)


if __name__ == '__main__':
    main()
