#!/usr/bin/env node
// Hangs MCP — stdio server that lets an AI assistant create and drive Hangs events via the public REST API.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BASE_URL = process.env.HANGS_BASE_URL || 'https://hangs-zeta.vercel.app'

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && data.error) || data || `HTTP ${res.status}`
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`)
  }
  return data
}

const tools = [
  {
    name: 'hangs_create_hang',
    description:
      'Create a new Hangs event. Returns id, shareUrl (/h/<id>), creatorId, and creatorToken (JWT, 90d). Save the creatorToken — required for later edits/confirm.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Hang title (max 120 chars)' },
        creatorName: { type: 'string', description: 'Creator display name (max 50 chars)' },
        dateMode: {
          type: 'string',
          enum: ['range', 'specific'],
          description: "'specific' = list candidate dates; 'range' = start+end window",
        },
        dateRangeStart: { type: 'string', description: 'YYYY-MM-DD (range mode)' },
        dateRangeEnd: { type: 'string', description: 'YYYY-MM-DD (range mode)' },
        selectedDates: {
          type: 'array',
          items: { type: 'string' },
          description: 'YYYY-MM-DD list (specific mode, max 31)',
        },
        duration: { type: 'number', description: 'Hours per slot (1-24, default 2)' },
        location: { type: 'string', description: 'Plain text or http(s) URL, max 200' },
        description: { type: 'string', description: 'Long description (max 300)' },
        activities: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: { name: { type: 'string' }, costEstimate: { type: 'string' } },
                required: ['name'],
              },
            ],
          },
          description: 'Activity options (max 50)',
        },
        bringListSeed: {
          type: 'array',
          items: { type: 'string' },
          description: 'Pre-seeded bring-list items (max 20). Use prefixes like "[Mains]" to group.',
        },
        theme: { type: 'string' },
        dressCode: { type: 'string' },
        responseDeadline: { type: 'string', description: 'YYYY-MM-DD' },
        askDietary: { type: 'boolean' },
        customQuestion: { type: 'string' },
        timeGranularity: {
          type: 'string',
          enum: ['blocks', 'hourly'],
          description: "'blocks' = morning/afternoon/evening/night pills (default, thumb-friendly); 'hourly' = per-hour drag grid (when precision matters)",
        },
        crewId: {
          type: 'string',
          description: 'Scope this hang to a crew. Caller must be a signed-in crew member (requires auth token on server side).',
        },
      },
      required: ['name', 'creatorName', 'dateMode'],
    },
  },
  {
    name: 'hangs_get_state',
    description: 'Fetch the full state of a hang — participants, availability, activities, bring list, votes, etc.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Hang ID (from create response)' } },
      required: ['id'],
    },
  },
  {
    name: 'hangs_join',
    description: 'Add a guest participant by name. Returns participantId and a guest token.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', description: 'Participant display name (max 50)' },
      },
      required: ['id', 'name'],
    },
  },
  {
    name: 'hangs_add_activity',
    description: 'Add an activity option to a hang. Requires participant or creator token.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', description: 'Activity name (max 60)' },
        costEstimate: { type: 'string', description: 'Optional cost note (max 40)' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'name', 'token'],
    },
  },
  {
    name: 'hangs_add_bring_item',
    description: 'Add an item to the bring list (optionally nested under parentId).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        item: { type: 'string', description: 'Item label (max 100)' },
        parentId: { type: 'number', description: 'Optional parent bring_list row id' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'item', 'token'],
    },
  },
  {
    name: 'hangs_claim_bring_item',
    description: 'Claim an item on the bring list (the calling participant marks themselves as bringing it).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        itemId: { type: 'number' },
        note: { type: 'string', description: 'Optional claim note (max 100)' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'itemId', 'token'],
    },
  },
  {
    name: 'hangs_set_availability',
    description: "Set availability for a participant. slots is an array of {date, hour, status}. 'busy' slots are not stored (the grid only persists free/maybe). The returned count is the number of slots actually stored.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slots: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              hour: { type: 'number', description: '0-23' },
              status: { type: 'string', enum: ['free', 'maybe', 'busy'] },
            },
            required: ['date', 'hour', 'status'],
          },
        },
        commitment: { type: 'string', enum: ['in', 'probably', 'cant'] },
        dietary: { type: 'string', description: 'Dietary requirements (max 60 chars, optional)' },
        customAnswer: { type: 'string', description: 'Answer to the hang custom question (max 300 chars, optional)' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'slots', 'token'],
    },
  },
  {
    name: 'hangs_add_comment',
    description: 'Post a comment in the hang.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string', description: 'Comment body (max 500)' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'text', 'token'],
    },
  },
  {
    name: 'hangs_confirm_plan',
    description: 'Creator-only: force-confirm a specific date/hour/activity, or unconfirm.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        action: { type: 'string', enum: ['force', 'unconfirm'] },
        date: { type: 'string', description: 'YYYY-MM-DD (for force)' },
        hour: { type: 'number', description: '0-23 (for force)' },
        activityName: { type: 'string', description: 'Optional activity label (max 60)' },
        token: { type: 'string', description: 'Creator JWT (required)' },
      },
      required: ['id', 'action', 'token'],
    },
  },
  {
    name: 'hangs_edit',
    description: 'Creator-only: edit name, description, theme, dress code, location, custom question, response deadline, ask-dietary.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        theme: { type: 'string' },
        dressCode: { type: 'string' },
        location: { type: 'string' },
        customQuestion: { type: 'string' },
        responseDeadline: { type: 'string', description: 'YYYY-MM-DD or empty string to clear' },
        askDietary: { type: 'boolean' },
        token: { type: 'string', description: 'Creator JWT (required)' },
      },
      required: ['id', 'token'],
    },
  },
  {
    name: 'hangs_share_url',
    description: 'Compute the absolute share URL for a hang ID (no API call).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'hangs_vote',
    description:
      'Vote on activity options for a hang. Supports bulk voting (preferred) or a single vote. vote values: "up" (keen), "meh" (indifferent), "down" (not keen). activityId is the numeric DB id from hangs_get_state.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Hang ID' },
        votes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              activityId: { type: 'number', description: 'Numeric activity id from state' },
              vote: { type: 'string', enum: ['up', 'meh', 'down'] },
            },
            required: ['activityId', 'vote'],
          },
          description: 'Bulk votes (preferred). If omitted, use activityId + vote for a single vote.',
        },
        activityId: { type: 'number', description: 'Single-vote: activity id' },
        vote: { type: 'string', enum: ['up', 'meh', 'down'], description: 'Single-vote: vote value' },
        token: { type: 'string', description: 'Participant JWT' },
      },
      required: ['id', 'token'],
    },
  },
  {
    name: 'hangs_lock',
    description:
      'Creator-only: lock a hang so no more availability/vote responses can be submitted. Use before synthesising the final plan. Pair with hangs_confirm_plan (force) to set the winner.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Hang ID' },
        token: { type: 'string', description: 'Creator JWT (required)' },
      },
      required: ['id', 'token'],
    },
  },
  {
    name: 'hangs_cancel',
    description: 'Creator-only: cancel a hang. Sets status to "cancelled". Irreversible via this tool (unlock via hangs settings if needed).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Hang ID' },
        token: { type: 'string', description: 'Creator JWT (required)' },
      },
      required: ['id', 'token'],
    },
  },
]

const handlers = {
  hangs_create_hang: async (a) => api('/api/hangs', { method: 'POST', body: a }),
  hangs_get_state: async ({ id }) => api(`/api/hangs/${id}/state`),
  hangs_join: async ({ id, name }) =>
    api(`/api/hangs/${id}/join`, { method: 'POST', body: { name } }),
  hangs_add_activity: async ({ id, name, costEstimate, token }) =>
    api(`/api/hangs/${id}/activities`, {
      method: 'POST',
      body: { name, costEstimate: costEstimate || '' },
      token,
    }),
  hangs_add_bring_item: async ({ id, item, parentId, token }) =>
    api(`/api/hangs/${id}/bring-list`, {
      method: 'POST',
      body: { action: 'add', item, parentId: parentId ?? null },
      token,
    }),
  hangs_claim_bring_item: async ({ id, itemId, note, token }) =>
    api(`/api/hangs/${id}/bring-list`, {
      method: 'POST',
      body: { action: 'claim', itemId, note: note || '' },
      token,
    }),
  hangs_set_availability: async ({ id, slots, commitment, dietary, customAnswer, token }) => {
    const result = await api(`/api/hangs/${id}/availability`, {
      method: 'POST',
      body: {
        slots,
        commitment,
        ...(dietary !== undefined ? { dietary } : {}),
        ...(customAnswer !== undefined ? { customAnswer } : {}),
      },
      token,
    })
    // The API returns count = slots.length (all sent slots), but the server
    // filters out 'busy' before writing. Report the stored count instead.
    const storedCount = slots.filter(s => s.status !== 'busy').length
    return { ...result, count: storedCount, sentCount: slots.length }
  },
  hangs_add_comment: async ({ id, text, token }) =>
    api(`/api/hangs/${id}/comments`, { method: 'POST', body: { text }, token }),
  hangs_confirm_plan: async ({ id, action, date, hour, activityName, token }) => {
    const body =
      action === 'unconfirm'
        ? { action: 'unconfirm' }
        : { action: 'force', date, hour, activityName: activityName || '' }
    return api(`/api/hangs/${id}/confirm`, { method: 'POST', body, token })
  },
  hangs_edit: async ({ id, token, ...rest }) =>
    api(`/api/hangs/${id}`, { method: 'PATCH', body: rest, token }),
  hangs_share_url: async ({ id }) => ({ url: `${BASE_URL}/h/${id}` }),
  hangs_vote: async ({ id, votes, activityId, vote, token }) =>
    api(`/api/hangs/${id}/vote`, {
      method: 'POST',
      body: {
        ...(votes ? { votes } : {}),
        ...(activityId !== undefined ? { activityId } : {}),
        ...(vote !== undefined ? { vote } : {}),
      },
      token,
    }),
  hangs_lock: async ({ id, token }) =>
    api(`/api/hangs/${id}/settings`, { method: 'POST', body: { action: 'lock' }, token }),
  hangs_cancel: async ({ id, token }) =>
    api(`/api/hangs/${id}/settings`, { method: 'POST', body: { action: 'cancel' }, token }),
}

const server = new Server(
  { name: 'hangs', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  const handler = handlers[name]
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    }
  }
  try {
    const result = await handler(args)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: e?.message || String(e) }],
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
