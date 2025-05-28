#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

/**
 * Test the MCP server by sending JSON-RPC requests
 */
async function testMcpServer() {
  console.log('🧪 Testing PRD Manager MCP Server...\n');

  // Start the MCP server
  const server = spawn('node', ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let responseCount = 0;
  const responses = [];

  server.stdout.on('data', (data) => {
    const response = data.toString();
    console.log('📥 Server Response:', response);
    responses.push(response);
    responseCount++;
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error);
  });

  // Helper function to send requests
  const sendRequest = (request) => {
    console.log('📤 Sending request:', JSON.stringify(request, null, 2));
    server.stdin.write(JSON.stringify(request) + '\n');
  };

  // Wait for server to start
  await setTimeout(1000);

  // Test 1: Initialize the connection
  sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: {
          listChanged: true
        },
        sampling: {}
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  });

  await setTimeout(500);

  // Test 2: List available tools
  sendRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });

  await setTimeout(500);

  // Test 3: List all tasks
  sendRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_tasks",
      arguments: {
        filter: "all"
      }
    }
  });

  await setTimeout(500);

  // Test 4: Try to get a specific task (this will likely fail, but tests error handling)
  sendRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "get_task",
      arguments: {
        taskId: "PRD-100001"
      }
    }
  });

  await setTimeout(500);

  // Test 5: Try to create a task (this will fail without a proper PRD file, but tests the interface)
  sendRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "create_task",
      arguments: {
        text: "Test task created via MCP",
        assignee: "@test-copilot"
      }
    }
  });

  await setTimeout(1000);

  // Clean up
  server.kill();
  
  console.log(`\n✅ Test completed! Sent 5 requests, received ${responseCount} responses.`);
  
  if (responseCount === 0) {
    console.log('⚠️  No responses received. Check server implementation.');
  } else {
    console.log('🎉 Server is responding to requests!');
  }
}

// Run the test
testMcpServer().catch(console.error);