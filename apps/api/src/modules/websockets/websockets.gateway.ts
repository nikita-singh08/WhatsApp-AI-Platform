import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as cookie from 'cookie';

@WebSocketGateway({
  cors: {
    origin: process.env.APP_URL || 'http://localhost:3002',
    credentials: true,
  },
})
export class WebsocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const cookies = client.handshake.headers.cookie;
    if (!cookies) {
      console.log(`[Socket] Client ${client.id} disconnected: no cookies`);
      client.disconnect();
      return;
    }
    const parsed = cookie.parse(cookies);
    const sessionToken = parsed['session_id'];
    if (!sessionToken) {
      console.log(`[Socket] Client ${client.id} disconnected: no session_id`);
      client.disconnect();
      return;
    }

    const orgId = client.handshake.query.orgId as string;
    if (orgId) {
      client.join(orgId);
      console.log(`[Socket] Client ${client.id} joined org room: ${orgId}`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[Socket] Client disconnected: ${client.id}`);
  }

  broadcastToOrg(orgId: string, event: string, payload: any) {
    if (this.server) {
      this.server.to(orgId).emit(event, payload);
    }
  }
}
