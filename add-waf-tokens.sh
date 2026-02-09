#!/bin/bash
# Add WAF tokens to all candidates

docker exec users-app node -e "
const fs = require('fs');
const path = '/app/state/state.json';
const state = JSON.parse(fs.readFileSync(path, 'utf8'));

if (state.candidates) {
  state.candidates.forEach(c => {
    if (!c.taskTokens) c.taskTokens = {};
    if (!c.taskTokens.waf) {
      c.taskTokens.waf = Math.random().toString(36).slice(2, 18);
      console.log('Added waf token for:', c.email);
    }
  });
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
  console.log('State file updated!');
}
"

echo "Restarting container..."
docker restart users-app
echo "Done! All candidates now have WAF tokens."
