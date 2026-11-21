import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callTool, clientLabel, offeredTools, type ToolContext } from './tools';
import path from 'node:path';
import type { Project } from '../types';
import { openProject, redactPaths } from './project';
import { ROWS_INSTRUCTIONS, compactRows } from './compact';
import { hider, projectAlias } from './privacy';
import { DATA_INSTRUCTIONS, cleanResult, cleanText } from './untrusted';

/** MCP server over stdio: the engineer's own AI program (any MCP client, or a local model through one)
 * starts `lvds mcp` and calls the tools. The app has no AI of its own, no account and no key. Runs on this
 * computer only; project files never leave it except as the short results the client asks for. Read-only
 * tools always; tools that change a project only when started with --write (and even then they preview
 * unless called with mode apply / propose). */
const READ_INSTRUCTIONS = 'Read and check LV Design Studio projects (low-voltage electrical design). Start with list_projects, then project_summary or run_checks. These tools never change a project. Results are a design aid: a qualified engineer checks them.';
const WRITE_INSTRUCTIONS = `${READ_INSTRUCTIONS.replace(' These tools never change a project.', '')} Tools that change a project preview by default: show the preview to the engineer and only call again with mode apply / propose when they agree. Value changes (cable, breaker, load, settings) are proposals in Reports → Changes: the engineer accepts and applies them in the app. Use size_circuits to size, propose_changes for other values; add_panel, add_circuit, move_panel, rename_panels and copy_panel change the structure, and set_supply writes the values given from upstream for a first panel (input data of the design, not a sizing result), all after a preview (undo_change puts a change back).`;

const HIDDEN_INSTRUCTIONS = ' Project names, file names and client details are hidden: call a project by the id list_projects gives (project-…).';

/** Names hidden (the default of `lvds mcp`): what cleans one call's result and error text. The project is read before
 * the tool runs, so a result of a tool that renames or deletes is cleaned with the words it had. */
function hiding(tool: string, args: Record<string, unknown>, ctx: ToolContext): { text: (s: string) => string; result: (v: unknown) => unknown } {
  let opened: { project: Project; file: string } | undefined;
  if (typeof args.project === 'string' && args.project.trim()) {
    try { const o = openProject({ ref: args.project, folder: ctx.folder, anywhere: ctx.anywhere }); opened = { project: o.project, file: path.basename(o.file) }; } catch { /* the tool reports it */ }
  }
  const h = hider(ctx.folder, opened);
  const paths = (v: unknown): unknown => (typeof v === 'string' ? redactPaths(v, ctx.folder) : Array.isArray(v) ? v.map(paths) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paths(x)])) : v);
  return {
    text: h.text,
    result: (v) => {
      // The list of projects: each by its id, with no name.
      if (tool === 'list_projects' && v && typeof v === 'object' && Array.isArray((v as { projects?: unknown }).projects)) {
        const list = (v as { projects: { file: string; name: string }[] }).projects;
        return { folder: '<projects folder>', projects: list.map(({ name: _name, ...x }) => ({ ...x, file: projectAlias(x.file) })) };
      }
      return h.result(paths(v));
    }
  };
}

export function createMcp(ctx: ToolContext, version: string): McpServer {
  const server = new McpServer(
    { name: 'lv-design-studio', title: 'LV Design Studio', version },
    { instructions: `${ctx.write ? WRITE_INSTRUCTIONS : READ_INSTRUCTIONS}${DATA_INSTRUCTIONS}${ctx.hideNames ? HIDDEN_INSTRUCTIONS : ''}${ctx.compactRows ? ROWS_INSTRUCTIONS : ''}` }
  );
  for (const t of offeredTools(ctx)) {
    server.registerTool(t.name, {
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: t.writes
        ? { title: t.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
        : { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (args: Record<string, unknown>) => {
      const hide = ctx.hideNames ? hiding(t.name, args, ctx) : undefined;
      try {
        const result = await callTool(t, args, { ...ctx, client: clientLabel(server.server.getClientVersion()) ?? 'unnamed MCP client' });
        // Text in a result is data from project files (src/headless/untrusted.ts).
        const cleaned = cleanResult(hide ? hide.result(result) : result);
        // Lists of records without their repeated names (src/headless/compact.ts).
        return { content: [{ type: 'text' as const, text: JSON.stringify(ctx.compactRows ? compactRows(cleaned) : cleaned) }] };
      } catch (e) {
        const message = redactPaths((e as Error).message, ctx.folder);
        return { isError: true, content: [{ type: 'text' as const, text: cleanText(hide ? hide.text(message) : message) }] };
      }
    });
  }
  return server;
}

export async function startMcp(ctx: ToolContext, version: string): Promise<void> {
  await createMcp(ctx, version).connect(new StdioServerTransport());
}

/** How this copy of lvds was started: the program running it and the lvds file. Inside the installed app
 * the program is the app itself, run as Node (ELECTRON_RUN_AS_NODE: no window), so no separate Node is needed. */
export interface Runtime { execPath: string; script: string; electron: boolean }

/** What an AI program needs to start this MCP server: the "mcpServers" entry most MCP clients take.
 * `lvds mcp-config` prints it, to paste into the program's MCP settings. */
export function mcpConfig(rt: Runtime, write: boolean, groups?: string[], showNames = false, fullRows = false): { mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> } {
  return {
    mcpServers: {
      'lv-design-studio': {
        command: rt.execPath,
        args: [rt.script, 'mcp', ...(write ? ['--write'] : []), ...(groups ? ['--tools', groups.length ? groups.join(',') : 'core'] : []), ...(showNames ? ['--show-names'] : []), ...(fullRows ? ['--full-rows'] : [])],
        ...(rt.electron ? { env: { ELECTRON_RUN_AS_NODE: '1' } } : {})
      }
    }
  };
}
