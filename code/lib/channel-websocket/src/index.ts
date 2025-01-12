import { global } from '@storybook/global';
import { Channel } from '@storybook/channels';
import type { ChannelHandler } from '@storybook/channels';
import { logger } from '@storybook/client-logger';
import { isJSON, parse, stringify } from 'telejson';
import invariant from 'tiny-invariant';

const { WebSocket } = global;

type OnError = (message: Event) => void;

interface WebsocketTransportArgs {
  url: string;
  onError: OnError;
}

interface CreateChannelArgs {
  url?: string;
  async?: boolean;
  onError?: OnError;
}

export class WebsocketTransport {
  private socket: WebSocket;

  private handler?: ChannelHandler;

  private buffer: string[] = [];

  private isReady = false;

  constructor({ url, onError }: WebsocketTransportArgs) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.isReady = true;
      this.flush();
    };
    this.socket.onmessage = ({ data }) => {
      const event = typeof data === 'string' && isJSON(data) ? parse(data) : data;
      invariant(this.handler, 'WebsocketTransport handler should be set');
      this.handler(event);
    };
    this.socket.onerror = (e) => {
      if (onError) {
        onError(e);
      }
    };
  }

  setHandler(handler: ChannelHandler) {
    this.handler = handler;
  }

  send(event: any) {
    if (!this.isReady) {
      this.sendLater(event);
    } else {
      this.sendNow(event);
    }
  }

  private sendLater(event: any) {
    this.buffer.push(event);
  }

  private sendNow(event: any) {
    const data = stringify(event, { maxDepth: 15, allowFunction: true });
    this.socket.send(data);
  }

  private flush() {
    const { buffer } = this;
    this.buffer = [];
    buffer.forEach((event) => this.send(event));
  }
}

export function createChannel({
  url,
  async = false,
  onError = (err) => logger.warn(err),
}: CreateChannelArgs) {
  let channelUrl = url;
  if (!channelUrl) {
    const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
    const { hostname, port } = window.location;
    channelUrl = `${protocol}://${hostname}:${port}/storybook-server-channel`;
  }

  const transport = new WebsocketTransport({ url: channelUrl, onError });
  return new Channel({ transport, async });
}

// backwards compat with builder-vite
export default createChannel;
