// Core K6 imports
import { check, sleep } from 'k6'; // ^0.45.0
import http from 'k6/http'; // ^0.45.0
import ws from 'k6/ws'; // ^0.45.0
import { Trend, Counter, Gauge } from 'k6/metrics'; // ^0.45.0

// Internal imports
import { getTestConfig } from '../../config/test-config';

// Constants
const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

// Custom metrics
const messageDeliveryTime = new Trend('message_delivery_time', true);
const aiResponseTime = new Trend('ai_response_time', true);
const websocketErrors = new Counter('websocket_errors');
const concurrentUsers = new Gauge('concurrent_users');
const aiAgentLoad = new Gauge('ai_agent_load');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 100, comment: 'Initial ramp-up for system warmup' },
    { duration: '5m', target: 1000, comment: 'Gradual load increase' },
    { duration: '10m', target: 5000, comment: 'Peak load testing' },
    { duration: '5m', target: 1000, comment: 'Controlled scale-down' },
    { duration: '1m', target: 0, comment: 'Graceful shutdown' }
  ],
  thresholds: {
    http_req_duration: ['p95<2000', 'p99<4000'],
    ws_connecting: ['p95<1000', 'p99<2000'],
    ws_msgs_received: ['rate>0.95'],
    http_req_failed: ['rate<0.01'],
    iteration_duration: ['p95<30000', 'p99<45000'],
    ai_response_success: ['rate>0.98'],
    'message_delivery_time': ['p95<2000', 'p99<4000'],
    'ai_response_time': ['p95<5000', 'p99<8000'],
    'websocket_errors': ['rate<0.01'],
    'concurrent_users': ['value<=5000'],
    'ai_agent_load': ['value<=1000']
  }
};

// Test setup function
export function setup() {
  const config = getTestConfig('performance');
  
  // Initialize test context
  const testContext = {
    aiAgents: [
      { id: 'explorer', specialization: 'Travel & Activities' },
      { id: 'foodie', specialization: 'Restaurants & Dining' },
      { id: 'planner', specialization: 'Itinerary Organization' }
    ],
    messageTemplates: [
      { type: 'regular', content: 'Hello everyone!' },
      { type: 'ai_mention', content: '@explorer What are the best attractions nearby?' },
      { type: 'ai_mention', content: '@foodie Can you recommend a restaurant?' },
      { type: 'ai_mention', content: '@planner Help us organize our day.' }
    ],
    chatGroups: Array.from({ length: 10 }, (_, i) => ({
      id: `group-${i}`,
      name: `Test Group ${i}`,
      size: Math.floor(Math.random() * 20) + 5
    }))
  };

  return testContext;
}

// Main test scenario
export default function(data) {
  const testConfig = getTestConfig('performance');
  
  // Track concurrent users
  concurrentUsers.add(1);

  // User authentication
  const authResponse = http.post(`${BASE_URL}/api/v1/auth/login`, {
    username: `user_${__VU}`,
    password: 'testPassword123'
  });

  check(authResponse, {
    'authentication successful': (r) => r.status === 200,
    'token received': (r) => r.json('token') !== undefined
  });

  const token = authResponse.json('token');

  // WebSocket connection with retry logic
  const wsParams = {
    headers: { Authorization: `Bearer ${token}` },
    tags: { type: 'websocket' }
  };

  const wsConnection = ws.connect(`${WS_URL}/chat`, wsParams, function(socket) {
    socket.on('open', () => {
      // Join chat groups
      data.chatGroups.forEach(group => {
        socket.send(JSON.stringify({
          type: 'join_group',
          groupId: group.id
        }));
      });

      // Message sending loop
      socket.setInterval(() => {
        const messageTemplate = data.messageTemplates[
          Math.floor(Math.random() * data.messageTemplates.length)
        ];

        const startTime = Date.now();
        const groupId = data.chatGroups[
          Math.floor(Math.random() * data.chatGroups.length)
        ].id;

        socket.send(JSON.stringify({
          type: 'message',
          groupId: groupId,
          content: messageTemplate.content,
          timestamp: startTime
        }));
      }, 1000);

      // Message and AI response handling
      socket.on('message', (message) => {
        const msg = JSON.parse(message);
        const now = Date.now();

        if (msg.type === 'message_delivered') {
          messageDeliveryTime.add(now - msg.originalTimestamp);
        } else if (msg.type === 'ai_response') {
          aiResponseTime.add(now - msg.requestTimestamp);
          aiAgentLoad.add(1, { agent: msg.agentId });
        }
      });

      // Error handling
      socket.on('error', () => {
        websocketErrors.add(1);
      });
    });
  });

  check(wsConnection, {
    'websocket connection successful': (ws) => ws !== null
  });

  // Simulate user activity
  sleep(Math.random() * 3 + 1);

  // Cleanup
  concurrentUsers.add(-1);
}