#!/usr/bin/env node
/*
 * Fetch latest tweets for a user and output a JSON with `fetched_at` and `alerts`.
 * Designed to run in CI or locally (Node 18/20). Uses global fetch.
 */

const fs = require('fs');
const process = require('process');

const token = process.env.X_BEARER_TOKEN;
const userId = process.env.X_USER_ID;
const limit = parseInt(process.env.ALERTS_MAX || '5', 10);
const outPath = process.env.OUT_PATH || process.argv[2];

function nowISO() {
  return new Date().toISOString();
}

async function fetchTweets() {
  const base = `https://api.twitter.com/2/users/${userId}/tweets`;
  const url = new URL(base);
  url.searchParams.set('max_results', String(Math.min(100, limit)));
  url.searchParams.set('tweet.fields', 'created_at,edit_history_tweet_ids,author_id');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('X API error:', res.status, body);
    process.exit(4);
  }

  const data = await res.json();
  const tweets = data?.data || [];
  const cleaned = tweets.slice(0, limit).map((t) => ({
    id: t.id,
    text: t.text,
    edit_history_tweet_ids: t.edit_history_tweet_ids || [],
    author_id: t.author_id,
    created_at: t.created_at,
  }));

  return {
    fetched_at: nowISO(),
    alerts: cleaned,
  };
}

async function main() {
  if (!token || !userId) {
    console.error('Missing X_BEARER_TOKEN or X_USER_ID');
    process.exit(2);
  }

  try {
    const out = await fetchTweets();
    const json = JSON.stringify(out, null, 2);
    if (outPath) {
      fs.writeFileSync(outPath, json, { encoding: 'utf-8' });
      console.log('Wrote', outPath);
    } else {
      console.log(json);
    }
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error', err);
    process.exit(3);
  }
}

if (require.main === module) {
  main();
}
