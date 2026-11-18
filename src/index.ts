#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.ts';

// In stdio mode stdout carries the protocol, so all logging goes to stderr.
const server = createMcpServer();
await server.connect(new StdioServerTransport());
console.error('[travel-mcp] running on stdio');
