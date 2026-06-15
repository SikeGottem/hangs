# Hangs MCP

Model Context Protocol server that lets an AI assistant create and drive Hangs events through the public REST API at `https://hangs-zeta.vercel.app`.

## Install

```bash
cd ~/Developer/hangs/mcp
npm install
```

## Register in Claude

Add to `.mcp.json` (project) or `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "hangs": {
      "command": "node",
      "args": ["/Users/ethanwu/Developer/hangs/mcp/src/index.js"]
    }
  }
}
```

Restart Claude after registering.

## Tools

- `hangs_create_hang` — new event (returns id, shareUrl, creatorToken)
- `hangs_get_state` — read full state
- `hangs_join` — add a participant
- `hangs_add_activity` — add an activity option
- `hangs_add_bring_item` — add to bring list (optional nesting)
- `hangs_claim_bring_item` — claim an item
- `hangs_set_availability` — set slots
- `hangs_add_comment`
- `hangs_confirm_plan` — creator-only force/unconfirm
- `hangs_edit` — creator-only PATCH
- `hangs_share_url` — compute share URL from id

## Env

`HANGS_BASE_URL` (default `https://hangs-zeta.vercel.app`). Set to `http://localhost:3000` to point at local dev.

## Auth

JWT goes in `Authorization: Bearer <token>`. Creator token comes back from `hangs_create_hang`; guest tokens come back from `hangs_join`. Tokens last 90 days.
